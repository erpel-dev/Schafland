// „Frag das Schaf“, Stufe 2: freie Fragen mit einem kleinen Sprachmodell (LFM), das auf dem Gerät läuft.
// Einfache Fragen (Preis, „ich möchte …“, Summe, Kategorie) beantwortet weiter Stufe 1 — schnell und
// sicher. Das Modell bekommt nur offene Fragen und darf nur über das Sortiment sprechen. Seine Antwort
// wird geprüft: keine Preise (die zeigt die Kasse selbst), nur Produkte aus dem Laden, kurz.
import { normalize, keysFor } from "./verstehen.js";
import { knowledgeLines } from "./wissen.js";

// Wörter, an denen man eine offene Frage erkennt
const OFFEN = [
  "gesund", "gesünder", "lecker", "schmeckt", "schmecken", "passt", "passen", "frühstück", "mittagessen", "abendessen", "mittag",
  "geburtstag", "party", "picknick", "backen", "kochen", "warum", "wieso", "weshalb", "empfiehl", "empfiehlst", "empfehlen",
  "magst", "lieblings", "kalt", "warm", "süß", "sauer", "farbe", "gelb", "rot", "grün", "blau", "orange farbe", "woher", "wächst",
  "vitamine", "zucker", "teuerste", "billigste", "günstig", "günstigste", "durst", "hunger", "hungrig", "geschenk", "spielen",
  "was soll ich", "was kann ich", "was gibt es zu", "brauche", "brauch", "tipp", "idee",
];

/** Soll die Frage an das Sprachmodell gehen? */
export function isOpenQuestion(result) {
  if (["add", "total", "hello", "thanks", "topic"].includes(result.intent)) return false;
  const text = " " + result.text + " ";
  // auch „Welches Obst ist gelb?“ (sonst zählt Stufe 1 nur das Obst auf)
  if (OFFEN.some((w) => text.includes(" " + w + " ") || text.includes(" " + w))) return true;
  if (result.intent === "category") return false;
  // Unverstandenes mit mehreren Wörtern: vielleicht eine Frage, die Stufe 1 nicht kennt
  return result.intent === "unknown" && result.text.split(" ").length >= 3;
}

const clean = (name) => (name ?? "").replace(/­/g, "");

/** Chat-Nachrichten für das Modell: Rolle, Regeln, Sortiment, Frage. */
export function buildMessages(question, { products, categories = [], cart = [] }) {
  const byCat = new Map();
  for (const p of products) {
    const cat = categories.find((c) => c.id === p.categoryId)?.name ?? "Sonstiges";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(clean(p.name));
  }
  const sortiment = [...byCat].map(([cat, names]) => `${cat}: ${names.join(", ")}`).join("\n");
  const korb = cart.length ? `Im Korb liegt schon: ${cart.map((l) => `${l.qty}× ${clean(l.product.name)}`).join(", ")}.` : "Der Korb ist leer.";
  return [
    {
      role: "system",
      content:
        "Du bist das freundliche Schaf im Kinder-Kaufladen „Schafland“. Ein Kind im Kindergartenalter fragt dich etwas.\n" +
        "Regeln:\n" +
        "- Antworte auf Deutsch, in höchstens zwei kurzen, einfachen Sätzen.\n" +
        "- Empfiehl nur Produkte aus dem Sortiment unten, mit genau diesem Namen. Erfinde nichts dazu.\n" +
        "- Nenne keine Preise und keine Zahlen.\n" +
        "- Ist die Frage nicht zum Einkaufen, antworte kurz und lieb und frag, was das Kind kaufen möchte.\n\n" +
        `Sortiment:\n${sortiment}\n\nWissen über das Sortiment:\n${knowledgeLines()}\n\n${korb}`,
    },
    { role: "user", content: question },
  ];
}

/** Produkte, die in einem Text vorkommen (ganze Wörter, auch Synonyme), in Reihenfolge des Vorkommens. */
export function mentionedProducts(text, products) {
  const t = " " + normalize(text) + " ";
  const hits = [];
  for (const p of products) {
    let at = -1;
    for (const key of keysFor(p)) {
      if (key.length < 3) continue;
      const i = t.search(new RegExp(`[ ]${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(n|e|en|s)?[ ]`));
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at >= 0) hits.push({ p, at });
  }
  hits.sort((a, b) => a.at - b.at);
  // Doppelte (z. B. „Brötchen“ und „Kaiserbrötchen“ an derselben Stelle) nur einmal
  const seen = new Set();
  return hits.filter(({ p }) => !seen.has(p.id) && seen.add(p.id)).map(({ p }) => p);
}

/**
 * Prüft und kürzt die Antwort des Modells.
 * Ergebnis: { text, products } oder null, wenn nichts Brauchbares übrig bleibt.
 */
export function checkAnswer(raw, { products }) {
  let text = (raw ?? "")
    .replace(/<\|[^|]*\|>/g, " ") // Steuerzeichen des Modells
    .replace(/[*_#`>]+/g, " ") // Markdown
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  // Sätze mit Zahlen, Preisen oder Links fliegen raus: Preise nennt die Kasse selbst
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const kept = sentences
    .map((s) => s.trim())
    .filter((s) => s && !/\d|euro|cent|€|http|www\./i.test(s));
  text = kept.slice(0, 2).join(" ").trim();
  if (text.length > 220) text = text.slice(0, 220).replace(/\s+\S*$/, "") + " …";
  if (text.length < 3) return null;
  return { text, products: mentionedProducts(text, products).slice(0, 4) };
}
