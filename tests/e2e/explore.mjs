// Erkundungstest: zufälliges Bedienen ("Affentest") plus Dauer- und Stresstests.
// Aufruf: npm run test:explore            (15 Minuten)
//         npm run test:explore -- --minutes=3
// Nach jedem Schritt wird geprüft, ob Korb, Summe und Anzeige zusammenpassen.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeFixtures } from "./fixtures.mjs";

const R = fileURLToPath(new URL("../..", import.meta.url));
const FIX = await makeFixtures();
const OUT = path.join(R, "tests/e2e/.output/explore");
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8098;
const APP_URL = `http://localhost:${PORT}/`;
const MINUTES = Number(process.argv.find((a) => a.startsWith("--minutes="))?.slice(10) ?? 15);
const SEED = Number(process.argv.find((a) => a.startsWith("--seed="))?.slice(7) ?? Date.now() % 100000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Reproduzierbarer Zufall
let seed = SEED;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const findings = [];
function finding(title, detail) {
  if (findings.some((f) => f.title === title)) return;
  findings.push({ title, detail });
  console.log(`FUND  ${title}  — ${detail}`);
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const PRODUCT = { status: 1, product: { product_name_de: "Vollmilch-Schokolade mit extra langem Namen für den Test", brands: "Beispielmarke", quantity: "100 g", categories_tags: ["en:chocolates"] } };

async function launch(cam = "own") {
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${FIX}/${cam}.y4m`, "--autoplay-policy=no-user-gesture-required", "--js-flags=--expose-gc"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true, permissions: ["camera"] });
  await ctx.route(/open(food|beauty|products)facts\.org\/api/, (r) =>
    r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(r.request().url().includes("4001234567891") ? PRODUCT : { status: 0 }) }));
  await ctx.route("**/__fx/**", (r) => r.fulfill({ contentType: "audio/mpeg", body: fs.readFileSync(path.join(FIX, "musik", decodeURIComponent(r.request().url().split("/__fx/")[1]))) }));
  const names = fs.readdirSync(path.join(FIX, "musik")).filter((n) => !n.includes("Kaputt")).sort();
  await ctx.addInitScript((names) => {
    const files = names.map((name) => ({ kind: "file", name, getFile: async () => new File([await (await fetch("/__fx/" + encodeURIComponent(name))).blob()], name, { type: "audio/mpeg" }) }));
    window.showDirectoryPicker = async () => ({ kind: "directory", name: "Test-Musik", async *values() { for (const f of files) yield f; }, queryPermission: async () => "granted", requestPermission: async () => "granted" });
  }, names);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", (d) => { finding("Unerwarteter Browser-Dialog", d.message()); d.dismiss(); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  return { browser, ctx, page, errors, cdp };
}

async function metrics(page, cdp) {
  await page.evaluate(() => window.gc?.());
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents };
}

/** Prüft, ob Korb, Summen und Anzeige stimmig sind. Gibt eine Fehlerbeschreibung oder null zurück. */
async function invariants(page) {
  return page.evaluate(() => {
    const num = (t) => Number(t.replace(/[^\d,]/g, "").replace(",", "."));
    if (!document.querySelector(".cart")) return null; // gerade nicht in der Kasse
    const lines = [...document.querySelectorAll(".ln")];
    let sum = 0;
    let count = 0;
    for (const ln of lines) {
      const qty = Number(ln.querySelector(".qty b").textContent);
      const price = num(ln.querySelector(".nm small").textContent);
      const lineSum = num(ln.querySelector(".sum").textContent);
      if (!(qty >= 1)) return `Zeile mit Menge ${qty}`;
      if (Math.abs(qty * price - lineSum) > 0.001) return `Zeilensumme falsch: ${qty} × ${price} ≠ ${lineSum}`;
      sum += lineSum;
      count += qty;
      const nm = ln.querySelector(".nm");
      if (ln.scrollWidth > ln.clientWidth + 1) return `Korbzeile läuft über: ${nm.textContent.trim().slice(0, 30)}`;
    }
    const total = num(document.querySelector(".total b").textContent);
    if (Math.abs(total - sum) > 0.001) return `Gesamtsumme ${total} ≠ Summe der Zeilen ${sum.toFixed(2)}`;
    const head = document.querySelector(".cart h2 span").textContent;
    if (Number(head.match(/\d+/)?.[0] ?? 0) !== count) return `Anzahl oben "${head}" ≠ ${count}`;
    const totalBox = document.querySelector(".total");
    if (totalBox.scrollWidth > totalBox.clientWidth + 1) return `Gesamtsumme passt nicht in die Box: ${document.querySelector(".total b").textContent}`;
    if (document.documentElement.scrollWidth > innerWidth) return "Seite scrollt seitlich";
    const pay = document.querySelector(".pay").getBoundingClientRect();
    if (pay.bottom > innerHeight + 1) return "Bezahlen-Knopf nicht sichtbar";
    const ids = lines.map((l) => l.querySelector(".nm").firstChild.textContent);
    if (new Set(ids).size !== ids.length) return "Produkt doppelt im Korb";
    return null;
  });
}

const where = (page) =>
  page.evaluate(() =>
    document.querySelector(".start") ? "start" : document.querySelector(".settings") ? "settings" : document.querySelector(".party") ? "party" : document.querySelector(".modal") ? "pay" : document.querySelector(".scan") ? "scan" : "shop");

// ---------------------------------------------------------------- Affentest
async function monkey(ms) {
  log(`Affentest ${Math.round(ms / 60000)} min, Seed ${SEED}`);
  const { browser, page, errors, cdp } = await launch("own");
  await page.goto(APP_URL);
  await page.click("text=Laden öffnen");
  const start = Date.now();
  const history = [];
  let steps = 0;
  const m0 = await metrics(page, cdp);

  const actions = {
    shop: [
      [12, "Kachel", async () => { const t = page.locator(".tile"); const n = await t.count(); if (n) await t.nth(Math.floor(rnd() * n)).tap(); }],
      [4, "Kategorie", async () => { const c = page.locator(".cat"); await c.nth(Math.floor(rnd() * (await c.count()))).tap(); }],
      [5, "Plus", async () => { const b = page.locator("button[aria-label='Eins mehr']"); const n = await b.count(); if (n) await b.nth(Math.floor(rnd() * n)).tap(); }],
      [4, "Minus", async () => { const b = page.locator("button[aria-label='Eins weniger']"); const n = await b.count(); if (n) await b.nth(Math.floor(rnd() * n)).tap(); }],
      [1, "Korb leeren 1×", async () => { if (await page.locator(".clear").count()) await page.locator(".clear").tap(); }],
      [1, "Korb leeren 2×", async () => { if (await page.locator(".clear").count()) { await page.locator(".clear").tap(); await page.locator(".clear").tap(); } }],
      [3, "Bezahlen", async () => { if (await page.isEnabled(".pay")) await page.locator(".pay").tap(); }],
      [2, "Scannen", async () => page.locator(".scanbar").tap()],
      [1, "Eltern-Bereich", async () => page.keyboard.press("Control+,")],
      [1, "Musik-Knopf", async () => { const b = page.locator("header .music button"); if (await b.count()) await b.first().tap(); }],
      [1, "Doppeltipp Kachel", async () => { const t = page.locator(".tile").first(); await t.dblclick(); }],
      [1, "Wischen", async () => page.mouse.wheel(0, rnd() * 600 - 300)],
      [0.3, "Neu laden", async () => { await page.reload(); await page.click("text=Laden öffnen"); }],
    ],
    pay: [
      [3, "Bezahlt", async () => page.locator("text=Bezahlt! Neuer Einkauf").tap()],
      [2, "Zurück", async () => page.locator(".modal >> text=Zurück").tap()],
      [1, "Escape", async () => page.keyboard.press("Escape")],
      [1, "Daneben tippen", async () => { await page.mouse.click(20, 400); if (!(await page.locator(".modal").count())) finding("Tippen neben das Bezahlfenster schließt es", ""); }],
      [2, "PayPal/Schaf wechseln", async () => { const o = page.locator(".opt"); await o.nth(Math.floor(rnd() * (await o.count()))).tap(); }],
      [1, "Doppelt Bezahlt", async () => { const b = page.locator("text=Bezahlt! Neuer Einkauf"); await b.dblclick().catch(() => {}); }],
    ],
    scan: [
      [3, "Warten", async () => wait(800 + rnd() * 1500)],
      [2, "Fertig", async () => page.locator("text=✓ Fertig gescannt").tap()],
      [1, "In den Korb", async () => { const b = page.locator(".found .big-btn"); if (await b.count()) await b.tap(); }],
      [1, "Korb-Plus beim Scannen", async () => { const b = page.locator("button[aria-label='Eins mehr']"); if (await b.count()) await b.first().tap(); }],
    ],
    party: [[1, "Antippen", async () => page.locator(".party").tap().catch(() => {})], [2, "Warten", async () => wait(1000)]],
    settings: [
      [2, "Reiter", async () => { const n = page.locator("nav button"); await n.nth(Math.floor(rnd() * (await n.count()))).tap(); }],
      [1, "PayPal an/aus", async () => { if (await page.locator("#pp-on").count()) await page.locator("#pp-on").tap(); }],
      [1, "PayPal-Name", async () => { if (await page.locator("#pp-name").count()) { await page.fill("#pp-name", pick(["FamilieTest", "x", "", "Name mit Leerzeichen", "a".repeat(25)])); await page.press("#pp-name", "Enter"); } }],
      [1, "Ordner wählen", async () => { const b = page.locator("text=Ordner wählen …"); if (await b.count()) await b.tap(); }],
      [1, "Lied antippen", async () => { const b = page.locator(".tracks button"); const n = await b.count(); if (n) await b.nth(Math.floor(rnd() * n)).tap(); }],
      [1, "Preis ändern", async () => { const i = page.locator(".prod .price input"); if (await i.count()) { await i.first().fill(pick(["0,5", "12", "abc", "-1", "999,99", "1000", ""])); await i.first().press("Tab"); } }],
      [3, "Zurück", async () => page.locator("text=Zurück zum Laden").tap()],
    ],
    start: [[1, "Öffnen", async () => page.click("text=Laden öffnen")]],
  };

  while (Date.now() - start < ms) {
    const state = await where(page);
    const list = actions[state];
    const total = list.reduce((s, a) => s + a[0], 0);
    let r = rnd() * total;
    const [, name, fn] = list.find((a) => (r -= a[0]) < 0) ?? list[0];
    history.push(`${state}:${name}`);
    if (history.length > 25) history.shift();
    try {
      await fn();
    } catch (e) {
      if (!/Timeout|detached|not attached|intercepts pointer|outside of the viewport|not visible|not enabled/i.test(e.message)) finding(`Aktion „${name}“ scheitert`, e.message.split("\n")[0]);
    }
    await wait(60 + rnd() * 200);
    steps++;
    const bad = await invariants(page).catch(() => null);
    if (bad) {
      finding(bad.replace(/[\d,.]+/g, "#"), `${bad}\n    letzte Schritte: ${history.slice(-8).join(" → ")}`);
      await page.screenshot({ path: path.join(OUT, `fund-${findings.length}.png`) });
    }
    if (errors.length) {
      finding(`Konsolenfehler: ${errors[0].slice(0, 80)}`, `nach: ${history.slice(-6).join(" → ")}`);
      errors.length = 0;
    }
    if (steps % 250 === 0) log(`  ${steps} Schritte, ${JSON.stringify(await metrics(page, cdp))}`);
  }
  // Ende: zurück zur Kasse, Speicher vergleichen
  for (let i = 0; i < 5 && (await where(page)) !== "shop"; i++) {
    const s = await where(page);
    if (s === "settings") await page.click("text=Zurück zum Laden");
    else if (s === "scan") await page.click("text=✓ Fertig gescannt");
    else if (s === "pay") await page.keyboard.press("Escape");
    else await wait(1500);
  }
  const m1 = await metrics(page, cdp);
  const receipts = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open("schafland"); q.onsuccess = () => { const t = q.result.transaction("receipts").objectStore("receipts").count(); t.onsuccess = () => res(t.result); }; }));
  log(`Affentest fertig: ${steps} Schritte, ${receipts} Einkäufe bezahlt. Speicher ${m0.heapMB} → ${m1.heapMB} MB, DOM-Knoten ${m0.nodes} → ${m1.nodes}, Listener ${m0.listeners} → ${m1.listeners}`);
  if (m1.heapMB > m0.heapMB * 2 + 10) finding("Speicher wächst im Affentest", `${m0.heapMB} → ${m1.heapMB} MB`);
  await page.screenshot({ path: path.join(OUT, "affentest-ende.png") });
  await browser.close();
  return { steps, receipts, m0, m1 };
}

// ---------------------------------------------------------------- Dauerlauf Kamera
async function cameraSoak(ms) {
  log(`Dauerlauf Kamera ${Math.round(ms / 60000)} min`);
  const { browser, page, cdp } = await launch("own");
  await page.goto(APP_URL);
  await page.click("text=Laden öffnen");
  // 1) 40× Scannen öffnen/schließen: Kamera und Worker müssen jedes Mal sauber beendet werden
  const m0 = await metrics(page, cdp);
  for (let i = 0; i < 40; i++) {
    await page.click(".scanbar");
    await page.waitForSelector(".found .t:has-text('Apfel')", { timeout: 10000 }).catch(() => finding("Scan nach mehrfachem Öffnen langsam/kaputt", `Durchgang ${i + 1}`));
    await page.click("text=✓ Fertig gescannt");
  }
  const qty = await page.evaluate(() => Number(document.querySelector(".ln .qty b")?.textContent ?? 0));
  if (qty !== 40) finding("Mehrfaches Scannen: falsche Menge", `40× gescannt, Menge ${qty}`);
  const live = await page.evaluate(() => document.querySelectorAll("video").length);
  if (live) finding("Video bleibt nach dem Schließen", `${live} video-Elemente`);
  const m1 = await metrics(page, cdp);
  log(`  40× öffnen/schließen: Menge ${qty}, Speicher ${m0.heapMB} → ${m1.heapMB} MB, Listener ${m0.listeners} → ${m1.listeners}`);
  if (m1.heapMB > m0.heapMB + 15) finding("Speicher wächst beim Öffnen/Schließen des Scanners", `${m0.heapMB} → ${m1.heapMB} MB`);

  // 2) Scanner lange offen lassen
  await page.click(".scanbar");
  await wait(3000);
  const s0 = await metrics(page, cdp);
  const start = Date.now();
  const samples = [];
  while (Date.now() - start < ms) {
    await wait(15000);
    const m = await metrics(page, cdp);
    const fps = await page.evaluate(() => document.querySelector(".stats span:nth-child(2)")?.textContent.match(/(\d+) Bilder/)?.[1]);
    samples.push({ t: Math.round((Date.now() - start) / 1000), ...m, fps: Number(fps) });
  }
  const last = samples.at(-1);
  log(`  Scanner ${Math.round(ms / 60000)} min offen: Speicher ${s0.heapMB} → ${last.heapMB} MB, Bilder/s ${samples.map((s) => s.fps).join(",")}`);
  if (last.heapMB > s0.heapMB + 15) finding("Speicher wächst bei offenem Scanner", `${s0.heapMB} → ${last.heapMB} MB`);
  if (samples.some((s) => s.fps < 3)) finding("Bildrate bricht ein", samples.map((s) => s.fps).join(","));
  const qty2 = await page.evaluate(() => Number(document.querySelector(".ln .qty b")?.textContent ?? 0));
  if (qty2 !== 41) finding("Dauer-Scan: Produkt mehrfach gezählt", `Menge ${qty2} statt 41`);
  await page.screenshot({ path: path.join(OUT, "dauerlauf-kamera.png") });
  await browser.close();
  return { samples };
}

// ---------------------------------------------------------------- Dauerlauf Musik
async function musicSoak(ms) {
  log(`Dauerlauf Musik ${Math.round(ms / 60000)} min`);
  const { browser, page, cdp, errors } = await launch("empty");
  await page.goto(APP_URL);
  await page.click("text=Laden öffnen");
  await page.keyboard.press("Control+,");
  await page.click("nav >> text=Musik");
  await page.click("text=Ordner wählen …");
  await page.waitForSelector(".tracks button");
  await page.click("text=Zurück zum Laden");
  const m0 = await metrics(page, cdp);
  const seen = new Set();
  const start = Date.now();
  let taps = 0;
  while (Date.now() - start < ms) {
    // Musik läuft, Kind tippt dauernd (Geräusche → Musik wird leiser und wieder lauter)
    await page.locator(".tile").nth(taps % 6).tap();
    taps++;
    const title = await page.textContent("header .music .title").catch(() => "");
    seen.add(title.trim());
    if (taps % 40 === 0) await page.locator(".clear").tap().then(() => page.locator(".clear").tap()).catch(() => {});
    await wait(250);
  }
  const vol = await page.evaluate(() => [...document.querySelectorAll("audio")].map((a) => a.volume));
  const m1 = await metrics(page, cdp);
  const playing = await page.locator("header .music button[aria-label='Musik anhalten']").count();
  log(`  ${taps} Tipps, Lieder gehört: ${[...seen].join(", ")}; Musik läuft: ${!!playing}; Speicher ${m0.heapMB} → ${m1.heapMB} MB`);
  if (!playing) finding("Musik hört im Dauerlauf auf", `gehört: ${[...seen].join(", ")}`);
  if (seen.size < 3) finding("Musik wechselt nicht durch alle Lieder", [...seen].join(", "));
  if (m1.heapMB > m0.heapMB + 15) finding("Speicher wächst bei Musik", `${m0.heapMB} → ${m1.heapMB} MB`);
  if (errors.length) finding("Konsolenfehler bei Musik", errors[0]);
  // Lautstärke nach dem Leiser-Stellen wieder normal?
  await wait(1600);
  const v = await page.evaluate(async () => {
    const s = (await new Promise((res) => { const q = indexedDB.open("schafland"); q.onsuccess = () => { const t = q.result.transaction("kv").objectStore("kv").get("settings"); t.onsuccess = () => res(t.result?.value); }; }))?.musicVolume ?? 0.5;
    return s;
  });
  log(`  Lautstärke-Einstellung ${v}, Audio-Elemente im DOM: ${vol.length}`);
  await browser.close();
}

// ---------------------------------------------------------------- Stress & Randfälle
async function edgeCases() {
  log("Randfälle");
  const { browser, page, errors } = await launch("off");
  await page.goto(APP_URL);
  await page.click("text=Laden öffnen");

  // Sehr große Mengen und Beträge
  await page.click(".cat:has-text('Obst')");
  for (let i = 0; i < 120; i++) await page.locator(".tile:has-text('Melone')").tap();
  for (const c of ["Gemüse", "Milch", "Backwaren", "Süßes", "Getränke"]) {
    await page.click(`.cat:has-text('${c}')`);
    for (const t of await page.locator(".tile").all()) await t.tap();
  }
  let bad = await invariants(page);
  if (bad) finding("Großer Einkauf", bad);
  await page.screenshot({ path: path.join(OUT, "grosser-einkauf.png") });
  const total = await page.textContent(".total b");
  log(`  120 Melonen + alles andere: ${total}`);

  // Bezahlen: QR bei großem Betrag, doppelt auf "Bezahlt" tippen
  await page.click(".pay");
  await page.waitForSelector(".modal canvas");
  const before = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open("schafland"); q.onsuccess = () => { const t = q.result.transaction("receipts").objectStore("receipts").count(); t.onsuccess = () => res(t.result); }; }));
  // drei schnelle Tipps hintereinander, bevor die Oberfläche reagieren kann
  await page.evaluate(() => { const b = [...document.querySelectorAll(".modal button")].find((x) => x.textContent.includes("Bezahlt")); b.click(); b.click(); b.click(); });
  await wait(800);
  const after = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open("schafland"); q.onsuccess = () => { const t = q.result.transaction("receipts").objectStore("receipts").count(); t.onsuccess = () => res(t.result); }; }));
  if (after - before !== 1) finding("Mehrfach-Tipp auf „Bezahlt!“ speichert mehrere Kassenbons", `${after - before} Kassenbons für einen Einkauf`);
  const emptyReceipt = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open("schafland"); q.onsuccess = () => { const t = q.result.transaction("receipts").objectStore("receipts").getAll(); t.onsuccess = () => res(t.result.filter((r) => !r.lines.length).length); }; }));
  if (emptyReceipt) finding("Leerer Kassenbon gespeichert", `${emptyReceipt} Bons ohne Positionen`);
  await wait(3500);

  // Bezahlen-Knopf doppelt: öffnet nur ein Fenster?
  await page.locator(".tile").first().tap();
  await page.locator(".pay").dblclick();
  if ((await page.locator(".modal").count()) !== 1) finding("Doppeltipp auf Bezahlen", `${await page.locator(".modal").count()} Fenster`);
  await page.keyboard.press("Escape");

  // Eltern-Bereich während Bezahlen? Strg+, im Bezahlfenster
  await page.click(".pay");
  await page.keyboard.press("Control+,");
  const state = await where(page);
  await page.keyboard.press("Escape");
  if (state === "settings") {
    await page.click("text=Zurück zum Laden");
    if (await page.locator(".modal").count()) finding("Bezahlfenster bleibt hinter dem Eltern-Bereich offen", "Strg+, im Bezahlfenster, danach zurück: Bezahlfenster ist wieder da");
  }
  if (await page.locator(".modal").count()) await page.keyboard.press("Escape");

  // Viele gescannte Produkte (z. B. nach Monaten)
  await page.evaluate(async () => {
    const db = await new Promise((res) => { const q = indexedDB.open("schafland"); q.onsuccess = () => res(q.result); });
    const tx = db.transaction("products", "readwrite");
    for (let i = 0; i < 300; i++) {
      const ean = String(4100000000000 + i * 7);
      tx.objectStore("products").put({ id: `off-${ean}`, ean, name: `Testprodukt Nummer ${i} mit einem ziemlich langen Namen`, emoji: "📦", categoryId: "gescannt", priceCents: 100 + i, source: "openfoodfacts.org", createdAt: Date.now() - i });
    }
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.reload();
  await page.click("text=Laden öffnen");
  const t0 = Date.now();
  await page.click(".cat:has-text('Gescannt')");
  await page.waitForSelector(".tile:has-text('Nummer 299')");
  log(`  300 gescannte Produkte: Reiter in ${Date.now() - t0} ms`);
  await page.locator(".tile").nth(5).tap();
  bad = await invariants(page);
  if (bad) finding("Lange Produktnamen", bad);
  await page.screenshot({ path: path.join(OUT, "300-gescannte.png") });
  await page.keyboard.press("Control+,");
  const t1 = Date.now();
  await page.click("nav >> text=Gescannte Produkte");
  await page.waitForSelector(".prod >> nth=299");
  log(`  Liste im Eltern-Bereich mit 300 Einträgen: ${Date.now() - t1} ms`);
  await page.click("text=Zurück zum Laden");

  // Unbekannter Code dann bekannter Code schnell nacheinander (veraltete Antwort darf nicht gewinnen)
  // Neu laden während einer laufenden Suche
  await page.click(".scanbar");
  await wait(150);
  await page.reload();
  await page.click("text=Laden öffnen");
  if (errors.length) finding("Konsolenfehler bei Randfällen", errors.join(" | ").slice(0, 200));
  await browser.close();
}

const server = spawn("python3", [path.join(R, "kiosk/server.py"), path.join(R, "dist"), String(PORT)], { stdio: "ignore" });
await wait(800);
const t0 = Date.now();
try {
  const total = MINUTES * 60000;
  await edgeCases();
  await musicSoak(total * 0.13);
  await cameraSoak(total * 0.2);
  await monkey(Math.max(60000, total - (Date.now() - t0)));
} finally {
  server.kill();
}
console.log(`\nErkundungstest fertig nach ${((Date.now() - t0) / 60000).toFixed(1)} min, Seed ${SEED}. Funde: ${findings.length}`);
for (const f of findings) console.log(`- ${f.title}\n    ${f.detail}`);
fs.writeFileSync(path.join(OUT, "funde.json"), JSON.stringify({ seed: SEED, minutes: MINUTES, findings }, null, 1));
process.exitCode = findings.length ? 1 : 0;
