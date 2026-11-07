// Kartenzahlung spielen: irgendeine NFC-Karte oder ein NFC-Aufkleber ans Gerät halten.
// Gelesen wird nichts von der Karte (keine Nummern, nichts gespeichert): es zählt nur „Karte da“.
//  - APK: Android-Lesemodus über das KioskPlugin (sieht jede Karte, auch Bankkarten)
//  - Chrome auf Android: Web NFC. Karten ohne NFC-Aufkleber-Format (z. B. Bankkarten) meldet
//    Chrome als „nicht lesbar“ – auch das heißt: Karte wurde hingehalten.
//  - Tests: globalThis.__schafFakeNfc = { available, enabled, granted, watch(onCard) → stop }
import { isNativeApp, Kiosk } from "./platform.js";

const fake = () => globalThis.__schafFakeNfc;

/**
 * Kann dieses Gerät Karten lesen?
 * { available, enabled (NFC in den Android-Einstellungen an), needsTap (Browser: erst nach Antippen) }
 */
export async function nfcInfo() {
  const f = fake();
  if (f) return { available: f.available !== false, enabled: f.enabled !== false, needsTap: !f.granted };
  if (isNativeApp) {
    try {
      const r = await Kiosk.nfcInfo();
      return { available: !!r.available, enabled: !!r.enabled, needsTap: false };
    } catch {
      return { available: false, enabled: false, needsTap: false }; // ältere APK ohne NFC
    }
  }
  if (!("NDEFReader" in globalThis)) return { available: false, enabled: false, needsTap: false };
  // Einmal erlaubt, darf die Seite ohne Antippen lesen
  let granted = false;
  try {
    granted = (await navigator.permissions.query({ name: "nfc" })).state === "granted";
  } catch {
    // Berechtigungs-Abfrage nicht verfügbar: dann eben nach Antippen
  }
  return { available: true, enabled: true, needsTap: !granted };
}

/**
 * Auf Karten warten. onCard() bei jeder hingehaltenen Karte. Ergebnis: stop().
 * Im Browser muss der erste Aufruf aus einem Antippen kommen (sonst NotAllowedError).
 */
export async function watchCards(onCard) {
  const f = fake();
  if (f) return f.watch(onCard) ?? (() => {});
  if (isNativeApp) {
    const handle = await Kiosk.addListener("nfcCard", () => onCard());
    try {
      await Kiosk.nfcStart();
    } catch (err) {
      handle.remove();
      throw err;
    }
    return () => {
      handle.remove();
      Kiosk.nfcStop().catch(() => {});
    };
  }
  const ctrl = new AbortController();
  const reader = new globalThis.NDEFReader();
  reader.onreading = () => onCard();
  reader.onreadingerror = () => onCard();
  await reader.scan({ signal: ctrl.signal });
  return () => ctrl.abort();
}

/** Android: NFC-Einstellungen öffnen (wenn NFC ausgeschaltet ist) */
export function openNfcSettings() {
  if (isNativeApp) Kiosk.nfcSettings().catch(() => {});
}
