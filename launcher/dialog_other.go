//go:build !windows

package main

import (
	"os"
	"os/exec"
)

// Per Doppelklick gestartet gibt es kein Terminal: Meldung zusätzlich als Fenster, wenn möglich.
func showDialog(title, msg string, isError bool) {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		return
	}
	kind := "--info"
	if isError {
		kind = "--error"
	}
	if p, err := exec.LookPath("zenity"); err == nil {
		_ = exec.Command(p, kind, "--title="+title, "--text="+msg).Run()
		return
	}
	if p, err := exec.LookPath("notify-send"); err == nil {
		_ = exec.Command(p, title, msg).Run()
	}
}
