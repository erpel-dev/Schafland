import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenQuestion, buildMessages, mentionedProducts, checkAnswer } from "../../src/lib/sprache/ki.js";
import { understand } from "../../src/lib/sprache/verstehen.js";
import { products, categories } from "../../src/lib/catalog.js";

const hear = (t) => understand(t, { products, categories });
const names = (ps) => ps.map((p) => p.name.replace(/­/g, ""));

test("Offene Fragen gehen ans Sprachmodell, einfache nicht", () => {
  for (const q of ["Was ist gesund?", "Was passt zum Frühstück?", "Ist die Banane gesund?", "Was soll ich für eine Party kaufen?", "Welches Obst ist gelb?", "Ich habe Durst"]) {
    assert.ok(isOpenQuestion(hear(q)), q);
  }
  for (const q of ["Was kostet die Banane?", "Ich möchte ein Eis", "Wie viel muss ich bezahlen?", "Was gibt es bei Obst?", "Hallo", "Banane"]) {
    assert.ok(!isOpenQuestion(hear(q)), q);
  }
});

test("Prompt enthält Sortiment und Regeln, keine Preise", () => {
  const m = buildMessages("Was ist gesund?", { products, categories, cart: [{ product: products[1], qty: 2 }] });
  assert.equal(m.length, 2);
  assert.match(m[0].content, /Obst: Apfel, Banane, Birne/);
  assert.match(m[0].content, /Kaiserbrötchen/); // ohne weiches Trennzeichen
  assert.match(m[1].content, /^\(Im Korb liegt schon: 2× Banane\.\) Was ist gesund\?$/);
  assert.doesNotMatch(m[0].content, /\d+,\d\d|€/);

});

test("Erwähnte Produkte finden", () => {
  assert.deepEqual(names(mentionedProducts("Äpfel und Bananen sind gesund, Karotten auch!", products)), ["Apfel", "Banane", "Karotte"]);
  assert.deepEqual(names(mentionedProducts("Zum Frühstück passen Brötchen mit Honig.", products)), ["Brötchen", "Honig"]);
  assert.deepEqual(names(mentionedProducts("Nimm doch ein Kaiserbrötchen.", products)), ["Kaiserbrötchen"]);
  assert.deepEqual(mentionedProducts("Ich bin ein Schaf und mag Gras.", products).length, 1); // „Schaf“ = Kuschelschaf
});

test("Antwort prüfen: keine Preise, kurz, nur echte Produkte", () => {
  const r = checkAnswer("Äpfel und Bananen sind gesund! Eine Banane kostet nur 30 Cent. Und **Karotten** sind auch toll. Noch ein Satz.", { products });
  assert.equal(r.text, "Äpfel und Bananen sind gesund! Und Karotten sind auch toll.");
  assert.deepEqual(names(r.products), ["Apfel", "Banane", "Karotte"]);
  assert.equal(checkAnswer("Das kostet 2,50 €.", { products }), null);
  assert.equal(checkAnswer("", { products }), null);
  const long = checkAnswer("Wolle ".repeat(80) + ".", { products });
  assert.ok(long.text.length <= 222);
  assert.equal(checkAnswer("<|im_start|>Hallo! Was möchtest du kaufen?<|im_end|>", { products }).text, "Hallo! Was möchtest du kaufen?");
});

import { matchImageAnswer } from "../../src/lib/sprache/ki.js";

test("Bilderkennung: Antworten zu Spielzeug zuordnen", () => {
  const name = (a) => matchImageAnswer(a, products).product?.name.replace(/­/g, "") ?? null;
  assert.equal(name("Banane"), "Banane");
  assert.equal(name("Spielzeugbanane"), "Banane");
  assert.equal(name("Eine Tomate aus Plastik."), "Tomate");
  assert.equal(name("Holzapfel"), "Apfel");
  assert.equal(name("Plastikgurke"), "Gurke");
  assert.equal(name("Erdbeere"), "Erdbeeren");
  assert.equal(name("Möhre"), "Karotte");
  assert.equal(name("Brokkoli aus Filz"), "Brokkoli");
  assert.equal(name("unbekannt"), null);
  assert.equal(name("Ein Ball"), null);
  assert.equal(name(""), null);
});

// ---------- genauer (nach dem Mutationstest) ----------
import { checkAnswer as check2, isOpenQuestion as offen, mentionedProducts as genannt, buildMessages as nachrichten, matchImageAnswer as bild } from "../../src/lib/sprache/ki.js";

const R = (intent, text) => ({ intent, text, product: null, candidates: [] });
const namen = (ps) => ps.map((p) => p.name.replace(/­/g, ""));

