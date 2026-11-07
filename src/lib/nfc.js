// Kartenzahlung spielen: irgendeine NFC-Karte oder ein NFC-Aufkleber ans Gerät halten.
// Gelesen wird nichts von der Karte (keine Nummern, nichts gespeichert): es zählt nur „Karte da“.
//  - APK: Android-Lesemodus über das KioskPlugin (sieht jede Karte, auch Bankkarten)
//  - Chrome auf Android: Web NFC. Karten ohne NFC-Aufkleber-Format (z. B. Bankkarten) meldet
//    Chrome als „nicht lesbar“ – auch das heißt: Karte wurde hingehalten.
//  - PC mit Schafland-Starter (exe/Linux): USB-Chipkartenleser (PC/SC). Der Starter fragt ihn ab
//    und meldet „Karte da“ (launcher/karte.go), auch fürs Einstecken in den Kartenschlitz.
//  - Tests: globalThis.__schafFakeNfc = { available, enabled, granted, watch(onCard) → stop }
import { isNativeApp, Kiosk } from "./platform.js";

const fake = () => globalThis.__schafFakeNfc;

/**
 * Läuft Schafland im Starter am PC? Dann kennt er die Kartenleser: { leser, fehler } oder null.
 * starter.json liegt in der App („starter: false“); nur der Starter ersetzt sie durch echte Angaben.
 */
async function pcInfo() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}starter.json`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    const info = res.ok ? await res.json() : null;
    return info?.starter && Array.isArray(info.leser) ? info : null;
  } catch {
    return null;
  }
}

/**
 * Kann dieses Gerät Karten lesen?
 * { available, enabled (NFC in den Android-Einstellungen an), needsTap (Browser: erst nach Antippen),
 *   pc (USB-Leser am PC), leser (deren Namen), hinweis (warum am PC keiner geht) }
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
  const pc = await pcInfo();
  if (pc?.leser.length) return { available: true, enabled: true, needsTap: false, pc: true, leser: pc.leser };
  if (!("NDEFReader" in globalThis)) return { available: false, enabled: false, needsTap: false, hinweis: pc?.fehler || "" };
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
  if ((await pcInfo())?.leser.length) {
    const events = new EventSource("/__schafland/karte/warten");
    events.addEventListener("karte", () => onCard());
    // erst „bereit“ melden, wenn der Starter zuhört (sonst ginge eine sehr schnelle Karte verloren)
    await new Promise((resolve) => {
      events.onopen = resolve;
      setTimeout(resolve, 1500);
    });
    return () => events.close();
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
