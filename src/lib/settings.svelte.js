import { kvGet, kvSet } from "./db.js";
import { isGiroReady, DEFAULT_TEXT } from "./girocode.js";

const DEFAULTS = {
  paypalEnabled: false,
  paypalName: "",
  giroEnabled: false,
  giroName: "",
  giroIban: "",
  giroText: DEFAULT_TEXT,
  nfcKarte: true, // Kartenzahlung spielen: NFC-Karte ans Gerät halten (nur wenn das Gerät NFC hat)
  musicAutoplay: true,
  musicVolume: 0.5,
  musicShuffle: true,
  aktion: null, // id der aktiven Aktion oder null
  cameraId: null, // zuletzt gewählte Kamera (Tablets: vorne/hinten)
  cameraLabel: null, // ihr Name: bleibt gleich, auch wenn der Browser die Kennung neu vergibt
  fragSchaf: false, // „Frag das Schaf“: Fragen per Sprache (lädt beim ersten Mal das Erkennungsmodell)
  fragModell: "base", // base (genau) | tiny (schnell)
  sprachAliases: [], // [{ heard, productId }]: so spricht das Kind ein Produkt aus
  kiAn: false, // Stufe 2: freie Fragen mit Sprachmodell
  kiModell: "klein", // klein (LFM2.5-350M) | gross (LFM3-1.7B)
  audioModell: false, // Prototyp: LFM3-Omni hört zu, antwortet, erkennt Bilder (nur mit Grafikkarte)
  omniStimme: false, // LFM3-Omni liest auch vor (natürlich, aber langsam); sonst Stimme des Systems
};

class Settings {
  value = $state({ ...DEFAULTS });

  async load() {
    this.value = { ...DEFAULTS, ...(await kvGet("settings", {})) };
  }

  set(patch) {
    Object.assign(this.value, patch);
    kvSet("settings", $state.snapshot(this.value));
  }

  /** PayPal ist nur nutzbar, wenn eingeschaltet und ein Name hinterlegt ist. */
  get paypalReady() {
    return this.value.paypalEnabled && /^[A-Za-z0-9]{1,20}$/.test(this.value.paypalName);
  }

  /** GiroCode ist nur nutzbar, wenn eingeschaltet, mit Empfängername und gültiger IBAN. */
  get giroReady() {
    return isGiroReady(this.value);
  }
}

export const settings = new Settings();
