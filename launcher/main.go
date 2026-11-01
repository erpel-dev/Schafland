// Schafland-Starter: eine einzige Datei für Windows (schafland.exe) und Linux (schafland).
// Enthält die fertige App, liefert sie über einen eingebauten Webserver auf localhost aus
// und öffnet einen installierten Chromium-Browser (Edge, Chrome, Chromium) im Kiosk-Modus.
// Wird der Browser geschlossen, beendet sich auch der Starter.
package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

//go:embed all:web
var webFS embed.FS

// Wird beim Bauen gesetzt (-ldflags "-X main.version=…").
var version = "dev"

// Gleicher Port wie die bisherigen Startskripte: gleiche Adresse heißt gleiche gespeicherte Daten.
const defaultPort = 8080

func main() {
	port := flag.Int("port", defaultPort, "Port für den eingebauten Webserver")
	serverOnly := flag.Bool("nur-server", false, "nur den Webserver starten, keinen Browser")
	browserPath := flag.String("browser", "", "Pfad zum Browser (sonst automatisch gesucht)")
	profile := flag.String("profil", "", "Ordner für das Browser-Profil (sonst wie bisher)")
	autostart := flag.Bool("autostart", false, "beim Anmelden automatisch starten (einrichten)")
	noAutostart := flag.Bool("kein-autostart", false, "Autostart wieder entfernen")
	showVersion := flag.Bool("version", false, "Version anzeigen")
	flag.Parse()

	if *showVersion {
		fmt.Println("Schafland", version)
		return
	}
	if *autostart || *noAutostart {
		msg, err := setAutostart(*autostart)
		if err != nil {
			fail("Autostart: %v", err)
		}
		info(msg)
		return
	}

	site, err := fs.Sub(webFS, "web")
	if err != nil {
		fail("App nicht gefunden: %v", err)
	}
	if _, err := fs.Stat(site, "index.html"); err != nil {
		fail("In dieser Datei fehlt die App (index.html). Bitte mit „npm run build:starter“ bauen.")
	}

	srv, err := startServer(site, *port)
	if err != nil {
		fail("Webserver: %v", err)
	}
	if srv.Note != "" {
		fmt.Fprintln(os.Stderr, srv.Note)
	}
	fmt.Println("Schafland läuft auf", srv.URL)

	if *serverOnly {
		waitForSignal()
		srv.Close()
		return
	}

	b, err := findBrowser(*browserPath)
	if err != nil {
		srv.Close()
		fail("%v", err)
	}
	dir := *profile
	if dir == "" {
		dir = defaultProfileDir(b)
	}
	cmd := exec.Command(b.Path, browserArgs(b, srv.URL, dir)...)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "Browser beendet:", err)
	}
	srv.Close()
}

func waitForSignal() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
	<-ch
}

func fail(format string, a ...any) {
	msg := fmt.Sprintf(format, a...)
	fmt.Fprintln(os.Stderr, msg)
	showDialog("Schafland", msg, true)
	os.Exit(1)
}

func info(msg string) {
	fmt.Println(msg)
	showDialog("Schafland", msg, false)
}
