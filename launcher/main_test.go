package main

import (
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
)

var testSite = fstest.MapFS{
	"index.html":             {Data: []byte("<!doctype html><title>Schafland</title>")},
	"assets/app.js":          {Data: []byte("console.log(1)")},
	"assets/zxing.wasm":      {Data: []byte("\x00asm")},
	"manifest.webmanifest":   {Data: []byte("{}")},
	"produkte/broetchen.svg": {Data: []byte("<svg/>")},
}

func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port
}

func get(t *testing.T, url string) (*http.Response, string) {
	t.Helper()
	res, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res, string(b)
}

func TestServerLiefertAppMitRichtigenTypen(t *testing.T) {
	srv, err := startServer(testSite, freePort(t))
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	if !strings.HasPrefix(srv.URL, "http://localhost:") {
		t.Fatalf("Adresse muss localhost sein (Kamera), ist %s", srv.URL)
	}
	cases := map[string]string{
		"":                       "text/html",
		"assets/app.js":          "text/javascript",
		"assets/zxing.wasm":      "application/wasm",
		"manifest.webmanifest":   "application/manifest+json",
		"produkte/broetchen.svg": "image/svg+xml",
	}
	for path, want := range cases {
		res, _ := get(t, srv.URL+path)
		if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), want) {
			t.Errorf("%s: Status %d, Typ %q, erwartet %q", path, res.StatusCode, res.Header.Get("Content-Type"), want)
		}
		if res.Header.Get("Cross-Origin-Opener-Policy") != "same-origin" || res.Header.Get("Cross-Origin-Embedder-Policy") != "credentialless" {
			t.Errorf("%s: ohne Kopfzeilen für mehrere Rechenkerne (COOP/COEP)", path)
		}
		if res.Header.Get("Cache-Control") != "no-cache" {
			t.Errorf("%s: ohne no-cache findet der Offline-Speicher keine neuen Versionen", path)
		}
	}
	if res, _ := get(t, srv.URL+"gibtsnicht.js"); res.StatusCode != 404 {
		t.Errorf("unbekannte Datei: Status %d", res.StatusCode)
	}
}

func TestServerNurAufLocalhost(t *testing.T) {
	port := freePort(t)
	srv, err := startServer(testSite, port)
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	// Von außen (alle anderen Adressen) darf niemand die Kasse erreichen
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		ip, _, _ := net.ParseCIDR(a.String())
		if ip == nil || ip.IsLoopback() || ip.To4() == nil {
			continue
		}
		if c, err := net.Dial("tcp", net.JoinHostPort(ip.String(), strconv.Itoa(port))); err == nil {
			c.Close()
			t.Errorf("Server ist über %s erreichbar", ip)
		}
	}
}

func TestZweiterStartBenutztLaufendenServer(t *testing.T) {
	port := freePort(t)
	first, err := startServer(testSite, port)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := startServer(testSite, port)
	if err != nil {
		t.Fatal(err)
	}
	if second.URL != first.URL || !strings.Contains(second.Note, "läuft schon") {
		t.Errorf("zweiter Start: %q / %q", second.URL, second.Note)
	}
	if !isSchafland(port) {
		t.Error("Ping erkennt den eigenen Server nicht")
	}
}

func TestFremdesProgrammAufDemPortNaechsterPort(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port
	go http.Serve(ln, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { io.WriteString(w, "fremd") }))
	srv, err := startServer(testSite, port)
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	if strings.Contains(srv.URL, ":"+strconv.Itoa(port)+"/") || !strings.Contains(srv.Note, "belegt") {
		t.Errorf("erwartet anderen Port mit Hinweis, ist %s / %q", srv.URL, srv.Note)
	}
}

