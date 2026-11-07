package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestBrowserVorgabe(t *testing.T) {
	dir := t.TempDir()
	edge := filepath.Join(dir, "msedge.exe")
	if err := os.WriteFile(edge, nil, 0o755); err != nil {
		t.Fatal(err)
	}
	b, err := findBrowser(edge)
	if err != nil || b.Path != edge || !b.Edge {
		t.Fatalf("%+v %v", b, err)
	}
	if _, err := findBrowser(filepath.Join(dir, "fehlt")); err == nil || !strings.Contains(err.Error(), "nicht gefunden") {
		t.Fatalf("fehlender Browser: %v", err)
	}
}

func TestBrowserSucheOhneTreffer(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows sucht feste Pfade")
	}
	t.Setenv("PATH", t.TempDir())
	if _, err := findBrowser(""); err == nil || !strings.Contains(err.Error(), "sudo apt install chromium") {
		t.Fatalf("Hinweis fehlt: %v", err)
	}
}

func TestStandardProfilOrdner(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows nutzt LOCALAPPDATA")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	if got := defaultProfileDir(browser{Path: "/usr/bin/chromium"}); got != filepath.Join(home, ".config", "schafland-kiosk") {
		t.Fatalf("%s", got)
	}
}

func TestAutostartUeberDasProgramm(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Linux-Pfade")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	if _, err := setAutostart(true); err != nil {
		t.Fatal(err)
	}
	desktop := filepath.Join(home, ".config", "autostart", "schafland.desktop")
	data, err := os.ReadFile(desktop)
	exe, _ := os.Executable()
	exe, _ = filepath.EvalSymlinks(exe)
	if err != nil || !strings.Contains(string(data), exe) {
		t.Fatalf("Eintrag: %v %s", err, data)
	}
	if _, err := setAutostart(false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(desktop); !os.IsNotExist(err) {
		t.Fatal("Eintrag nicht entfernt")
	}
}

func TestAlleZehnPortsBelegt(t *testing.T) {
	// zehn aufeinanderfolgende freie Ports suchen und mit fremden Programmen belegen
	var lns []net.Listener
	defer func() {
		for _, l := range lns {
			l.Close()
		}
	}()
	base := 0
	for try := 0; try < 50 && base == 0; try++ {
		for _, l := range lns {
			l.Close()
		}
		lns = nil
		start := 20000 + try*37
		ok := true
		for p := start; p < start+portTries+1; p++ {
			l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
			if err != nil {
				ok = false
				break
			}
			lns = append(lns, l)
		}
		if ok {
			base = start
		}
	}
	if base == 0 {
		t.Skip("keine elf freien Ports nebeneinander")
	}
	// der elfte Port bleibt frei: er darf NICHT genommen werden
	lns[portTries].Close()
	lns = lns[:portTries]
	for _, l := range lns {
		go http.Serve(l, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, "fremd") }))
	}
	srv, err := startServer(testSite, base)
	if err == nil {
		srv.Close()
		t.Fatalf("erwartet Fehler, läuft auf %s", srv.URL)
	}
	if !strings.Contains(err.Error(), fmt.Sprintf("kein freier Port zwischen %d und %d", base, base+portTries-1)) {
		t.Fatalf("Meldung: %v", err)
	}
}

func TestGemeinsamerServerSchliessenOhneAbsturz(t *testing.T) {
	s := &server{URL: "http://localhost:1/"} // vom laufenden Starter übernommen: nichts zu schließen
	s.Close()
}

func TestAutostartMitSymbol(t *testing.T) {
	if _, err := webFS.ReadFile("web/icon-512.png"); err != nil {
		t.Skip("App nicht eingebettet (nur .gitkeep)")
	}
	home := t.TempDir()
	if _, err := autostartLinux(true, "/opt/schafland", home); err != nil {
		t.Fatal(err)
	}
	if st, err := os.Stat(filepath.Join(home, ".local", "share", "icons", "schafland.png")); err != nil || st.Size() < 1000 {
		t.Fatalf("Symbol fehlt: %v", err)
	}
}
