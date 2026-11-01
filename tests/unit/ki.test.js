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
  assert.match(m[0].content, /Im Korb liegt schon: 2× Banane/);
  assert.doesNotMatch(m[0].content, /\d+,\d\d|€/);
  assert.equal(m[1].content, "Was ist gesund?");
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
