// Erkundungstest für „Frag das Schaf“ (Stufe 1, Stufe 2, LFM3-Omni) mit nachgestellten Modellen.
// Bedient die App zufällig (Fragen, Abbrechen, Nochmal, Bilder antippen, Bezahlen, Eltern-Bereich,
// Scannen mit „Was ist das?“) mit zufälligen Verzögerungen und prüft dabei feste Regeln.
// Aufruf: node tests/e2e/explore-schaf.mjs [Minuten] [Startwert]
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeFixtures } from "./fixtures.mjs";

const R = fileURLToPath(new URL("../..", import.meta.url));
const MINUTES = +(process.argv[2] ?? 15);
const SEED = +(process.argv[3] ?? Date.now() % 100000);
const PORT = 8795;
const Q = await makeFixtures();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let s = SEED;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const findings = new Map(); // Regel → { count, example }
function finding(rule, detail) {
  const f = findings.get(rule) ?? { count: 0, example: detail };
  f.count++;
  findings.set(rule, f);
  if (f.count === 1) console.log(`FUND  ${rule}  — ${detail}`);
}

const wav = path.join(Q, "frage-ton.wav");
if (!fs.existsSync(wav)) execSync(`ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=300:duration=1.2" -af "volume=0.8,apad=pad_dur=2.5" -ar 16000 -ac 1 ${wav}`);

const SAETZE = [
  "Was kostet die Banane?", "Ich möchte ein Eis", "Nane", "Wie viel muss ich bezahlen?", "Was gibt es bei Obst?",
  "Was ist gesund?", "Welches Obst ist gelb?", "Ist die Schokolade gesund?", "Hallo Schaf", "Danke", "Raumschiff",
  "Ki", "", "Vielen Dank fürs Zuschauen", "Was schmeckt lecker?", "Was kann ich meiner Oma kaufen?", "Ich will drei Bananen",
  "Was kostet der Kürbis?", "Ich habe Durst", "Was passt zum Frühstück", "Gibt es Milch?", "Brezel bitte in den Korb",
  "Was ist das teuerste?", "Kaufe Kirschen", "Was kostet alles zusammen?", "Hot Wheels Rennbahn", "Ähm", "123 456",
  "<script>alert(1)</script>", "Ich möchte Spielzeug", "Welches Gemüse ist grün?", "Ich nehme eine Brücke",
];
const KI_ANTWORTEN = [
  "Äpfel und Bananen sind gesund!", "Lecker ist Eis oder Muffin.", "Das kostet 3 Euro.", "", "Oma freut sich über Blumen und Honig.",
  "Ich bin ein Schaf. Mäh!", "Nimm doch Brot, Butter und Käse. Und Milch. Und Eier. Und Saft.", "<|im_end|>", "Kauf 5 Äpfel.",
];
const BILD_ANTWORTEN = ["Apfel", "Spielzeugbanane", "unbekannt", "Ein Ball", "Tomate aus Plastik", "Orange", "Erdbeere", "Ding"];

const server = spawn("python3", [`${R}/kiosk/server.py`, `${R}/dist`, String(PORT)], { stdio: "ignore" });
await wait(800);
const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${Q}/empty.y4m`, `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera", "microphone"] });
await ctx.addInitScript(([saetze, ki, bild]) => {
  const r = () => Math.random();
  const pick = (a) => a[Math.floor(r() * a.length)];
  const delay = (max) => new Promise((res) => setTimeout(res, r() * max));
  window.__said = [];
  window.__schafFakeErkennung = async () => {
    await delay(1500);
    const t = pick(saetze);
    window.__said.push(t);
    return t;
  };
  window.__schafFakeKi = async () => {
    await delay(2500);
    return pick(ki);
  };
  Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => ({ features: new Set() }) } });
  window.__schafFakeAudio = { image: async () => (await delay(1500), pick(bild)) };
  localStorage.setItem("schaf-ki-cpu", "1");
}, [SAETZE, KI_ANTWORTEN, BILD_ANTWORTEN]);
const page = await ctx.newPage();
page.on("pageerror", (e) => finding("Seitenfehler", e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) finding("Konsolenfehler", m.text().slice(0, 200));
});

