import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { lookupOpenFacts } from "../../src/lib/off.js";
import { NetworkError } from "../../src/lib/net.js";

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

test("Netzwerkfehler: sofort aufgeben statt drei Server abzuwarten", async () => {
  mockFetch(() => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(lookupOpenFacts("1"), NetworkError);
  assert.equal(calls.length, 1);
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
