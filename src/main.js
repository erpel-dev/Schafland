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
import { scanned } from "./lib/shop.svelte.js";
import { music } from "./lib/music.svelte.js";

async function boot() {
  try {
    await Promise.all([settings.load(), scanned.load()]);
    music.restore();
  } catch (err) {
    // Ohne Speicher läuft die Kasse trotzdem, nur Einstellungen gehen beim Neustart verloren
    console.warn("Speicher nicht verfügbar", err);
  }
  mount(App, { target: document.getElementById("app") });
}
boot();
