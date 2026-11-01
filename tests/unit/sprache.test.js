import { test } from "node:test";
import assert from "node:assert/strict";
import { understand, koelner, similarity, normalize } from "../../src/lib/sprache/verstehen.js";
import { answer, sayPrice, genus } from "../../src/lib/sprache/antworten.js";
import { products, categories } from "../../src/lib/catalog.js";
import { aktionen } from "../../src/lib/aktionen.js";

const ctx = { products, categories };
const hear = (text, extra = {}) => understand(text, { ...ctx, ...extra });
const name = (r) => r.product?.name.replace(/­/g, "");

test("Kölner Phonetik", () => {
  assert.equal(koelner("Müller"), "657");
  assert.equal(koelner("Meyer"), koelner("Maier"));
  assert.equal(koelner("Schokolade"), koelner("Schokolate"));
});

test("Normalisieren", () => {
  assert.equal(normalize("Was kostet die Banane?"), "was kostet die banane");
  assert.equal(normalize("Kaiser­brötchen!"), "kaiserbrötchen");
  assert.equal(normalize("Hot-Wheels-Rennwagen"), "hot wheels rennwagen");
});

test("Preisfrage mit sauberem Satz", () => {
  const r = hear("Was kostet die Banane?");
  assert.equal(r.intent, "price");
  assert.equal(name(r), "Banane");
});

test("Kinder-Aussprache wird trotzdem verstanden", () => {
  for (const [said, meant] of [
    ["Nane", "Banane"],
    ["was kostet die nane", "Banane"],
    ["Tokolade", "Schokolade"],
    ["Schoki", "Schokolade"],
    ["Ich will ein Eis", "Eis"],
    ["Erbeern", "Erdbeeren"],
    ["Kirsche", "Kirschen"],
    ["Ei", "Eier"],
    ["Möhre", "Karotte"],
    ["Semmel", "Brötchen"],
    ["Laugenbrötchen", "Laugenbrötchen"],
    ["Brezn", "Brezel"],
    ["Ananas", "Ananas"],
    ["Wassermelone", "Melone"],
    ["Polizeiauto", "Hot-Wheels-Polizeiauto"],
    ["Schwert", "Minecraft-Schwert"],
    ["Lutscher", "Lolli"],
  ]) {
    assert.equal(name(hear(said)), meant, `„${said}“ sollte ${meant} sein (verstanden: ${name(hear(said)) ?? "nichts"}, Kandidaten: ${hear(said).candidates.map((p) => p.name).join(", ")})`);
  }
});

test("In den Korb", () => {
  for (const s of ["Ich möchte eine Banane", "Ich nehme Trauben", "Banane in den Korb bitte", "Kann ich einen Apfel haben"]) {
    assert.equal(hear(s).intent, "add", s);
  }
});

test("Gesamtsumme", () => {
  assert.equal(hear("Wie viel muss ich bezahlen?").intent, "total");
  assert.equal(hear("Was kostet alles zusammen").intent, "total");
});

test("Kategorie", () => {
  const r = hear("Was gibt es bei Obst?");
  assert.equal(r.intent, "category");
  assert.equal(r.category.id, "obst");
  // „Milch“ ist ein Produkt und eine Kategorie: das Produkt gewinnt
  assert.equal(name(hear("Was kostet die Milch")), "Milch");
});

test("Unsicher: Auswahl statt Raten", () => {
  const r = hear("Kartoffelbrei mit Ketchup");
  assert.ok(!r.product || r.candidates.length);
  const none = hear("Raumschiff");
  assert.equal(none.product, null);
});

test("Gruß und Dank", () => {
  assert.equal(hear("Hallo Schaf").intent, "hello");
  assert.equal(hear("Danke schön").intent, "thanks");
});

test("Eltern-Aussprachen haben Vorrang", () => {
  const apfel = products.find((p) => p.name === "Apfel");
  const r = hear("Lala", { aliases: [{ heard: "lala", productId: apfel.id }] });
  assert.equal(name(r), "Apfel");
});

test("Aktionsprodukte", () => {
  const halloween = aktionen.find((a) => a.id === "halloween");
  const r = understand("Was kostet der Kürbis", { products: [...products, ...halloween.products], categories });
  assert.equal(name(r), "Kürbis");
});

test("Preise vorlesen", () => {
  assert.equal(sayPrice(30), "30 Cent");
  assert.equal(sayPrice(200), "2 Euro");
  assert.equal(sayPrice(150), "1 Euro 50");
  assert.equal(sayPrice(1205), "12 Euro 5");
});

test("Artikel", () => {
  const g = (n) => genus(products.find((p) => p.name.replace(/­/g, "") === n));
  assert.deepEqual(g("Banane"), { article: "die", plural: false });
  assert.deepEqual(g("Apfel"), { article: "der", plural: false });
  assert.deepEqual(g("Brot"), { article: "das", plural: false });
  assert.deepEqual(g("Trauben"), { article: "die", plural: true });
  assert.deepEqual(g("Kaiserbrötchen"), { article: "das", plural: false });
  // Jedes Produkt im Sortiment hat einen Artikel
  const missing = products.filter((p) => !genus(p).article).map((p) => p.name);
  assert.deepEqual(missing, []);
});

