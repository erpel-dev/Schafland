// Produktbilder für den Bilderkennungs-Test: Emojis (Noto Color Emoji) als PNG.
// „leicht“: groß auf ruhigem Grund. „schwer“: kleiner, schräg, leicht unscharf, unruhiger Hintergrund
// (ungefähr wie ein Spielzeug, das ein Kind vor die Kamera hält).
// Aufruf: node tests/lfm3/bilder.mjs <ordner>
import { chromium } from "playwright";
import fs from "node:fs";

const dir = process.argv[2] ?? "bilder";
fs.mkdirSync(dir, { recursive: true });
const items = { Banane: "🍌", Apfel: "🍎", Karotte: "🥕", Brezel: "🥨", Erdbeeren: "🍓", Ananas: "🍍", Tomate: "🍅", Brokkoli: "🥦" };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
for (const [name, emoji] of Object.entries(items)) {
  await page.setContent(`<body style="margin:0;background:#f4f1ea;display:grid;place-items:center;height:480px"><span style="font:260px 'Noto Color Emoji'">${emoji}</span></body>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${dir}/${name}.png` });
  // schwer: Zimmer-Hintergrund mit Streifen und Flecken, Objekt kleiner, gedreht, etwas unscharf
  await page.setContent(`<body style="margin:0;height:480px;overflow:hidden;background:
      repeating-linear-gradient(35deg,#c9b79c 0 40px,#b9a483 40px 80px);position:relative">
    <div style="position:absolute;left:30px;top:40px;width:160px;height:120px;background:#5d7fa3;border-radius:12px"></div>
    <div style="position:absolute;right:40px;bottom:30px;width:200px;height:90px;background:#9c4f4f;border-radius:40px"></div>
    <div style="position:absolute;left:0;right:0;top:0;bottom:0;display:grid;place-items:center">
      <span style="font:150px 'Noto Color Emoji';transform:rotate(18deg) translate(20px,-10px);filter:blur(1.2px) saturate(0.85) brightness(0.95);display:inline-block">${emoji}</span>
    </div></body>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${dir}/${name}-schwer.png` });
}
await browser.close();
console.log(fs.readdirSync(dir).join(", "));
