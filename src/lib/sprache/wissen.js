// Wissen über das Sortiment für typische Kinderfragen („Was ist gesund?“, „Welches Obst ist gelb?“).
// Feste Antworten statt Raten: Das funktioniert ohne Sprachmodell und ist immer richtig.
// Das Sprachmodell (Stufe 2) bekommt dieselben Listen als Grundlage.
import { normalize } from "./verstehen.js";
import { glutenOf } from "../gluten.js";
import { allProducts } from "../catalog.js";

// trigger: Wortanfänge (normalisiert), mit $ am Ende nur das ganze Wort („weiß“, nicht „weißt“); products: Namen aus dem Sortiment (ohne weiche Trennzeichen)
// yes: so wird „Ist X …?“ bejaht; intro: Satzanfang der Antwort
export const THEMEN = [
  { id: "gesund", trigger: ["gesund", "vitamin"], intro: "Gesund sind Obst und Gemüse, zum Beispiel", yes: "gesund", products: ["Apfel", "Banane", "Karotte", "Brokkoli", "Kiwi", "Gurke", "Paprika", "Tomate", "Birne", "Orange", "Salat", "Wasser", "Milch"] },
  { id: "fruehstueck", trigger: ["frühstück"], intro: "Zum Frühstück passen", yes: "passt gut zum Frühstück", products: ["Brötchen", "Butter", "Honig", "Milch", "Eier", "Kakao", "Joghurt", "Croissant", "Brot", "Saft", "Tee"] },
  { id: "durst", trigger: ["durst", "trinken"], intro: "Gegen Durst helfen", yes: "ist gut gegen Durst", products: ["Wasser", "Saft", "Tee", "Milch", "Limo", "Kakao"] },
  { id: "hunger", trigger: ["hunger", "hungrig", "satt"], intro: "Satt machen zum Beispiel", yes: "macht satt", products: ["Brot", "Brötchen", "Banane", "Kartoffeln", "Käse", "Apfel", "Brezel"] },
  { id: "suess", trigger: ["süß", "naschen", "nasch", "schleck"], intro: "Süß sind", yes: "süß", products: ["Schokolade", "Bonbons", "Lolli", "Donut", "Muffin", "Eis", "Honig", "Keks", "Kuchen", "Waffel"] },
  { id: "sauer", trigger: ["sauer"], intro: "Sauer sind", yes: "sauer", products: ["Zitrone", "Kiwi"] },
  { id: "kalt", trigger: ["kalt", "abkühlen", "heiß$", "heiss$", "sommer"], intro: "Zum Abkühlen gibt es", yes: "ist schön kalt", products: ["Eis", "Wasser", "Limo", "Melone", "Saft"] },
  { id: "backen", trigger: ["backen"], intro: "Zum Backen brauchst du", yes: "braucht man zum Backen", products: ["Eier", "Butter", "Milch", "Schokolade", "Honig"] },
  { id: "party", trigger: ["party", "geburtstag", "feier", "fest$", "festes$"], intro: "Für eine Party passen", yes: "passt gut zur Party", products: ["Kuchen", "Muffin", "Limo", "Popcorn", "Bonbons", "Donut", "Saft"] },
  { id: "picknick", trigger: ["picknick", "ausflug"], intro: "Für ein Picknick passen", yes: "passt gut zum Picknick", products: ["Brot", "Apfel", "Saft", "Wasser", "Keks", "Brezel", "Käse", "Banane"] },
  { id: "mittag", trigger: ["mittag", "kochen", "suppe"], intro: "Zum Kochen gibt es", yes: "kann man kochen", products: ["Kartoffeln", "Karotte", "Brokkoli", "Tomate", "Zwiebel", "Pilze", "Paprika", "Mais"] },
  { id: "abend", trigger: ["abendbrot", "abendessen", "abends"], intro: "Zum Abendbrot passen", yes: "passt gut zum Abendbrot", products: ["Brot", "Butter", "Käse", "Gurke", "Tomate", "Tee"] },
  { id: "spielen", trigger: ["geschenk", "spielen", "spielsachen"], intro: "Zum Spielen gibt es", yes: "ist toll zum Spielen", products: ["Kuschelschaf", "Schaf-Puzzle", "Hot-Wheels-Rennwagen", "Minecraft-Schwert", "Schaf-Bilderbuch", "Wollknäuel"] },
  // Farben
  { id: "gelb", trigger: ["gelb"], intro: "Gelb sind", yes: "gelb", products: ["Banane", "Zitrone", "Ananas", "Mais", "Käse", "Butter"] },
  { id: "rot", trigger: ["rot"], intro: "Rot sind", yes: "rot", products: ["Apfel", "Erdbeeren", "Kirschen", "Tomate"] },
  { id: "gruen", trigger: ["grün"], intro: "Grün sind", yes: "grün", products: ["Birne", "Kiwi", "Gurke", "Brokkoli", "Salat", "Paprika"] },
  { id: "braun", trigger: ["braun"], intro: "Braun sind", yes: "braun", products: ["Kartoffeln", "Brot", "Kakao", "Schokolade", "Kokosnuss", "Brezel", "Keks"] },
  { id: "lila", trigger: ["lila$", "violett"], intro: "Lila sind", yes: "lila", products: ["Trauben", "Aubergine"] },
  { id: "weiss", trigger: ["weiß$", "weiss$", "weiße", "weisse"], intro: "Weiß sind", yes: "weiß", products: ["Milch", "Eier", "Zwiebel", "Knoblauch", "Joghurt"] },
  // Gluten: aus den Angaben der Produkte (auch gescannte), nicht aus festen Listen.
  // „glutenfrei“ vor „gluten“, damit „ohne Gluten“ nicht beim Gluten-Thema landet.
  {
    id: "glutenfrei", trigger: ["glutenfrei", "ohne gluten", "zöliakie"], intro: "Ohne Gluten sind zum Beispiel", yes: "glutenfrei",
    match: (p) => glutenOf(p) === "frei", known: (p) => glutenOf(p) !== null, ohneSiegel: (p) => glutenOf(p) === "ohne",
    knowledge: "Glutenfrei sind Obst, Gemüse, Milch, Käse, Eier, Getränke und Süßes ohne Mehl",
  },
  {
    id: "gluten", trigger: ["gluten$", "weizen", "mehl$"], intro: "Gluten steckt zum Beispiel in", yes: "enthält Gluten",
    match: (p) => ["enthalten", "wahrscheinlich", "spuren"].includes(glutenOf(p)), known: (p) => glutenOf(p) !== null, ohneSiegel: (p) => glutenOf(p) === "ohne",
  },
];
// Namenslisten der berechneten Themen (für Tests und das Sprachmodell)
for (const t of THEMEN) if (t.match && !t.products) t.products = allProducts.filter(t.match).map((p) => (p.name ?? "").replace(/\u00ad/g, ""));

