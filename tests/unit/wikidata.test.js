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

// ---------- genauer (nach dem Mutationstest) ----------

test("Jede Art von Periodikum wird Zeitschrift", async () => {
  for (const q of ["Q41298", "Q1002697", "Q11032", "Q5633421", "Q737498"]) {
    mockFetch((url) => (url.includes("list=search") ? searchHit("Q9") : entity("Q9", { de: "Heft", p31: ["Q5", q] })));
    assert.equal((await lookupWikidata("4001234567893")).categoryId, "zeitschrift", q);
  }
  mockFetch((url) => (url.includes("list=search") ? searchHit("Q9") : entity("Q9", { de: "Ding", p31: ["Q5"] })));
  const p = await lookupWikidata("4001234567893");
  assert.equal(p.categoryId, "gescannt");
  assert.equal(p.quantity, "");
  assert.equal(p.id, "wd-4001234567893");
  assert.equal(p.wikidataId, "Q9");
});

test("Suche: GTIN 13- und 14-stellig, ISSN, ISBN in allen Schreibweisen; Protokoll", async () => {
  const trace = [];
  mockFetch(() => searchHit(null));
  assert.equal(await lookupWikidata("9783161484100", { trace }), null);
  assert.match(calls[0], /haswbstatement:P212=978-[^|]+\|.*P212=978-3-16-148410-0\|.*P3962=9783161484100\|P3962=09783161484100/);
  assert.deepEqual(trace, ["wikidata.org: nicht gefunden (ISBN)"]);
  trace.length = 0;
  await lookupWikidata(ean977("0724867"), { trace });
  assert.match(calls.at(-1), /haswbstatement:P236=0724-8679\|P3962=/);
  assert.deepEqual(trace, ["wikidata.org: nicht gefunden (ISSN 0724-8679)"]);
  trace.length = 0;
  await lookupWikidata("4001234567893", { trace });
  assert.match(calls.at(-1), /haswbstatement:P3962=4001234567893\|P3962=04001234567893&srlimit=1/);
  assert.deepEqual(trace, ["wikidata.org: nicht gefunden"]);
});

test("Antworten ohne gültige Q-Nummer oder ohne Eintrag gelten als nicht gefunden", async () => {
  for (const bad of [json({}), json({ query: {} }), json({ query: { search: [{ title: "Property:P1" }] } }), json({ query: { search: [{ title: "XQ1" }] } }), json({ query: { search: [{ title: "Q1x" }] } })]) {
    mockFetch(() => bad);
    assert.equal(await lookupWikidata("4001234567893"), null);
    assert.equal(calls.length, 1, "keine zweite Anfrage");
  }
  const trace = [];
  mockFetch((url) => (url.includes("list=search") ? searchHit("Q7") : json({ entities: {} })));
  assert.equal(await lookupWikidata("4001234567893", { trace }), null);
  assert.deepEqual(trace, ["wikidata.org: Q7 ohne Namen"]);
  mockFetch((url) => (url.includes("list=search") ? searchHit("Q7") : json({})));
  assert.equal(await lookupWikidata("4001234567893"), null);
});

test("Name: Deutsch, sonst Englisch, sonst irgendeine Sprache; Eigenschaften ohne Wert werden übersprungen", async () => {
  const withLabels = (labels, claims = {}) => json({ entities: { Q3: { labels, descriptions: { fr: { value: "revue" } }, claims } } });
  const run = async (labels, claims) => {
    mockFetch((url) => (url.includes("list=search") ? searchHit("Q3") : withLabels(labels, claims)));
    return lookupWikidata("4001234567893");
  };
  assert.equal((await run({ en: { value: "Milk" }, de: { value: "Milch" } })).name, "Milch");
  assert.equal((await run({ en: { value: "Milk" }, fr: { value: "Lait" } })).name, "Milk");
  const fr = await run({ fr: { value: "  Lait " } });
  assert.equal(fr.name, "Lait");
  assert.equal(fr.brand, "revue", "Beschreibung in irgendeiner Sprache");
  const ohneWert = await run({ de: { value: "X" } }, { P154: [{ mainsnak: {} }, { mainsnak: { datavalue: { value: "Logo.svg" } } }], P31: [{}] });
  assert.equal(ohneWert.imageUrl, commonsThumb("Logo.svg"));
  const objektStattDatei = await run({ de: { value: "X" } }, { P18: [{ mainsnak: { datavalue: { value: { id: "Q1" } } } }] });
  assert.equal(objektStattDatei.imageUrl, null, "kein Dateiname: kein Bild");
});
