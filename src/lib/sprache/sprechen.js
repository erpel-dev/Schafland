// Vorlesen: im Browser über die Sprachausgabe des Systems (offline, keine Daten nach außen),
// in der Android-App über Androids eigene Sprachausgabe (die WebView kann es nicht).
import { isNativeApp, Kiosk } from "../platform.js";

let voice = null;

function pickVoice() {
  const voices = globalThis.speechSynthesis?.getVoices() ?? [];
  const german = voices.filter((v) => v.lang?.toLowerCase().startsWith("de"));
  // lokale Stimmen bevorzugen (funktionieren offline, senden nichts), weibliche/freundliche zuerst
  voice =
    german.find((v) => v.localService && /hedda|katja|anna|petra|marlene|female|weiblich/i.test(v.name)) ??
    german.find((v) => v.localService) ??
    german[0] ??
    null;
  return voice;
}
globalThis.speechSynthesis?.addEventListener?.("voiceschanged", pickVoice);

/** Gibt es eine deutsche Stimme? (Linux braucht speech-dispatcher) */
export function canSpeak() {
  if (isNativeApp) return true;
  return !!(globalThis.speechSynthesis && (voice ?? pickVoice()));
}

/** Ausführlich, auch für die Android-App: { ok, name } */
export async function speechStatus() {
  if (isNativeApp) {
    try {
      const info = await Kiosk.speechInfo();
      return { ok: info.available && info.german, name: info.available ? `Android-Sprachausgabe (${info.engine})${info.german ? "" : ", aber ohne deutsche Stimme"}` : "" };
    } catch {
      return { ok: false, name: "" };
    }
  }
  return { ok: canSpeak(), name: voiceName() };
}

export function voiceName() {
  if (isNativeApp) return "Android-Sprachausgabe";
  return (voice ?? pickVoice())?.name ?? "";
}

/** Liest vor; das Versprechen erfüllt sich, wenn der Satz zu Ende ist (oder nach Zeitlimit). */
export async function speak(text) {
  if (!text) return;
  if (isNativeApp) {
    try {
      await Kiosk.speak({ text });
    } catch (err) {
      console.warn("Vorlesen nicht möglich", err);
    }
    return;
  }
  const synth = globalThis.speechSynthesis;
  if (!synth || !(voice ?? pickVoice())) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.92; // etwas langsamer für Kinder
  u.pitch = 1.15;
  await new Promise((resolve) => {
    const done = () => resolve();
    u.onend = done;
    u.onerror = done;
    setTimeout(done, 1500 + text.length * 120);
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (isNativeApp) Kiosk.stopSpeaking?.().catch(() => {});
  else globalThis.speechSynthesis?.cancel();
}
