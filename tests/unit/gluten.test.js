// Gluten-Kennzeichnung (src/lib/gluten.js), Open Food Facts, „Frag das Schaf“.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { glutenOf, glutenRelevant, glutenFromOpenFacts, GLUTEN } from "../../src/lib/gluten.js";
import { products, allProducts } from "../../src/lib/catalog.js";
import { aktionById } from "../../src/lib/aktionen.js";
import { lookupOpenFacts } from "../../src/lib/off.js";
import { topicOf, topicProducts, knowledgeLines } from "../../src/lib/sprache/wissen.js";
import { answer } from "../../src/lib/sprache/antworten.js";

const byName = (n) => allProducts.find((p) => p.name.replace(/­/g, "") === n);
const g = (n) => glutenOf(byName(n));

test("Eigenes Sortiment: Backwaren und Kekse mit Gluten, Obst/Gemüse/Milch/Getränke ohne", () => {
  for (const p of products.filter((p) => p.categoryId === "backwaren")) assert.equal(glutenOf(p), "enthalten", p.name);
  for (const cat of ["obst", "gemuese", "milch", "getraenke"]) for (const p of products.filter((p) => p.categoryId === cat)) assert.equal(glutenOf(p), "frei", p.name);
  assert.equal(g("Keks"), "enthalten");
  assert.equal(g("Donut"), "enthalten");
  for (const n of ["Schokolade", "Bonbons", "Lolli", "Honig", "Popcorn"]) assert.equal(g(n), "frei", n);
});

test("Spielzeug und Deko: keine Angabe; Aktionen nach Rezeptur", () => {
  for (const p of products.filter((p) => p.categoryId === "spielzeug")) {
    assert.equal(glutenOf(p), null, p.name);
    assert.equal(glutenRelevant(p), false, p.name);
  }
  assert.equal(g("Lebkuchen"), "enthalten");
  assert.equal(g("Rentier-Kekse"), "enthalten");
  assert.equal(g("Fledermaus-Kekse"), "enthalten");
  assert.equal(g("Süßes-oder-Saures-Tüte"), "spuren");
  assert.equal(g("Marzipan-Schneemann"), "frei");
  assert.equal(g("Mandarinen"), "frei");
  for (const n of ["Hexenhut", "Grusel-Kerze", "Zauberbesen", "Weihnachtsbaum", "Geschenk", "Glöckchen", "Weihnachtsstern", "Kuschelsocken", "Schlitten"]) {
    assert.equal(g(n), null, n);
    assert.equal(glutenRelevant(byName(n)), false, n);
  }
  assert.ok(aktionById("halloween").products.some((p) => glutenOf(p) === "frei"));
});

test("Gespeicherte Angabe zählt zuerst; ungültige und fehlende Angaben", () => {
  const brot = byName("Brot");
  assert.equal(glutenOf({ ...brot, gluten: "frei" }), "frei", "von den Eltern geändert");
  assert.equal(glutenOf({ ...brot, gluten: null }), null);
  assert.equal(glutenOf({ ...brot, gluten: "quatsch" }), null);
  assert.equal(glutenOf({ name: "Nutella", source: "openfoodfacts.org" }), null, "vor der Gluten-Funktion gescannt");
  assert.equal(glutenOf({ name: "c't", source: "Pressecode", categoryId: "zeitschrift" }), null);
  assert.equal(glutenOf(null), null);
  assert.equal(glutenRelevant({ name: "Nutella", source: "openfoodfacts.org", categoryId: "suesses" }), true);
  assert.equal(glutenRelevant({ name: "Buch", source: "books.google.com", categoryId: "buch" }), false);
  assert.equal(glutenRelevant(byName("Apfel")), true);
  assert.equal(glutenRelevant(null), false);
  assert.deepEqual(Object.keys(GLUTEN), ["enthalten", "spuren", "frei"]);
});

test("Open Food Facts: Allergen vor Siegel vor Spuren; ohne Angaben unbekannt", () => {
  assert.equal(glutenFromOpenFacts({ allergens_tags: ["en:milk", "en:gluten"] }), "enthalten");
  assert.equal(glutenFromOpenFacts({ allergens_tags: ["en:gluten"], labels_tags: ["en:no-gluten"] }), "enthalten");
  assert.equal(glutenFromOpenFacts({ labels_tags: ["en:no-gluten"], traces_tags: ["en:gluten"] }), "frei");
  assert.equal(glutenFromOpenFacts({ labels_tags: ["en:gluten-free"] }), "frei");
  assert.equal(glutenFromOpenFacts({ traces_tags: ["en:nuts", "en:gluten"] }), "spuren");
  assert.equal(glutenFromOpenFacts({ allergens_tags: ["en:milk"] }), null, "andere Allergene sagen nichts über Gluten");
  assert.equal(glutenFromOpenFacts({ allergens_tags: "en:gluten" }), null, "kein Array");
  assert.equal(glutenFromOpenFacts({}), null);
  assert.equal(glutenFromOpenFacts(null), null);
});

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

