// Gluten-Kennzeichnung. Werte: "enthalten" | "spuren" (kann Spuren enthalten) | "frei" | null (unbekannt
// oder kein Lebensmittel).
//  - eigenes Sortiment und Aktionen: nach typischer Rezeptur (unten)
//  - gescannte Produkte: aus Open Food Facts (Allergene, Spuren, Siegel „glutenfrei“), im
//    Eltern-Bereich korrigierbar
// Im Kaufladen ist das Spielwissen. Bei echten Allergien zählt immer die Verpackung.

export const GLUTEN = {
  enthalten: { label: "enthält Gluten", short: "Gluten" },
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

/**
 * Angabe aus den Feldern von Open Food Facts (allergens_tags, traces_tags, labels_tags).
 * Ohne Allergen-Angaben bleibt es unbekannt: fehlende Angabe heißt nicht glutenfrei.
 */
export function glutenFromOpenFacts(p) {
  const has = (field, ...tags) => Array.isArray(p?.[field]) && tags.some((t) => p[field].includes(t));
  if (has("allergens_tags", "en:gluten")) return "enthalten";
  if (has("labels_tags", "en:no-gluten", "en:gluten-free")) return "frei";
  if (has("traces_tags", "en:gluten")) return "spuren";
  return null;
}
