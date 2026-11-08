import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { lookupOpenFacts } from "../../src/lib/off.js";
import { NetworkError, ServiceError } from "../../src/lib/net.js";

const realFetch = globalThis.fetch;
let calls;

function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    return handler(String(url), opts);
  };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const product = (p) => json({ status: 1, product: p });

beforeEach(() => (calls = []));
afterEach(() => (globalThis.fetch = realFetch));

test("gefundenes Produkt: Name, Marke, Kategorie und Spielpreis", async () => {
  mockFetch((url) =>
    url.includes("/api/") ? product({ product_name_de: "Vollmilch", brands: "Kuh AG, Weide", quantity: "1 l", categories_tags: ["en:dairies", "en:milks"], image_front_small_url: "https://img/x.jpg" })
      : new Response(new Blob(["png"]), { status: 200 }),
  );
  const p = await lookupOpenFacts("4001234567891");
  assert.equal(p.name, "Vollmilch");
  assert.equal(p.brand, "Kuh AG");
  assert.equal(p.categoryId, "milch");
  assert.equal(p.priceCents, 120);
  assert.equal(p.id, "off-4001234567891");
  assert.equal(p.source, "openfoodfacts.org");
  assert.ok(p.imageBlob);
  assert.match(calls[0], /world\.openfoodfacts\.org\/api\/v2\/product\/4001234567891\.json/);
});

test("Süßes hat Vorrang vor Snacks und Milch (Schokolade)", async () => {
  mockFetch(() => product({ product_name: "Schoko", categories_tags: ["en:dairies", "en:snacks", "en:chocolates"] }));
  const p = await lookupOpenFacts("1");
  assert.equal(p.categoryId, "suesses");
  assert.equal(p.priceCents, 99);
});

test("ohne passende Kategorie: Gescannt, 1,00 €", async () => {
  mockFetch(() => product({ product_name: "Schraube", categories_tags: ["en:tools"] }));
  const p = await lookupOpenFacts("1");
  assert.equal(p.categoryId, "gescannt");
  assert.equal(p.priceCents, 100);
});

test("deutscher Name wird bevorzugt, sonst Marke als Ersatz", async () => {
  mockFetch(() => product({ product_name_de: "", product_name: "", brands: "Nur Marke" }));
  assert.equal((await lookupOpenFacts("1")).name, "Nur Marke");
});

test("nicht in Food Facts → Beauty Facts → Products Facts", async () => {
  mockFetch((url) => (url.includes("openproductsfacts") ? product({ product_name: "Bürste" }) : json({ status: 0 })));
  const p = await lookupOpenFacts("1");
  assert.equal(p.name, "Bürste");
  assert.equal(p.source, "openproductsfacts.org");
  assert.equal(calls.length, 3);
});

test("überall unbekannt → null", async () => {
  mockFetch(() => json({ status: 0 }));
  assert.equal(await lookupOpenFacts("1"), null);
  assert.equal(calls.length, 3);
});

test("Netzwerkfehler: einmal wiederholen, dann aufgeben statt drei Server abzuwarten", async () => {
  mockFetch(() => { throw new TypeError("Failed to fetch"); });
  const trace = [];
  await assert.rejects(lookupOpenFacts("1", { trace }), NetworkError);
  assert.equal(calls.length, 2);
  assert.deepEqual(trace, ["openfoodfacts.org: keine Verbindung"]);
});

for (const [name, response] of [
  ["überlastet (503)", () => new Response("Service Unavailable", { status: 503 })],
  ["zu viele Anfragen (429)", () => new Response("Too Many Requests", { status: 429 })],
  ["Wartungsseite statt JSON", () => new Response("<html>Wartung</html>", { status: 200, headers: { "content-type": "text/html" } })],
]) {
  test(`Open Food Facts ${name}: nicht als „unbekannt“ werten`, async () => {
    mockFetch(() => response());
    const trace = [];
    await assert.rejects(lookupOpenFacts("1", { trace }), ServiceError);
    assert.equal(calls.length, 6, "jeder der drei Server mit einem Wiederholversuch");
    assert.equal(trace.length, 3);
  });
}

test("Störung nur kurz: der Wiederholversuch findet das Produkt", async () => {
  let n = 0;
  mockFetch(() => (n++ === 0 ? new Response("", { status: 503 }) : product({ product_name: "Milch", categories_tags: ["en:milks"] })));
  const trace = [];
  const p = await lookupOpenFacts("1", { trace });
  assert.equal(p.name, "Milch");
  assert.deepEqual(trace, ["openfoodfacts.org: gefunden"]);
});

test("Food Facts gestört, Products Facts findet es trotzdem", async () => {
  mockFetch((url) => (url.includes("openfoodfacts") ? new Response("", { status: 503 }) : url.includes("openproductsfacts") ? product({ product_name: "Bürste" }) : json({ status: 0 }, 404)));
  const trace = [];
  assert.equal((await lookupOpenFacts("1", { trace })).name, "Bürste");
  assert.deepEqual(trace, ["openfoodfacts.org: Serverfehler 503", "openbeautyfacts.org: nicht gefunden", "openproductsfacts.org: gefunden"]);
});

