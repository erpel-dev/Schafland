// Antworten des Schafs (src/lib/sprache/antworten.js): genaue Sätze für jede Absicht.
// Gefunden beim Mutationstesten: „Glöckchen“, „Kuschelsocken“ und „Mandarinen“ (Aktionen) hatten
// keinen Artikel, das Schaf sagte „Kuschelsocken kostet …“.
import { test } from "node:test";
import assert from "node:assert/strict";
import { answer, genus, sayPrice } from "../../src/lib/sprache/antworten.js";
import { products } from "../../src/lib/catalog.js";
import { aktionen } from "../../src/lib/aktionen.js";

const P = (name, priceCents = 100, id = name) => ({ id, name, priceCents });
const R = (intent, extra = {}) => ({ intent, product: null, candidates: [], text: "x", ...extra });

test("Artikel: alle Produkte aus Sortiment und Aktionen", () => {
  const all = [...products, ...aktionen.flatMap((a) => a.products)];
  assert.deepEqual(all.filter((p) => !genus(p).article).map((p) => p.name), []);
  assert.deepEqual(genus(P("Glöckchen")), { article: "das", plural: false });
  assert.deepEqual(genus(P("Kuschel­socken")), { article: "die", plural: true });
  assert.deepEqual(genus(P("Mandarinen")), { article: "die", plural: true });
  assert.deepEqual(genus(P("Gebrannte Mandeln")), { article: "die", plural: true });
  assert.deepEqual(genus(P("Rentier-Kekse")), { article: "die", plural: true });
  assert.deepEqual(genus(P("Kaiserbrötchen")), { article: "das", plural: false });
  assert.deepEqual(genus(P("Lebkuchenhaus")), { article: "das", plural: false }, "längstes Grundwort");
  assert.deepEqual(genus(P("APFEL")), { article: "der", plural: false }, "Groß-/Kleinschreibung egal");
  assert.deepEqual(genus(P("Bio Banane")), { article: "die", plural: false }, "letzter Namensteil");
  assert.deepEqual(genus(P("Nutella")), { article: null, plural: false });
  assert.deepEqual(genus(P("Eier")), { article: "die", plural: true });
  assert.deepEqual(genus(P("Kuchen")), { article: "der", plural: false });
  assert.deepEqual(genus(P("Bücher")), { article: null, plural: false });
  assert.deepEqual(genus(P("")), { article: null, plural: false });
});

test("Preise vorlesen: Cent, Euro, gemischt", () => {
  assert.equal(sayPrice(0), "0 Cent");
  assert.equal(sayPrice(5), "5 Cent");
  assert.equal(sayPrice(99), "99 Cent");
  assert.equal(sayPrice(100), "1 Euro");
  assert.equal(sayPrice(101), "1 Euro 1");
  assert.equal(sayPrice(1990), "19 Euro 90");
});

test("In den Korb: ist / sind", () => {
  const apfel = P("Apfel");
  assert.deepEqual(answer(R("add", { product: apfel })), { say: "Der Apfel ist im Korb!", added: apfel });
  assert.equal(answer(R("add", { product: P("Trauben") })).say, "Die Trauben sind im Korb!");
  assert.equal(answer(R("add", { product: P("Nutella") })).say, "Nutella ist im Korb!", "ohne Artikel");
});

test("Preis: kostet / kosten und ihn / sie / es", () => {
  const cases = [
    [P("Apfel", 50), "Der Apfel kostet 50 Cent. Soll ich ihn in den Korb legen?"],
    [P("Banane", 30), "Die Banane kostet 30 Cent. Soll ich sie in den Korb legen?"],
    [P("Brot", 250), "Das Brot kostet 2 Euro 50. Soll ich es in den Korb legen?"],
    [P("Trauben", 200), "Die Trauben kosten 2 Euro. Soll ich sie in den Korb legen?"],
    [P("Nutella", 300), "Nutella kostet 3 Euro. Soll ich sie in den Korb legen?"],
  ];
  for (const [p, say] of cases) {
    for (const intent of ["price", "product"]) assert.deepEqual(answer(R(intent, { product: p })), { say, offerAdd: p }, `${intent} ${p.name}`);
  }
});

test("Summe: leer, eine Sache, mehrere", () => {
  assert.equal(answer(R("total")).say, "Dein Korb ist noch leer. Was möchtest du kaufen?");
  assert.equal(answer(R("total"), { cartCount: 1, cartTotal: 50 }).say, "Im Korb ist eine Sache. Das macht zusammen 50 Cent.");
  assert.equal(answer(R("total"), { cartCount: 2, cartTotal: 300 }).say, "Im Korb sind 2 Sachen. Das macht zusammen 3 Euro.");
});

