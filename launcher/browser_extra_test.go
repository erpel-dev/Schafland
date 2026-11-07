package main

import (
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