func TestBrowserArgsChromiumUndEdge(t *testing.T) {
	c := strings.Join(browserArgs(browser{Path: "/usr/bin/chromium"}, "http://localhost:8080/", "/p"), " ")
	for _, want := range []string{"--kiosk --app=http://localhost:8080/", "--user-data-dir=/p", "--no-first-run", "--disable-features=Translate"} {
		if !strings.Contains(c, want) {
			t.Errorf("Chromium: %q fehlt in %q", want, c)
		}
	}
	e := strings.Join(browserArgs(browser{Path: `C:\x\msedge.exe`, Edge: true}, "http://localhost:8080/", `C:\p`), " ")
	if !strings.Contains(e, "--kiosk http://localhost:8080/ --edge-kiosk-type=fullscreen") || strings.Contains(e, "--app=") {
		t.Errorf("Edge: %q", e)
	}
}

func TestBrowserSucheWindowsEdgeZuerst(t *testing.T) {
	env := map[string]string{"ProgramFiles(x86)": `C:\Program Files (x86)`, "ProgramFiles": `C:\Program Files`, "LOCALAPPDATA": `C:\Users\k\AppData\Local`}
	c := browserCandidates("windows", func(k string) string { return env[k] })
	if !strings.HasSuffix(c[0], "msedge.exe") || !isEdge(c[0]) {
		t.Errorf("Windows sollte zuerst Edge suchen: %v", c[:2])
	}
	if c := browserCandidates("linux", os.Getenv); c[0] != "chromium" {
		t.Errorf("Linux: %v", c)
	}
}

func TestBrowserSucheImPfad(t *testing.T) {
	dir := t.TempDir()
	fake := filepath.Join(dir, "google-chrome")
	os.WriteFile(fake, []byte("#!/bin/sh\n"), 0o755)
	t.Setenv("PATH", dir)
	b, err := findBrowser("")
	if err != nil || b.Path != fake || b.Edge {
		t.Errorf("gefunden: %+v, %v", b, err)
	}
	t.Setenv("PATH", t.TempDir())
	if _, err := findBrowser(""); err == nil || !strings.Contains(err.Error(), "apt install chromium") {
		t.Errorf("ohne Browser: %v", err)
	}
	if _, err := findBrowser("/gibt/es/nicht"); err == nil {
		t.Error("falscher --browser-Pfad sollte scheitern")
	}
}

func TestProfilOrdnerWieBisher(t *testing.T) {
	home := func() (string, error) { return "/home/kind", nil }
	if p := profileDirFor("linux", "/usr/bin/chromium", os.Getenv, home); p != "/home/kind/.config/schafland-kiosk" {
		t.Errorf("Linux: %s", p)
	}
	env := func(k string) string {
		if k == "LOCALAPPDATA" {
			return `C:\Users\k\AppData\Local`
		}
		return ""
	}
	if p := profileDirFor("windows", "", env, home); !strings.HasSuffix(p, "schafland-kiosk") || !strings.HasPrefix(p, `C:\Users\k\AppData\Local`) {
		t.Errorf("Windows: %s", p)
	}
}

func TestAutostartLinux(t *testing.T) {
	home := t.TempDir()
	if _, err := autostartLinux(true, "/opt/schafland/schafland", home); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(home, ".config", "autostart", "schafland.desktop"))
	if err != nil || !strings.Contains(string(b), `Exec="/opt/schafland/schafland"`) {
		t.Fatalf("Autostart-Eintrag: %v %s", err, b)
	}
	if _, err := os.Stat(filepath.Join(home, ".local", "share", "applications", "schafland.desktop")); err != nil {
		t.Error("Eintrag im Anwendungsmenü fehlt")
	}
	autostartLinux(false, "", home)
	if _, err := os.Stat(filepath.Join(home, ".config", "autostart", "schafland.desktop")); err == nil {
		t.Error("Autostart nicht entfernt")
	}
}

func TestAutostartWindows(t *testing.T) {
	appData := t.TempDir()
	os.MkdirAll(filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup"), 0o755)
	if _, err := autostartWindows(true, `C:\Spiele\schafland.exe`, appData); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Schafland.cmd"))
	if string(b) != "@start \"\" \"C:\\Spiele\\schafland.exe\"\r\n" {
		t.Errorf("Startup-Datei: %q", b)
	}
}