test("Kategorie: leer, bis vier Namen, „und noch … andere“, höchstens sechs zum Antippen", () => {
  const cat = { name: "Obst" };
  assert.deepEqual(answer(R("category", { category: cat })), { say: "Bei Obst ist gerade nichts im Regal." });
  const eins = [P("Apfel")];
  assert.deepEqual(answer(R("category", { category: cat }), { categoryProducts: eins }), { say: "Bei Obst gibt es Apfel.", choices: eins });
  const vier = ["Apfel", "Banane", "Birne", "Kiwi"].map((n) => P(n));
  assert.equal(answer(R("category", { category: cat }), { categoryProducts: vier }).say, "Bei Obst gibt es Apfel, Banane, Birne und Kiwi.");
  const acht = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "Ki­wi"].map((n) => P(n));
  const r = answer(R("category", { category: cat }), { categoryProducts: acht });
  assert.equal(r.say, "Bei Obst gibt es A1, A2, A3 und A4 und noch 4 andere Sachen.");
  assert.equal(r.choices.length, 6);
});

test("Thema (z. B. gesund): passt / passt nicht / Liste", () => {
  const gesund = { yes: "gesund", intro: "Gesund sind" };
  const apfel = P("Apfel", 50, "a");
  const trauben = P("Trauben", 200, "t");
  const eis = P("Eis", 100, "e");
  // Produkt passt zum Thema
  assert.deepEqual(answer(R("topic", { product: apfel, topic: gesund, topicList: [apfel, trauben] })), { say: "Ja! Der Apfel ist gesund.", offerAdd: apfel });
  assert.equal(answer(R("topic", { product: trauben, topic: gesund, topicList: [trauben] })).say, "Ja! Die Trauben sind gesund.");
  // ganze Wendung: Verb in die Mehrzahl
  const fruehstueck = { yes: "passt gut zum Frühstück", intro: "Zum Frühstück passen" };
  assert.equal(answer(R("topic", { product: trauben, topic: fruehstueck, topicList: [trauben] })).say, "Ja! Die Trauben passen gut zum Frühstück.");
  assert.equal(answer(R("topic", { product: apfel, topic: fruehstueck, topicList: [apfel] })).say, "Ja! Der Apfel passt gut zum Frühstück.");
  for (const [yes, plural] of [["ist lecker", "sind lecker"], ["macht satt", "machen satt"], ["kann man teilen", "kann man teilen"], ["braucht Kühlung", "braucht Kühlung"]]) {
    assert.equal(answer(R("topic", { product: trauben, topic: { yes, intro: "x" }, topicList: [trauben] })).say, `Ja! Die Trauben ${plural}.`);
  }
  // passt nicht: Vorschläge
  const nein = answer(R("topic", { product: eis, topic: gesund, topicList: [apfel, trauben, P("Kiwi", 40, "k"), P("Birne", 60, "b")] }));
  assert.equal(nein.say, "Hmm, eher nicht. Gesund sind Apfel, Trauben und Kiwi.");
  assert.equal(nein.choices.length, 3);
  assert.deepEqual(answer(R("topic", { product: eis, topic: gesund, topicList: [] })), { say: "Hmm, eher nicht.", choices: [] });
  // ohne Produkt: Liste
  const liste = answer(R("topic", { topic: gesund, topicList: [apfel, trauben, eis, P("Kiwi"), P("Birne"), P("Mais"), P("Gurke")] }));
  assert.equal(liste.say, "Gesund sind Apfel, Trauben und Eis.");
  assert.equal(liste.choices.length, 6);
  assert.deepEqual(answer(R("topic", { topic: gesund, topicList: [] })), { say: "Dazu habe ich gerade nichts im Laden.", retry: true });
  // nur eins: Verb in die Einzahl
  assert.equal(answer(R("topic", { topic: gesund, topicList: [apfel] })).say, "Gesund ist Apfel.");
  assert.equal(answer(R("topic", { topic: fruehstueck, topicList: [apfel] })).say, "Zum Frühstück passt Apfel.");
  assert.equal(answer(R("topic", { topic: { intro: "Bei Husten helfen" }, topicList: [apfel] })).say, "Bei Husten hilft Apfel.");
  assert.equal(answer(R("topic", { topic: { intro: "Gelb sind" }, topicList: [apfel, eis] })).say, "Gelb sind Apfel und Eis.");
});

test("Gruß, Dank, Rückfrage, nicht verstanden, nichts gehört", () => {
  assert.deepEqual(answer(R("hello")), { say: "Hallo! Schön, dass du da bist. Was möchtest du kaufen?" });
  assert.deepEqual(answer(R("thanks")), { say: "Gern geschehen! Bis bald in Schafland!" });
  const kiwi = P("Ki­wi");
  assert.deepEqual(answer(R("unknown", { candidates: [kiwi] })), { say: "Meinst du Kiwi?", choices: [kiwi], retry: true });
  const zwei = [kiwi, P("Kirsche")];
  assert.deepEqual(answer(R("unknown", { candidates: zwei })), { say: "Meinst du eins von diesen?", choices: zwei, retry: true });
  assert.deepEqual(answer(R("unknown")), { say: "Das habe ich nicht verstanden. Sag es bitte nochmal!", retry: true });
  assert.deepEqual(answer(R("unknown", { text: "" })), { say: "Ich habe nichts gehört. Sag es bitte nochmal!", retry: true });
});