const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
const text = (sel) => page.locator(sel).first().textContent({ timeout: 500 }).catch(() => "");
const cartCount = () => page.evaluate(() => [...document.querySelectorAll(".ln .qty b")].reduce((n, b) => n + +b.textContent, 0)).catch(() => 0);

async function setup() {
  await page.goto(`http://localhost:${PORT}/`);
  await page.click("text=Laden öffnen");
  await page.waitForSelector(".tile");
  await page.keyboard.press("Control+,");
  await page.click("nav >> text=Frag das Schaf");
  await page.click("#schaf-on");
  await page.click("#ki-on").catch(() => {});
  // LFM3-Omni (nachgestellt) einschalten, damit auch „Was ist das?“ beim Scannen drankommt
  await page.click("#audio-on").catch(() => {});
  await page.click("text=/Jetzt laden \\(ca\\. 2,6 GB\\)/", { timeout: 2000 }).catch(() => {});
  await page.click("text=Zurück zum Laden");
}

async function openSettings() {
  await page.keyboard.press("Control+,");
  await page.waitForSelector("text=Eltern-Bereich", { timeout: 3000 });
  await page.click("nav >> text=Frag das Schaf");
}

// Aktionen
const actions = {
  async fragen() {
    if (await visible(".askbar")) await page.click(".askbar", { timeout: 1000 });
    else if (await visible(".panel .btn.mic")) await page.click(".panel .btn.mic", { timeout: 1000 });
  },
  async schnellDoppelt() {
    if (await visible(".askbar")) {
      await page.click(".askbar", { timeout: 1000 });
      await page.click(".askbar", { timeout: 1000, force: true }).catch(() => {});
    }
  },
  async schliessen() {
    if (await visible(".panel .x")) await page.click(".panel .x", { timeout: 1000 });
  },
  async escape() {
    await page.keyboard.press("Escape");
  },
  async neuNachSchliessen() {
    // schließen, während das Schaf überlegt, und sofort neu fragen
    if (await visible(".panel")) {
      await page.click(".panel .x", { timeout: 1000 }).catch(() => {});
      await wait(rnd() * 300);
      if (await visible(".askbar")) await page.click(".askbar", { timeout: 1000 });
    }
  },
  async fertigGesprochen() {
    if (await visible(".panel >> text=Fertig gesprochen")) await page.click(".panel >> text=Fertig gesprochen", { timeout: 1000 });
  },
  async jaInDenKorb() {
    if (await visible(".panel .btn.yes")) await page.click(".panel .btn.yes", { timeout: 1000 });
  },
  async bildAntippen() {
    const n = await page.locator(".panel .choice").count();
    if (n) await page.locator(".panel .choice").nth(Math.floor(rnd() * n)).click({ timeout: 1000 });
  },
  async kachel() {
    const n = await page.locator(".tile").count();
    if (n && !(await visible(".panel"))) await page.locator(".tile").nth(Math.floor(rnd() * n)).click({ timeout: 1000 });
  },
  async bezahlen() {
    if (await visible(".pay:not([disabled])")) {
      await page.click(".pay", { timeout: 1000 }).catch(() => {});
      await wait(400);
      if (await visible("text=Bezahlt! Neuer Einkauf")) await page.click("text=Bezahlt! Neuer Einkauf", { timeout: 1000 });
      await wait(300);
      if (await visible(".party")) await page.click(".party", { timeout: 1000 }).catch(() => {});
    }
  },
  async elternUndZurueck() {
    await openSettings();
    if (rnd() < 0.5) await page.fill("#schaf-try", pick(SAETZE)).catch(() => {});
    if (rnd() < 0.3 && (await visible("#ki-try"))) {
      await page.fill("#ki-try", pick(SAETZE));
      await page.click("button:has-text('Fragen')", { timeout: 1000 }).catch(() => {});
      await wait(rnd() * 2000);
    }
    if (rnd() < 0.2) await page.click(`.opt:has(b:text-is("${pick(["Genau", "Schnell", "Sehr genau"])}"))`, { timeout: 1000 }).catch(() => {});
    if (rnd() < 0.15) await page.click("#audio-on", { timeout: 1000 }).catch(() => {});
    if (rnd() < 0.15 && (await visible("text=/Jetzt laden \\(ca\\. 2,6 GB\\)/"))) await page.click("text=/Jetzt laden \\(ca\\. 2,6 GB\\)/", { timeout: 1000 }).catch(() => {});
    if (rnd() < 0.1) await page.click("#ki-on", { timeout: 1000 }).catch(() => {});
    if (rnd() < 0.1) {
      await page.click("nav >> text=Aktionen");
      await page.locator(".aktion button[role=switch], .aktion [role=switch]").nth(Math.floor(rnd() * 2)).click({ timeout: 1000 }).catch(() => {});
    }
    await page.click("text=Zurück zum Laden", { timeout: 2000 });
  },
  async scannenWasIstDas() {
    if (await visible(".panel")) return;
    if (!(await visible("text=Scannen!"))) return;
    await page.click("text=Scannen!", { timeout: 1000 });
    await wait(800);
    if (await visible("button.see")) {
      await page.click("button.see", { timeout: 1000 });
      if (rnd() < 0.3) await page.click("button.see", { timeout: 500, force: true }).catch(() => {});
      await wait(rnd() * 2500);
      if (await visible(".maybe-item")) await page.locator(".maybe-item").first().click({ timeout: 1000 }).catch(() => {});
    }
    if (rnd() < 0.7) await page.click("text=✓ Fertig gescannt", { timeout: 1000 }).catch(() => {});
  },
  async fertigGescannt() {
    if (await visible("text=✓ Fertig gescannt")) await page.click("text=✓ Fertig gescannt", { timeout: 1000 });
  },
  async warten() {
    await wait(rnd() * 3000);
  },
};
const weights = { fertigGescannt: 2, fragen: 8, schnellDoppelt: 2, schliessen: 3, escape: 1, neuNachSchliessen: 3, fertigGesprochen: 2, jaInDenKorb: 3, bildAntippen: 3, kachel: 2, bezahlen: 1, elternUndZurueck: 1.5, scannenWasIstDas: 1.5, warten: 4 };
const bag = Object.entries(weights).flatMap(([k, w]) => Array(Math.round(w * 2)).fill(k));

