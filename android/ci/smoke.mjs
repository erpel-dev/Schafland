// Bedient die Schafland-App im Android-Emulator über das Chrome-DevTools-Protokoll der WebView.
// Screenshots (verkleinert, JPEG) landen als base64 im Protokoll: Zeilen "SCREENSHOT <name> <daten>".
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const NAME = process.argv[2] ?? "Gerät";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${NAME}: ${name}${detail ? "  — " + detail : ""}`);
};
const adb = (...args) => execFileSync("adb", args, { maxBuffer: 64 * 1024 * 1024 });

function screenshot(label) {
  const png = adb("exec-out", "screencap", "-p");
  fs.mkdirSync("android-shots", { recursive: true });
  const file = `android-shots/${NAME}-${label}.png`;
  fs.writeFileSync(file, png);
  // verkleinern, damit es ins Protokoll passt
  const jpg = execFileSync("python3", ["-c", `
import sys, io
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
im.thumbnail((720, 720))
b = io.BytesIO(); im.save(b, "JPEG", quality=70); sys.stdout.buffer.write(b.getvalue())`, file]);
  console.log(`SCREENSHOT ${NAME}-${label} ${jpg.toString("base64")}`);
}

// --- minimaler CDP-Client (verbindet sich neu, falls die Seite neu lädt; jede Anfrage mit Zeitlimit)
let ws;
let seq = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = await (await fetch("http://127.0.0.1:9222/json")).json();
      const page = pages.find((p) => p.type === "page" && p.url.startsWith("https://localhost"));
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error("Zeitlimit")), 5000); });
        ws.onmessage = (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        };
        ws.onclose = () => { for (const [, res] of pending) res({ error: { message: "Verbindung geschlossen" } }); pending.clear(); ws = null; };
        return page.url;
      }
    } catch {}
    await wait(1000);
  }
  throw new Error("WebView nicht erreichbar");
}
async function send(method, params = {}) {
  if (!ws || ws.readyState !== 1) await connect();
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => {
    pending.set(id, res);
    setTimeout(() => { if (pending.delete(id)) res({ error: { message: `Zeitlimit bei ${method}` } }); }, 10000);
  });
}
async function js(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.error) throw new Error(r.error.message);
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "JS-Fehler");
  return r.result?.result?.value;
}
async function until(expression, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(expression).catch(() => false)) return true; await wait(300); }
  return false;
}
const click = (sel) => js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})][0]; if (!el) return false; el.click(); return true; })()`);
const clickText = (sel, text) => js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.replace(/\\u00ad/g, "").includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`);

try {
  const url = await connect();
  check("App startet in der WebView", true, url);
  check("läuft als Android-App", await until(`window.Capacitor?.getPlatform?.() === "android"`), await js("window.Capacitor?.getPlatform?.()").catch((e) => e.message));
  check("Startbildschirm", await until(`document.body.innerText.includes("Laden öffnen")`));
  await wait(1500);
  screenshot("1-start");

  await clickText("button", "Laden öffnen");
  check("Laden öffnen", await until(`!!document.querySelector(".tile")`));
  const size = await js("[innerWidth, innerHeight]");
  const narrow = await js(`!!document.querySelector(".bar")`);
  check("passende Anordnung", narrow === size[0] <= 760, `${size.join("×")} CSS-Pixel, Korb als ${narrow ? "Leiste unten" : "Spalte rechts"}`);
  await clickText(".tile", "Apfel");
  await clickText(".tile", "Banane");
  const total = await js(`(document.querySelector(".bar-total") ?? document.querySelector(".total b")).textContent.replace(/\\s/g, " ")`);
  check("Warenkorb rechnet", total === "0,80 €", total);
  check("nichts ragt über den Rand", await js("document.documentElement.scrollWidth <= innerWidth + 1"));
  await wait(800);
  screenshot("2-kasse");

  await click(".scanbar");
  const camera = await until(`document.querySelector("video")?.readyState >= 2`, 20000);
  const hint = await js(`document.querySelector(".hint")?.textContent.trim()`);
  check("Kamera startet (Erlaubnis, WebView)", camera, hint);
  await wait(1500);
  screenshot("3-scannen");
  // zählt mit, ob die Zurück-Taste in der App ankommt (Fehlersuche)
  await js(`window.__back = 0; window.Capacitor.Plugins.App.addListener("backButton", () => window.__back++).then(() => true)`).catch(() => {});
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  await wait(800);
  console.log(`  Zurück-Taste in der App angekommen: ${await js("window.__back").catch((e) => e.message)}×`);
  check("Zurück-Taste schließt das Scannen", await until(`!document.querySelector("video") && !!document.querySelector(".tile")`, 5000));

  await click(narrow ? ".bar-pay" : ".pay");
  check("Bezahlen-Fenster mit QR-Code", await until(`!!document.querySelector(".modal canvas")`));
  await wait(800);
  screenshot("4-bezahlen");
  await clickText("button", "Bezahlt!");
  check("Bezahlen abschließen", await until(`!!document.querySelector(".party")`));
  await wait(3800);

  await js(`window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ctrlKey: true }))`);
  check("Eltern-Bereich", await until(`document.body.innerText.includes("Eltern-Bereich")`));
  check("Reiter „Tablet“ nur in der App", await clickText("nav button", "Tablet"));
  const pinned = await js(`window.Capacitor.Plugins.Kiosk.isPinned().then((r) => JSON.stringify(r))`).catch((e) => "Fehler: " + e.message);
  check("eigenes Kiosk-Plugin antwortet (Java)", /"pinned":(true|false)/.test(pinned), pinned);
  await wait(800);
  screenshot("5-eltern-tablet");
  await clickText("nav button", "Musik");
  check("Musik: Lieder importieren statt Ordner", await js(`!!document.querySelector("#music-files") && !document.querySelector("#music-files").hasAttribute("webkitdirectory")`));
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  check("Zurück-Taste: Eltern-Bereich zu, App läuft weiter", await until(`!!document.querySelector(".tile")`, 5000));
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  await wait(1500);
  const alive = adb("shell", "pidof", "de.schafland.kasse").toString().trim();
  check("Zurück-Taste beendet die App nie", !!alive && (await js("1+1").catch(() => 0)) === 2);
  const keepOn = adb("shell", "dumpsys", "window").toString().includes("KEEP_SCREEN_ON");
  check("Bildschirm bleibt an (FLAG_KEEP_SCREEN_ON)", keepOn);
} catch (err) {
  check("Ablauf", false, err.message);
}
const failed = results.filter((r) => !r).length;
console.log(`\n${NAME}: ${results.length - failed}/${results.length} bestanden`);
process.exitCode = failed ? 1 : 0;
