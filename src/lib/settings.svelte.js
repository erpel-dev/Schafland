import { kvGet, kvSet } from "./db.js";
import { isGiroReady, DEFAULT_TEXT } from "./girocode.js";

const DEFAULTS = {
  paypalEnabled: false,
  paypalName: "",
  giroEnabled: false,
  giroName: "",
  giroIban: "",
  giroText: DEFAULT_TEXT,
  musicAutoplay: true,
  musicVolume: 0.5,
  musicShuffle: true,
  aktion: null, // id der aktiven Aktion oder null
  cameraId: null, // zuletzt gewählte Kamera (Tablets: vorne/hinten)
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