test("Offene Frage: feste Absichten nie, Kategorie nur mit offenem Wort, Unbekanntes ab drei Wörtern", () => {
  for (const intent of ["add", "total", "hello", "thanks", "topic"]) assert.equal(offen(R(intent, "ist das gesund")), false, intent);
  assert.equal(offen(R("category", "welches obst ist gelb")), true);
  assert.equal(offen(R("category", "was gibt es bei obst")), false);
  assert.equal(offen(R("price", "ist die banane gesund")), true);
  assert.equal(offen(R("price", "was kostet die banane")), false);
  assert.equal(offen(R("product", "gesunde banane")), true, "Wortanfang genügt");
  assert.equal(offen(R("unknown", "raumschiff mit flügeln")), true);
  assert.equal(offen(R("unknown", "raumschiff fliegt")), false);
  assert.equal(offen(R("product", "raumschiff mit flügeln")), false);
});

test("Sortiment im Prompt: Produkte ohne bekannte Kategorie unter „Sonstiges“", () => {
  const m = nachrichten("Was ist lecker?", { products: [{ id: "x", name: "Nutella", categoryId: "gescannt" }], categories: [] });
  assert.match(m[0].content, /Sonstiges: Nutella/);
  assert.equal(m[1].content, "(Der Korb ist leer.) Was ist lecker?");
});

test("Erwähnte Produkte: Reihenfolge im Text, Mehrzahl, kurze Schlüssel ab drei Buchstaben, keine Doppelten", () => {
  assert.deepEqual(namen(genannt("Bananen und dann ein Apfel", products)), ["Banane", "Apfel"]);
  assert.deepEqual(namen(genannt("Ein Eis bitte", products)), ["Eis"]);
  assert.deepEqual(namen(genannt("Ei", products)), [], "„ei“ ist zu kurz");
  assert.deepEqual(namen(genannt("Banane, Banane, Banane", products)), ["Banane"]);
  assert.deepEqual(namen(genannt("Möhren und Äpfel", products)), ["Karotte", "Apfel"], "Synonyme");
  assert.deepEqual(genannt("Raumschiff", products), []);
});

test("Antwort prüfen: Steuerzeichen, Markdown, zwei Sätze, Länge, Zahlen", () => {
  assert.equal(check2("<|im_end|>**Äpfel** sind _toll_! # Ja", { products }).text, "Äpfel sind toll! Ja");
  assert.equal(check2("Eins. Zwei! Drei? Vier.", { products }).text, "Eins. Zwei!");
  assert.equal(check2("Ohne Punkt am Ende", { products }).text, "Ohne Punkt am Ende");
  assert.equal(check2("Das kostet 2 Euro. Das ist schön.", { products }).text, "Das ist schön.");
  for (const bad of ["Nur 3 Stück.", "Siehe www.x.de.", "Für 1 €.", "Ab", "", null, "<|im_start|>", "   "]) assert.equal(check2(bad, { products }), null, String(bad));
  const genau = "a".repeat(220);
  assert.equal(check2(genau, { products }).text, genau, "220 Zeichen bleiben");
  const lang = ("Wolle " + "x".repeat(10) + " ").repeat(20).trim();
  const r = check2(lang, { products });
  assert.ok(r.text.endsWith(" …") && r.text.length <= 222);
  assert.ok(!/ x* …$/.test(r.text.replace(/x{10} …$/, "")), "am Wortende gekürzt");
  assert.equal(r.text.slice(0, -2), lang.slice(0, 220).replace(/\s+\S*$/, ""));
  assert.equal(check2("Apfel, Banane, Birne, Kiwi und Melone sind Obst.", { products }).products.length, 4);
});

test("Bild-Antworten: unbekannt, genau, mehrere genannt, frei mit Material", () => {
  for (const a of ["", null, "unbekannt", "Ich weiß nicht.", "Keins davon", "kein Produkt", "Kann ich nicht erkennen", "Plastik", "aus Holz"]) {
    assert.deepEqual(bild(a, products), { product: null, candidates: [] }, String(a));
  }
  assert.deepEqual(namen([bild("kaiserbrötchen", products).product]), ["Kaiserbrötchen"]);
  const mehrere = bild("Eine Banane, ein Apfel, eine Birne und eine Kiwi", products);
  assert.equal(mehrere.product.name, "Banane");
  assert.deepEqual(namen(mehrere.candidates), ["Apfel", "Birne"]);
  assert.equal(bild("Bananne aus Plastik", products).product?.name, "Banane", "frei, ungenau, mit Material");
  const unsicher = bild("Tomate", [{ id: "1", name: "Tomaten" }, { id: "2", name: "Tomatex" }, { id: "3", name: "Tomatey" }, { id: "4", name: "Tomatez" }]);
  assert.equal(unsicher.product, null);
  assert.equal(unsicher.candidates.length, 3);
});
