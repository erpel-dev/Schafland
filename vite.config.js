import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
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
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Produktbilder von Open Food Facts landen ohnehin in IndexedDB
        navigateFallback: "index.html",
      },
    }),
  ],
  worker: { format: "es" },
});