// Regeln, nach jeder Aktion geprüft
let stuckSince = null;
let awayFromShop = 0;
let lastPhase = "";
async function checkRules(lastAction) {
  const st = await page.evaluate(() => {
    const s = window.__fragDasSchaf;
    return { phase: s.phase, say: s.reply?.say ?? "", ki: !!s.reply?.ki, picked: !!s.reply?.picked, streaming: !!s.reply?.streaming, heard: s.heard, error: s.error };
  }).catch(() => null);
  if (!st) return;
  const big = (await text(".panel .big")) ?? "";
  // 1. Keine kaputten Texte
  if (/undefined|NaN|\[object|null\b/.test(st.say + big)) finding("Kaputter Text in der Sprechblase", `${st.say} | ${big}`);
  // 2. KI-Antworten ohne Zahlen/Preise
  if (st.ki && /\d|euro|cent|€/i.test(st.say)) finding("KI-Antwort mit Preis/Zahl", st.say);
  // 3. Nichts bleibt ewig hängen
  if (["thinking", "loading", "listening"].includes(st.phase) || st.streaming) {
    if (st.phase !== lastPhase) stuckSince = Date.now();
    stuckSince ??= Date.now();
    if (Date.now() - stuckSince > 20000) finding("Hängt fest", `${st.phase}${st.streaming ? " (streaming)" : ""} seit ${(Date.now() - stuckSince) / 1000 | 0} s nach ${lastAction}`);
  } else stuckSince = null;
  lastPhase = st.phase;
  // 0. Nicht dauerhaft außerhalb des Ladens hängen bleiben
  const inShop = (await visible(".tile")) || (await visible(".feed"));
  awayFromShop = inShop ? 0 : awayFromShop + 1;
  if (awayFromShop === 15) finding("Bleibt außerhalb des Ladens hängen", `nach ${lastAction}: ${(await page.evaluate(() => document.body.innerText.slice(0, 160).replace(/\s+/g, " ")))}`);
  // 4. Sprechblase sichtbar ⇔ phase ≠ idle
  const panel = await visible(".panel");
  if (panel !== (st.phase !== "idle") && !(await visible("text=Eltern-Bereich"))) finding("Sprechblase und Zustand passen nicht", `phase ${st.phase}, Blase ${panel} nach ${lastAction}`);
  // 5. Summe, die das Schaf nennt, stimmt mit dem Korb
  const m = /(\d+) Sachen\. Das macht zusammen/.exec(st.say);
  if (m && st.phase === "answer") {
    const n = await cartCount();
    if (n !== +m[1]) finding("Genannte Anzahl ≠ Korb", `${st.say} (Korb: ${n}) nach ${lastAction}`);
  }
  // 6. Antwort passt zur gehörten Frage (keine verspätete Antwort auf eine alte Frage)
  if (st.phase === "answer" && !st.streaming && !st.picked && st.heard && /kostet|ist im Korb|sind im Korb/.test(st.say)) {
    const said = st.say.replace(/^(Der|Die|Das) /, "").split(/ (kostet|kosten|ist|sind) /)[0].toLowerCase();
    const heard = st.heard.toLowerCase();
    if (said && !heard.includes(said.slice(0, 4)) && !/nane|brücke|kirsch|rennbahn|milch|ki\b/.test(heard)) {
      finding("Antwort passt nicht zur Frage", `gehört „${st.heard}“ → „${st.say}“ nach ${lastAction}`);
    }
  }
}

console.log(`Erkundung „Frag das Schaf“: ${MINUTES} Minuten, Startwert ${SEED}`);
await setup();
const end = Date.now() + MINUTES * 60000;
let steps = 0;
const domStart = await page.evaluate(() => document.getElementsByTagName("*").length);
const counts = {};
while (Date.now() < end) {
  const a = pick(bag);
  counts[a] = (counts[a] ?? 0) + 1;
  try {
    await actions[a]();
  } catch (e) {
    if (!/Timeout|not visible|detached|intercept|outside of the viewport/i.test(e.message)) finding("Aktion scheiterte unerwartet", `${a}: ${e.message.split("\n")[0]}`);
  }
  await wait(100 + rnd() * 400);
  await checkRules(a);
  steps++;
  if (steps % 25 === 0 && process.env.SCHAF_SHOTS) await page.screenshot({ path: `${process.env.SCHAF_SHOTS}/schritt-${steps}.png` }).catch(() => {});
  if (steps % 100 === 0) {
    const dom = await page.evaluate(() => document.getElementsByTagName("*").length);
    const log = await page.evaluate(() => window.__fragDasSchaf.log.length);
    console.log(`  ${steps} Schritte, ${Math.round((end - Date.now()) / 1000)} s übrig, DOM ${dom} Elemente, Protokoll ${log}`);
    if (dom > domStart * 3) finding("DOM wächst", `${domStart} → ${dom}`);
  }
}
console.log(`\n${steps} Schritte: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(findings.size ? `${findings.size} Arten von Funden:` : "Keine Funde.");
for (const [rule, f] of findings) console.log(`  ${f.count}×  ${rule}  — z. B. ${f.example}`);
await browser.close();
server.kill();
process.exitCode = findings.size ? 1 : 0;
