// Erzeugt Testkameras (Y4M-Videos mit Strichcodes), ein Produktfoto und Test-MP3s.
// Braucht ffmpeg und Playwright-Chromium. Ergebnis: tests/e2e/.fixtures/
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkDigit } from "../../src/lib/ean.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const FIX = path.join(ROOT, "tests/e2e/.fixtures");
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);

export const CODES = {
  off: "4001234567891", // simuliertes Open-Food-Facts-Produkt
  own: "2101001000001", // eigenes Etikett: Apfel
  unknown: "4009998887774", // gültig, aber in keiner Datenbank
  magazine: "977072486700" + checkDigit("977072486700"), // Zeitschrift mit ISSN 0724-8679 (c't)
  book: "9783161484100", // Beispiel-ISBN 978-3-16-148410-0
  press: "4199148407003", // deutscher Pressecode (c't): Titel 91484, 7,00 €, Zusatzcode 23 = Ausgabe
};
// Bei Änderungen an den Fixtures erhöhen, dann werden sie neu erzeugt
const VERSION = "5";

export async function makeFixtures({ force = false } = {}) {
  if (!force && existsSync(path.join(FIX, "done")) && readFileSync(path.join(FIX, "done"), "utf8").startsWith(`${VERSION} `)) return FIX;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg fehlt. Installieren: sudo apt install ffmpeg");
  }
  mkdirSync(path.join(FIX, "musik"), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });

  async function cam(name, code, { barWidth = 2.6, height = 110, rot = -5, label = "", addOn = "" } = {}) {
    await page.setContent(`<body style="margin:0;background:radial-gradient(#8a8f84,#4a4f45);width:640px;height:480px;display:grid;place-items:center">
      ${code ? `<div style="background:#7b3f22;padding:26px 30px;border-radius:10px;transform:rotate(${rot}deg)">
      <div style="background:#fff;padding:8px 14px;border-radius:4px;font:700 20px sans-serif">${label}<br><svg id="bc"></svg></div></div>` : ""}</body>`);
    if (code) {
      await page.addScriptTag({ path: path.join(ROOT, "node_modules/jsbarcode/dist/JsBarcode.all.min.js") });
      await page.evaluate(([c, w, h, add]) => {
        if (!add) return JsBarcode("#bc", c, { format: "EAN13", width: w, height: h, fontSize: 16, margin: 4 });
        // Zeitschriften und US-Bücher: Zusatzcode (EAN-2/EAN-5) rechts neben dem Hauptcode
        JsBarcode("#bc").options({ width: w, fontSize: 16, margin: 4 }).EAN13(c, { height: h }).blank(9)[add.length === 2 ? "EAN2" : "EAN5"](add, { height: h * 0.85, textPosition: "top" }).render();
      }, [code, barWidth, height, addOn]);
    }
    await page.screenshot({ path: path.join(FIX, `${name}.png`) });
  }
  await cam("off", CODES.off);
  await cam("own", CODES.own, { label: "Apfel", rot: 3 });
  await cam("unknown", CODES.unknown);
  await cam("magazine", CODES.magazine, { label: "c't 23/2026", rot: -3 });
  await cam("book", CODES.book, { label: "ISBN 978-3-16-148410-0", rot: 4 });
  await cam("press", CODES.press, { label: "c't 23/2026", rot: -3, barWidth: 2, addOn: "23" });
  // Buch hochkant vor die Kamera gehalten, mit Preis-Zusatzcode wie bei US-Taschenbüchern
  await cam("book-rotated", CODES.book, { label: "ISBN 978-3-16-148410-0", rot: 88, barWidth: 1.8, height: 90, addOn: "50899" });
  await cam("small", CODES.off, { barWidth: 1.1, height: 45, rot: -8 });
  await cam("empty", null);

  await page.setViewportSize({ width: 300, height: 300 });
  await page.setContent(`<body style="margin:0;width:300px;height:300px;display:grid;place-items:center;background:#fff">
    <div style="width:250px;height:150px;background:#5a2a8a;border-radius:10px;transform:rotate(-8deg);color:#fff;font:800 30px sans-serif;display:flex;flex-direction:column;justify-content:center;padding-left:22px">Vollmilch<br>Schokolade</div></body>`);
  await page.screenshot({ path: path.join(FIX, "product.png") });
  await browser.close();

  const y4m = (src, out, vf) => ffmpeg("-loop", "1", "-t", "3", "-r", "15", "-i", path.join(FIX, src), ...(vf ? ["-vf", vf] : []), "-pix_fmt", "yuv420p", path.join(FIX, out));
  for (const n of ["off", "own", "unknown", "magazine", "book", "press", "book-rotated", "small", "empty"]) y4m(`${n}.png`, `${n}.y4m`);
  // Wie eine alte Fixfokus-Webcam: unscharf und verrauscht
  y4m("off.png", "blur.y4m", "gblur=sigma=2.5,noise=alls=18:allf=t");
  // Absichtlich zu schwer: klein, unscharf und kontrastarm zugleich
  y4m("small.png", "hard.y4m", "gblur=sigma=1.5,noise=alls=15:allf=t,eq=contrast=0.6:brightness=-0.15");

  for (const [name, hz] of [["01_Kurz-A", 440], ["02_Kurz-B", 523], ["03_Kurz-C", 659]]) {
    ffmpeg("-f", "lavfi", "-i", `sine=frequency=${hz}:duration=2`, "-q:a", "9", path.join(FIX, "musik", `${name}.mp3`));
  }
  writeFileSync(path.join(FIX, "musik", "02b_Kaputt.mp3"), randomBytes(5000));
  writeFileSync(path.join(FIX, "done"), `${VERSION} ${new Date().toISOString()}`);
  return FIX;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await makeFixtures({ force: true });
  console.log("Fixtures erzeugt in", FIX);
}
