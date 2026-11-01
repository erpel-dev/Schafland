import { defineConfig, defaultClientConditions } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

// Version für den Eltern-Bereich, damit man auf dem Notebook sieht, welcher Stand läuft
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// SCHAFLAND_VERSION nur für Tests (Update-Test baut mehrere Versionen)
const APP_VERSION = `${process.env.SCHAFLAND_VERSION ?? pkg.version} vom ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

export default defineConfig({
  base: "./",
  // Spracherkennung: ONNX-Laufzeit ohne eingebaute Verweise auf ihre großen .wasm-Dateien;
  // die passende (ohne WebGPU, 14 MB) liefert die App selbst aus (src/lib/sprache/schaf.svelte.js)
  resolve: { conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions] },
  plugins: [
    svelte(),
    VitePWA({
      // "prompt": die App entscheidet, wann eine neue Version geladen wird (src/lib/update.svelte.js)
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["schaf.svg"],
      manifest: {
        name: "Schafland",
        short_name: "Schafland",
        description: "Hier bin ich Schaf, hier kauf ich ein",
        lang: "de",
        display: "fullscreen",
        background_color: "#fffdf7",
        theme_color: "#cfe8f7",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "schaf.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,wasm}"],
        // Laufzeit der Spracherkennung nur laden, wenn „Frag das Schaf“ benutzt wird; dann behalten
        globIgnores: ["**/ort-wasm-*"],
        runtimeCaching: [
          { urlPattern: /\/assets\/ort-wasm-[^/]+$/, handler: "CacheFirst", options: { cacheName: "spracherkennung" } },
        ],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Produktbilder von Open Food Facts landen ohnehin in IndexedDB
        navigateFallback: "index.html",
      },
    }),
  ],
  worker: { format: "es" },
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
});
