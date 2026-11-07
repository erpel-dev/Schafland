//go:build windows

package main

// Windows: die eingebaute Chipkarten-Schnittstelle (winscard.dll), ohne C-Compiler aufgerufen.
// Der Dienst „Smartcard“ startet von selbst, sobald ein Leser eingesteckt ist.

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	winscard             = syscall.NewLazyDLL("winscard.dll")
	procEstablishContext = winscard.NewProc("SCardEstablishContext")
	procReleaseContext   = winscard.NewProc("SCardReleaseContext")
	procListReadersW     = winscard.NewProc("SCardListReadersW")
	procGetStatusChangeW = winscard.NewProc("SCardGetStatusChangeW")
)

const (
	scardScopeUser       = 0
	scardStatePresent    = 0x0020
	scardENoReaders      = 0x8010002E
	scardENoService      = 0x8010001D
	scardEServiceStopped = 0x8010001E
	scardETimeout        = 0x8010000A
)

// SCARD_READERSTATEW (64 Bytes auf 64 Bit)
type readerStateW struct {
	reader       *uint16
	userData     uintptr
	currentState uint32
	eventState   uint32
	atrLen       uint32
	atr          [36]byte
}

type winLeser struct{ ctx uintptr }

type scardFehler uint32

func (e scardFehler) Error() string { return fmt.Sprintf("Chipkarten-Fehler 0x%08X", uint32(e)) }

func init() {
	oeffneSystem = func() (kartenleser, error) {
		if err := winscard.Load(); err != nil {
			return nil, err
		}
		var ctx uintptr
		r, _, _ := procEstablishContext.Call(scardScopeUser, 0, 0, uintptr(unsafe.Pointer(&ctx)))
		if r != 0 {
			return nil, scardFehler(r)
		}
		return &winLeser{ctx}, nil
	}
}

func (w *winLeser) Leser() ([]string, error) {
	var n uint32
	r, _, _ := procListReadersW.Call(w.ctx, 0, 0, uintptr(unsafe.Pointer(&n)))
	if uint32(r) == scardENoReaders {
		return []string{}, nil
	}
	if r != 0 {
		return nil, scardFehler(r)
	}
	buf := make([]uint16, n)
	r, _, _ = procListReadersW.Call(w.ctx, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n)))
	if uint32(r) == scardENoReaders {
		return []string{}, nil
	}
	if r != 0 {
		return nil, scardFehler(r)
	}
	return splitMulti(buf[:n]), nil
}

// splitMulti: „Name1\0Name2\0\0“ → [Name1 Name2]
func splitMulti(buf []uint16) []string {
	var out []string
	start := 0
	for i, c := range buf {
		if c == 0 {
			if i > start {
				out = append(out, syscall.UTF16ToString(buf[start:i]))
			}
			start = i + 1
		}
	}
	return out
}

// Karte: Zustand des Lesers abfragen, ohne zu warten und ohne die Karte anzusprechen
func (w *winLeser) Karte(leser string) (bool, error) {
	name, err := syscall.UTF16PtrFromString(leser)
	if err != nil {
		return false, err
	}
	st := readerStateW{reader: name}
	r, _, _ := procGetStatusChangeW.Call(w.ctx, 0, uintptr(unsafe.Pointer(&st)), 1)
	if r != 0 && uint32(r) != scardETimeout {
		return false, scardFehler(r)
	}
	return st.eventState&scardStatePresent != 0, nil
}

func (w *winLeser) Close() { procReleaseContext.Call(w.ctx) }

func verstaendlich(err error) string {
	if e, ok := err.(scardFehler); ok && (uint32(e) == scardENoService || uint32(e) == scardEServiceStopped) {
		return "Kein Kartenleser eingesteckt (der Windows-Dienst „Smartcard“ startet, sobald einer da ist)."
	}
	return "Kartenleser: " + err.Error()
}
