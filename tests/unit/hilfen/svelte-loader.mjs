// Node-Loader für Unit-Tests: *.svelte.js-Dateien (Svelte-Runen wie $state) vorher übersetzen,
// so wie es Vite in der App macht. Aufruf: node --import ./tests/unit/hilfen/svelte-register.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compileModule } from "svelte/compiler";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".svelte.js")) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const { js } = compileModule(await readFile(filename, "utf8"), { filename, generate: "client", dev: false });
  return { format: "module", source: js.code, shortCircuit: true };
}