const clean = (n) => (n ?? "").replace(/­/g, "");

/** Welches Thema spricht der Satz an? (erstes passendes) */
export function topicOf(text) {
  const words = normalize(text).split(" ");
  const padded = ` ${words.join(" ")} `;
  // mehrere Wörter: als ganze Wortfolge; $ am Ende: ganzes Wort; sonst Wortanfang
  const hit = (tr) => (tr.includes(" ") ? padded.includes(` ${tr} `) : words.some((w) => (tr.endsWith("$") ? w === tr.slice(0, -1) : w.startsWith(tr))));
  return THEMEN.find((t) => t.trigger.some(hit)) ?? null;
}

/** Produkte eines Themas aus dem Sortiment, optional nur aus einer Kategorie. */
export function topicProducts(topic, products, categoryId = null) {
  const inCategory = (p) => p && (!categoryId || p.categoryId === categoryId);
  // berechnete Themen: aus dem tatsächlichen Sortiment (auch gescannte Produkte)
  if (topic.match) return products.filter((p) => inCategory(p) && topic.match(p));
  const byName = new Map(products.map((p) => [clean(p.name), p]));
  return topic.products.map((n) => byName.get(n)).filter(inCategory);
}

/** Für das Sprachmodell: eine Zeile pro Thema. */
export function knowledgeLines() {
  return THEMEN.map((t) => t.knowledge ?? `${t.intro}: ${t.products.join(", ")}`).join("\n");
}
