import "@fontsource/baloo-2/latin-500.css";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-800.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { settings } from "./lib/settings.svelte.js";
import { isNativeApp } from "./lib/platform.js";
import { scanned } from "./lib/shop.svelte.js";
import { music } from "./lib/music.svelte.js";
import { scanLog } from "./lib/scanlog.svelte.js";
import { update } from "./lib/update.svelte.js";
import { schaf } from "./lib/sprache/schaf.svelte.js";

// In der Android-App die Systemschriften nehmen (siehe app.css, --emoji)
if (isNativeApp) document.documentElement.dataset.native = "";

async function boot() {
  try {
    await Promise.all([settings.load(), scanned.load(), scanLog.load()]);
    music.restore();
    schaf.restore();
  } catch (err) {
    // Ohne Speicher läuft die Kasse trotzdem, nur Einstellungen gehen beim Neustart verloren
    console.warn("Speicher nicht verfügbar", err);
  }
  mount(App, { target: document.getElementById("app") });
  update.init();
}
boot();
