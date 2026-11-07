// „Frag das Schaf“, Stufe 2: freie Fragen mit einem kleinen Sprachmodell (LFM), das auf dem Gerät läuft.
// Einfache Fragen (Preis, „ich möchte …“, Summe, Kategorie) beantwortet weiter Stufe 1 — schnell und
// sicher. Das Modell bekommt nur offene Fragen und darf nur über das Sortiment sprechen. Seine Antwort
// wird geprüft: keine Preise (die zeigt die Kasse selbst), nur Produkte aus dem Laden, kurz.
import { normalize, keysFor, understand } from "./verstehen.js";
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
  // auch „Welches Obst ist gelb?“ (sonst zählt Stufe 1 nur das Obst auf); Wortanfang genügt („gesunde“)
  if (OFFEN.some((w) => text.includes(" " + w))) return true;
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
        `Sortiment:\n${sortiment}\n\nWissen über das Sortiment:\n${knowledgeLines()}`,
    },
    // Der Korb steht bei der Frage: so bleibt der lange Systemteil gleich und das Modell kann ihn
    // einmal vorrechnen und behalten (Präfix-Speicher in lfm3audio.js)
    { role: "user", content: `(${korb}) ${question}` },
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
    .replace(/ ([.,!?])/g, "$1") // „toll !“ nach entferntem Markdown
    .replace(/(https?:\/\/|www\.)\S+/gi, "⟨link⟩") // Links nicht an ihren Punkten zerteilen
    .trim();
  if (!text) return null;
  // Sätze mit Zahlen, Preisen oder Links fliegen raus: Preise nennt die Kasse selbst
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const kept = sentences
    .map((s) => s.trim())
    .filter((s) => s && !/\d|euro|cent|€|⟨link⟩/i.test(s));
  text = kept.slice(0, 2).join(" ").trim();
  if (text.length > 220) text = text.slice(0, 220).replace(/\s+\S*$/, "") + " …";
  if (text.length < 3) return null;
  return { text, products: mentionedProducts(text, products).slice(0, 4) };
}

/** Fragen an LFM3-Omni zu einem Kamerabild. Im Kaufladen ist fast alles Spielzeug (Plastik, Holz, Filz). */
const BILD_SYSTEM =
  "Du bist die Kasse im Kinder-Kaufladen „Schafland“. Auf den Fotos sind meist Spielsachen: Obst, Gemüse und Essen aus Plastik, Holz oder Filz. " +
  "Sag, welches Lebensmittel oder Ding das Spielzeug darstellt.";

/**
 * Erste Frage: Auswahl aus dem Sortiment. Die Liste steht im Systemteil: der ist bei jedem Foto
 * gleich und wird nur einmal gerechnet (Präfix-Speicher), pro Foto bleiben Bild und kurze Frage.
 */
export function productImageQuestion(products) {
  const names = [...new Set(products.map((p) => clean(p.name)))];
  return {
    system: `${BILD_SYSTEM}\nListe der Produkte: ${names.join(", ")}`,
    question: "Welches Produkt aus der Liste ist auf dem Bild zu sehen (auch als Spielzeug)? Antworte nur mit dem Namen aus der Liste. Wenn keins passt, antworte „unbekannt“.",
  };
}

/** Zweite Frage, wenn die Liste nicht half: frei benennen, die Kasse ordnet es selbst zu */
export function productImageFreeQuestion() {
  return {
    system: BILD_SYSTEM,
    question: "Was ist auf dem Bild? Wenn es Spielzeug-Essen ist: welches Essen stellt es dar? Antworte mit einem einzigen deutschen Wort.",
  };
}

// Wörter, die nur sagen, woraus das Spielzeug ist („Spielzeugbanane aus Plastik“ → „banane“)
const MATERIAL = /\b(spielzeug|plastik|kunststoff|holz|filz|stoff|attrappe|deko|modell|aus|eine?r?s?|das|der|die|ist|sieht|wie|bild|foto)\b|spielzeug|plastik|holz/g;

/**
 * Antwort des Modells → { product, candidates }: sicher erkanntes Produkt oder Vorschläge zum Antippen.
 */
export function matchImageAnswer(answer, products) {
  const none = { product: null, candidates: [] };
  if (!answer || /unbekannt|weiß nicht|keins|kein produkt|nicht erkennen/i.test(answer)) return none;
  const exact = products.find((p) => normalize(clean(p.name)) === normalize(answer));
  if (exact) return { product: exact, candidates: [] };
  const named = mentionedProducts(answer, products);
  if (named.length) return { product: named[0], candidates: named.slice(1, 3) };
  const plain = normalize(answer).replace(MATERIAL, " ").replace(/\s+/g, " ").trim();
  if (!plain) return none;
  const r = understand(plain, { products });
  return { product: r.product, candidates: r.product ? [] : r.candidates.slice(0, 3) };
}

/** Kurzform für alte Aufrufer: nur das sichere Produkt */
export function productFromAnswer(answer, products) {
  return matchImageAnswer(answer, products).product;
}
