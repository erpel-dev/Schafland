package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"strings"
	"time"
)

// Antwort unter dieser Adresse erkennt ein laufender Schafland-Starter wieder.
const pingPath = "/__schafland"

// Wie viele Ports nach dem Wunsch-Port probiert werden, wenn ein fremdes Programm ihn belegt.
const portTries = 10

type server struct {
	URL   string
	Note  string // Hinweis für die Ausgabe, z. B. anderer Port
	close func()
}

func (s *server) Close() {
	if s.close != nil {
		s.close()
	}
}

func init() {
	// Barcode-Erkennung braucht den richtigen Typ, sonst lädt der Browser die WASM-Datei nicht
	_ = mime.AddExtensionType(".wasm", "application/wasm")
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".js", "text/javascript")
}

// Kartenleser am PC (karte.go): ein Dienst für alle Anfragen
var karten = neuerKartenDienst(oeffneLeser)

func handler(site fs.FS) http.Handler {
	files := http.FileServer(http.FS(site))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == pingPath {
			fmt.Fprintf(w, "schafland %s", version)
			return
		}
		if strings.HasPrefix(r.URL.Path, pingPath+"/") || r.URL.Path == "/starter.json" {
			karten.handler(w, r)
			return
		}
		// Immer frisch ausliefern: nur so findet der Offline-Speicher der App neue Versionen
		w.Header().Set("Cache-Control", "no-cache")
		// „cross-origin isolated“: Spracherkennung darf mehrere Prozessorkerne nutzen.
		// credentialless: Produktbilder anderer Server laden weiter (ohne Cookies).
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "credentialless")
		files.ServeHTTP(w, r)
	})
}

// isSchafland prüft, ob auf dem Port schon ein Schafland-Starter läuft.
func isSchafland(port int) bool {
	c := http.Client{Timeout: 700 * time.Millisecond}
	res, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d%s", port, pingPath))
	if err != nil {
		return false
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 100))
	return strings.HasPrefix(string(body), "schafland")
}

// startServer lauscht nur auf localhost (die Kamera erlaubt der Browser nur dort oder über HTTPS).
// Läuft dort schon ein Schafland-Starter, wird er mitbenutzt (zweiter Doppelklick).
// Belegt ein fremdes Programm den Port, wird der nächste freie genommen; gespeicherte Daten
// gehören dann aber zu einer anderen Adresse und sind dort nicht zu sehen.
func startServer(site fs.FS, port int) (*server, error) {
	for p := port; p < port+portTries; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err != nil {
			if isSchafland(p) {
				return &server{URL: fmt.Sprintf("http://localhost:%d/", p), Note: "Schafland läuft schon, benutze den laufenden Server."}, nil
			}
			continue
		}
		srv := &http.Server{Handler: handler(site), ReadHeaderTimeout: 10 * time.Second}
		go func() {
			if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
				fmt.Println("Webserver:", err)
			}
		}()
		s := &server{
			URL: fmt.Sprintf("http://localhost:%d/", p),
			close: func() {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				_ = srv.Shutdown(ctx)
			},
		}
		if p != port {
			s.Note = fmt.Sprintf("Port %d ist von einem anderen Programm belegt, nehme %d. Gespeicherte Daten von Port %d sind hier nicht zu sehen.", port, p, port)
		}
		return s, nil
	}
	return nil, fmt.Errorf("kein freier Port zwischen %d und %d", port, port+portTries-1)
}
