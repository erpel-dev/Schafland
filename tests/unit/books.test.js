import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isBookEan, isbnHyphenations, lookupGoogleBooks, lookupOpenLibrary } from "../../src/lib/books.js";
import { lookupWikidata } from "../../src/lib/wikidata.js";
import { NetworkError, ServiceError } from "../../src/lib/net.js";

const ISBN = "9783161484100"; // Beispiel-ISBN 978-3-16-148410-0

test("Buch-Codes erkennen (978 und 979)", () => {
  assert.ok(isBookEan(ISBN));
  assert.ok(isBookEan("9791032300824"));
  assert.ok(!isBookEan("4001234567891"));
  assert.ok(!isBookEan("9770724867005")); // Zeitschrift
  assert.ok(!isBookEan("978316148410"));
});

test("ISBN-Schreibweisen enthalten die richtige, alle mit 13 Ziffern", () => {
  const all = isbnHyphenations(ISBN);
  assert.ok(all.includes("978-3-16-148410-0"));
  assert.ok(isbnHyphenations("9780306406157").includes("978-0-306-40615-7"));
  assert.ok(isbnHyphenations("9788804668237").includes("978-88-04-66823-7")); // zweistellige Gruppe (Italien)
  for (const h of all) assert.equal(h.replace(/-/g, ""), ISBN);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 18);
  assert.deepEqual(isbnHyphenations("4001234567891"), []);
});

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));
let calls;
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push(decodeURIComponent(String(url)));
    return handler(decodeURIComponent(String(url)));
  };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("Google Books: Titel, Autoren, Verlag, Cover über https", async () => {
  mockFetch((url) =>
    url.includes("googleapis")
      ? json({ totalItems: 1, items: [{ volumeInfo: { title: "Der Grüffelo ", authors: ["Julia Donaldson", "Axel Scheffler"], publisher: "Beltz", industryIdentifiers: [{ type: "ISBN_13", identifier: ISBN }], imageLinks: { thumbnail: "http://books.google.com/books/content?id=x&img=1&edge=curl" } } }] })
      : new Response(new Blob(["jpg"])),
  );
  const trace = [];
  const p = await lookupGoogleBooks(ISBN, { trace });
  assert.match(calls[0], /volumes\?q=isbn:9783161484100/);
  assert.equal(p.name, "Der Grüffelo");
  assert.equal(p.brand, "Julia Donaldson, Axel Scheffler");
  assert.equal(p.quantity, "Beltz");
  assert.equal(p.categoryId, "buch");
  assert.equal(p.emoji, "📚");
  assert.equal(p.priceCents, 500);
  assert.equal(p.source, "books.google.com");
  assert.equal(p.imageUrl, "https://books.google.com/books/content?id=x&img=1");
  assert.ok(p.imageBlob);
  assert.deepEqual(trace, ["books.google.com: gefunden"]);
});

test("Google Books: viele Autoren werden gekürzt", async () => {
  mockFetch(() => json({ items: [{ volumeInfo: { title: "Sammelband", authors: ["A", "B", "C", "D"] } }] }));
  assert.equal((await lookupGoogleBooks(ISBN)).brand, "A, B u. a.");
});

test("Google Books: Treffer mit anderer ISBN wird verworfen (unscharfe Suche)", async () => {
  mockFetch(() => json({ totalItems: 1, items: [{ volumeInfo: { title: "Falsches Buch", industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000002" }] } }] }));
  const trace = [];
  assert.equal(await lookupGoogleBooks(ISBN, { trace }), null);
  assert.deepEqual(trace, ["books.google.com: nicht gefunden"]);
});

test("Google Books: keine Treffer → null", async () => {
  mockFetch(() => json({ kind: "books#volumes", totalItems: 0 }));
  assert.equal(await lookupGoogleBooks(ISBN), null);
});

test("Google Books: Tageslimit erreicht (429) → ServiceError", async () => {
  mockFetch(() => new Response("", { status: 429 }));
  const trace = [];
  await assert.rejects(lookupGoogleBooks(ISBN, { trace }), ServiceError);
  assert.deepEqual(trace, ["books.google.com: zu viele Anfragen (429)"]);
});

test("Open Library: Titel, Autorennamen, Verlag, Cover", async () => {
  mockFetch((url) =>
    url.includes("openlibrary.org/api")
      ? json({ [`ISBN:${ISBN}`]: { title: "Das kleine Gespenst", authors: [{ name: "Otfried Preußler" }], publishers: [{ name: "Thienemann" }], cover: { small: "https://covers.openlibrary.org/b/id/1-S.jpg", medium: "https://covers.openlibrary.org/b/id/1-M.jpg" } } })
      : new Response(new Blob(["jpg"])),
  );
  const p = await lookupOpenLibrary(ISBN);
  assert.match(calls[0], /bibkeys=ISBN:9783161484100&format=json&jscmd=data/);
  assert.equal(p.name, "Das kleine Gespenst");
  assert.equal(p.brand, "Otfried Preußler");
  assert.equal(p.quantity, "Thienemann");
  assert.equal(p.imageUrl, "https://covers.openlibrary.org/b/id/1-M.jpg");
  assert.equal(p.source, "openlibrary.org");
});

test("Open Library: unbekannt ({}) → null", async () => {
  mockFetch(() => json({}));
  const trace = [];
  assert.equal(await lookupOpenLibrary(ISBN, { trace }), null);
  assert.deepEqual(trace, ["openlibrary.org: nicht gefunden"]);
});

test("Open Library: keine Verbindung → NetworkError", async () => {
  mockFetch(() => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(lookupOpenLibrary(ISBN), NetworkError);
});

test("Wikidata: Buch über alle ISBN-Schreibweisen, Kategorie Buch", async () => {
  mockFetch((url) =>
    url.includes("list=search")
      ? json({ query: { search: [{ title: "Q123" }] } })
      : json({ entities: { Q123: { labels: { de: { value: "Momo" } }, descriptions: { de: { value: "Roman von Michael Ende" } }, claims: {} } } }),
  );
  const trace = [];
  const p = await lookupWikidata(ISBN, { trace });
  assert.ok(calls[0].includes("P212=978-3-16-148410-0"), calls[0]);
  assert.ok(calls[0].includes(`P3962=${ISBN}`));
  assert.equal(p.name, "Momo");
  assert.equal(p.categoryId, "buch");
  assert.equal(p.priceCents, 500);
});

test("Wikidata: Buch nicht gefunden → Hinweis „ISBN“ im Protokoll", async () => {
  mockFetch(() => json({ query: { search: [] } }));
  const trace = [];
  assert.equal(await lookupWikidata(ISBN, { trace }), null);
  assert.deepEqual(trace, ["wikidata.org: nicht gefunden (ISBN)"]);
});
