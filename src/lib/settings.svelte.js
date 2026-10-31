import { kvGet, kvSet } from "./db.js";

const DEFAULTS = {
  paypalEnabled: false,
  paypalName: "",
  musicAutoplay: true,
  musicVolume: 0.5,
  musicShuffle: true,
  aktion: null, // id der aktiven Aktion oder null
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
}

export const settings = new Settings();
