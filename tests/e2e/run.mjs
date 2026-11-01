// Browser-Tests für Schafland. Aufruf: npm run test:e2e
// Startet den echten Kiosk-Webserver (kiosk/server.py) mit dist/ und prüft die App in Chromium.
// Kameras werden mit Videodateien simuliert, Open Food Facts mit festen Antworten.
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeFixtures } from "./fixtures.mjs";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

const R = fileURLToPath(new URL("../..", import.meta.url));
prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(path.join(R, "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm")).buffer } });
/** Liest den angezeigten QR-Code wieder ein, so wie es ein Handy tun würde. */
async function readQr(page, selector) {
  const png = await page.locator(selector).screenshot();
  const [hit] = await readBarcodes(new Blob([png]), { formats: ["QRCode"] });
  return hit?.text ?? null;
}
const Q = await makeFixtures();
const SHOTS = path.join(R, "tests/e2e/.output");
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8099;
const APP_URL = `http://localhost:${PORT}/`;
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let offRequests = [];
let wikidataRequests = [];
let bookRequests = [];

/** info: Ergebnis wird berichtet, zählt aber nicht als Fehler (bekannte Grenze). */
function check(name, ok, detail = "", { info = false } = {}) {
  results.push({ name, ok: !!ok, detail, info });
  const tag = ok ? "PASS" : info ? "INFO" : "FAIL";
  console.log(`${tag}  ${name}${detail ? "  — " + detail : ""}`);
}
const section = (name) => !ONLY || ONLY.split(",").includes(name);

const PRODUCT = { status: 1, product: { product_name_de: "Vollmilch-Schokolade", brands: "Beispielmarke", quantity: "100 g",
  image_front_small_url: "https://images.openfoodfacts.org/x/front.jpg", categories_tags: ["en:sweet-snacks", "en:chocolates"] } };

