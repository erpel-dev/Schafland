// Echter Test von Stufe 2 („Frag das Schaf“ mit Sprachmodell). Braucht Internet (Hugging Face).
// Lädt das kleine Modell (ohne Grafikkarte, auf dem Prozessor) und stellt ein paar offene Fragen.
// Aufruf: node tests/e2e/ki-echt.mjs
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const R = fileURLToPath(new URL("../..", import.meta.url));
const PORT = 8791;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const server = spawn("python3", [`${R}/kiosk/server.py`, `${R}/dist`, String(PORT)], { stdio: "ignore" });
await wait(800);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://localhost:${PORT}/`);
  await page.click("text=Laden öffnen");
  await page.waitForSelector(".tile");
  await page.keyboard.press("Control+,");
  await page.click("nav >> text=Frag das Schaf");
  await page.click("#schaf-on");
  await page.click("#ki-on");
  await page.click('.opt:has-text("Klein")');
  const t0 = Date.now();
  await page.locator("button:has-text('Jetzt laden')").last().click();
  let loaded = true;
  try {
    await page.waitForSelector("text=/✓ Geladen \\((Grafikkarte|Prozessor)\\)/", { timeout: 600000 });
  } catch {
    loaded = false;
  }
  const err = await page.textContent(".err").catch(() => "");
  check("Sprachmodell „Klein“ geladen", loaded, loaded ? `${((Date.now() - t0) / 1000).toFixed(0)} s` : err);
  if (loaded) {
    // Fragen, die Stufe 1 nicht kennt (Gesund, Farben, Frühstück … beantwortet sie mit festem Wissen)
    for (const q of ["Was schmeckt lecker?", "Was kann ich meiner Oma kaufen?", "Was essen Schafe?", "Welches Obst ist rund?"]) {
      await page.fill("#ki-try", q);
      const t = Date.now();
      await page.click("button:has-text('Fragen')");
      await wait(300);
      await page.waitForSelector("button:text-is('Fragen'):not([disabled])", { timeout: 180000 });
      const answer = (await page.textContent(".ki-answer").catch(() => "")).replace(/^🐑\s*/, "");
      const said = answer.split("  (Bilder")[0];
      // geprüft wird, was die App garantiert: kurz, ohne Zahlen/Preise; die Qualität steht im Protokoll
      check(`„${q}“`, said.length > 3 && said.length <= 225 && !/\d/.test(said), `${answer} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    }
  }
  if (errors.length) console.log("Konsole:", errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
process.exit(failed ? 1 : 0);
