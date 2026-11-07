package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Leser, der beim ersten Aufruf scheitert (Dienst neu gestartet) und dann wieder geht
type wackelLeser struct {
	fehler   error
	geschlos *int
}

func (w *wackelLeser) Leser() ([]string, error)   { return []string{"W"}, w.fehler }
func (w *wackelLeser) Karte(string) (bool, error) { return false, w.fehler }
func (w *wackelLeser) Close()                     { *w.geschlos++ }

func TestNachFehlerWirdNeuVerbunden(t *testing.T) {
	geoeffnet, geschlossen := 0, 0
	d := neuerKartenDienst(func() (kartenleser, error) {
		geoeffnet++
		if geoeffnet == 1 {
			return &wackelLeser{fehler: errors.New("Verbindung weg"), geschlos: &geschlossen}, nil
		}
		return &wackelLeser{geschlos: &geschlossen}, nil
	})
	if info := d.info(); info.Fehler == "" || len(info.Leser) != 0 {
		t.Fatalf("erster Versuch: %+v", info)
	}
	if geschlossen != 1 || d.leser != nil {
		t.Fatalf("kaputte Verbindung nicht geschlossen (%d) oder behalten", geschlossen)
	}
	info := d.info()
	if info.Fehler != "" || len(info.Leser) != 1 || geoeffnet != 2 {
		t.Fatalf("zweiter Versuch: %+v, geöffnet %d", info, geoeffnet)
	}
	// Verbindung bleibt bestehen, solange sie funktioniert
	d.info()
	if geoeffnet != 2 {
		t.Fatalf("unnötig neu verbunden: %d", geoeffnet)
	}
}

func TestOeffnenScheitert(t *testing.T) {
	d := neuerKartenDienst(func() (kartenleser, error) { return nil, errors.New("geht nicht") })
	info := d.info()
	if !info.Starter || info.Leser == nil || !strings.Contains(info.Fehler, "geht nicht") {
		t.Fatalf("%+v", info)
	}
}

func TestSystemOhneKartenleser(t *testing.T) {
	t.Setenv("SCHAFLAND_TESTKARTE", "")
	alt := oeffneSystem
	oeffneSystem = nil
	defer func() { oeffneSystem = alt }()
	if _, err := oeffneLeser(); err == nil || !strings.Contains(err.Error(), "nicht unterstützt") {
		t.Fatalf("Fehler erwartet: %v", err)
	}
}

func TestTestleser(t *testing.T) {
	l := testleser{t.TempDir() + "/fehlt"}
	if da, err := l.Karte("Testleser"); da || err != nil {
		t.Fatal("Karte da ohne Datei")
	}
	l.Close()
}

// ResponseWriter ohne Flush (z. B. hinter einem Proxy): Stream geht nicht, aber kein Absturz
type ohneFlush struct{ http.ResponseWriter }

func TestStreamOhneFlush(t *testing.T) {
	d := neuerKartenDienst(oeffneLeser)
	rec := httptest.NewRecorder()
	d.handler(ohneFlush{rec}, httptest.NewRequest("GET", pingPath+"/karte/warten", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("Status %d", rec.Code)
	}
	if len(d.warten) != 0 {
		t.Fatal("Wartender bleibt angemeldet")
	}
}