async function launch(cam = "empty", { viewport = { width: 1366, height: 768 }, touch = false, camera = true, fakeDir = true, noPicker = false, offFail = false, offMode = null, googleDown = false, cams = 1, rear = false, device = null, audio = null } = {}) {
  // Mit Video-Datei kennt Chromium nur eine Kamera; mehrere Kameras zeigen ein Testbild
  const args = cams > 1
    ? [`--use-fake-device-for-media-stream=device-count=${cams}`, "--autoplay-policy=no-user-gesture-required"]
    : ["--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${Q}/${cam}.y4m`, "--autoplay-policy=no-user-gesture-required"];
  args.push(camera ? "--use-fake-ui-for-media-stream" : "--deny-permission-prompts");
  // Mikrofon: WAV-Datei einmal abspielen, danach Stille
  if (audio) args.push(`--use-file-for-fake-audio-capture=${audio}%noloop`);
  const perms = camera ? ["camera", "microphone"] : [];
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext(device
    ? { ...device, permissions: perms }
    : { viewport, hasTouch: touch, isMobile: false, permissions: perms });
  const errors = [];
  await ctx.route(/open(food|beauty|products)facts\.org\/api/, (route) => {
    const url = route.request().url();
    offRequests.push(url);
    if (offFail) return route.abort("internetdisconnected");
    if (offMode?.() === "503") return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "Service Unavailable" });
    const hit = url.includes("openfoodfacts") && url.includes("4001234567891");
    route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(hit ? PRODUCT : { status: 0, status_verbose: "product not found" }) });
  });
  // Wikidata: kennt nur die Zeitschrift mit ISSN 0724-8679
  await ctx.route(/www\.wikidata\.org\/w\/api\.php/, (route) => {
    const url = decodeURIComponent(route.request().url());
    wikidataRequests.push(url);
    if (offFail) return route.abort("internetdisconnected");
    const body = url.includes("list=search")
      ? { query: { search: url.includes("P236=0724-8679") ? [{ title: "Q1140000" }] : [] } }
      : { entities: { Q1140000: { labels: { de: { value: "c’t" } }, descriptions: { de: { value: "Computerzeitschrift" } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q41298" } } } }], P154: [{ mainsnak: { datavalue: { value: "Ct-logo.svg" } } }] } } } };
    route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  // Bücher: Google Books und Open Library kennen nur die Beispiel-ISBN
  await ctx.route(/www\.googleapis\.com\/books/, (route) => {
    bookRequests.push("google");
    if (googleDown === "abort") return route.abort("connectionrefused");
    if (googleDown) return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "" });
    const hit = route.request().url().includes("9783161484100");
    route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(hit
      ? { totalItems: 1, items: [{ volumeInfo: { title: "Das Testbuch vom Schaf", authors: ["Wolle Wollmann"], publisher: "Wiesenverlag", industryIdentifiers: [{ type: "ISBN_13", identifier: "9783161484100" }], imageLinks: { thumbnail: "http://books.google.com/books/content?id=t&img=1" } } }] }
      : { totalItems: 0 }) });
  });
  await ctx.route(/openlibrary\.org\/api\/books/, (route) => {
    bookRequests.push("openlibrary");
    const hit = route.request().url().includes("9783161484100");
    route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(hit
      ? { "ISBN:9783161484100": { title: "Das Testbuch vom Schaf (Open Library)", authors: [{ name: "Wolle Wollmann" }], publishers: [{ name: "Wiesenverlag" }], cover: { medium: "https://covers.openlibrary.org/b/id/1-M.jpg" } } }
      : {}) });
  });
  await ctx.route(/books\.google\.com\/books\/content|covers\.openlibrary\.org/, (r) => r.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(`${Q}/product.png`) }));
  await ctx.route("https://commons.wikimedia.org/**", (r) => r.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(`${Q}/product.png`) }));
  await ctx.route("https://images.openfoodfacts.org/**", (r) => r.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(`${Q}/product.png`) }));
  await ctx.route("**/__qa/**", (r) => r.fulfill({ contentType: "audio/mpeg", body: fs.readFileSync(path.join(Q, "musik", decodeURIComponent(r.request().url().split("/__qa/")[1]))) }));
  const names = fs.readdirSync(`${Q}/musik`).sort();
  await ctx.addInitScript(([names, fakeDir, noPicker]) => {
    if (noPicker) { delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker; return; }
    if (!fakeDir) return;
    const files = names.map((name) => ({ kind: "file", name, getFile: async () => new File([await (await fetch("/__qa/" + encodeURIComponent(name))).blob()], name, { type: "audio/mpeg" }) }));
    window.showDirectoryPicker = async () => ({ kind: "directory", name: "QA-Musik", async *values() { for (const f of files) yield f; }, queryPermission: async () => "granted", requestPermission: async () => "granted" });
  }, [names, fakeDir, noPicker]);
  // Tablet-Rückkamera: die Test-Kamera meldet sich als "environment"
  if (rear) await ctx.addInitScript(() => {
    const orig = MediaStreamTrack.prototype.getSettings;
    MediaStreamTrack.prototype.getSettings = function () { return { ...orig.call(this), facingMode: "environment" }; };
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return { browser, ctx, page, errors };
}

async function openShop(page) {
  await page.goto(APP_URL);
  await page.click("text=Laden öffnen");
  await page.waitForSelector("text=Einkaufskorb");
}
const cartQty = (page, name) => page.evaluate((n) => {
  const ln = [...document.querySelectorAll(".ln")].find((l) => l.querySelector(".nm").firstChild.textContent.trim() === n);
  return ln ? +ln.querySelector(".qty b").textContent : 0;
}, name);
const total = (page) => page.textContent(".total b");
async function openSettings(page) { await page.keyboard.press("Control+,"); await page.waitForSelector("text=Eltern-Bereich"); }

(async () => {
  const server = spawn("python3", [`${R}/kiosk/server.py`, `${R}/dist`, String(PORT)], { stdio: "ignore" });
  await wait(800);
  try {
    // ---------- 1. Warenkorb-Logik ----------
    if (section("cart")) {
      const { browser, page, errors } = await launch();
      await openShop(page);
      const tap = (n) => page.click(`.tile:has-text("${n}")`);
      await tap("Apfel"); await tap("Apfel"); await tap("Banane");
      check("Kachel zweimal → Menge 2", (await cartQty(page, "Apfel")) === 2);
      check("Summe 0,50×2 + 0,30", (await total(page)).replace(/\s/g, " ") === "1,30 €", await total(page));
      // Rundungsfehler: 10× Banane (0,30) + 3× Zitrone (0,30) usw.
      for (let i = 0; i < 9; i++) await tap("Banane");
      check("10× 0,30 € ergibt genau 3,00 €", /^3,00/.test((await page.textContent(".ln:has-text('Banane') .sum")).trim()), await page.textContent(".ln:has-text('Banane') .sum"));
      const sumText = (await page.textContent(".ln:has-text('Banane') .sum")).trim();
      check("Zeilensumme ohne €-Zeichen (wie geplant)", !sumText.includes("€"), JSON.stringify(sumText));
      await page.click(".ln:has-text('Apfel') button[aria-label='Eins weniger']");
      await page.click(".ln:has-text('Apfel') button[aria-label='Eins weniger']");
      check("Minus bis 0 entfernt die Zeile", (await cartQty(page, "Apfel")) === 0);
      await page.click(".clear");
      check("Korb leeren fragt erst nach", (await page.locator(".ln").count()) === 1 && (await page.textContent(".clear")).includes("Wirklich"));
      await page.click(".clear");
      check("Zweites Tippen leert den Korb", (await page.locator(".ln").count()) === 0);
      check("Bezahlen bei leerem Korb gesperrt", await page.isDisabled(".pay"));
      // Kontextmenü (langer Druck auf dem Touchscreen) darf nicht erscheinen
      const prevented = await page.evaluate(() => { const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); document.querySelector(".tile").dispatchEvent(e); return e.defaultPrevented; });
      check("Kontextmenü auf Kacheln unterdrückt", prevented);
      // Gescannt-Reiter fehlt ohne gescannte Produkte
      check("Reiter „Gescannt“ fehlt am Anfang", (await page.locator(".cat:has-text('Gescannt')").count()) === 0);
      // Kategorie Spielzeug: eigene Bilder geladen, Namen im Korb vollständig
      await page.click(".cat:has-text('Spielzeug')");
      check("Spielzeug: 12 Produkte", (await page.locator(".tile").count()) === 12);
      const broken = await page.evaluate(() => [...document.querySelectorAll(".tile img")].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
      check("Spielzeug: eigene Bilder geladen (Kuschelschaf, Minecraft, Rennbahn)", (await page.locator(".tile img").count()) === 6 && !broken.length, broken.join(", "));
      for (const t of await page.locator(".tile").all()) await t.click();
      const cutToys = await page.evaluate(() => [...document.querySelectorAll(".ln .name")].filter((e) => e.scrollHeight > e.clientHeight + 4).map((e) => e.textContent));
      check("Spielzeug: Namen im Korb nicht abgeschnitten", !cutToys.length, cutToys.join(", "));
      check("Spielzeug: Summe aller 12 Spielsachen 61,00 €", (await total(page)).replace(/\s/g, " ") === "61,00 €", await total(page));
      await page.click(".clear"); await page.click(".clear");
      // 30 verschiedene Produkte: Korb scrollt, Bezahlen bleibt sichtbar
      for (const c of ["Obst", "Gemüse", "Milch"]) { await page.click(`.cat:has-text('${c}')`); for (const t of await page.locator(".tile").all()) await t.click(); }
      const payBox = await page.locator(".pay").boundingBox();
      check("Bezahlen-Knopf bleibt bei vollem Korb sichtbar", payBox && payBox.y + payBox.height <= 768, JSON.stringify(payBox));
      await page.screenshot({ path: `${SHOTS}/korb-voll.png` });
      check("Keine Konsolenfehler (Warenkorb)", !errors.length, errors.join(" | "));
      await browser.close();
    }

    // ---------- 2. Scannen ----------
    if (section("scan")) {
      offRequests = [];
      const { browser, page, errors } = await launch("own");
      await openShop(page);
      await page.click("text=Scannen!");
      await page.waitForSelector(".found .t:has-text('Apfel')", { timeout: 15000 });
      check("Eigenes Etikett (Apfel) erkannt", true);
      check("Eigenes Etikett ohne Internet-Abfrage", offRequests.length === 0, offRequests.join(","));
      await wait(6500);
      const q = await cartQty(page, "Apfel");
      check("Code dauerhaft vor der Kamera: zählt nur einmal", q === 1, `Menge nach 6,5 s: ${q}`);
      await page.screenshot({ path: `${SHOTS}/scan-eigenes-etikett.png` });
      check("Keine Konsolenfehler (Scan eigen)", !errors.length, errors.join(" | "));
      await browser.close();
    }
    if (section("scan")) {
      offRequests = [];
      const { browser, page, errors } = await launch("off");
      await openShop(page);
      await page.click("text=Scannen!");
      await page.waitForSelector(".found .t:has-text('Vollmilch')", { timeout: 15000 });
      // sofort "In den Korb" tippen, bevor der Automatik-Timer läuft
      await page.click(".found .big-btn");
      await wait(1600);
      const q = await cartQty(page, "Vollmilch-Schokolade");
      check("„In den Korb“ getippt + Automatik: nur einmal im Korb", q === 1, `Menge: ${q}`);
      check("Open Food Facts genau einmal gefragt", offRequests.length === 1, `${offRequests.length} Anfragen`);
      await page.click("text=✓ Fertig gescannt");
      check("Kamera nach dem Schließen aus", await page.evaluate(async () => !document.querySelector("video")));
      // Gefunden im Erkundungstest: "Fertig" direkt nach dem Piep → Produkt fehlte im Korb
      await page.click("text=Scannen!");
      await page.waitForSelector(".found .t:has-text('Vollmilch')", { timeout: 15000 });
      await page.click("text=✓ Fertig gescannt");
      const q2 = await cartQty(page, "Vollmilch-Schokolade");
      check("„Fertig“ gleich nach dem Piep: Produkt trotzdem im Korb", q2 === 2, `Menge: ${q2}`);
      await page.click(".cat:has-text('Gescannt')");
      check("Reiter „Gescannt“ zeigt das Produkt", (await page.locator(".tile:has-text('Vollmilch')").count()) === 1);
      // Neu laden: gespeichert?
      await page.reload(); await page.click("text=Laden öffnen");
      await page.click(".cat:has-text('Gescannt')");
      check("Gescanntes Produkt nach Neustart noch da", (await page.locator(".tile:has-text('Vollmilch') img").count()) === 1);
      // Löschen im Eltern-Bereich, während Reiter "Gescannt" aktiv war
      await openSettings(page);
      await page.click("nav >> text=Gescannte Produkte");
      await page.fill(".prod .price input", "1,5"); await page.press(".prod .price input", "Tab");
      await wait(200);
      check("Preis „1,5“ wird zu 1,50", (await page.inputValue(".prod .price input")) === "1,50");
      await page.fill(".prod .price input", "abc"); await page.press(".prod .price input", "Tab");
      await wait(200);
      check("Ungültiger Preis wird zurückgesetzt", (await page.inputValue(".prod .price input")) === "1,50", await page.inputValue(".prod .price input"));
      await page.click(".prod .del");
      await page.click("text=Zurück zum Laden");
      const anyOn = await page.locator(".cat.on").count();
      check("Nach Löschen des letzten gescannten Produkts ist ein Reiter aktiv", anyOn === 1 && (await page.locator(".tile").count()) > 0);
      check("Keine Konsolenfehler (Scan OFF)", !errors.length, errors.join(" | "));
      await browser.close();
    }
    if (section("scan")) {
      offRequests = [];
      wikidataRequests = [];
      const { browser, page } = await launch("unknown");
      await openShop(page);
      await page.click("text=Scannen!");
      await page.waitForSelector("text=Das kenne ich nicht", { timeout: 15000 });
      check("Unbekannter Code: Schaf zuckt mit den Schultern", true, `${offRequests.length} Datenbanken gefragt`);
      check("Unbekannter Code: nichts im Korb", (await page.locator(".ln").count()) === 0);
      await wait(4000);
      const n = offRequests.length;
      check("Unbekannter Code vor der Kamera: keine Dauer-Abfragen", n <= 3, `${n} Anfragen in ~5 s`);
      check("Unbekannter Code: Wikidata einmal gefragt (nach Open Food Facts)", wikidataRequests.length === 1, `${wikidataRequests.length} Anfragen`);
      await page.screenshot({ path: `${SHOTS}/scan-unbekannt.png` });
      await browser.close();
    }
    if (section("scan")) {
      offRequests = [];
      wikidataRequests = [];
      const { browser, page } = await launch("unknown", { offFail: true });
      await openShop(page);
      await page.click("text=Scannen!");
      const t0 = Date.now();
      await page.waitForSelector("text=Kein Internet.", { timeout: 25000 });
      const dt = Date.now() - t0;
      check("WLAN da, aber kein Internet: schnelle Antwort", dt < 8000, `${dt} ms, ${offRequests.length} Anfragen`);
      check("Kein Internet: Meldung „Kein Internet“, nicht „unbekannt“", (await page.textContent(".found")).includes("Kein Internet"), `OFF ${offRequests.length}, Wikidata ${wikidataRequests.length} Anfragen`);
      await browser.close();
    }
    if (section("scan")) {
      // Gefunden durch einen Fehlerbericht: eine Störung bei Open Food Facts wurde als "unbekannt"
      // gewertet und 10 Minuten gemerkt. Danach kam das Produkt auch nicht, als der Server wieder lief.
      offRequests = [];
      let mode = "503";
      const { browser, page, errors } = await launch("off", { offMode: () => mode });
      await openShop(page);
      await page.click("text=Scannen!");
      await page.waitForSelector("text=Ich kann gerade nicht nachschauen", { timeout: 25000 });
      check("Open Food Facts gestört (503): „Ich kann gerade nicht nachschauen“ statt „unbekannt“", true, `${offRequests.length} Anfragen`);
      mode = null;
      await page.click("text=✓ Fertig gescannt");
      await page.click("text=Scannen!");
      let ok = true;
      try { await page.waitForSelector(".found .t:has-text('Vollmilch')", { timeout: 15000 }); } catch { ok = false; }
      check("Server wieder da: nächster Scan findet das Produkt", ok);
      await page.click("text=✓ Fertig gescannt");
      await openSettings(page);
      await page.click("nav >> text=Scan-Protokoll");
      const log = (await page.textContent(".pane")).replace(/\s+/g, " ");
      check("Scan-Protokoll zeigt Störung und Fund", log.includes("Serverfehler 503") && log.includes("gefunden: Vollmilch"), log.slice(0, 160));
      await page.screenshot({ path: `${SHOTS}/scan-protokoll.png` });
      check("Keine Konsolenfehler (Störung)", !errors.filter((e) => !/503|Failed to load resource/.test(e)).length, errors.join(" | "));
      await browser.close();
    }
    if (section("scan")) {
      offRequests = [];
      wikidataRequests = [];
      const { browser, page, errors } = await launch("magazine");
      await openShop(page);
      await page.click("text=Scannen!");
      let ok = true;
      try { await page.waitForSelector(".found .t:has-text('c’t')", { timeout: 15000 }); } catch { ok = false; }
      check("Zeitschrift (977-Code) über Wikidata gefunden", ok);
      if (ok) {
        check("Zeitschrift: Wikidata zuerst, Open Food Facts gar nicht gefragt", offRequests.length === 0 && wikidataRequests.length === 2, `OFF ${offRequests.length}, Wikidata ${wikidataRequests.length}`);
        check("Zeitschrift: Suche über die ISSN aus dem Strichcode", wikidataRequests[0].includes("P236=0724-8679"));
        const info = (await page.textContent(".found")).replace(/\s+/g, " ");
        check("Zeitschrift: Quelle, ISSN und Preis 3,50 € angezeigt", info.includes("wikidata.org") && info.includes("ISSN 0724-8679") && info.includes("3,50"), info.slice(0, 120));
        check("Zeitschrift: Logo geladen", (await page.locator(".found .pimg img").count()) === 1);
        await page.waitForSelector("text=✓ Im Korb", { timeout: 4000 });
        await page.screenshot({ path: `${SHOTS}/scan-zeitschrift.png` });
        await page.click("text=✓ Fertig gescannt");
        await openSettings(page);
        await page.click("nav >> text=Gescannte Produkte");
        check("Eltern-Bereich: Kategorie „Zeitschrift“", (await page.textContent(".prod")).includes("Zeitschrift"));
      }
      check("Keine Konsolenfehler (Zeitschrift)", !errors.length, errors.join(" | "));
      await browser.close();
    }
    for (const googleDown of section("scan") ? [false, true, "abort"] : []) {
      offRequests = [];
      wikidataRequests = [];
      bookRequests = [];
      const { browser, page, errors } = await launch("book", { googleDown });
      await openShop(page);
      await page.click("text=Scannen!");
      const label = googleDown === "abort" ? "Google Books nicht erreichbar: Buch über Open Library" : googleDown ? "Google Books gestört: Buch über Open Library" : "Buch (ISBN) über Google Books";
      let ok = true;
      try { await page.waitForSelector(".found .t:has-text('Testbuch')", { timeout: 20000 }); } catch { ok = false; }
      check(`${label} gefunden`, ok, bookRequests.join(" → "));
      if (ok) {
        const info = (await page.textContent(".found")).replace(/\s+/g, " ");
        check(`${label}: Autor, Verlag, 5,00 €`, info.includes("Wolle Wollmann") && info.includes("Wiesenverlag") && info.includes("5,00"), info.slice(0, 140));
        check(`${label}: Lebensmittel-Datenbanken nicht gefragt`, offRequests.length === 0 && wikidataRequests.length === 0, `OFF ${offRequests.length}, Wikidata ${wikidataRequests.length}`);
        check(`${label}: Cover angezeigt`, (await page.locator(".found .pimg img").count()) === 1);
        if (!googleDown) await page.screenshot({ path: `${SHOTS}/scan-buch.png` });
      }
      check(`Keine Konsolenfehler (${label})`, !errors.filter((e) => !/503|Failed to load resource/.test(e)).length, errors.join(" | "));
      await browser.close();
    }
    if (section("scan")) {
      // Fehlerbericht: c't mit deutschem Pressecode 419… und Zusatzcode „23“ wurde nicht erkannt
      offRequests = [];
      wikidataRequests = [];
      bookRequests = [];
      const { browser, page, errors } = await launch("press");
      await openShop(page);
      await page.click("text=Scannen!");
      let ok = true;
      try { await page.waitForSelector(".found .src:has-text('Pressecode')", { timeout: 15000 }); } catch { ok = false; }
      check("Zeitschrift mit Pressecode (419…) erkannt", ok);
      if (ok) {
        await page.waitForSelector(".found:has-text('Ausgabe 23')", { timeout: 6000 }).catch(() => {});
        const info = (await page.textContent(".found")).replace(/\s+/g, " ");
        check("Pressecode: Preis 7,00 € aus dem Code, Ausgabe 23 aus dem Zusatzcode", info.includes("7,00") && info.includes("Ausgabe 23"), info.slice(0, 120));
        check("Pressecode: keine Datenbank gefragt", offRequests.length + wikidataRequests.length + bookRequests.length === 0);
        await page.screenshot({ path: `${SHOTS}/scan-pressecode.png` });
        await page.click("text=✓ Fertig gescannt");
        // Eltern tragen den Namen ein, danach kennt die Kasse die Zeitschrift
        await openSettings(page);
        check("Eltern-Bereich zeigt die Version", /Version \d+\.\d+\.\d+ vom/.test(await page.textContent("header")), await page.textContent("header small"));
        await page.click("nav >> text=Gescannte Produkte");
        await page.fill(".prod input.name", "c't");
        await page.press(".prod input.name", "Enter");
        await wait(300);
        await page.click("text=Zurück zum Laden");
        await page.click("text=Scannen!");
        let named = true;
        try { await page.waitForSelector(".found .t:has-text(\"c't\")", { timeout: 10000 }); } catch { named = false; }
        check("Umbenannt in „c't“: nächster Scan zeigt den Namen", named);
        await page.click("text=✓ Fertig gescannt");
        check("Korb: zweimal c't zu je 7,00 €", (await page.textContent(".total b")).includes("14,00"), await page.textContent(".total b"));
      }
      check("Keine Konsolenfehler (Pressecode)", !errors.length, errors.join(" | "));
      await browser.close();
    }
    if (section("scan")) {
      // Buch hochkant gehalten, mit 5-stelligem Preis-Zusatzcode
      bookRequests = [];
      const { browser, page, errors } = await launch("book-rotated");
      await openShop(page);
      await page.click("text=Scannen!");
      let ok = true;
      try { await page.waitForSelector(".found .t:has-text('Testbuch')", { timeout: 15000 }); } catch { ok = false; }
      check("Hochkant gehaltenes Buch mit Zusatzcode erkannt", ok, bookRequests.join(","));
      if (ok) {
        await page.click("text=✓ Fertig gescannt");
        await openSettings(page);
        await page.click("nav >> text=Scan-Protokoll");
        // Der Preis-Zusatzcode US-amerikanischer Bücher spielt keine Rolle; gesucht wird mit dem Hauptcode
        check("Scan-Protokoll: Buch mit dem Hauptcode gesucht", (await page.textContent(".log code")).trim().startsWith("9783161484100"), await page.textContent(".log code"));
      }
      check("Keine Konsolenfehler (Buch hochkant)", !errors.length, errors.join(" | "));
      await browser.close();
    }
    if (section("scan")) {
      // Tablet mit Vorder- und Rückkamera (Testbild statt Barcode: hier geht es nur ums Umschalten)
      const { browser, page, errors } = await launch("own", { cams: 2 });
      await openShop(page);
      await page.click("text=Scannen!");
      await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2, null, { timeout: 15000 });
      await page.locator("button.switch").waitFor({ timeout: 5000 }).catch(() => {});
      check("Webcam/Frontkamera wird gespiegelt angezeigt", (await page.locator("video.mirror").count()) === 1);
      check("Zwei Kameras: Knopf „Kamera“ zum Umschalten", (await page.locator("button.switch").count()) === 1);
      const camId = () => page.evaluate(() => document.querySelector("video")?.srcObject?.getVideoTracks()[0]?.getSettings().deviceId);
      const camLabel = () => page.evaluate(() => document.querySelector("video")?.srcObject?.getVideoTracks()[0]?.label);
      const before = await camId();
      if (await page.locator("button.switch").count()) await page.click("button.switch");
      await wait(1500);
      const after = await camId();
      const afterLabel = await camLabel();
      check("Umschalten wechselt die Kamera", before && after && before !== after, `${before?.slice(0, 8)} → ${after?.slice(0, 8)} (${afterLabel})`);
      await page.click("text=✓ Fertig gescannt");
      await page.reload();
      await openShop(page);
      await page.click("text=Scannen!");
      await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2, null, { timeout: 15000 });
      // Der Test-Browser vergibt bei jedem Laden neue Kennungen; wiedergefunden wird sie über den Namen
      await wait(1000);
      check("Gewählte Kamera nach Neustart gemerkt", (await camLabel()) === afterLabel, `${await camLabel()} / erwartet ${afterLabel}`);
      check("Keine Konsolenfehler (zwei Kameras)", !errors.length, errors.join(" | "));
      await browser.close();
    }
    if (section("scan")) {
      const { browser, page } = await launch("own", { rear: true });
      await openShop(page);
      await page.click("text=Scannen!");
      await page.locator(".found .t:has-text('Apfel')").waitFor({ timeout: 15000 });
      check("Rückkamera (Tablet) wird nicht gespiegelt", (await page.locator("video.mirror").count()) === 0 && (await page.locator("video").count()) === 1);
      await browser.close();
    }
    if (section("scan")) {
      const { browser, page } = await launch("unknown", { camera: false });
      await openShop(page);
      await page.click("text=Scannen!");
      await page.waitForFunction(() => !/startet/.test(document.querySelector(".hint")?.textContent ?? "startet"), null, { timeout: 8000 }).catch(() => {});
      const hint = await page.textContent(".hint");
      check("Kamera verweigert: verständlicher Hinweis", /nicht erlaubt|keine Kamera|nicht starten/.test(hint), hint.trim());
      await page.screenshot({ path: `${SHOTS}/scan-keine-kamera.png` });
      await browser.close();
    }
    // Erkennungsgrenzen. "hard" ist absichtlich zu schwer und dokumentiert die Grenze.
    for (const cam of section("scan") ? ["small", "blur", "hard"] : []) {
      const { browser, page } = await launch(cam);
      await openShop(page);
      await page.click("text=Scannen!");
      const t0 = Date.now();
      let ok = true;
      try { await page.waitForSelector(".found .t:has-text('Vollmilch')", { timeout: 12000 }); } catch { ok = false; }
      check(`Schwieriges Kamerabild „${cam}“ erkannt`, ok, ok ? `${Date.now() - t0} ms` : "nicht erkannt in 12 s", { info: cam === "hard" });
      if (cam === "hard") await page.screenshot({ path: `${SHOTS}/scan-schwierig.png` });
      await browser.close();
    }

    // ---------- 3. Bezahlen & Einstellungen ----------
    if (section("pay")) {
      const { browser, page, errors } = await launch();
      await openShop(page);
      await page.click(".tile:has-text('Apfel')");
      await page.click(".pay");
      check("PayPal ausgeblendet, solange nicht eingerichtet", (await page.locator(".opt:has-text('PayPal')").count()) === 0);
      const payload = await page.textContent(".txt code");
      check("Spiel-QR-Text wie gewünscht", /^Danke für Ihren Einkauf bei Schafland im Wert von 0,50 €$/.test(payload.replace(/ /g, " ")), JSON.stringify(payload));
      check("Spiel-QR-Text ohne geschütztes Leerzeichen", !payload.includes(" "));
      await page.keyboard.press("Escape");
      check("Escape schließt das Bezahlen", (await page.locator(".modal").count()) === 0);
      await openSettings(page);
      await page.click("#pp-on");
      await page.fill("#pp-name", "https://paypal.me/Familie_Test!");
      await page.press("#pp-name", "Enter");
      const err = await page.locator(".err").count();
      check("Ungültiger PayPal-Name wird angezeigt", err === 1, await page.inputValue("#pp-name"));
      await page.fill("#pp-name", "paypal.me/FamilieTest");
      await page.press("#pp-name", "Enter");
      check("PayPal-Link wird auf den Namen gekürzt", (await page.inputValue("#pp-name")) === "FamilieTest");
      await page.click("nav >> text=Musik");
      await page.evaluate(() => { const v = document.querySelector("#vol"); v.value = "0.3"; v.dispatchEvent(new Event("input", { bubbles: true })); });
      await wait(300);
      await page.reload();
      await page.click("text=Laden öffnen");
      await openSettings(page);
      check("PayPal-Einstellungen nach Neustart erhalten", (await page.inputValue("#pp-name")) === "FamilieTest" && (await page.getAttribute("#pp-on", "aria-checked")) === "true");
      await page.click("nav >> text=Musik");
      check("Lautstärke nach Neustart erhalten", (await page.inputValue("#vol")) === "0.3");
      await page.click("text=Zurück zum Laden");
      await page.click(".tile:has-text('Banane')"); await page.click(".tile:has-text('Banane')");
      await page.click(".pay");
      await page.click(".opt:has-text('PayPal')");
      check("PayPal-Link mit Betrag", (await page.textContent(".txt code")) === "https://paypal.me/FamilieTest/0.60EUR");
      check("PayPal-QR-Code mit dem Handy lesbar", (await readQr(page, ".modal .qr")) === "https://paypal.me/FamilieTest/0.60EUR");
      await page.click("text=Bezahlt! Neuer Einkauf");
      await page.waitForSelector(".party");
      await wait(3600);
      check("Dankesbildschirm schließt sich selbst", (await page.locator(".party").count()) === 0);
      check("Korb nach dem Bezahlen leer", (await page.locator(".ln").count()) === 0);
      await openSettings(page);
      await page.click("nav >> text=Kassenbons");
      await wait(300);
      check("Kassenbon gespeichert", (await page.textContent(".bon")).includes("2× Banane"));
      await page.click("text=Zurück zum Laden");

      // Gefunden im Erkundungstest: Doppeltipp auf "Bezahlen" schloss das Fenster sofort wieder
      await page.click(".tile:has-text('Apfel')");
      await page.locator(".pay").dblclick();
      await wait(200);
      check("Doppeltipp auf „Bezahlen“: Fenster bleibt offen", (await page.locator(".modal").count()) === 1);
      // Gefunden im Erkundungstest: dreimal schnell "Bezahlt!" ergab drei Kassenbons
      const bons = () => page.evaluate(() => new Promise((res) => { const q = indexedDB.open("schafland"); q.onsuccess = () => { const t = q.result.transaction("receipts").objectStore("receipts").count(); t.onsuccess = () => res(t.result); }; }));
      const n0 = await bons();
      await page.evaluate(() => { const b = [...document.querySelectorAll(".modal button")].find((x) => x.textContent.includes("Bezahlt")); b.click(); b.click(); b.click(); });
      await wait(600);
      check("Dreimal schnell „Bezahlt!“: nur ein Kassenbon", (await bons()) - n0 === 1, `${(await bons()) - n0} Bons`);
      await wait(3500);
      // Strg+, im Bezahlfenster: danach darf das Fenster nicht wieder auftauchen
      await page.click(".tile:has-text('Apfel')");
      await page.click(".pay");
      await openSettings(page);
      await page.click("text=Zurück zum Laden");
      check("Eltern-Bereich schließt das Bezahlfenster", (await page.locator(".modal").count()) === 0);
      check("Keine Konsolenfehler (Bezahlen)", !errors.length, errors.join(" | "));
      await browser.close();
    }

    // ---------- Update nach git pull ----------
    // Fehlerbericht: Nach git pull lud der erste Start noch die alte Version (Offline-Zwischenspeicher).
    if (section("update")) {
      const UPD = path.join(SHOTS, "update");
      fs.rmSync(UPD, { recursive: true, force: true });
      const build = (v) => {
        const out = path.join(UPD, v);
        execSync(`npx vite build --outDir "${out}" --emptyOutDir`, { cwd: R, env: { ...process.env, SCHAFLAND_VERSION: v }, stdio: "ignore" });
        return out;
      };
      const [A, B, C] = ["9.0.0-a", "9.0.0-b", "9.0.0-c"].map(build);
      const LIVE = path.join(UPD, "live");
      const deploy = (dir) => { fs.rmSync(LIVE, { recursive: true, force: true }); fs.cpSync(dir, LIVE, { recursive: true }); };
      deploy(A);
      const port = 8079;
      const srv = spawn("python3", [`${R}/kiosk/server.py`, LIVE, String(port)], { stdio: "ignore" });
      await wait(800);
      const profile = path.join(UPD, "profil"); // wie das Kiosk-Profil: bleibt zwischen den Starts erhalten
      const start = async () => {
        const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1366, height: 768 } });
        const page = ctx.pages()[0] ?? (await ctx.newPage());
        await page.goto(`http://localhost:${port}/`);
        return { ctx, page };
      };
      const versionOf = async (page) => {
        await page.click("text=Laden öffnen");
        await openSettings(page);
        const v = (await page.textContent("header small")).match(/Version (\S+)/)?.[1];
        await page.click("text=Zurück zum Laden");
        return v;
      };
      try {
        // 1. Start mit Version A, Offline-Speicher wird angelegt
        let { ctx, page } = await start();
        await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => {});
        check("Update: erster Start zeigt Version A", (await versionOf(page)) === "9.0.0-a");
        await ctx.close();
        // 2. git pull → Version B, Kasse neu starten, Startbildschirm stehen lassen
        deploy(B);
        ({ ctx, page } = await start());
        await wait(4000);
        check("Update: erster Start nach git pull zeigt schon Version B", (await versionOf(page)) === "9.0.0-b");
        await ctx.close();
        // 3. git pull → Version C, aber das Kind öffnet den Laden sofort: kein Neuladen mitten im Spiel
        deploy(C);
        ({ ctx, page } = await start());
        await page.click("text=Laden öffnen");
        await page.click(".tile:has-text('Apfel')");
        await wait(4000);
        check("Update: kein Neuladen mitten im Spiel (Korb bleibt)", (await page.locator(".ln").count()) === 1 && (await page.locator(".start").count()) === 0);
        // nach dem Bezahlen (natürliche Pause) kommt die neue Version
        await page.click(".pay");
        await page.click("text=Bezahlt! Neuer Einkauf");
        await page.locator(".party").click();
        await page.locator(".start").waitFor({ timeout: 10000 }).catch(() => {});
        check("Update: nach dem Bezahlen neue Version C", (await page.locator(".start").count()) === 1 && (await versionOf(page)) === "9.0.0-c");
        await ctx.close();
      } finally {
        srv.kill();
      }
    }

    // ---------- GiroCode ----------
    if (section("pay")) {
      const { browser, page, errors } = await launch();
      await openShop(page);
      await page.click(".tile:has-text('Apfel')");
      await page.click(".pay");
      check("GiroCode ausgeblendet, solange nicht eingerichtet", (await page.locator(".opt:has-text('Überweisung')").count()) === 0);
      await page.keyboard.press("Escape");
      await openSettings(page);
      await page.click("#giro-on");
      await page.fill("#giro-name", "Familie Müller");
      await page.fill("#giro-iban", "DE89 3704 0044 0532 0130 01");
      await page.press("#giro-iban", "Enter");
      check("Falsche IBAN wird erkannt", (await page.locator(".err:has-text('IBAN')").count()) === 1 && (await page.locator(".test:has-text('Empfänger')").count()) === 0);
      await page.fill("#giro-iban", "de89370400440532013000");
      await page.press("#giro-iban", "Enter");
      check("Richtige IBAN: lesbar formatiert, kein Fehler", (await page.inputValue("#giro-iban")) === "DE89 3704 0044 0532 0130 00" && (await page.locator(".err").count()) === 0, await page.inputValue("#giro-iban"));
      const testQr = await readQr(page, ".test .qr");
      check("Test-GiroCode über 1,00 € lesbar", testQr === "BCD\n002\n1\nSCT\n\nFamilie Müller\nDE89370400440532013000\nEUR1.00\n\n\nSchafland Einkauf", JSON.stringify(testQr));
      await page.fill("#giro-text", "Kaufladen Oma");
      await page.press("#giro-text", "Enter");
      await wait(300);
      await page.reload();
      await page.click("text=Laden öffnen");
      await openSettings(page);
      check("GiroCode-Einstellungen nach Neustart erhalten", (await page.inputValue("#giro-name")) === "Familie Müller" && (await page.inputValue("#giro-text")) === "Kaufladen Oma" && (await page.getAttribute("#giro-on", "aria-checked")) === "true");
      await page.click("text=Zurück zum Laden");
      await page.click(".tile:has-text('Apfel')");
      await page.click(".tile:has-text('Banane')");
      await page.click(".pay");
      await page.click(".opt:has-text('Überweisung')");
      await wait(300);
      check("Bezahlen per GiroCode: ohne Schaf in der Mitte", (await page.locator(".modal .qr .badge").count()) === 0);
      check("Bezahlen per GiroCode: Empfänger, IBAN, Betrag lesbar angezeigt", (await page.textContent(".txt code.giro")).includes("DE89 3704 0044 0532 0130 00") && (await page.textContent(".txt code.giro")).includes("0,80"));
      const qr = await readQr(page, ".modal .qr");
      check("Bezahlen per GiroCode: Code enthält genau die Überweisung", qr === "BCD\n002\n1\nSCT\n\nFamilie Müller\nDE89370400440532013000\nEUR0.80\n\n\nKaufladen Oma", JSON.stringify(qr));
      await page.screenshot({ path: `${SHOTS}/bezahlen-girocode.png` });
      await page.click("text=Bezahlt! Neuer Einkauf");
      await wait(3600);
      await openSettings(page);
      await page.click("nav >> text=Kassenbons");
      await wait(300);
      check("Kassenbon: Bezahlart „Überweisung (GiroCode)“", (await page.textContent(".bon")).includes("Überweisung (GiroCode)"));
      await page.click("nav >> text=Bezahlen");
      await page.click("#giro-on");
      await page.click("text=Zurück zum Laden");
      await page.click(".tile:has-text('Apfel')");
      await page.click(".pay");
      check("GiroCode ausschalten: Option verschwindet", (await page.locator(".opt:has-text('Überweisung')").count()) === 0);
      check("Spiel-QR weiterhin mit Schaf und lesbar", (await page.locator(".modal .qr .badge").count()) === 1 && (await readQr(page, ".modal .qr")).startsWith("Danke für Ihren Einkauf"));
      check("Keine Konsolenfehler (GiroCode)", !errors.length, errors.join(" | "));
      await browser.close();
    }

    // ---------- Aktionen ----------
    const AKTIONEN = [
      { id: "halloween", name: "Halloween", sky: "rgb(42, 29, 71)", hat: "path[fill='#5b2a86']", buy: ["Kürbissuppe", "Hexenhut"], total: "5,20 €", thanks: "Süßes oder Saures", label: "Zauberbesen", deko: ".bat", ink: "rgb(255, 241, 220)" },
      { id: "weihnachten", name: "Weihnachten", sky: "rgb(27, 42, 78)", hat: "path[fill='#d42d3a']", buy: ["Geschenk", "Schlitten"], total: "7,00 €", thanks: "Frohe Weihnachten", label: "Rentier-Kekse", deko: ".flake", ink: "rgb(255, 248, 234)" },
    ];
    for (const A of section("aktion") ? AKTIONEN : []) {
      const { browser, page, errors } = await launch("own");
      await openShop(page);
      check(`${A.name}: ohne Aktion kein Aktionsreiter, normales Aussehen`, (await page.locator(".cat.aktion").count()) === 0 && !(await page.evaluate(() => document.documentElement.dataset.aktion)));
      await openSettings(page);
      await page.click("nav >> text=Aktionen");
      await page.click(`#aktion-${A.id}`);
      check(`${A.name}: einschalten aktiviert das Aussehen`, (await page.evaluate(() => document.documentElement.dataset.aktion)) === A.id);
      await page.click("text=Zurück zum Laden");
      const tabs = await page.locator(".cat").allTextContents();
      check(`${A.name}: Reiter ganz vorne und ausgewählt`, tabs[0].includes(A.name) && (await page.locator(".cat.on").textContent()).includes(A.name), tabs.join(" | "));
      check(`${A.name}: 12 Aktionsprodukte im Reiter`, (await page.locator(".tile").count()) === 12);
      const sky = await page.evaluate(() => getComputedStyle(document.querySelector("header")).backgroundColor);
      check(`${A.name}: Kopfzeile als Nachthimmel`, sky === A.sky, sky);
      check(`${A.name}: Deko in der Kopfzeile`, (await page.locator(`header ${A.deko}`).count()) > 0);
      check(`${A.name}: Schaf mit Kostüm`, (await page.locator(`header svg ${A.hat}`).count()) === 1);
      for (const n of A.buy) await page.locator(".tile").filter({ hasText: n }).first().click();
      // alle Aktionsprodukte einmal in den Korb: kein Name darf abgeschnitten werden
      const before = await total(page);
      check(`${A.name}: Aktionsprodukte in den Korb, Summe stimmt`, (await total(page)).replace(/\s/g, " ") === A.total, await total(page));
      for (const t of await page.locator(".tile").all()) await t.click();
      const cut = await page.evaluate(() => [...document.querySelectorAll(".ln .name")].filter((e) => e.scrollHeight > e.clientHeight + 4).map((e) => e.textContent));
      check(`${A.name}: Namen im Korb nicht abgeschnitten`, !cut.length, cut.join(", "));
      // Sonstige Funktionen gleich: Scannen eines normalen Etiketts, Bezahlen
      await page.click("text=Scannen!");
      await page.waitForSelector(".found .t:has-text('Apfel')", { timeout: 15000 });
      const src = await page.evaluate(() => { const s = getComputedStyle(document.querySelector(".found .src")); return [s.color, s.backgroundColor]; });
      check(`${A.name}: Scannen funktioniert, Quellen-Schild lesbar`, src[0] === A.ink && src[1] === A.sky, src.join(" auf "));
      await page.click("text=✓ Fertig gescannt");
      await page.click(".pay");
      await page.click("text=Bezahlt! Neuer Einkauf");
      await page.waitForSelector(".party");
      check(`${A.name}: Danke-Bildschirm mit „${A.thanks}!“`, (await page.textContent(".party")).includes(A.thanks));
      await wait(3600);
      await page.reload();
      check(`${A.name}: Aktion bleibt nach Neustart an`, (await page.textContent(".start")).includes(`${A.name} in Schafland`));
      await page.screenshot({ path: `${SHOTS}/aktion-${A.id}-start.png` });
      await page.click("text=Laden öffnen");
      await openSettings(page);
      await page.click("nav >> text=Etiketten drucken");
      check(`${A.name}: Etiketten für Aktionsprodukte druckbar`, (await page.locator(`.label:has-text('${A.label}')`).count()) === 1);
      await page.click("nav >> text=Aktionen");
      // Wechsel auf die jeweils andere Aktion: immer nur eine aktiv
      const other = AKTIONEN.find((x) => x !== A);
      await page.click(`#aktion-${other.id}`);
      check(`${A.name} → ${other.name}: nur eine Aktion aktiv`,
        (await page.getAttribute(`#aktion-${A.id}`, "aria-checked")) === "false" && (await page.evaluate(() => document.documentElement.dataset.aktion)) === other.id);
      await page.click("text=Zurück zum Laden");
      const tabs2 = await page.locator(".cat").allTextContents();
      check(`${A.name} → ${other.name}: nur der neue Aktionsreiter`, tabs2[0].includes(other.name) && !tabs2.some((t) => t.includes(A.name)), tabs2.join(" | "));
      await openSettings(page);
      await page.click("nav >> text=Aktionen");
      await page.click(`#aktion-${other.id}`);
      await page.click("text=Zurück zum Laden");
      check(`${A.name}: ausschalten → normales Aussehen, Obst gewählt`,
        (await page.locator(".cat.aktion").count()) === 0 && !(await page.evaluate(() => document.documentElement.dataset.aktion)) && (await page.locator(".cat.on").textContent()).includes("Obst"));
      check(`Keine Konsolenfehler (${A.name})`, !errors.length, errors.join(" | "));
      await browser.close();
    }

    // ---------- 4. Musik ----------
    if (section("music")) {
      const { browser, page, errors } = await launch();
      await openShop(page);
      await openSettings(page);
      await page.click("nav >> text=Musik");
      await page.click("text=Ordner wählen …");
      await page.waitForSelector(".tracks button");
      check("4 Dateien im Ordner gelistet", (await page.locator(".tracks button").count()) === 4);
      // Zufall aus, dann Titel 1 abspielen und durchlaufen lassen
      if ((await page.getAttribute("#shuf", "aria-checked")) === "true") await page.click("#shuf");
      await page.locator(".tracks button").nth(0).click();
      await wait(3500);
      const now = await page.textContent(".now b");
      check("Nach Liedende läuft das nächste", now.includes("Kurz-B") || now.includes("Kaputt"), now);
      await wait(4000);
      const now2 = await page.textContent(".now b");
      check("Kaputte Datei wird übersprungen", !now2.includes("Kaputt") && (await page.evaluate(() => document.querySelector(".tracks .on")?.textContent)).length > 0, now2);
      await page.click("text=Zurück zum Laden");
      check("Musik-Knopf in der Kopfzeile", (await page.locator("header .music").count()) === 1);
      await page.click("header .music button[aria-label='Musik anhalten']").catch(() => {});
      check("Konsolenfehler nur für die kaputte Datei", errors.every((e) => /Kaputt|media|MEDIA|decode|DEMUXER|Format/i.test(e)), errors.join(" | "));
      await browser.close();
    }
    if (section("music")) {
      const { browser, page } = await launch("empty", { noPicker: true });
      await openShop(page);
      await openSettings(page);
      await page.click("nav >> text=Musik");
      const input = page.locator("#music-files");
      check("Ohne Ordner-API (Android-App): „Lieder hinzufügen“", (await input.count()) === 1 && (await input.getAttribute("webkitdirectory")) === null);
      const songs = fs.readdirSync(`${Q}/musik`).map((f) => `${Q}/musik/${f}`);
      await input.setInputFiles(songs);
      await page.waitForSelector(".tracks button", { timeout: 5000 });
      check("Importierte Lieder erscheinen", (await page.locator(".tracks .track").count()) === 4, `${await page.locator(".tracks .track").count()} Lieder`);
      await input.setInputFiles(songs.slice(0, 2));
      await wait(500);
      check("Dasselbe Lied nicht doppelt", (await page.locator(".tracks .track").count()) === 4);
      await page.reload();
      await page.click("text=Laden öffnen");
      await openSettings(page);
      await page.click("nav >> text=Musik");
      await page.waitForSelector(".tracks .track", { timeout: 5000 }).catch(() => {});
      check("Lieder nach Neustart noch da (in der App gespeichert)", (await page.locator(".tracks .track").count()) === 4);
      // Reihenfolge der importierten Lieder ist nicht festgelegt: gezielt ein heiles Lied wählen
      await page.locator(".tracks .track", { hasText: "Kurz" }).first().locator("button").first().click();
      await wait(1500);
      check("Gespeichertes Lied spielt", (await page.textContent(".now b")).includes("Kurz"), await page.textContent(".now b"));
      await page.locator(".tracks .track .del").last().click();
      await wait(400);
      check("Lied entfernen", (await page.locator(".tracks .track").count()) === 3);
      await browser.close();
    }

    // ---------- 5. Touch: langer Druck auf das Schaf ----------
    if (section("touch")) {
      const { browser, page, ctx } = await launch("empty", { touch: true });
      await openShop(page);
      const cdp = await ctx.newCDPSession(page);
      const b = await page.locator(".brand").boundingBox();
      const pt = { x: b.x + 25, y: b.y + 25 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
      await wait(500);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await wait(300);
      check("Kurzes Tippen auf das Schaf öffnet nichts", (await page.locator("text=Eltern-Bereich").count()) === 0);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
      await wait(2300);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await wait(300);
      check("2 s auf das Schaf drücken (Touch) öffnet den Eltern-Bereich", (await page.locator("text=Eltern-Bereich").count()) === 1);
      await page.click("text=Zurück zum Laden");
      await page.tap(".tile:has-text('Apfel')");
      check("Antippen per Touch legt in den Korb", (await cartQty(page, "Apfel")) === 1);
      await browser.close();
    }

    // ---------- 6. Bildschirmgrößen ----------
    for (const [w, h] of section("layout") ? [[1366, 768], [1280, 800], [1024, 768], [1920, 1080], [1280, 720]] : []) {
      const { browser, page } = await launch("empty", { viewport: { width: w, height: h } });
      await openShop(page);
      for (const n of ["Apfel", "Banane", "Birne"]) await page.click(`.tile:has-text("${n}")`);
      const m = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const out = [];
        for (const el of document.querySelectorAll(".pay, .scanbar, .cats, .total, header")) {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1) out.push(el.className.split(" ")[0]);
        }
        const cats = document.querySelector(".cats").getBoundingClientRect().height;
        return { out, scroll: document.documentElement.scrollWidth > vw, cats };
      });
      check(`Layout ${w}×${h}: alles im Bild`, !m.out.length && !m.scroll, JSON.stringify(m));
      await page.screenshot({ path: `${SHOTS}/layout-${w}x${h}.png` });
      await browser.close();
    }

    // ---------- Smartphones (Android-App) ----------
    for (const [name, device] of section("handy") ? [["Pixel 7 hochkant", devices["Pixel 7"]], ["Galaxy S8 hochkant", devices["Galaxy S8"]], ["Pixel 7 quer", devices["Pixel 7 landscape"]]] : []) {
      const { browser, page, errors } = await launch("own", { device });
      const portrait = device.viewport.width < device.viewport.height;
      const offscreen = () => page.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push("Seite seitlich scrollbar");
        for (const el of document.querySelectorAll("button, .tile")) {
          const r = el.getBoundingClientRect();
          if (!r.width || el.closest(".cats, nav, .grid, .lines, .tracks, .pane")) continue;
          if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1) out.push((el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20));
        }
        return out;
      });
      await page.goto(APP_URL);
      await page.tap("text=Laden öffnen");
      for (const n of ["Apfel", "Banane", "Banane"]) await page.locator(".tile").filter({ hasText: n }).first().tap();
      let bad = await offscreen();
      check(`${name}: Kasse ohne Überstand`, !bad.length, bad.join(", "));
      const tiles = await page.evaluate(() => [...document.querySelectorAll(".tile")].filter((t) => { const r = t.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).length);
      check(`${name}: mindestens 8 Kacheln auf einen Blick`, tiles >= 8, `${tiles} Kacheln`);
      if (portrait) {
        check(`${name}: Korb als Leiste unten mit Summe`, (await page.textContent(".bar")).replace(/\s+/g, " ").includes("3 Sachen") && (await page.textContent(".bar-total")).replace(/\s/g, " ") === "1,10 €");
        await page.tap(".bar-info");
        await page.locator(".sheet .ln:has-text('Banane') button[aria-label='Eins mehr']").tap();
        check(`${name}: Korb-Blatt öffnen und Menge ändern`, (await page.textContent(".bar-total")).replace(/\s/g, " ") === "1,40 €", await page.textContent(".bar-total"));
        await page.tap(".sheet-close");
        check(`${name}: Korb-Blatt schließt`, (await page.locator(".sheet").count()) === 0);
      } else {
        const cut = await page.evaluate(() => [...document.querySelectorAll(".ln .name")].filter((e) => e.scrollHeight > e.clientHeight + 4 || /\S\s\S/.test(e.innerText.replace(/\n/g, " ")) && e.innerText.includes("\n") && !e.textContent.includes("\u00ad")).map((e) => e.innerText));
        check(`${name}: Korb rechts, Namen nicht zerhackt`, (await page.locator(".bar").count()) === 0 && !cut.length, cut.join(" | "));
      }
      // Scannen: Kamera und Fund passen ins Bild, Bild überdeckt keinen Text
      await page.tap("text=Scannen!");
      await page.locator(".found .t:has-text('Apfel')").waitFor({ timeout: 15000 });
      const overlap = await page.evaluate(() => { const a = document.querySelector(".found .pimg").getBoundingClientRect(); const b = document.querySelector(".found .t").getBoundingClientRect(); return !(a.right <= b.left + 1 || a.bottom <= b.top + 1 || b.right <= a.left + 1 || b.bottom <= a.top + 1); });
      bad = await offscreen();
      check(`${name}: Scannen ohne Überstand, Bild neben dem Namen`, !bad.length && !overlap, [...bad, overlap ? "Bild überdeckt Namen" : ""].filter(Boolean).join(", "));
      await page.tap("text=✓ Fertig gescannt");
      // Bezahlen
      await page.tap(portrait ? ".bar-pay" : ".pay");
      const qr = await page.evaluate(() => { const r = document.querySelector(".modal .qr").getBoundingClientRect(); return { w: Math.round(r.width), inside: r.bottom <= innerHeight && r.right <= innerWidth }; });
      bad = await offscreen();
      check(`${name}: QR-Code groß genug und ganz zu sehen`, qr.w >= 140 && qr.inside && !bad.length, `${qr.w} px ${bad.join(", ")}`);
      check(`${name}: QR-Code lesbar`, (await readQr(page, ".modal .qr"))?.startsWith("Danke für Ihren Einkauf"));
      await page.tap("text=Bezahlt! Neuer Einkauf");
      await page.locator(".party").waitFor();
      await page.locator(".party").tap();
      // Eltern-Bereich
      await openSettings(page);
      bad = await offscreen();
      const navScroll = await page.evaluate(() => { const n = document.querySelector("nav"); return getComputedStyle(n).flexDirection; });
      check(`${name}: Eltern-Bereich bedienbar`, !bad.length && (portrait ? navScroll === "row" : true), bad.join(", "));
      await page.tap("nav >> text=Aktionen");
      await page.tap("#aktion-weihnachten");
      check(`${name}: Aktion einschalten geht`, (await page.evaluate(() => document.documentElement.dataset.aktion)) === "weihnachten");
      await page.screenshot({ path: `${SHOTS}/handy-${name.replace(/\s+/g, "-")}.png` });
      check(`Keine Konsolenfehler (${name})`, !errors.length, errors.join(" | "));
      await browser.close();
    }

    // ---------- 7. Langsame CPU (4× gedrosselt, ähnlich i5-4200U-Notebook im Stromsparmodus) ----------
    if (section("slow")) {
      const { browser, page, ctx } = await launch("off");
      await openShop(page);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const t0 = Date.now();
      await page.click(".tile:has-text('Apfel')");
      await page.waitForSelector(".ln:has-text('Apfel')");
      const tapMs = Date.now() - t0;
      check("Tippen → im Korb bei 4× langsamer CPU", tapMs < 400, `${tapMs} ms`);
      await page.click("text=Scannen!");
      const t1 = Date.now();
      await page.waitForSelector(".found .t:has-text('Vollmilch')", { timeout: 20000 });
      check("Scan bei 4× langsamer CPU", true, `${Date.now() - t1} ms bis erkannt`);
      await browser.close();
    }

    // ---------- 7b. Frag das Schaf ----------
    if (section("schaf")) {
      // Gesprochene Frage: 1,2 s „Stimme“ (Ton), danach Stille. Die Spracherkennung selbst wird hier
      // ersetzt (ihr Modell kommt aus dem Internet); echt getestet wird sie in .github/workflows/sprache.yml
      const wav = path.join(Q, "frage-ton.wav");
      if (!fs.existsSync(wav)) execSync(`ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=300:duration=1.2" -af "volume=0.8,apad=pad_dur=2.5" -ar 16000 -ac 1 ${wav}`);
      const { browser, ctx, page, errors } = await launch("empty", { audio: wav });
      await ctx.addInitScript(() => { window.__schafFakeErkennung = async (audio) => (audio.length > 8000 ? `Was kostet die Banane? (${(audio.length / 16000).toFixed(1)} s)` : ""); });
      await openShop(page);
      check("Ohne Einschalten kein Knopf „Frag das Schaf“", (await page.locator(".askbar").count()) === 0);
      await openSettings(page);
      await page.click("nav >> text=Frag das Schaf");
      await page.click("#schaf-on");
      await page.fill("#schaf-try", "Was kostet die Nane?");
      check("Eltern: Ausprobieren ohne Mikrofon", (await page.textContent(".answer")).includes("Die Banane kostet 30 Cent"), await page.textContent(".answer"));
      await page.screenshot({ path: `${SHOTS}/schaf-eltern.png` });
      await page.click("text=Zurück zum Laden");
      check("Knopf „Frag das Schaf!“ neben „Scannen!“", await page.isVisible(".askbar"));
      await page.screenshot({ path: `${SHOTS}/schaf-knopf.png` });

      // Echtes Mikrofon (Test-Ton), Zuhören bis zur Pause, dann Antwort
      const t0 = Date.now();
      await page.click(".askbar");
      let listened = true;
      try { await page.waitForSelector(".panel >> text=Ich höre zu", { timeout: 5000 }); } catch { listened = false; }
      check("Mikrofon: Schaf hört zu", listened);
      await page.waitForSelector(".panel .big:has-text('kostet')", { timeout: 15000 });
      const secs = (Date.now() - t0) / 1000;
      const heard = await page.textContent(".panel .heard");
      check("Aufnahme endet von selbst nach dem Sprechen", secs < 6 && /\(1\.[0-9] s|\(2\.[0-9] s/.test(heard), `${secs.toFixed(1)} s, ${heard}`);
      check("Antwort mit Preis", (await page.textContent(".panel .big")).includes("Die Banane kostet 30 Cent"));
      await page.screenshot({ path: `${SHOTS}/schaf-antwort.png` });
      await page.click("text=🧺 Ja, in den Korb");
      await wait(300);
      check("„Ja, in den Korb“ legt die Banane in den Korb", (await cartQty(page, "Banane")) === 1);
      check("Schaf bestätigt", (await page.textContent(".panel .big")).includes("Die Banane ist im Korb"));

      // Direkt in den Korb, Summe, Unklares mit Bildauswahl
      await page.evaluate(() => window.__fragDasSchaf.hear("Ich möchte ein Eis"));
      check("„Ich möchte ein Eis“ legt Eis in den Korb", (await cartQty(page, "Eis")) === 1);
      await page.evaluate(() => window.__fragDasSchaf.hear("Wie viel muss ich bezahlen?"));
      check("Summe vorlesen", (await page.textContent(".panel .big")).includes("2 Sachen. Das macht zusammen 3 Euro 30"), await page.textContent(".panel .big"));
      await page.evaluate(() => window.__fragDasSchaf.hear("Pfirsiche"));
      await page.evaluate(() => window.__fragDasSchaf.hear("Ki"));
      const choices = await page.locator(".choice").count();
      check("Unklar: Bilder zur Auswahl", choices >= 1 || (await page.textContent(".panel .big")).includes("nicht verstanden"), `${choices} Bilder`);
      await page.evaluate(() => window.__fragDasSchaf.hear("Lulu"));
      await page.screenshot({ path: `${SHOTS}/schaf-auswahl.png` });
      if (await page.locator(".choice").count()) {
        const picked = await page.locator(".choice .nm").first().textContent();
        await page.locator(".choice").first().click();
        check("Bild antippen: Schaf nennt den Preis", (await page.textContent(".panel .big")).includes("kostet"), picked);
      }
      await page.evaluate(() => window.__fragDasSchaf.hear("Was gibt es bei Obst?"));
      check("Kategorie: Schaf zählt auf", (await page.textContent(".panel .big")).startsWith("Bei Obst gibt es"));
      await page.click(".panel .x");
      check("Schließen", (await page.locator(".panel").count()) === 0);

      // Stufe 2: freie Fragen (Sprachmodell hier durch eine feste Antwort ersetzt)
      await page.evaluate(() => {
        window.__schafFakeKi = async (messages) => {
          window.__kiPrompt = messages;
          const q = messages.at(-1).content;
          if (/Party/.test(q)) return "Das kostet 12 Euro.";
          return "Äpfel und Bananen sind gesund! Eine Banane kostet 30 Cent.";
        };
      });
      await openSettings(page);
      await page.click("nav >> text=Frag das Schaf");
      check("Stufe 2 ist ab Werk aus", (await page.getAttribute("#ki-on", "aria-checked")) === "false");
      await page.click("#ki-on");
      await page.click("text=Jetzt laden >> nth=-1").catch(() => {});
      await page.waitForSelector("text=✓ Geladen (test)", { timeout: 5000 }).catch(() => {});
      await page.fill("#ki-try", "Was ist gesund?");
      await page.click("button:has-text('Fragen')");
      await page.waitForSelector(".ki-answer:has-text('gesund')", { timeout: 5000 }).catch(() => {});
      const kiTry = (await page.textContent(".ki-answer").catch(() => "")) ?? "";
      check("Eltern: KI ausprobieren, Preis-Satz entfernt", kiTry.includes("Äpfel und Bananen sind gesund!") && !kiTry.includes("30 Cent") && kiTry.includes("Apfel, Banane"), kiTry);
      await page.screenshot({ path: `${SHOTS}/schaf-ki-eltern.png`, fullPage: true });
      await page.click("text=Zurück zum Laden");
      await page.evaluate(() => window.__fragDasSchaf.hear("Was ist gesund?"));
      check("Offene Frage: KI-Antwort", (await page.textContent(".panel .big")).trim() === "Äpfel und Bananen sind gesund!");
      check("Offene Frage: empfohlene Produkte als Bilder", (await page.locator(".choice").count()) === 2);
      const prompt = await page.evaluate(() => window.__kiPrompt[0].content);
      check("KI bekommt Sortiment und Korb, keine Preise", prompt.includes("Obst: Apfel, Banane") && prompt.includes("Im Korb liegt schon") && !/\d+,\d\d/.test(prompt));
      await page.screenshot({ path: `${SHOTS}/schaf-ki-antwort.png` });
      await page.locator(".choice").first().click();
      check("KI-Bild antippen: Preis aus der Kasse", (await page.textContent(".panel .big")).includes("Der Apfel kostet 50 Cent"));
      await page.evaluate(() => window.__fragDasSchaf.hear("Was soll ich für eine Party kaufen?"));
      check("Unbrauchbare KI-Antwort (nur Preis): Antwort von Stufe 1", !(await page.textContent(".panel .big")).includes("12 Euro"), await page.textContent(".panel .big"));
      await page.evaluate(() => window.__fragDasSchaf.hear("Was kostet die Birne?"));
      check("Einfache Frage bleibt bei Stufe 1", (await page.textContent(".panel .big")).includes("Die Birne kostet 60 Cent"));
      await page.click(".panel .x");

      // Eltern: Protokoll und Aussprache merken
      await openSettings(page);
      await page.click("nav >> text=Frag das Schaf");
      check("Eltern: zuletzt gefragt", (await page.locator(".log").count()) >= 5);
      const learn = page.locator("button.link").first();
      if (await learn.count()) {
        const t = await learn.textContent();
        await learn.click();
        check("Eltern: Aussprache mit einem Tipp merken", (await page.locator(".alias").count()) === 1, t);
      }
      await page.fill(".alias-add input", "Nane");
      await page.selectOption(".alias-add select", { label: "Banane" });
      await page.click(".alias-add button");
      check("Eltern: Aussprache von Hand", (await page.textContent(".pane")).includes("„nane“"));
      await page.screenshot({ path: `${SHOTS}/schaf-eltern-aussprache.png`, fullPage: true });
      await page.click("text=Zurück zum Laden");

      // Ohne Internet beim ersten Mal: verständliche Meldung statt Hängen
      await page.evaluate(() => { delete window.__schafFakeErkennung; });
      await ctx.route(/huggingface\.co|hf\.co/, (r) => r.abort("internetdisconnected"));
      await page.evaluate(() => window.__fragDasSchaf.resetModel());
      await page.click(".askbar");
      let msg = "";
      try { await page.waitForSelector(".panel >> text=Oh!", { timeout: 20000 }); msg = await page.textContent(".panel .bubble"); } catch {}
      check("Ohne Internet beim ersten Mal: verständliche Meldung", msg.includes("Internet"), msg.replace(/\s+/g, " ").slice(0, 120));
      await page.click(".panel .x");
      check("Keine Konsolenfehler (Frag das Schaf)", !errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|huggingface|fetch/i.test(e)).length, errors.join(" | "));
      await browser.close();

      // Handy hochkant: Knöpfe nebeneinander, Sprechblase passt
      const h = await launch("empty", { device: devices["Pixel 7"], audio: wav });
      await h.ctx.addInitScript(() => { window.__schafFakeErkennung = async () => "Was kostet die Schokolade"; });
      await h.page.goto(APP_URL);
      await h.page.click("text=Laden öffnen");
      await h.page.waitForSelector(".tile");
      await openSettings(h.page);
      await h.page.click("nav >> text=Frag das Schaf");
      await h.page.click("#schaf-on");
      await h.page.click("text=Zurück zum Laden");
      await h.page.screenshot({ path: `${SHOTS}/schaf-handy-knopf.png` });
      await h.page.click(".askbar");
      await h.page.waitForSelector(".panel .big:has-text('kostet')", { timeout: 15000 });
      const fits = await h.page.evaluate(() => { const r = document.querySelector(".panel").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; });
      check("Handy: Sprechblase passt auf den Bildschirm", fits);
      await h.page.screenshot({ path: `${SHOTS}/schaf-handy.png` });
      await h.browser.close();
    }

    // ---------- 8. Offline (Service Worker) ----------
    if (section("offline")) {
      const { browser, page, ctx, errors } = await launch("own");
      await page.goto(APP_URL);
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
      server.kill(); // Server weg und Netz aus
      await ctx.setOffline(true);
      await wait(300);
      await page.reload();
      let ok = true;
      try { await page.waitForSelector("text=Laden öffnen", { timeout: 8000 }); } catch { ok = false; }
      check("App startet ohne Server/Netz aus dem Cache", ok);
      if (ok) {
        await page.click("text=Laden öffnen");
        await page.click("text=Scannen!");
        let s = true;
        try { await page.waitForSelector(".found .t:has-text('Apfel')", { timeout: 15000 }); } catch { s = false; }
        check("Scannen funktioniert offline (WASM aus dem Cache)", s);
        const font = await page.evaluate(() => document.fonts.check("800 20px 'Baloo 2'"));
        check("Schrift offline geladen", font);
      }
      check("Keine Konsolenfehler (offline)", !errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length, errors.join(" | "));
      await browser.close();
    }
  } finally {
    server.kill();
  }
  const failed = results.filter((r) => !r.ok && !r.info);
  const infos = results.filter((r) => !r.ok && r.info);
  console.log(`\n${results.length - failed.length - infos.length}/${results.length} bestanden, ${failed.length} Fehler, ${infos.length} bekannte Grenzen`);
  console.log(`Screenshots: ${SHOTS}`);
  fs.writeFileSync(`${SHOTS}/results.json`, JSON.stringify(results, null, 1));
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
