// Produktbilder für den Bilderkennungs-Test: große Emojis (Noto Color Emoji) als PNG.
// Aufruf: node tests/lfm3/bilder.mjs <ordner>
import { chromium } from "playwright";
import fs from "node:fs";

const dir = process.argv[2] ?? "bilder";
fs.mkdirSync(dir, { recursive: true });
const items = { Banane: "🍌", Apfel: "🍎", Karotte: "🥕", Brezel: "🥨", Erdbeeren: "🍓", Ananas: "🍍" };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
for (const [name, emoji] of Object.entries(items)) {
  await page.setContent(`<body style="margin:0;background:#f4f1ea;display:grid;place-items:center;height:320px"><span style="font:230px 'Noto Color Emoji'">${emoji}</span></body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${dir}/${name}.png` });
}
await browser.close();
console.log(fs.readdirSync(dir).join(", "));
