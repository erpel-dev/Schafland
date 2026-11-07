// „Frag das Schaf“: aus erkanntem Text herausfinden, was das Kind möchte.
// Bewusst ohne KI-Sprachmodell: Die Spracherkennung liefert Text, hier wird er fehlertolerant mit
// dem Sortiment verglichen. Kinder (und Kinder mit Aussprachestörungen) lassen Silben weg oder
// tauschen Laute („Nane“, „Tokolade“, „Tate“); deshalb zählen Klangähnlichkeit und Wortenden.

/** Kleinbuchstaben, ohne Satzzeichen, weiche Trennzeichen und Bindestriche. */
export function normalize(text) {
  return (text ?? "")
    .toLowerCase()
    .replace(/­/g, "")
    .replace(/ß/g, "ss")
    .replace(/[-_/]/g, " ")
    .replace(/[^a-zäöü0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kölner Phonetik: deutsche Wörter, die gleich klingen, bekommen denselben Code. */
export function koelner(word) {
  const w = word.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "s").replace(/[^a-z]/g, "");
  // Achtung: "abc".includes("") ist immer true. Am Wortanfang/-ende gibt es keinen Nachbarn.
  const among = (letters, ch) => ch !== "" && letters.includes(ch);
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const prev = w[i - 1] ?? "";
    const next = w[i + 1] ?? "";
    let code;
    if ("aeijouy".includes(c)) code = "0";
    else if (c === "h") code = "-";
    else if (c === "b") code = "1";
    else if (c === "p") code = next === "h" ? "3" : "1";
    else if (c === "d" || c === "t") code = among("csz", next) ? "8" : "2";
    else if ("fvw".includes(c)) code = "3";
    else if ("gkq".includes(c)) code = "4";
    else if (c === "c") {
      if (i === 0) code = among("ahkloqrux", next) ? "4" : "8";
      else code = among("sz", prev) || !among("ahkoqux", next) ? "8" : "4";
    } else if (c === "x") code = among("ckq", prev) ? "8" : "48";
    else if (c === "l") code = "5";
    else if (c === "m" || c === "n") code = "6";
    else if (c === "r") code = "7";
    else if (c === "s" || c === "z") code = "8";
    else continue;
    out += code;
  }
  // gleiche Nachbarn zusammenfassen, dann Vokale (außer am Anfang) und h entfernen
  let collapsed = "";
  for (const ch of out) if (ch !== collapsed.at(-1)) collapsed += ch;
  return collapsed.replace(/-/g, "").replace(/(?!^)0/g, "");
}

/** Levenshtein-Abstand (Einfügen, Löschen, Ersetzen). */
export function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const ratio = (a, b) => 1 - distance(a, b) / Math.max(a.length, b.length, 1);

/** Wie gut passt das Gehörte (ein bis drei Wörter) zu einem Schlüsselwort? 0 … 1 */
export function similarity(heard, key) {
  if (!heard || !key) return 0;
  if (heard === key) return 1;
  const h = heard.replace(/ /g, "");
  const k = key.replace(/ /g, "");
  if (h === k) return 0.98;
  let best = ratio(h, k);
  // Plural/Singular („Kirsche“ – „Kirschen“, „Ei“ – „Eier“)
  if (h.length >= 3 && (k.startsWith(h) || h.startsWith(k)) && Math.abs(h.length - k.length) <= 2) best = Math.max(best, 0.9);
  // Anfang verschluckt („Nane“ – „Banane“, „Lade“ – „Schokolade“)
  if (h.length >= 3 && k.length > h.length && k.endsWith(h)) best = Math.max(best, 0.62 + 0.3 * (h.length / k.length));
  const ph = koelner(h);
  const pk = koelner(k);
  // Klangcode: erst ab drei Lauten aussagekräftig („Katze“ und „Käse“ haben beide „48“)
  if (ph && pk && Math.min(ph.length, pk.length) >= 3) {
    // gleicher Klang zählt viel, aber nicht allein („Marne“ und „Möhren“ haben denselben Code)
    if (ph === pk) best = Math.max(best, 0.55 + 0.4 * ratio(h, k));
    else best = Math.max(best, 0.8 * ratio(ph, pk));
  } else if (ph && ph === pk && h.length >= 3) best = Math.max(best, 0.62);
  return best;
}

// Andere Wörter für Produkte im Sortiment (normalisiert)
const SYNONYME = {
  Apfel: ["äpfel", "äpfeln"],
  Karotte: ["möhre", "möhren", "mohrrübe", "mohrrüben", "rübe", "rüben"],
  Trauben: ["weintrauben", "weintraube", "traube"],
  Orange: ["apfelsine", "orangen"],
  Melone: ["wassermelone"],
  Kartoffeln: ["kartoffel", "erdapfel"],
  Brokkoli: ["broccoli"],
  Eier: ["ei"],
  Eis: ["eiscreme", "speiseeis"],
  Brötchen: ["semmel", "semmeln", "schrippe", "weckle", "wecken", "brötchens"],
  Brezel: ["breze", "brezn", "brezeln"],
  Pfannkuchen: ["pfannekuchen", "eierkuchen", "crepe"],
  Schokolade: ["schoki", "schoko"],
  Lolli: ["lutscher", "lolly", "lollipop"],
  Bonbons: ["bonbon", "zuckerl"],
  Keks: ["kekse", "plätzchen", "cookie"],
  Limo: ["limonade", "brause"],
  Saft: ["apfelsaft", "orangensaft"],
  Kakao: ["schokomilch", "kakau"],
  Wasser: ["sprudel", "mineralwasser"],
  Kuschelschaf: ["schaf", "kuscheltier", "schäfchen"],
  Wollknäuel: ["wolle"],
  "Minecraft-Spitzhacke": ["spitzhacke", "hacke"],
  "Minecraft-Grasblock": ["grasblock", "block"],
  "Hot-Wheels-Rennwagen": ["rennauto", "auto", "rennwagen"],
  "Hot-Wheels-Polizeiauto": ["polizeiauto", "polizei"],
  "Hot-Wheels-Rennbahn": ["rennbahn", "autobahn"],
  "Hot-Wheels-Monstertruck": ["monstertruck", "monster truck", "truck"],
};

const cleanName = (name) => (name ?? "").replace(/­/g, "");

/** Suchschlüssel eines Produkts: ganzer Name, letzter Namensteil, Synonyme. */
export function keysFor(product) {
  const name = cleanName(product.name);
  const keys = new Set([normalize(name)]);
  const parts = normalize(name).split(" ");
  // „Minecraft-Schwert“ → „schwert“, aber nicht bei gescannten Produkten mit langen Namen
  if (parts.length > 1 && parts.length <= 3) keys.add(parts.at(-1));
  for (const s of SYNONYME[name] ?? []) keys.add(normalize(s));
  return [...keys].filter((k) => k.length >= 2);
}

// Erkennungswörter für Absichten (normalisiert, als ganze Wörter oder Wortfolgen gesucht)
const ABSICHT = {
  total: ["zusammen", "alles zusammen", "wie viel muss ich", "was muss ich bezahlen", "bezahlen", "im korb", "mein korb", "korb"],
  add: ["möchte", "moechte", "will", "nehme", "nehm", "kaufe", "kaufen", "hätte gern", "hätte gerne", "gib mir", "in den korb", "einpacken", "haben"],
  price: ["kostet", "kosten", "preis", "teuer", "wie viel", "wieviel"],
  have: ["gibt es", "gibts", "habt ihr", "haben sie", "hast du"],
  hello: ["hallo", "guten tag", "guten morgen", "hi", "moin", "servus", "grüß gott"],
  thanks: ["danke", "dankeschön", "tschüss", "tschüs", "auf wiedersehen"],
};

const has = (text, phrase) => (" " + text + " ").includes(" " + phrase + " ");

/**
 * Versteht einen Satz.
 * products: alle wählbaren Produkte; categories: Kategorien { id, name };
 * aliases: [{ heard, productId }] von den Eltern hinterlegte Aussprachen.
 * Ergebnis: { intent, product?, candidates, category?, text }
 *   intent: price | add | total | category | hello | thanks | product | unknown
 */
// Whisper „hört“ bei Stille oder Rauschen gern Sätze aus Videountertiteln
const HALLUZINATION = /untertitel|zuschauen|amara|copyright|abonnier|^musik$|^applaus$|^ähm$|^hm+$/;

export function understand(rawText, { products, categories = [], aliases = [] }) {
  let text = normalize(rawText);
  if (HALLUZINATION.test(text)) text = "";
  const words = text.split(" ").filter(Boolean);
  const result = { text, intent: "unknown", product: null, candidates: [], category: null };
  if (!words.length) return result;

  // Wortgruppen aus 1–3 Wörtern, Füllwörter fallen weg
  const STOP = new Set(["die", "der", "das", "den", "dem", "ein", "eine", "einen", "einem", "ich", "du", "wir", "bitte", "mal", "noch", "und", "auch", "was", "wie", "viel", "kostet", "kosten", "ist", "sind", "es", "gibt", "habt", "ihr", "hast", "möchte", "will", "nehme", "kaufe", "kaufen", "gern", "gerne", "hätte", "gib", "mir", "in", "korb", "von", "für", "zwei", "drei", "eins", "schaf", "liebes", "muss", "alles", "zusammen", "schön", "bei", "uns", "euch", "hier", "heute", "da", "welche", "welches", "habt", "dir", "kann", "darf", "können", "soll"]);
  for (const phrases of Object.values(ABSICHT)) for (const ph of phrases) for (const w of ph.split(" ")) STOP.add(w);
  const content = words.filter((w) => !STOP.has(w));
  const grams = new Set();
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= content.length; i++) grams.add(content.slice(i, i + n).join(" "));
  }
  // „Schaf“ allein ist auch ein Produkt (Kuschelschaf): nur zählen, wenn sonst nichts da ist
  const is = (intent) => ABSICHT[intent].some((p) => has(text, p));
  if (!grams.size && words.includes("schaf") && !is("hello") && !is("thanks")) grams.add("schaf");

  // Von den Eltern hinterlegte Aussprachen zählen sicher
  const aliasHit = aliases.find((a) => grams.has(normalize(a.heard)) || text === normalize(a.heard));
  const scored = [];
  for (const product of products) {
    let score = 0;
    if (aliasHit && aliasHit.productId === product.id) score = 1.01;
    else for (const key of keysFor(product)) for (const g of grams) score = Math.max(score, similarity(g, key));
    if (score >= 0.5) scored.push({ product, score });
  }
  scored.sort((a, b) => b.score - a.score);
  result.candidates = scored.slice(0, 3).map((s) => s.product);
  const [best, second] = scored;
  // sicher: gut genug und deutlich besser als das zweitbeste
  if (best && best.score >= 0.7 && (!second || best.score - second.score >= 0.08 || best.score >= 0.97)) {
    result.product = best.product;
  }

  // Kategorie auch ungenau gehört („Oost“, „Ozt“ für Obst); nach „bei …“ / „welches …“ großzügiger
  const catCue = /\b(bei|welche|welcher|welches|habt|gibt)\b/.test(text);
  let category = null;
  let catScore = 0;
  for (const c of categories) {
    const key = normalize(c.name);
    let sc = grams.has(key) || words.includes(key) ? 1 : 0;
    for (const w of content) if (w.length >= 3) sc = Math.max(sc, similarity(w, key));
    if (sc > catScore) [category, catScore] = [c, sc];
  }
  if (catScore < (catCue ? 0.5 : 0.8)) category = null;

  if (is("total") && !result.product) result.intent = "total";
  else if (result.product && (is("price") || is("have"))) result.intent = "price";
  else if (result.product && is("add")) result.intent = "add";
  else if (result.product) result.intent = "product";
  else if (category && !(result.product && normalize(result.product.name) === normalize(category.name))) {
    result.intent = "category";
    result.category = category;
  } else if (is("hello")) result.intent = "hello";
  else if (is("thanks")) result.intent = "thanks";
  return result;
}
