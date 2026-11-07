// Warenkorb und Produktsuche (src/lib/shop.svelte.js). Läuft mit IndexedDB-Attrappe und übersetzten
// Svelte-Runen (tests/unit/hilfen/svelte-register.mjs, siehe „npm test“).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cart, scanned, findByEan } from "../../src/lib/shop.svelte.js";
import { products } from "../../src/lib/catalog.js";
import { db } from "../../src/lib/db.js";

const [apfel, banane] = products;
const realFetch = globalThis.fetch;
let calls = [];

/** Netz nachbauen: handler(url) → Response oder Fehler (wirft = keine Verbindung) */
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return handler(String(url));
  };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** überall „nicht gefunden“ */
const nirgends = (url) =>
  url.includes("facts.org") ? json({ status: 0 })
    : url.includes("wikidata") ? json({ query: { search: [] } })
      : url.includes("googleapis") ? json({ totalItems: 0 })
        : json({});

beforeEach(async () => {
  cart.clear();
  await db.products.clear();
  await db.receipts.clear();
  await scanned.load();
});
afterEach(() => (globalThis.fetch = realFetch));

// ---------- Warenkorb ----------

test("Warenkorb: hinzufügen zählt hoch, zuletzt Hinzugefügtes steht oben", () => {
  cart.add(apfel);
  cart.add(banane);
  assert.deepEqual(cart.lines.map((l) => l.product.id), [banane.id, apfel.id]);
  const tick = cart.lastTick;
  cart.add(apfel);
  assert.deepEqual(cart.lines.map((l) => [l.product.id, l.qty]), [[apfel.id, 2], [banane.id, 1]]);
  assert.equal(cart.lastId, apfel.id);
  assert.equal(cart.lastTick, tick + 1);
  assert.equal(cart.count, 3);
  assert.equal(cart.totalCents, 2 * apfel.priceCents + banane.priceCents);
});

test("Warenkorb: Menge ändern, bei 0 verschwindet die Zeile, Unbekanntes wird ignoriert", () => {
  cart.add(apfel);
  cart.change(apfel.id, +2);
  assert.equal(cart.lines[0].qty, 3);
  cart.change(apfel.id, -1);
  assert.equal(cart.lines[0].qty, 2);
  cart.change("gibt-es-nicht", 5);
  assert.equal(cart.count, 2);
  cart.change(apfel.id, -2);
  assert.equal(cart.lines.length, 0);
  assert.equal(cart.totalCents, 0);
});

test("Warenkorb: leeren setzt auch das zuletzt Hinzugefügte zurück", () => {
  cart.add(apfel);
  cart.clear();
  assert.equal(cart.lines.length, 0);
  assert.equal(cart.lastId, null);
});

test("Bezahlen: Kassenbon mit Zahlart, Zeilen und Summe; danach ist der Korb leer", async () => {
  cart.add(apfel);
  cart.add(apfel);
  cart.add(banane);
  const before = Date.now();
  await cart.checkout("karte");
  const [bon] = await db.receipts.toArray();
  assert.equal(bon.payment, "karte");
  assert.equal(bon.totalCents, 2 * apfel.priceCents + banane.priceCents);
  assert.ok(bon.createdAt >= before);
  assert.deepEqual(bon.lines, [
    { productId: banane.id, name: banane.name, qty: 1, priceCents: banane.priceCents },
    { productId: apfel.id, name: apfel.name, qty: 2, priceCents: apfel.priceCents },
  ]);
  assert.equal(cart.lines.length, 0);
});

// ---------- Gescannte Produkte ----------

test("Gescannt: speichern, ändern, löschen; neueste zuerst", async () => {
  await scanned.save({ id: "a", ean: "1", name: "Alt", createdAt: 1 });
  await scanned.save({ id: "b", ean: "2", name: "Neu", createdAt: 2 });
  await scanned.save({ id: "c", ean: "3", name: "Ohne Datum" });
  assert.deepEqual(scanned.list.map((p) => p.id), ["b", "a", "c"]);
  await scanned.update("a", { name: "Umbenannt" });
  assert.equal(scanned.list.find((p) => p.id === "a").name, "Umbenannt");
  await scanned.remove("b");
  assert.deepEqual(scanned.list.map((p) => p.id), ["a", "c"]);
});

