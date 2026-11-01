// Echter Test der Spracherkennung (Whisper) für „Frag das Schaf“.
// Braucht Internet (Modell von Hugging Face) und WAV-Dateien mit gesprochenen Fragen.
// Aufruf: node tests/e2e/sprache-echt.mjs <ordner-mit-wavs> [base|tiny]
// Die WAV-Dateien heißen wie die erwartete Antwort, z. B. „Banane__Was kostet die Banane.wav“.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const R = fileURLToPath(new URL("../..", import.meta.url));
const DIR = path.resolve(process.argv[2] ?? "sprache-wavs");
const MODEL = process.argv[3] ?? "base";
const PORT = 8790;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const server = spawn("python3", [`${R}/kiosk/server.py`, `${R}/dist`, String(PORT)], { stdio: "ignore" });
await wait(800);
// Ein Browserprofil für alle Fragen: Das Modell wird nur einmal geladen (wie beim Kind zu Hause)
const profile = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP ?? "/tmp", "schaf-profil-"));
try {
  const wavs = fs.readdirSync(DIR).filter((f) => f.endsWith(".wav")).sort();
  let first = true;
  for (const file of wavs) {
    const [expect, sentence] = file.replace(/\.wav$/, "").split("__");
    const ctx = await chromium.launchPersistentContext(profile, {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${path.join(DIR, file)}%noloop`],
      permissions: ["microphone"],
      viewport: { width: 1280, height: 800 },
    });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/`);
    await page.click("text=Laden öffnen");
    await page.waitForSelector(".tile");
    if (first) {
      await page.keyboard.press("Control+,");
      await page.click("nav >> text=Frag das Schaf");
      await page.click("#schaf-on");
      await page.click(`.opt:has(b:text-is("${{ tiny: "Schnell", base: "Genau", small: "Sehr genau" }[MODEL]}"))`);
      const t0 = Date.now();
      await page.click("text=Jetzt laden");
      await page.waitForSelector("text=✓ Geladen", { timeout: 300000 });
      check(`Modell „${MODEL}“ geladen`, true, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
      await page.click("text=Zurück zum Laden");
      first = false;
    }
    const t0 = Date.now();
    await page.click(".askbar");
    let reply = "";
    let heard = "";
    try {
      await page.waitForSelector(".panel .big:not(:has-text('Ich höre')):not(:has-text('überlege')):not(:has-text('spitzt'))", { timeout: 180000 });
      reply = (await page.textContent(".panel .big")).trim();
      heard = (await page.textContent(".panel .heard").catch(() => "")).replace("Du hast gesagt: ", "");
    } catch {
      reply = (await page.textContent(".panel").catch(() => "")) || "keine Antwort";
    }
    const ms = await page.evaluate(() => window.__fragDasSchaf.lastMs);
    const ok = reply.toLowerCase().includes(expect.toLowerCase());
    check(`„${sentence}“`, ok, `gehört: ${heard || "—"} → ${reply} (Erkennung ${(ms / 1000).toFixed(1)} s, gesamt ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    if (errors.length) console.log("  Fehler:", errors.join(" | "));
    await ctx.close();
  }
} finally {
  server.kill();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
process.exit(failed ? 1 : 0);
