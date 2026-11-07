//go:build linux

package main

import (
	"os"
	"os/exec"
	"strings"
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
