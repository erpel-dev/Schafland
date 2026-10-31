// Browser-Tests für Schafland. Aufruf: npm run test:e2e
// Startet den echten Kiosk-Webserver (kiosk/server.py) mit dist/ und prüft die App in Chromium.
// Kameras werden mit Videodateien simuliert, Open Food Facts mit festen Antworten.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeFixtures } from "./fixtures.mjs";

const R = fileURLToPath(new URL("../..", import.meta.url));
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

/** info: Ergebnis wird berichtet, zählt aber nicht als Fehler (bekannte Grenze). */
function check(name, ok, detail = "", { info = false } = {}) {
  results.push({ name, ok: !!ok, detail, info });
  const tag = ok ? "PASS" : info ? "INFO" : "FAIL";
  console.log(`${tag}  ${name}${detail ? "  — " + detail : ""}`);
}
const section = (name) => !ONLY || ONLY.split(",").includes(name);

const PRODUCT = { status: 1, product: { product_name_de: "Vollmilch-Schokolade", brands: "Beispielmarke", quantity: "100 g",
  image_front_small_url: "https://images.openfoodfacts.org/x/front.jpg", categories_tags: ["en:sweet-snacks", "en:chocolates"] } };

async function launch(cam = "empty", { viewport = { width: 1366, height: 768 }, touch = false, camera = true, fakeDir = true, noPicker = false, offFail = false } = {}) {
  const args = ["--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${Q}/${cam}.y4m`, "--autoplay-policy=no-user-gesture-required"];
  args.push(camera ? "--use-fake-ui-for-media-stream" : "--deny-permission-prompts");
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: false, permissions: camera ? ["camera"] : [] });
  const errors = [];
  await ctx.route(/open(food|beauty|products)facts\.org\/api/, (route) => {
    const url = route.request().url();
    offRequests.push(url);
    if (offFail) return route.abort("internetdisconnected");
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
      await page.fill(".prod input", "1,5"); await page.press(".prod input", "Tab");
      await wait(200);
      check("Preis „1,5“ wird zu 1,50", (await page.inputValue(".prod input")) === "1,50");
      await page.fill(".prod input", "abc"); await page.press(".prod input", "Tab");
      await wait(200);
      check("Ungültiger Preis wird zurückgesetzt", (await page.inputValue(".prod input")) === "1,50", await page.inputValue(".prod input"));
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
      await page.waitForSelector("text=Das kenne ich nicht", { timeout: 25000 });
      const dt = Date.now() - t0;
      check("WLAN da, aber kein Internet: schnelle Antwort", dt < 8000, `${dt} ms, ${offRequests.length} Anfragen`);
      check("Kein Internet: Wikidata wird gar nicht erst gefragt", wikidataRequests.length === 0, `${wikidataRequests.length} Anfragen`);
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
      check("Ohne Ordner-API: Auswahl über Dateifeld", (await input.count()) === 1);
      try {
        await input.setInputFiles(`${Q}/musik`);
        await page.waitForSelector(".tracks button", { timeout: 5000 });
        check("Dateifeld-Rückfall listet die Lieder", (await page.locator(".tracks button").count()) === 4);
      } catch (e) { check("Dateifeld-Rückfall listet die Lieder", false, e.message.split("\n")[0]); }
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