test("Antworten", () => {
  assert.equal(answer(hear("Was kostet die Banane")).say, "Die Banane kostet 30 Cent. Soll ich sie in den Korb legen?");
  assert.equal(answer(hear("Was kostet der Apfel")).say, "Der Apfel kostet 50 Cent. Soll ich ihn in den Korb legen?");
  assert.equal(answer(hear("Was kosten die Trauben")).say, "Die Trauben kosten 2 Euro. Soll ich sie in den Korb legen?");
  assert.equal(answer(hear("Ich möchte ein Brot")).say, "Das Brot ist im Korb!");
  assert.equal(answer(hear("Wie viel muss ich bezahlen"), { cartCount: 3, cartTotal: 120 }).say, "Im Korb sind 3 Sachen. Das macht zusammen 1 Euro 20.");
  assert.equal(answer(hear("Wie viel muss ich bezahlen"), { cartCount: 0 }).say, "Dein Korb ist noch leer. Was möchtest du kaufen?");
  const obst = products.filter((p) => p.categoryId === "obst");
  assert.match(answer(hear("Was gibt es bei Obst"), { categoryProducts: obst }).say, /^Bei Obst gibt es Apfel, Banane, Birne und Trauben und noch 8 andere Sachen\.$/);
  assert.equal(answer(hear("")).say, "Ich habe nichts gehört. Sag es bitte nochmal!");
  assert.ok(answer(hear("Raumschiff")).retry);
  // Untertitel-Sätze, die Whisper bei Stille erfindet, zählen als „nichts gehört“
  assert.equal(answer(hear("Vielen Dank fürs Zuschauen!")).say, "Ich habe nichts gehört. Sag es bitte nochmal!");
});

test("Alltagswörter werden keinem Produkt zugeordnet", () => {
  // auch typische Whisper-Halluzinationen bei Stille („Vielen Dank fürs Zuschauen“)
  for (const w of ["Mama", "Papa", "Hund", "Katze", "ich weiß nicht", "nein", "ja", "okay", "Hase", "Zug", "Kasse", "Euro", "Pizza", "Untertitel der Amara.org-Community", "Vielen Dank fürs Zuschauen"]) {
    const r = hear(w);
    assert.equal(r.product, null, `„${w}“ → ${r.product?.name}`);
  }
});

import { topicOf, topicProducts, THEMEN } from "../../src/lib/sprache/wissen.js";

/** wie in schaf.svelte.js: Thema erkennen und beantworten */
function ask(text) {
  const r = hear(text);
  const topic = topicOf(text);
  if (topic && ["unknown", "product", "category"].includes(r.intent)) {
    Object.assign(r, { intent: "topic", topic, topicList: topicProducts(topic, products, r.category?.id ?? null) });
  }
  return answer(r);
}

test("Wissen: alle Produkte der Themen gibt es im Sortiment", () => {
  const names = new Set(products.map((p) => p.name.replace(/­/g, "")));
  for (const t of THEMEN) for (const n of t.products) assert.ok(names.has(n), `${t.id}: ${n}`);
});

test("Wissen: typische Kinderfragen", () => {
  assert.equal(ask("Was ist gesund?").say, "Gesund sind Obst und Gemüse, zum Beispiel Apfel, Banane und Karotte.");
  assert.equal(ask("Welches Obst ist gelb?").say, "Gelb sind Banane, Zitrone und Ananas.");
  assert.equal(ask("Was ist gelb?").say, "Gelb sind Banane, Zitrone und Ananas.");
  assert.equal(ask("Welches Gemüse ist gelb?").say, "Gelb ist Mais.");
  assert.equal(ask("Was passt zum Frühstück?").say, "Zum Frühstück passen Brötchen, Butter und Honig.");
  assert.equal(ask("Ich habe Durst").say, "Gegen Durst helfen Wasser, Saft und Tee.");
  assert.equal(ask("Ist die Banane gesund?").say, "Ja! Die Banane ist gesund.");
  assert.equal(ask("Sind Erdbeeren rot?").say, "Ja! Die Erdbeeren sind rot.");
  assert.equal(ask("Passt Honig zum Frühstück?").say, "Ja! Der Honig passt gut zum Frühstück.");
  assert.match(ask("Ist die Schokolade gesund?").say, /^Hmm, eher nicht\. Gesund sind Obst und Gemüse, zum Beispiel Apfel, Banane und Karotte\.$/);
  assert.equal(ask("Was kann ich naschen?").choices.length, 6);
  // keine Verwechslung mit „weißt“ oder „heißt“
  assert.equal(topicOf("Weißt du, was eine Banane kostet?"), null);
  assert.equal(topicOf("Wie heißt du?"), null);
  // Preisfrage bleibt Preisfrage, auch mit Farbwort
  assert.match(ask("Was kostet die rote Paprika?").say, /^Die Paprika kostet/);
});

test("Kategorie auch ungenau gehört", () => {
  for (const q of ["Was gibt es bei Oost?", "Was gibt es bei Ozt?", "Welches Gemüüse habt ihr?"]) {
    const r = hear(q);
    assert.equal(r.intent, "category", `${q} → ${r.intent}`);
  }
  // ohne Hinweis wie „bei“ keine wilde Kategorie
  assert.notEqual(hear("Ost").intent, "category");
  assert.notEqual(hear("Was gibt es bei uns?").intent, "category");
});
