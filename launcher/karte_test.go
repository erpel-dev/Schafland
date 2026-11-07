package main

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// simulierter Leser: Karte per Test umschaltbar, zählt Abfragen
type fakeLeser struct {
	mu      sync.Mutex
	da      bool
	abfrage int
}

func (f *fakeLeser) Leser() ([]string, error) { return []string{"Fake"}, nil }
func (f *fakeLeser) Karte(string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.abfrage++
	return f.da, nil
}
func (f *fakeLeser) Close() {}
func (f *fakeLeser) setze(da bool) {
	f.mu.Lock()
	f.da = da
	f.mu.Unlock()
}
func (f *fakeLeser) abfragen() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.abfrage
}

func warteAuf(t *testing.T, ch <-chan struct{}, d time.Duration) bool {
	t.Helper()
	select {
	case <-ch:
		return true
	case <-time.After(d):
		return false
	}
}

func TestKarteNurWennNeuAufgelegt(t *testing.T) {
	f := &fakeLeser{da: true} // steckt schon beim Öffnen des Bezahlfensters
	d := neuerKartenDienst(func() (kartenleser, error) { return f, nil })
	d.takt = 10 * time.Millisecond
	ch, abmelden := d.abonnieren()
	if warteAuf(t, ch, 150*time.Millisecond) {
		t.Fatal("Karte, die schon steckt, darf nicht bezahlen")
	}
	f.setze(false)
	time.Sleep(50 * time.Millisecond)
	f.setze(true)
	if !warteAuf(t, ch, time.Second) {
		t.Fatal("neu eingesteckte Karte nicht gemeldet")
	}
	if warteAuf(t, ch, 150*time.Millisecond) {
		t.Fatal("liegende Karte darf nur einmal melden")
	}
	abmelden()
	time.Sleep(60 * time.Millisecond)
	n := f.abfragen()
	time.Sleep(100 * time.Millisecond)
	if f.abfragen() != n {
		t.Fatal("ohne Wartende wird der Leser weiter abgefragt")
	}
}

func TestKartenStreamUndInfo(t *testing.T) {
	datei := filepath.Join(t.TempDir(), "karte")
	t.Setenv("SCHAFLAND_TESTKARTE", datei)
	karten = neuerKartenDienst(oeffneLeser)
	karten.takt = 20 * time.Millisecond
	srv, err := startServer(testSite, freePort(t))
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()

	for _, pfad := range []string{"__schafland/karte", "starter.json"} {
		_, body := get(t, srv.URL+pfad)
		var info kartenInfo
		if err := json.Unmarshal([]byte(body), &info); err != nil || !info.Starter || len(info.Leser) != 1 || info.Leser[0] != "Testleser" || info.Fehler != "" {
			t.Fatalf("%s: %s (%v)", pfad, body, err)
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"__schafland/karte/warten", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if ct := res.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("Content-Type %q", ct)
	}
	zeilen := make(chan string, 10)
	go func() {
		sc := bufio.NewScanner(res.Body)
		for sc.Scan() {
			zeilen <- sc.Text()
		}
		close(zeilen)
	}()
	time.Sleep(100 * time.Millisecond)
	if err := os.WriteFile(datei, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	deadline := time.After(2 * time.Second)
	for {
		select {
		case z, ok := <-zeilen:
			if !ok {
				t.Fatal("Stream zu Ende ohne Karte")
			}
			if z == "event: karte" {
				return
			}
		case <-deadline:
			t.Fatal("keine Karte gemeldet")
		}
	}
}

func TestUnbekannterPfadUnterSchafland(t *testing.T) {
	srv, err := startServer(testSite, freePort(t))
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	res, _ := get(t, srv.URL+"__schafland/gibtsnicht")
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("Status %d", res.StatusCode)
	}
	_, body := get(t, srv.URL+"__schafland")
	if !strings.HasPrefix(body, "schafland") {
		t.Fatalf("Ping kaputt: %q", body)
	}
}