test("Scan über Open Food Facts speichert die Gluten-Angabe", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ status: 1, product: { product_name: "Zwieback", allergens_tags: ["en:gluten"] } }), { status: 200 });
  };
  const p = await lookupOpenFacts("4000000000017");
  assert.equal(p.gluten, "enthalten");
  assert.match(urls[0], /allergens_tags,traces_tags,labels_tags/);
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 1, product: { product_name: "Saft" } }), { status: 200 });
  assert.equal((await lookupOpenFacts("4000000000024")).gluten, null);
});

test("Frag das Schaf: Themen glutenfrei und Gluten", () => {
  assert.equal(topicOf("Was ist ohne Gluten?").id, "glutenfrei");
  assert.equal(topicOf("Ist die Banane glutenfrei?").id, "glutenfrei");
  assert.equal(topicOf("Ich habe Zöliakie").id, "glutenfrei");
  assert.equal(topicOf("Hat die Brezel Gluten?").id, "gluten");
  assert.equal(topicOf("Wo ist Weizen drin?").id, "gluten");
  assert.equal(topicOf("Was ist aus Mehl?").id, "gluten");
  assert.equal(topicOf("Mehlwurm"), null, "„mehl“ nur als ganzes Wort");
  assert.equal(topicOf("Ohne Zucker"), null);
  // berechnet aus dem Sortiment, auch gescannte Produkte
  const reis = { id: "r", name: "Reiswaffeln", source: "openfoodfacts.org", gluten: "frei" };
  const frei = topicProducts(topicOf("glutenfrei"), [...products, reis]);
  assert.ok(frei.includes(reis) && frei.includes(byName("Apfel")) && !frei.includes(byName("Brot")));
  const mit = topicProducts(topicOf("Gluten"), [...products, byName("Süßes-oder-Saures-Tüte")]);
  assert.ok(mit.includes(byName("Brot")) && mit.includes(byName("Süßes-oder-Saures-Tüte")) && !mit.includes(byName("Apfel")));
  assert.deepEqual(topicProducts(topicOf("Gluten"), products, "obst"), [], "nach Kategorie gefiltert");
  // Sprachmodell: kurze Zeile statt 60 Namen
  const lines = knowledgeLines();
  assert.match(lines, /Glutenfrei sind Obst, Gemüse/);
  assert.match(lines, /Gluten steckt zum Beispiel in: Brot, Brezel/);
});

test("Frag das Schaf: Antworten zu Gluten", () => {
  const R = (product, q) => {
    const topic = topicOf(q);
    return answer({ intent: "topic", product, topic, topicList: topicProducts(topic, allProducts), candidates: [], text: q });
  };
  assert.equal(R(byName("Brezel"), "Hat die Brezel Gluten?").say, "Ja! Die Brezel enthält Gluten.");
  assert.equal(R(byName("Rentier-Kekse"), "Haben die Kekse Gluten?").say, "Ja! Die Rentier-Kekse enthalten Gluten.");
  assert.equal(R(byName("Banane"), "Ist die Banane glutenfrei?").say, "Ja! Die Banane ist glutenfrei.");
  assert.match(R(byName("Brezel"), "Ist die Brezel glutenfrei?").say, /^Hmm, eher nicht\. Ohne Gluten sind zum Beispiel /);
  // keine Angabe: nicht raten
  const nutella = { id: "n", name: "Nutella", source: "openfoodfacts.org", gluten: null };
  assert.deepEqual(R(nutella, "Ist Nutella glutenfrei?"), { say: "Bei Nutella weiß ich das leider nicht. Schau auf die Packung!" });
  assert.equal(R({ ...nutella, name: "Kuchen" }, "Ist der Kuchen glutenfrei?").say, "Bei dem Kuchen weiß ich das leider nicht. Schau auf die Packung!");
  assert.equal(R({ ...nutella, name: "Banane" }, "Ist die Banane glutenfrei?").say, "Bei der Banane weiß ich das leider nicht. Schau auf die Packung!");
  assert.equal(R({ ...nutella, name: "Trauben" }, "Sind die Trauben glutenfrei?").say, "Bei den Trauben weiß ich das leider nicht. Schau auf die Packung!");
  assert.equal(R({ ...nutella, name: "Kekse" }, "Sind die Kekse glutenfrei?").say, "Bei den Keksen weiß ich das leider nicht. Schau auf die Packung!");
});
