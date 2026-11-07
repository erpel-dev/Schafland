// Für Unit-Tests: IndexedDB-Attrappe (Dexie läuft dann auch in Node) und *.svelte.js übersetzen
import "fake-indexeddb/auto";
import { register } from "node:module";

register("./svelte-loader.mjs", import.meta.url);