// ---------- Produktsuche ----------

test("Suche: eigener Katalog zuerst, ohne Netz", async () => {
  mockFetch(() => assert.fail("kein Netz nötig"));
  const own = products.find((p) => p.ean);
  const r = await findByEan(own.ean);
  assert.equal(r.product, own);
  assert.equal(r.source, "eigen");
  assert.equal(calls.length, 0);
});

test("Suche: online gefunden → gespeichert; beim zweiten Mal aus dem Speicher", async () => {
  mockFetch((url) => (url.includes("openfoodfacts") && url.includes("/api/") ? json({ status: 1, product: { product_name: "Kakao", categories_tags: ["en:beverages"] } }) : nirgends(url)));
  const r = await findByEan("4000000000017");
  assert.equal(r.product.name, "Kakao");
  assert.equal(r.source, "openfoodfacts.org");
  assert.equal(scanned.list.length, 1);
  const n = calls.length;
  const again = await findByEan("4000000000017");
  assert.equal(again.source, "gespeichert");
  assert.equal(calls.length, n, "kein zweiter Netzabruf");
});

test("Suche: nirgends gefunden → „unknown“ und kurz gemerkt (keine Anfragen-Flut)", async () => {
  mockFetch(nirgends);
  const r = await findByEan("4000000000024");
  assert.equal(r.error, "unknown");
  assert.ok(r.trace.length > 0);
  const n = calls.length;
  const again = await findByEan("4000000000024");
  assert.equal(again.error, "unknown");
  assert.match(again.trace[0], /vor Kurzem/);
  assert.equal(calls.length, n);
});

test("Suche: keine Verbindung → „offline“ (nicht gemerkt)", async () => {
  mockFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  const r = await findByEan("4000000000031");
  assert.equal(r.error, "offline");
  mockFetch(nirgends);
  assert.equal((await findByEan("4000000000031")).error, "unknown", "nach dem Offline-Fehler wird wieder gefragt");
});

test("Suche: Server gestört → „unavailable“", async () => {
  mockFetch((url) => (url.includes("facts.org") ? new Response("Wartung", { status: 503 }) : nirgends(url)));
  const r = await findByEan("4000000000048");
  assert.equal(r.error, "unavailable");
});

test("Suche: ein Dienst ohne Verbindung, die anderen sagen „nicht gefunden“ → „unavailable“", async () => {
  mockFetch((url) => {
    if (url.includes("wikidata")) throw new TypeError("Failed to fetch");
    return nirgends(url);
  });
  assert.equal((await findByEan("4000000000055")).error, "unavailable");
});

test("Suche: Bücher zuerst bei Google Books, Zeitschriften (977) zuerst bei Wikidata", async () => {
  mockFetch(nirgends);
  await findByEan("9783161484100");
  assert.match(calls[0], /googleapis/);
  assert.ok(!calls.some((u) => u.includes("facts.org")), "Bücher nicht bei Lebensmitteln suchen");
  mockFetch(nirgends);
  await findByEan("9771234567003");
  assert.match(calls[0], /wikidata/);
});

test("Suche: Pressecode wird ohne Netz angelegt, neue Ausgabe aktualisiert den gespeicherten", async () => {
  mockFetch(() => assert.fail("kein Netz nötig"));
  const code = "4194567802505";
  const r = await findByEan(code, { issue: "03" });
  assert.equal(r.source, "Pressecode");
  assert.ok(r.product.priceCents > 0);
  const again = await findByEan(code, { issue: "04" });
  assert.equal(again.source, "gespeichert");
  assert.equal(again.product.brand, "Ausgabe 04");
  assert.equal((await db.products.where("ean").equals(code).first()).brand, "Ausgabe 04");
});
