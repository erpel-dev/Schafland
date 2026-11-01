package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type browser struct {
	Path string
	Edge bool // Edge braucht eigene Kiosk-Schalter
}

// Kandidaten in der Reihenfolge, in der gesucht wird. Unter Windows ist Edge immer installiert.
func browserCandidates(goos string, env func(string) string) []string {
	if goos == "windows" {
		var c []string
		for _, base := range []string{env("ProgramFiles(x86)"), env("ProgramFiles"), env("LOCALAPPDATA")} {
			if base == "" {
				continue
			}
			c = append(c,
				filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
				filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"),
			)
		}
		return append(c, "msedge", "chrome")
	}
	return []string{"chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "microsoft-edge-stable"}
}

func findBrowser(override string) (browser, error) {
	if override != "" {
		if _, err := os.Stat(override); err != nil {
			return browser{}, errors.New("Browser nicht gefunden: " + override)
		}
		return browser{Path: override, Edge: isEdge(override)}, nil
	}
	for _, c := range browserCandidates(runtime.GOOS, os.Getenv) {
		if filepath.IsAbs(c) {
			if _, err := os.Stat(c); err == nil {
				return browser{Path: c, Edge: isEdge(c)}, nil
			}
			continue
		}
		if p, err := exec.LookPath(c); err == nil {
			return browser{Path: p, Edge: isEdge(p)}, nil
		}
	}
	if runtime.GOOS == "windows" {
		return browser{}, errors.New("Kein Browser gefunden. Schafland braucht Microsoft Edge oder Google Chrome.")
	}
	return browser{}, errors.New("Kein Chromium gefunden. Bitte installieren: sudo apt install chromium")
}

func isEdge(path string) bool {
	return strings.Contains(strings.ToLower(filepath.Base(path)), "edge")
}

// Eigenes Profil wie bei den bisherigen Startskripten: Kamera-Erlaubnis, Musik-Ordner und alle
// gespeicherten Daten bleiben erhalten, das normale Surf-Profil bleibt unberührt.
func defaultProfileDir(b browser) string {
	return profileDirFor(runtime.GOOS, b.Path, os.Getenv, os.UserHomeDir)
}

func profileDirFor(goos, browserPath string, env func(string) string, home func() (string, error)) string {
	if goos == "windows" {
		return filepath.Join(env("LOCALAPPDATA"), "schafland-kiosk")
	}
	h, _ := home()
	// Snap-Chromium (Ubuntu) darf nicht in versteckte Ordner wie ~/.config schreiben
	if resolved, err := filepath.EvalSymlinks(browserPath); err == nil && strings.HasPrefix(resolved, "/snap/") {
		return filepath.Join(h, "snap", "chromium", "common", "schafland-kiosk")
	}
	return filepath.Join(h, ".config", "schafland-kiosk")
}

func browserArgs(b browser, url, profileDir string) []string {
	args := []string{
		"--user-data-dir=" + profileDir,
		"--no-first-run", "--no-default-browser-check",
		"--noerrdialogs", "--disable-infobars", "--disable-session-crashed-bubble",
		"--disable-features=Translate,TouchpadOverscrollHistoryNavigation",
		"--overscroll-history-navigation=0", "--disable-pinch",
		"--check-for-update-interval=31536000",
	}
	if b.Edge {
		// Edge: Kiosk-Modus als Vollbild, Adresse direkt hinter --kiosk
		return append(args, "--kiosk", url, "--edge-kiosk-type=fullscreen")
	}
	return append(args, "--kiosk", "--app="+url)
}