test("zu langsam: Störung (nicht „offline“), kein Wiederholversuch, nächster Server", async () => {
  globalThis.fetch = (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  const trace = [];
  // AbortSignal.timeout hält Node nicht am Leben; ein laufender Timer schon
  const keepAlive = setInterval(() => {}, 10);
  await assert.rejects(lookupOpenFacts("1", { timeoutMs: 50, trace }), ServiceError).finally(() => clearInterval(keepAlive));
  assert.equal(trace.length, 3);
  assert.equal(trace[0], "openfoodfacts.org: keine Antwort nach 0.05 s");
});

test("HTTP 404 (so meldet Open Food Facts unbekannte Codes) zählt als nicht gefunden", async () => {
  mockFetch(() => json({ status: 0, status_verbose: "product not found" }, 404));
  assert.equal(await lookupOpenFacts("1"), null);
  assert.equal(calls.length, 3);
});

test("Produkt ohne Namen zählt als nicht gefunden", async () => {
  mockFetch(() => product({ product_name: "  " }));
  assert.equal(await lookupOpenFacts("1"), null);
});

test("Bild ohne CORS: Produkt trotzdem, nur mit Bild-URL", async () => {
  mockFetch((url) => {
    if (url.includes("/api/")) return product({ product_name: "X", image_front_small_url: "https://img/x.jpg" });
    throw new TypeError("CORS");
  });
  const p = await lookupOpenFacts("1");
  assert.equal(p.imageBlob, null);
  assert.equal(p.imageUrl, "https://img/x.jpg");
});

test("Kategorie aus jedem bekannten Schlagwort", async () => {
  const table = {
    suesses: ["en:chocolates", "en:confectioneries", "en:sweets", "en:candies", "en:sweet-snacks", "en:biscuits", "en:snacks"],
    getraenke: ["en:beverages", "en:waters", "en:juices", "en:sodas"],
    milch: ["en:dairies", "en:milks", "en:cheeses", "en:yogurts", "en:butters", "en:eggs"],
    backwaren: ["en:breads", "en:pastries", "en:viennoiseries", "en:cakes"],
    obst: ["en:fruits", "en:fresh-fruits", "en:fruits-based-foods"],
    gemuese: ["en:vegetables", "en:fresh-vegetables", "en:vegetables-based-foods"],
  };
  for (const [id, tags] of Object.entries(table)) {
    for (const tag of tags) {
      mockFetch(() => product({ product_name: "X", categories_tags: ["en:irgendwas", tag] }));
      assert.equal((await lookupOpenFacts("1")).categoryId, id, tag);
    }
  }
  mockFetch(() => product({ product_name: "X" }));
  assert.equal((await lookupOpenFacts("1")).categoryId, "gescannt", "ohne Schlagwörter");
});

test("Name, Marke, Menge: Ersatzwerte und Aufräumen", async () => {
  mockFetch(() => product({ brands: "  Nur Marke , Zweite" }));
  let p = await lookupOpenFacts("1");
  assert.equal(p.name, "Nur Marke , Zweite");
  assert.equal(p.brand, "Nur Marke");
  assert.equal(p.quantity, "");
  assert.equal(p.imageUrl, null);
  assert.equal(p.imageBlob, null);
  assert.ok(Math.abs(p.createdAt - Date.now()) < 5000);
  mockFetch(() => product({ product_name: "  Saft  ", quantity: "1 l" }));
  p = await lookupOpenFacts("1");
  assert.equal(p.name, "Saft");
  assert.equal(p.brand, "");
  assert.equal(p.quantity, "1 l");
  assert.match(calls[0], /fields=product_name,product_name_de,brands,quantity,image_front_small_url,categories_tags,allergens_tags,traces_tags,labels_tags,ingredients_tags,ingredients_text_de,ingredients_text,ingredients_n,unknown_ingredients_n&lc=de/);
});

test("Gefunden nur beim zweiten Server; leerer Name zählt als nicht gefunden", async () => {
  const trace = [];
  mockFetch((url) => (url.includes("openfoodfacts") ? product({ product_name: "   " }) : url.includes("openbeautyfacts") ? product({ product_name: "Seife" }) : assert.fail()));
  const p = await lookupOpenFacts("4", { trace });
  assert.equal(p.name, "Seife");
  assert.equal(p.source, "openbeautyfacts.org");
  assert.deepEqual(trace, ["openfoodfacts.org: nicht gefunden", "openbeautyfacts.org: gefunden"]);
  mockFetch(() => json({ status: 1 }));
  assert.equal(await lookupOpenFacts("4"), null, "status 1 ohne Produkt");
  mockFetch(() => json({ status: 0, product: { product_name: "Geist" } }));
  assert.equal(await lookupOpenFacts("4"), null, "status 0 trotz Produkt");
});
