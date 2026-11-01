package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// setAutostart richtet den Start beim Anmelden ein oder entfernt ihn wieder.
// Linux: Eintrag in ~/.config/autostart und im Anwendungsmenü. Windows: Datei im Autostart-Ordner.
func setAutostart(on bool) (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "windows" {
		return autostartWindows(on, exe, os.Getenv("APPDATA"))
	}
	return autostartLinux(on, exe, home)
}

func autostartLinux(on bool, exe, home string) (string, error) {
	files := []string{
		filepath.Join(home, ".config", "autostart", "schafland.desktop"),
		filepath.Join(home, ".local", "share", "applications", "schafland.desktop"),
	}
	icon := filepath.Join(home, ".local", "share", "icons", "schafland.png")
	if !on {
		for _, f := range files {
			_ = os.Remove(f)
		}
		return "Autostart entfernt.", nil
	}
	if png, err := webFS.ReadFile("web/icon-512.png"); err == nil {
		_ = os.MkdirAll(filepath.Dir(icon), 0o755)
		_ = os.WriteFile(icon, png, 0o644)
	}
	entry := fmt.Sprintf("[Desktop Entry]\nType=Application\nName=Schafland\nComment=Hier bin ich Schaf, hier kauf ich ein\nExec=\"%s\"\nIcon=%s\nTerminal=false\nCategories=Game;Education;\nX-GNOME-Autostart-enabled=true\n", exe, icon)
	for _, f := range files {
		if err := os.MkdirAll(filepath.Dir(f), 0o755); err != nil {
			return "", err
		}
		if err := os.WriteFile(f, []byte(entry), 0o644); err != nil {
			return "", err
		}
	}
	return "Schafland startet ab jetzt nach dem Anmelden automatisch und steht im Anwendungsmenü.\nEntfernen: schafland --kein-autostart", nil
}

func autostartWindows(on bool, exe, appData string) (string, error) {
	if appData == "" {
		return "", fmt.Errorf("APPDATA ist nicht gesetzt")
	}
	f := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Schafland.cmd")
	if !on {
		_ = os.Remove(f)
		return "Autostart entfernt.", nil
	}
	content := fmt.Sprintf("@start \"\" \"%s\"\r\n", exe)
	if err := os.WriteFile(f, []byte(content), 0o644); err != nil {
		return "", err
	}
	return "Schafland startet ab jetzt nach dem Anmelden automatisch.\nEntfernen: schafland.exe --kein-autostart", nil
}
