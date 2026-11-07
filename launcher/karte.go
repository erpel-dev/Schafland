package main

// Kartenzahlung spielen am PC: ein USB-Chipkartenleser (PC/SC, z. B. ein Leser für den
// Personalausweis mit NFC und Kartenschlitz). Der Browser darf solche Leser nicht ansprechen,
// deshalb fragt der Starter ihn ab und meldet der Seite nur „Karte da“.
// Gelesen wird nichts von der Karte: keine Nummern, nichts gespeichert.
//
//   GET /starter.json              → {"starter": true, "leser": ["…"], "fehler": "…"}
//                                    (in der App liegt dieselbe Datei mit „starter: false“: so
//                                    fragt die Seite ohne Fehlermeldung, ob sie im Starter läuft)
//   GET /__schafland/karte         → dasselbe
//   GET /__schafland/karte/warten  → Ereignis-Stream: „event: karte“, sobald eine Karte
//                                    aufgelegt oder eingesteckt wird
//
// Der Leser wird nur abgefragt, solange jemand wartet (Bezahlfenster offen).

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

// kartenleser: Zugriff auf die Chipkarten-Schnittstelle des Systems (Linux: pcscd, Windows: winscard)
type kartenleser interface {
	Leser() ([]string, error)
	Karte(leser string) (bool, error) // liegt eine Karte auf bzw. steckt eine?
	Close()
}

// öffnet die Schnittstelle des Systems (karte_linux.go, karte_windows.go)
var oeffneSystem func() (kartenleser, error)

// Testleser: SCHAFLAND_TESTKARTE=<datei> → ein Leser „Testleser“, Karte da, solange die Datei existiert
type testleser struct{ datei string }

func (t testleser) Leser() ([]string, error) { return []string{"Testleser"}, nil }
func (t testleser) Karte(string) (bool, error) {
	_, err := os.Stat(t.datei)
	return err == nil, nil
}
func (t testleser) Close() {}

func oeffneLeser() (kartenleser, error) {
	if f := os.Getenv("SCHAFLAND_TESTKARTE"); f != "" {
		return testleser{f}, nil
	}
	if oeffneSystem == nil {
		return nil, fmt.Errorf("Kartenleser werden auf diesem System nicht unterstützt")
	}
	return oeffneSystem()
}

const kartenTakt = 250 * time.Millisecond

type kartenDienst struct {
	oeffne func() (kartenleser, error)
	takt   time.Duration

	mu     sync.Mutex
	leser  kartenleser
	warten map[chan struct{}]struct{}
	laeuft bool
}

func neuerKartenDienst(oeffne func() (kartenleser, error)) *kartenDienst {
	return &kartenDienst{oeffne: oeffne, takt: kartenTakt, warten: map[chan struct{}]struct{}{}}
}

// mitLeser: Verbindung zur Schnittstelle (bei Fehlern beim nächsten Mal neu aufbauen, z. B. wenn
// der Dienst neu gestartet wurde)
func (d *kartenDienst) mitLeser(f func(kartenleser) error) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.leser == nil {
		l, err := d.oeffne()
		if err != nil {
			return err
		}
		d.leser = l
	}
	if err := f(d.leser); err != nil {
		d.leser.Close()
		d.leser = nil
		return err
	}
	return nil
}

type kartenInfo struct {
	Starter bool     `json:"starter"`
	Leser   []string `json:"leser"`
	Fehler  string   `json:"fehler,omitempty"`
}

func (d *kartenDienst) info() kartenInfo {
	info := kartenInfo{Starter: true, Leser: []string{}}
	err := d.mitLeser(func(l kartenleser) error {
		namen, err := l.Leser()
		if err == nil {
			info.Leser = append(info.Leser, namen...)
		}
		return err
	})
	if err != nil {
		info.Fehler = verstaendlich(err)
	}
	return info
}

// abonnieren: Kanal bekommt bei jeder neu aufgelegten Karte ein Signal; abmelden() beendet es
func (d *kartenDienst) abonnieren() (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	d.mu.Lock()
	d.warten[ch] = struct{}{}
	if !d.laeuft {
		d.laeuft = true
		go d.beobachten()
	}
	d.mu.Unlock()
	return ch, func() {
		d.mu.Lock()
		delete(d.warten, ch)
		d.mu.Unlock()
	}
}

// beobachten fragt die Leser ab, solange jemand wartet. Zählt nur, wenn eine Karte NEU kommt:
// eine Karte, die beim Öffnen schon steckt, bezahlt nicht (erst rausnehmen und wieder rein).
func (d *kartenDienst) beobachten() {
	vorher := map[string]bool{}
	erste := true
	for {
		d.mu.Lock()
		if len(d.warten) == 0 {
			d.laeuft = false
			d.mu.Unlock()
			return
		}
		d.mu.Unlock()

		jetzt := map[string]bool{}
		_ = d.mitLeser(func(l kartenleser) error {
			namen, err := l.Leser()
			if err != nil {
				return err
			}
			for _, n := range namen {
				da, err := l.Karte(n)
				if err != nil {
					continue // Leser kurz nicht erreichbar: zählt als „keine Karte“
				}
				jetzt[n] = da
			}
			return nil
		})
		neu := false
		for n, da := range jetzt {
			if da && !vorher[n] && !erste {
				neu = true
			}
		}
		vorher, erste = jetzt, false
		if neu {
			d.mu.Lock()
			for ch := range d.warten {
				select {
				case ch <- struct{}{}:
				default:
				}
			}
			d.mu.Unlock()
		}
		time.Sleep(d.takt)
	}
}

func (d *kartenDienst) handler(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case pingPath + "/karte", "/starter.json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(d.info())
	case pingPath + "/karte/warten":
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "kein Stream", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-store")
		ch, abmelden := d.abonnieren()
		defer abmelden()
		fmt.Fprint(w, ": bereit\n\n")
		fl.Flush()
		ping := time.NewTicker(15 * time.Second)
		defer ping.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case <-ch:
				fmt.Fprint(w, "event: karte\ndata: {}\n\n")
				fl.Flush()
			case <-ping.C:
				fmt.Fprint(w, ": ping\n\n")
				fl.Flush()
			}
		}
	default:
		http.NotFound(w, r)
	}
}
