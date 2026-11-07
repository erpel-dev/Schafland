//go:build linux

package main

// Linux: der Chipkarten-Dienst pcscd (Paket „pcscd“), angesprochen über seinen Socket
// (reines Go, keine C-Bibliothek nötig).

import (
	"errors"
	"os"
	"strings"
	"syscall"

	pcsc "github.com/gballet/go-libpcsclite"
)

type pcscLeser struct{ c *pcsc.Client }

func init() {
	oeffneSystem = func() (kartenleser, error) {
		sock := os.Getenv("PCSCLITE_CSOCK_NAME") // wie bei libpcsclite: anderer Socket (z. B. Flatpak)
		if sock == "" {
			sock = pcsc.PCSCDSockName
		}
		c, err := pcsc.EstablishContext(sock, pcsc.ScopeSystem)
		if err != nil {
			return nil, err
		}
		return &pcscLeser{c}, nil
	}
}

func (p *pcscLeser) Leser() ([]string, error) {
	namen, err := p.c.ListReaders()
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(namen))
	for _, n := range namen {
		if n = strings.TrimRight(n, "\x00"); n != "" {
			out = append(out, n)
		}
	}
	return out, nil
}

// Karte: Verbinden klappt nur, wenn eine Karte aufliegt oder steckt; sofort wieder trennen,
// ohne etwas zu lesen. Andere Programme (z. B. die AusweisApp) können den Leser weiter nutzen.
func (p *pcscLeser) Karte(leser string) (bool, error) {
	card, err := p.c.Connect(leser, pcsc.ShareShared, pcsc.ProtocolAny)
	if err != nil {
		return kartenStatus(err)
	}
	_ = card.Disconnect(pcsc.LeaveCard)
	return true, nil
}

// kartenStatus: Fehler beim Verbinden → liegt eine Karte auf?
func kartenStatus(err error) (bool, error) {
	msg := err.Error()
	// keine Karte (8010000c), Karte stumm (80100066), ohne Strom (80100068) oder gerade entfernt (80100069)
	for _, code := range []string{"8010000c", "80100066", "80100068", "80100069"} {
		if strings.Contains(msg, code) {
			return false, nil
		}
	}
	// von einem anderen Programm exklusiv belegt (8010000b): Karte ist trotzdem da
	if strings.Contains(msg, "8010000b") {
		return true, nil
	}
	return false, err
}

func (p *pcscLeser) Close() { _ = p.c.ReleaseContext() }

func verstaendlich(err error) string {
	if errors.Is(err, os.ErrNotExist) || errors.Is(err, syscall.ENOENT) || errors.Is(err, syscall.ECONNREFUSED) || strings.Contains(err.Error(), "no such file") || strings.Contains(err.Error(), "connection refused") {
		return "Der Chipkarten-Dienst pcscd läuft nicht. Einmal installieren: sudo apt install pcscd"
	}
	if strings.Contains(err.Error(), "connection reset") {
		return "Der Chipkarten-Dienst pcscd lehnt Schafland ab (Rechte, polkit)."
	}
	return "Kartenleser: " + err.Error()
}
