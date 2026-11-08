// Gluten-Kennzeichnung. Werte: "enthalten" | "wahrscheinlich" (nur aus der Produktart geschlossen) |
// "spuren" (kann Spuren enthalten) | "frei" | null (unbekannt oder kein Lebensmittel).
//  - eigenes Sortiment und Aktionen: nach typischer Rezeptur (unten)
//  - gescannte Produkte: aus Open Food Facts (Allergene, Siegel, Zutaten, Spuren, Produktart), im
//    Eltern-Bereich korrigierbar
// Im Kaufladen ist das Spielwissen. Bei echten Allergien zählt immer die Verpackung.

export const GLUTEN = {
  enthalten: { label: "enthält Gluten", short: "Gluten" },
  wahrscheinlich: { label: "enthält wahrscheinlich Gluten", short: "wahrscheinlich" },
  spuren: { label: "kann Spuren von Gluten enthalten", short: "Spuren" },
  frei: { label: "glutenfrei", short: "glutenfrei" },
};

const clean = (name) => (name ?? "").replace(/­/g, "");

// Eigene Produkte mit Gluten (Weizen, Roggen, Dinkel …)
const MIT_GLUTEN = new Set([
  "Brot", "Brezel", "Croissant", "Baguette", "Muffin", "Kuchen", "Waffel", "Pfannkuchen",
  "Brötchen", "Kaiserbrötchen", "Körnerbrötchen", "Laugenbrötchen", "Mohnbrötchen", "Sesambrötchen",
  "Keks", "Donut",
  "Fledermaus-Kekse", "Lebkuchen", "Rentier-Kekse",
]);
// gemischte Tüten: was drin ist, weiß man nicht genau
const MIT_SPUREN = new Set(["Süßes-oder-Saures-Tüte"]);
// keine Lebensmittel: keine Angabe
const KEIN_ESSEN = new Set(["Hexenhut", "Grusel-Kerze", "Zauberbesen", "Weihnachtsbaum", "Geschenk", "Glöckchen", "Weihnachtsstern", "Kuschelsocken", "Schlitten"]);
const KEIN_ESSEN_KATEGORIE = new Set(["spielzeug", "zeitschrift", "buch"]);

/** Gluten-Angabe eines Produkts (siehe oben). Eine gespeicherte Angabe (gescannt, korrigiert) zählt zuerst. */
export function glutenOf(product) {
  if (!product) return null;
  if (product.gluten !== undefined) return product.gluten in GLUTEN ? product.gluten : null;
  if (KEIN_ESSEN_KATEGORIE.has(product.categoryId)) return null;
  if (product.source !== "eigen") return null;
  const name = clean(product.name);
  if (KEIN_ESSEN.has(name)) return null;
  if (MIT_GLUTEN.has(name)) return "enthalten";
  if (MIT_SPUREN.has(name)) return "spuren";
  return "frei";
}

/** Ist das ein Lebensmittel, bei dem eine Angabe Sinn hat (auch wenn sie noch fehlt)? */
export function glutenRelevant(product) {
  if (!product || KEIN_ESSEN_KATEGORIE.has(product.categoryId)) return false;
  if (product.source === "eigen") return !KEIN_ESSEN.has(clean(product.name));
  return true;
}

// Getreide mit Gluten, wie Open Food Facts Zutaten benennt (en:wheat-flour, en:whole-wheat-flour,
// en:barley-malt-extract …). Ganze Wortteile, damit en:buckwheat (glutenfrei) nicht als Weizen zählt.
const GLUTEN_ZUTATEN = new Set(["wheat", "barley", "rye", "spelt", "oat", "oats", "kamut", "khorasan", "triticale", "durum", "semolina", "couscous", "bulgur", "malt", "gluten", "seitan", "emmer", "einkorn", "farro", "freekeh"]);
// dieselben auf Deutsch, für Zutatenlisten ohne ausgewertete Zutaten (auch in Wortzusammensetzungen:
// „Weizenmehl“, „Hartweizengrieß“, „Gerstenmalzextrakt“; aber nicht „Buchweizen“ oder „Maltodextrin“)
const GLUTEN_TEXT = /(?<!buch)weizen|roggen|gerste|dinkel|hafer|grünkern|emmer|einkorn|kamut|triticale|malz|seitan|\bgluten\b(?!frei)/i;
// Produktarten, die fast immer Gluten enthalten (nur genutzt, wenn keine Zutaten bekannt sind)
const GLUTEN_ARTEN = ["en:breads", "en:pastas", "en:biscuits", "en:cakes", "en:pastries", "en:viennoiseries", "en:beers", "en:crackers", "en:pizzas", "en:wafers", "en:waffles", "en:croissants", "en:pretzels", "en:breakfast-cereals", "en:breadcrumbs", "en:cookies", "en:gingerbreads"];

const zutatHatGluten = (tag) => typeof tag === "string" && tag.startsWith("en:") && tag.slice(3).split("-").some((w) => GLUTEN_ZUTATEN.has(w));

/**
 * Angabe aus den Feldern von Open Food Facts. Reihenfolge nach Verlässlichkeit:
 *   Allergen „Gluten“ → Siegel „glutenfrei“ → glutenhaltige Zutat → Spuren → Produktart.
 * Ergebnis: { gluten, grund } mit grund = "allergene" | "siegel" | "zutaten" | "spuren" | "produktart" | null.
 * Fehlende Angaben heißen nie „glutenfrei“.
 */
export function glutenAusOpenFacts(p) {
  const list = (field) => (Array.isArray(p?.[field]) ? p[field] : []);
  const has = (field, ...tags) => tags.some((t) => list(field).includes(t));
  if (has("allergens_tags", "en:gluten")) return { gluten: "enthalten", grund: "allergene" };
  if (has("labels_tags", "en:no-gluten", "en:gluten-free")) return { gluten: "frei", grund: "siegel" };
  const zutaten = list("ingredients_tags");
  const text = [p?.ingredients_text_de, p?.ingredients_text].find((t) => typeof t === "string" && t.trim()) ?? "";
  if (zutaten.some(zutatHatGluten) || GLUTEN_TEXT.test(text)) return { gluten: "enthalten", grund: "zutaten" };
  if (has("traces_tags", "en:gluten")) return { gluten: "spuren", grund: "spuren" };
  // Produktart nur, wenn die Zutaten unbekannt sind (sonst sprechen sie gegen Gluten, z. B. Reiswaffeln)
  if (!zutaten.length && !text && GLUTEN_ARTEN.some((c) => list("categories_tags").includes(c))) return { gluten: "wahrscheinlich", grund: "produktart" };
  return { gluten: null, grund: null };
}

/** Nur der Wert (für ältere Aufrufer) */
export const glutenFromOpenFacts = (p) => glutenAusOpenFacts(p).gluten;

/** Woher die Angabe stammt, für den Eltern-Bereich */
export const GLUTEN_GRUND = {
  allergene: "Allergenangabe",
  siegel: "Siegel „glutenfrei“",
  zutaten: "aus den Zutaten",
  spuren: "Spurenhinweis",
  produktart: "aus der Produktart geschätzt",
  eltern: "von Hand eingetragen",
};
