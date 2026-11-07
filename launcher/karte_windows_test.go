//go:build windows

package main

import (
	"testing"
	"unsafe"
)

func TestReaderStateLayout(t *testing.T) {
	// muss genau SCARD_READERSTATEW entsprechen, sonst liest Windows falsche Felder
	if s := unsafe.Sizeof(readerStateW{}); s != 64 {
		t.Fatalf("readerStateW ist %d Bytes statt 64", s)
	}
	if o := unsafe.Offsetof(readerStateW{}.eventState); o != 20 {
		t.Fatalf("eventState bei %d statt 20", o)
	}
}

func TestSplitMulti(t *testing.T) {
	buf := []uint16{'A', 0, 'B', 'C', 0, 0}
	got := splitMulti(buf)
	if len(got) != 2 || got[0] != "A" || got[1] != "BC" {
		t.Fatalf("%q", got)
	}
}

// Auf einem Rechner ohne Leser (GitHub-Windows): Schnittstelle antwortet sauber, keine Abstürze
func TestWinscardOhneLeser(t *testing.T) {
	t.Setenv("SCHAFLAND_TESTKARTE", "")
	d := neuerKartenDienst(oeffneLeser)
	info := d.info()
	t.Logf("Leser %q, Hinweis %q", info.Leser, info.Fehler)
	if info.Leser == nil {
		t.Fatal("Leser-Liste fehlt")
	}
	for _, l := range info.Leser {
		if _, err := d.leser.Karte(l); err != nil {
			t.Fatalf("Karte(%q): %v", l, err)
		}
	}
}
