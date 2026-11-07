//go:build linux

package main

import (
	"errors"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"
	"time"

	pcsc "github.com/gballet/go-libpcsclite"
)

// Mit dem echten Chipkarten-Dienst pcscd und einer virtuellen Karte (Pakete pcscd,
// vsmartcard-vpcd, vsmartcard-vpicc). Läuft nur, wenn beides da ist (z. B. in der CI).
func TestEchterPcscdMitVirtuellerKarte(t *testing.T) {
	if _, err := os.Stat(pcsc.PCSCDSockName); err != nil {
		t.Skip("pcscd läuft nicht")
	}
	if _, err := exec.LookPath("vicc"); err != nil {
		t.Skip("vicc (virtuelle Karte) fehlt")
	}
	t.Setenv("SCHAFLAND_TESTKARTE", "")
	d := neuerKartenDienst(oeffneLeser)
	info := d.info()
	if strings.Contains(info.Fehler, "läuft nicht") {
		t.Skip("pcscd antwortet nicht (alte Socket-Datei?)")
	}
	if info.Fehler != "" || len(info.Leser) == 0 || !strings.Contains(strings.Join(info.Leser, ","), "Virtual PCD") {
		t.Fatalf("Leser: %+v", info)
	}
	ch, abmelden := d.abonnieren()
	defer abmelden()
	if warteAuf(t, ch, 600*time.Millisecond) {
		t.Fatal("ohne Karte gemeldet")
	}
	vicc := exec.Command("vicc", "-t", "iso7816")
	if err := vicc.Start(); err != nil {
		t.Fatal(err)
	}
	defer vicc.Process.Kill()
	if !warteAuf(t, ch, 5*time.Second) {
		t.Fatal("virtuelle Karte nicht gemeldet")
	}
}

func TestOhnePcscdVerstaendlicherHinweis(t *testing.T) {
	t.Setenv("SCHAFLAND_TESTKARTE", "")
	t.Setenv("PCSCLITE_CSOCK_NAME", "/nicht/da/pcscd.comm")
	info := neuerKartenDienst(oeffneLeser).info()
	if !strings.Contains(info.Fehler, "sudo apt install pcscd") {
		t.Fatalf("Hinweis: %q", info.Fehler)
	}
}

func TestKartenStatusAusFehlercodes(t *testing.T) {
	for _, f := range []struct {
		msg    string
		da     bool
		fehler bool
	}{
		{"invalid return code: 8010000c (no smart card inserted)", false, false},
		{"invalid return code: 80100066 (unresponsive)", false, false},
		{"invalid return code: 80100068 (unpowered)", false, false},
		{"invalid return code: 80100069 (removed)", false, false},
		{"invalid return code: 8010000b (sharing violation)", true, false},
		{"invalid return code: 80100017 (reader unavailable)", false, true},
	} {
		da, err := kartenStatus(errors.New(f.msg))
		if da != f.da || (err != nil) != f.fehler {
			t.Errorf("%s: da=%v err=%v", f.msg, da, err)
		}
	}
}

func TestVerstaendlicheHinweiseLinux(t *testing.T) {
	for msg, want := range map[string]string{
		"dial unix /run/pcscd/pcscd.comm: connect: no such file or directory": "sudo apt install pcscd",
		"dial unix /run/pcscd/pcscd.comm: connect: connection refused":        "sudo apt install pcscd",
		"read: connection reset by peer":                                      "polkit",
		"etwas anderes":                                                       "Kartenleser: etwas anderes",
	} {
		if got := verstaendlich(errors.New(msg)); !strings.Contains(got, want) {
			t.Errorf("%q → %q", msg, got)
		}
	}
	if got := verstaendlich(syscall.ENOENT); !strings.Contains(got, "pcscd") {
		t.Errorf("ENOENT → %q", got)
	}
}
