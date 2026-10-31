import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { issnFromEan, lookupWikidata, commonsThumb } from "../../src/lib/wikidata.js";
import { NetworkError, ServiceError } from "../../src/lib/net.js";
import { checkDigit } from "../../src/lib/ean.js";

const ean977 = (issn7, extra = "00") => {
  const base = `977${issn7}${extra}`;
  return base + checkDigit(base);
};

test("ISSN aus Zeitschriften-Code: c't (ISSN 0724-8679)", () => {
  assert.equal(issnFromEan(ean977("0724867")), "0724-8679");
  // Ausgabe/Preis-Ziffern ändern nichts an der ISSN
  assert.equal(issnFromEan(ean977("0724867", "23")), "0724-8679");
});

test("ISSN mit Prüfziffer X", () => {
  assert.equal(issnFromEan(ean977("2434561")), "2434-561X");
});

test("Kein Zeitschriften-Code → keine ISSN", () => {
  assert.equal(issnFromEan("4001234567891"), null);
  assert.equal(issnFromEan("4191234567890"), null); // deutscher Pressecode, enthält keine ISSN
  assert.equal(issnFromEan("977123"), null);
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
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const searchHit = (id) => json({ query: { search: id ? [{ title: id }] : [] } });
const entity = (id, { de, en, desc, p31 = [], logo, image } = {}) =>
  json({
    entities: {
      [id]: {
        labels: { ...(de && { de: { value: de } }), ...(en && { en: { value: en } }) },
        descriptions: desc ? { de: { value: desc } } : {},
        claims: {
          P31: p31.map((q) => ({ mainsnak: { datavalue: { value: { id: q } } } })),
          ...(logo && { P154: [{ mainsnak: { datavalue: { value: logo } } }] }),
          ...(image && { P18: [{ mainsnak: { datavalue: { value: image } } }] }),
        },
      },
    },
  });

test("Zeitschrift über die ISSN: Name, Beschreibung, Logo, Kategorie Zeitschrift", async () => {
  mockFetch((url) => {
    if (url.includes("list=search")) return searchHit("Q1140000");
    if (url.includes("wbgetentities")) return entity("Q1140000", { de: "c’t", desc: "deutsche Computerzeitschrift", p31: ["Q41298"], logo: "C't Logo.svg" });
    return new Response(new Blob(["svg"]));
  });
  const p = await lookupWikidata(ean977("0724867"));
  assert.ok(calls[0].includes("haswbstatement:P236=0724-8679|P3962="), calls[0]);
  assert.ok(calls[0].includes("origin=*"));
  assert.equal(p.name, "c’t");
  assert.equal(p.brand, "deutsche Computerzeitschrift");
  assert.equal(p.categoryId, "zeitschrift");
  assert.equal(p.emoji, "📰");
  assert.equal(p.priceCents, 350);
  assert.equal(p.quantity, "ISSN 0724-8679");
  assert.equal(p.source, "wikidata.org");
  assert.equal(p.imageUrl, commonsThumb("C't Logo.svg"));
  assert.ok(p.imageBlob);
});

test("Produkt über die GTIN, englischer Name als Ersatz, Bild statt Logo", async () => {
  mockFetch((url) => {
    if (url.includes("list=search")) return searchHit("Q42");
    if (url.includes("wbgetentities")) return entity("Q42", { en: "Some Game", p31: ["Q7889"], image: "Box.jpg" });
    throw new TypeError("kein CORS");
  });
  const p = await lookupWikidata("4001234567891");
  assert.ok(calls[0].includes("haswbstatement:P3962=4001234567891|P3962=04001234567891"), calls[0]);
  assert.ok(!calls[0].includes("P236"));
  assert.equal(p.name, "Some Game");
  assert.equal(p.categoryId, "gescannt");
  assert.equal(p.priceCents, 100);
  assert.equal(p.imageUrl, commonsThumb("Box.jpg"));
  assert.equal(p.imageBlob, null);
});

test("Periodikum über GTIN (ohne 977) wird trotzdem Zeitschrift", async () => {
  mockFetch((url) => (url.includes("list=search") ? searchHit("Q7") : entity("Q7", { de: "Heft", p31: ["Q1002697"] })));
  assert.equal((await lookupWikidata("4001234567891")).categoryId, "zeitschrift");
});

test("nicht in Wikidata → null, ohne zweite Anfrage", async () => {
  mockFetch(() => searchHit(null));
  assert.equal(await lookupWikidata("4001234567891"), null);
  assert.equal(calls.length, 1);
});

test("Eintrag ohne Namen → null", async () => {
  mockFetch((url) => (url.includes("list=search") ? searchHit("Q9") : entity("Q9", {})));
  assert.equal(await lookupWikidata("4001234567891"), null);
});

test("Wikidata gestört → ServiceError mit Hinweis im Protokoll", async () => {
  mockFetch(() => new Response("", { status: 503 }));
  const trace = [];
  await assert.rejects(lookupWikidata("4001234567891", { trace }), ServiceError);
  assert.deepEqual(trace, ["wikidata.org: Serverfehler 503"]);
});

test("kein Internet → NetworkError", async () => {
  mockFetch(() => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(lookupWikidata("4001234567891"), NetworkError);
});
