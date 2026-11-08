// Bausteine der Spracherkennung (src/lib/sprache/verstehen.js) mit genauen Werten.
// Gefunden beim Mutationstesten: Ohne diese Tests durfte die Kölner Phonetik fast beliebig falsch
// rechnen (z. B. „Christ“ → 478 statt 4782), weil nur ganze Sätze geprüft wurden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { koelner, normalize, distance, similarity, keysFor, understand } from "../../src/lib/sprache/verstehen.js";
import { products, categories } from "../../src/lib/catalog.js";
import { aktionen } from "../../src/lib/aktionen.js";

const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg ?? ""} ${actual} ≠ ${expected}`);

test("Kölner Phonetik: Referenzwerte (Wikipedia und Postel 1969)", () => {
  const ref = {
    "Müller-Lüdenscheidt": "65752682",
    Wikipedia: "3412",
    Breschnew: "17863",
    Xaver: "4837", // x am Anfang: 48
    Axel: "0485", // Vokal am Anfang bleibt
    Christ: "4782", // t am Wortende: 2 (nicht 8)
    Chemie: "46", // Ch am Anfang vor e: 4
    Cäsar: "487",
    Deutsch: "28",
    Haus: "08",
    Matze: "68",
    Philipp: "351", // ph: 3
    Sachse: "848", // chs: 4 8
    Hexe: "048",
    Kick: "44",
    Lux: "548", // x nach u: 48
    Fuchs: "348", // chs
    Dachs: "248",
    Max: "648",
    Hacke: "04", // ck
    Rezept: "7812",
    Vace: "38", // c am Ende: 8
    Brot: "172",
    Bad: "12",
    Mitte: "62",
    Sachsen: "8486",
    Kiste: "482",
    Lutz: "58",
  };
  for (const [word, code] of Object.entries(ref)) assert.equal(koelner(word), code, word);
  assert.equal(koelner(""), "");
  assert.equal(koelner("123 !"), "");
  assert.equal(koelner("Straße"), koelner("Strase"));
  assert.equal(koelner("Mühle"), koelner("Muhle"));
});

test("Kölner Phonetik: d/t vor c, s, z wird 8, sonst 2; c je nach Nachbarn", () => {
  assert.equal(koelner("ts"), "8");
  assert.equal(koelner("td"), "2");
  assert.equal(koelner("dz"), "8");
  assert.equal(koelner("ca"), "4"); // c am Anfang vor a
  assert.equal(koelner("ce"), "8"); // c am Anfang vor e
  assert.equal(koelner("c"), "8"); // c allein
  assert.equal(koelner("aca"), "04"); // c im Wort vor a
  assert.equal(koelner("ace"), "08"); // c im Wort vor e
  assert.equal(koelner("asca"), "08"); // c nach s
  assert.equal(koelner("ax"), "048");
  assert.equal(koelner("akx"), "048"); // x nach k: nur 8
  assert.equal(koelner("ph"), "3");
  assert.equal(koelner("pa"), "1");
  assert.equal(koelner("b"), "1");
  assert.equal(koelner("w"), "3");
  assert.equal(koelner("q"), "4");
  assert.equal(koelner("l"), "5");
  assert.equal(koelner("mn"), "6");
  assert.equal(koelner("r"), "7");
  assert.equal(koelner("ahs"), "08"); // h zählt nicht
});

test("Normalisieren: Kleinbuchstaben, ß, Bindestriche, Satzzeichen, Leerzeichen", () => {
  assert.equal(normalize("  Die  STRASSE!!  "), "die strasse");
  assert.equal(normalize("Straße"), "strasse");
  assert.equal(normalize("Müller-Lüdenscheidt/Ost_1"), "müller lüdenscheidt ost 1");
  assert.equal(normalize("Kaiser­brötchen"), "kaiserbrötchen");
  assert.equal(normalize("a,b.c?d"), "a b c d");
  assert.equal(normalize("a\t\nb"), "a b");
  assert.equal(normalize(null), "");
  assert.equal(normalize(undefined), "");
});

test("Abstand (Levenshtein)", () => {
  assert.equal(distance("kitten", "sitting"), 3);
  assert.equal(distance("", "abc"), 3);
  assert.equal(distance("abc", ""), 3);
  assert.equal(distance("abc", "abc"), 0);
  assert.equal(distance("a", "b"), 1);
  assert.equal(distance("ab", "ba"), 2);
  assert.equal(distance("banane", "nane"), 2);
  assert.equal(distance("nane", "banane"), 2);
});

test("Ähnlichkeit: genaue Stufen", () => {
  assert.equal(similarity("banane", "banane"), 1);
  assert.equal(similarity("", "banane"), 0);
  assert.equal(similarity("banane", ""), 0);
  assert.equal(similarity("monster truck", "monstertruck"), 0.98);
  // Plural/Singular
  assert.equal(similarity("kirsche", "kirschen"), 0.9);
  assert.equal(similarity("tomaten", "tomate"), 0.9);
  // Anfang verschluckt: 0,62 + 0,3 · Anteil
  near(similarity("nane", "banane"), 0.62 + 0.3 * (4 / 6), "nane");
  // gleicher Klang (ab drei Lauten): 0,55 + 0,4 · Buchstaben-Ähnlichkeit
  near(similarity("schoklade", "schokolade"), 0.55 + 0.4 * 0.9, "schoklade");
  near(similarity("apfl", "apfel"), 0.55 + 0.4 * 0.8, "apfl");
  // „Marne“ klingt wie „Möhren“, reicht aber allein nicht für einen sicheren Treffer
  near(similarity("marne", "möhren"), 0.55 + 0.4 * (1 - 4 / 6), "marne");
  assert.ok(similarity("marne", "möhren") < 0.7);
  // kurzer Klangcode: gleicher Klang nur 0,62
  assert.equal(similarity("katze", "käse"), 0.62);
  // zu kurz für Plural- und Klangregeln
  assert.equal(similarity("ei", "eier"), 0.5);
  // nur Buchstaben-Ähnlichkeit
  near(similarity("kartofel", "kartoffeln"), 0.8, "kartofel");
  near(similarity("melone", "zitrone"), 1 - 4 / 7, "melone");
});

test("Suchschlüssel: Name, letzter Namensteil, Synonyme", () => {
  const byName = (n) => products.find((p) => p.name.replace(/­/g, "") === n);
  assert.deepEqual(keysFor({ name: "Banane" }), ["banane"]);
  assert.deepEqual(keysFor({ name: "Minecraft-Schwert" }), ["minecraft schwert", "schwert"]);
  // lange gescannte Namen: kein letzter Teil (sonst würde „milch“ alles Mögliche treffen)
  assert.deepEqual(keysFor({ name: "Bio Weide Milch frisch 3,8" }), ["bio weide milch frisch 3 8"]);
  assert.deepEqual(keysFor({ name: "X" }), [], "zu kurze Schlüssel fallen weg");
  assert.deepEqual(keysFor({ name: "Kaiser­brötchen" }), ["kaiserbrötchen"]);
  const synonyme = {
    Apfel: ["äpfel", "äpfeln"],
    Karotte: ["möhre", "mohrrübe", "rüben"],
    Trauben: ["weintrauben", "traube"],
    Orange: ["apfelsine"],
    Melone: ["wassermelone"],
    Kartoffeln: ["erdapfel"],
    Brokkoli: ["broccoli"],
    Eier: ["ei"],
    Eis: ["eiscreme", "speiseeis"],
    Brötchen: ["semmel", "schrippe", "weckle"],
    Brezel: ["breze", "brezn"],
    Pfannkuchen: ["eierkuchen", "crepe"],
    Schokolade: ["schoki", "schoko"],
    Lolli: ["lutscher", "lollipop"],
    Bonbons: ["bonbon", "zuckerl"],
    Keks: ["plätzchen", "cookie"],
    Limo: ["limonade", "brause"],
    Saft: ["apfelsaft"],
    Kakao: ["schokomilch"],
    Wasser: ["sprudel", "mineralwasser"],
    Kuschelschaf: ["schaf", "schäfchen"],
    Wollknäuel: ["wolle"],
    "Minecraft-Spitzhacke": ["spitzhacke", "hacke"],
    "Minecraft-Grasblock": ["grasblock", "block"],
    "Hot-Wheels-Rennwagen": ["rennauto", "auto"],
    "Hot-Wheels-Polizeiauto": ["polizei"],
    "Hot-Wheels-Rennbahn": ["autobahn"],
    "Hot-Wheels-Monstertruck": ["monster truck", "truck"],
  };
  for (const [name, words] of Object.entries(synonyme)) {
    const p = byName(name);
    assert.ok(p, `${name} im Katalog`);
    for (const w of words) assert.ok(keysFor(p).includes(w), `${name}: ${w}`);
  }
});

test("Synonyme werden im Satz erkannt", () => {
  const hear = (t) => understand(t, { products, categories }).product?.name.replace(/­/g, "");
  assert.equal(hear("Ich möchte eine Semmel"), "Brötchen");
  assert.equal(hear("Was kostet die Apfelsine?"), "Orange");
  assert.equal(hear("Ich nehme Plätzchen"), "Keks");
  assert.equal(hear("Ich will eine Mohrrübe"), "Karotte");
  const bau = aktionen.find((a) => a.id === "baustelle").products;
  const hearBau = (t) => understand(t, { products: bau, categories }).product?.name.replace(/\u00ad/g, "");
  assert.equal(hearBau("Was kostet der Stampfer?"), "Rüttelhüpfer");
  assert.equal(hearBau("Ich möchte den Vibrationsstampfer"), "Rüttelhüpfer");
  assert.equal(hearBau("Was kostet die Rüttelplatte?"), "Rüttelhüpfer");
  assert.equal(hearBau("Ich will einen Trecker"), "Traktor");
  assert.equal(hearBau("Was kostet eine Reparatur?"), "Reparatur");
  assert.equal(hearBau("Kannst du das reparieren?"), "Reparatur");
});

// ---------- Entscheidungsregeln mit kleinen, gezielt gebauten Sortimenten ----------
const P = (id, name) => ({ id, name });

test("Zwei gleich gute Treffer: Auswahl statt Raten", () => {
  const r = understand("tomate", { products: [P("t1", "Tomaten"), P("t2", "Tomatex"), P("z", "Zzzzzz")] });
  assert.equal(r.product, null);
  assert.deepEqual(r.candidates.map((p) => p.id), ["t1", "t2"]);
  // deutlich besser als der zweite: sicher
  const sicher = understand("tomate", { products: [P("x", "Tomatensaft"), P("t1", "Tomaten")] });
  assert.equal(sicher.product.id, "t1");
});

test("Kandidaten ab Ähnlichkeit 0,5, höchstens drei, beste zuerst", () => {
  const r = understand("ab", { products: [P("z", "Zzzzzz"), P("a", "Abcd")] });
  assert.deepEqual(r.candidates.map((p) => p.id), ["a"], "0,5 reicht, „Zzzzzz“ nicht");
  assert.equal(r.product, null, "0,5 ist zu unsicher");
  const viele = understand("tomate", { products: ["Tomaten", "Tomatex", "Tomatey", "Tomatez"].map((n, i) => P(String(i), n)) });
  assert.equal(viele.candidates.length, 3);
});

test("Eltern-Aussprachen: ganzer Satz oder Wortgruppe, nur für das hinterlegte Produkt", () => {
  const products = [P("a", "Apfel"), P("b", "Banane")];
  const r = understand("bambam bitte", { products, aliases: [{ heard: "Bambam", productId: "b" }] });
  assert.equal(r.product.id, "b");
  // Aussprache aus lauter Füllwörtern: zählt nur, wenn der ganze Satz passt
  const ganz = understand("ich will", { products, aliases: [{ heard: "Ich will", productId: "b" }] });
  assert.equal(ganz.product?.id, "b");
  assert.equal(understand("apfel", { products, aliases: [{ heard: "bambam", productId: "b" }] }).product.id, "a");
});

test("„Schaf“ allein ist das Kuschelschaf, aber nicht in Gruß oder Dank", () => {
  const products = [P("s", "Kuschelschaf"), P("a", "Apfel")];
  assert.equal(understand("Schaf", { products }).product?.id, "s");
  assert.equal(understand("Hallo Schaf", { products }).intent, "hello");
  assert.equal(understand("Hallo Schaf", { products }).product, null);
  assert.equal(understand("Danke Schaf", { products }).intent, "thanks");
  assert.equal(understand("Schaf, ich möchte einen Apfel", { products }).product.id, "a");
});

test("Absichten: Reihenfolge und Kategorie mit gleichem Namen wie ein Produkt", () => {
  const products = [P("m", "Milch"), P("a", "Apfel")];
  const categories = [{ id: "milch", name: "Milch" }, { id: "obst", name: "Obst" }];
  const opts = { products, categories };
  assert.equal(understand("Milch", opts).intent, "product");
  assert.equal(understand("Was kostet die Milch", opts).intent, "price");
  assert.equal(understand("Gibt es Milch", opts).intent, "price");
  assert.equal(understand("Ich möchte Milch", opts).intent, "add");
  assert.equal(understand("Was gibt es bei Obst", opts).intent, "category");
  assert.equal(understand("Was gibt es bei Obst", opts).category.id, "obst");
  assert.equal(understand("Wie viel muss ich bezahlen", opts).intent, "total");
  assert.equal(understand("", opts).intent, "unknown");
  assert.equal(understand("Untertitel von Amara", opts).text, "", "Whisper-Halluzination");
});

test("Kategorie: genau, ungenau mit Hinweiswort, kurze Wörter zählen nicht", () => {
  const categories = [{ id: "obst", name: "Obst" }, { id: "eis", name: "Eis" }];
  const opts = { products: [P("a", "Apfel")], categories };
  assert.equal(understand("Obst", opts).category?.id, "obst");
  assert.equal(understand("bei Oost", opts).category?.id, "obst", "ungenau, aber mit „bei“");
  assert.equal(understand("Oost", opts).category, null, "ungenau ohne Hinweiswort: zu unsicher");
  assert.equal(understand("bei eis", opts).category?.id, "eis", "genaues kurzes Wort zählt");
  assert.equal(understand("bei ei", opts).category, null, "„ei“ ist zu kurz für ungefähr");
});
