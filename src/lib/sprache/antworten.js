// „Frag das Schaf“: Antworten in einfacher Sprache, zum Vorlesen und als Sprechblase.

// Artikel nach dem letzten Namensteil (Grundwort). Plural steht mit „die“ und „kosten“.
const ARTIKEL = {
  der: ["apfel", "pfirsich", "brokkoli", "mais", "salat", "knoblauch", "käse", "joghurt", "muffin", "kuchen", "pfannkuchen", "lolli", "keks", "donut", "honig", "saft", "kakao", "tee", "grasblock", "diamant", "rennwagen", "monstertruck", "kürbis", "hexenhut", "zauberbesen", "lebkuchen", "stern", "schneemann", "nikolaus", "weihnachtsbaum", "baum", "christstollen", "stollen", "punsch", "adventskalender", "kalender", "zuckerstab", "glühwein", "tannenbaum", "schlitten", "spekulatius", "lebkuchenmann", "schokoweihnachtsmann", "weihnachtsmann", "nussknacker", "engel"],
  die: ["banane", "birne", "orange", "melone", "zitrone", "kiwi", "ananas", "karotte", "tomate", "gurke", "paprika", "zwiebel", "aubergine", "milch", "butter", "brezel", "waffel", "schokolade", "limo", "kokosnuss", "spitzhacke", "rennbahn", "kerze", "kürbissuppe", "suppe", "tüte", "mütze", "kugel", "christbaumkugel", "zuckerstange", "stange", "glocke", "laterne", "weihnachtsmütze", "plätzchendose", "dose", "mandarine", "nuss", "walnuss"],
  das: ["eis", "brot", "croissant", "baguette", "brötchen", "popcorn", "wasser", "kuschelschaf", "schaf", "puzzle", "wollknäuel", "bilderbuch", "buch", "schwert", "polizeiauto", "auto", "geschenk", "lebkuchenhaus", "haus", "marzipan"],
};
const PLURAL = ["trauben", "erdbeeren", "kirschen", "kartoffeln", "pilze", "eier", "bonbons", "marshmallows", "kekse", "gummis", "zähne", "nüsse", "plätzchen", "mandeln", "gebrannte mandeln", "socken", "handschuhe"];

const clean = (name) => (name ?? "").replace(/­/g, "");
const grundwort = (name) => {
  const parts = clean(name).toLowerCase().split(/[\s-]+/).filter(Boolean);
  return parts.at(-1) ?? "";
};

/** { article: "die"|"der"|"das"|null, plural } für ein Produkt. */
export function genus(product) {
  const name = clean(product.name).toLowerCase();
  const head = grundwort(product.name);
  if (PLURAL.includes(head) || PLURAL.includes(name)) return { article: "die", plural: true };
  // Zusammengesetzte Wörter: das längste passende Grundwort am Ende („Kaiserbrötchen“ → „brötchen“)
  for (const [article, words] of Object.entries(ARTIKEL)) if (words.includes(head)) return { article, plural: false };
  let best = null;
  for (const [article, words] of Object.entries(ARTIKEL)) {
    for (const w of words) if (head.endsWith(w) && (!best || w.length > best.w.length)) best = { article, w };
  }
  return best ? { article: best.article, plural: false } : { article: null, plural: false };
}

/** Preis zum Vorlesen: „30 Cent“, „2 Euro“, „1 Euro 50“. */
export function sayPrice(cents) {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  if (!euros) return `${rest} Cent`;
  if (!rest) return `${euros} Euro`;
  return `${euros} Euro ${rest}`;
}

/** „Die Banane“ / „Die Trauben“ / „Nutella“ (gescannt, ohne bekannten Artikel) */
function subject(product, { capital = true } = {}) {
  const { article } = genus(product);
  const name = clean(product.name);
  if (!article) return name;
  const a = capital ? article[0].toUpperCase() + article.slice(1) : article;
  return `${a} ${name}`;
}

/** Aufzählung: „Apfel, Banane und Birne“ */
const list = (names) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`);

/**
 * Antwort auf ein Ergebnis von understand().
 * Ergebnis: { say, offerAdd?: product, choices?: products, added?: product, retry? }
 */
export function answer(result, { cartCount = 0, cartTotal = 0, categoryProducts = [] } = {}) {
  const p = result.product;
  switch (result.intent) {
    case "add": {
      const { plural } = genus(p);
      return { say: `${subject(p)} ${plural ? "sind" : "ist"} im Korb!`, added: p };
    }
    case "price":
    case "product": {
      const { plural } = genus(p);
      return { say: `${subject(p)} ${plural ? "kosten" : "kostet"} ${sayPrice(p.priceCents)}. Soll ich ${plural ? "sie" : genus(p).article === "der" ? "ihn" : genus(p).article === "das" ? "es" : "sie"} in den Korb legen?`, offerAdd: p };
    }
    case "total":
      if (!cartCount) return { say: "Dein Korb ist noch leer. Was möchtest du kaufen?" };
      return { say: `Im Korb ${cartCount === 1 ? "ist eine Sache" : `sind ${cartCount} Sachen`}. Das macht zusammen ${sayPrice(cartTotal)}.` };
    case "category": {
      const names = categoryProducts.map((x) => clean(x.name));
      if (!names.length) return { say: `Bei ${result.category.name} ist gerade nichts im Regal.` };
      const shown = names.slice(0, 4);
      const more = names.length - shown.length;
      return {
        say: `Bei ${result.category.name} gibt es ${list(shown)}${more > 0 ? ` und noch ${more} andere Sachen` : ""}.`,
        choices: categoryProducts.slice(0, 6),
      };
    }
    case "hello":
      return { say: "Hallo! Schön, dass du da bist. Was möchtest du kaufen?" };
    case "thanks":
      return { say: "Gern geschehen! Bis bald in Schafland!" };
    default:
      if (result.candidates.length) {
        return { say: result.candidates.length === 1 ? `Meinst du ${clean(result.candidates[0].name)}?` : "Meinst du eins von diesen?", choices: result.candidates, retry: true };
      }
      return { say: result.text ? "Das habe ich nicht verstanden. Sag es bitte nochmal!" : "Ich habe nichts gehört. Sag es bitte nochmal!", retry: true };
  }
}
