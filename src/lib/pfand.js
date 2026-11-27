// Pfand für leere Flaschen und Dosen („Pfand abgeben“).
//
// Der Strichcode selbst verrät kein Pfand. Deshalb in dieser Reihenfolge:
//   1. Wahl des Kindes oder der Eltern für genau diesen Code (gemerkt, siehe shop.svelte.js)
//   2. eigenes Sortiment (Feld pfand in catalog.js)
//   3. Open Food Facts: Siegel und Verpackung (de:einwegpfand, de:mehrwegpfand …)
//   4. aus der Verpackung geschätzt: Getränk in Dose oder Plastikflasche → Einweg
//   5. Getränk, aber nichts bekannt → das Kind wird gefragt (pfand: null)
// Alles hier ist ohne Datenbank und ohne Svelte, damit es sich einfach testen lässt.

/** Pfand-Arten. Einweg ist gesetzlich immer 25 Cent; Mehrweg-Beträge lassen sich im Eltern-Bereich ändern. */
export const PFAND_ARTEN = {
  einweg: { name: "Einweg", lang: "Einwegpfand", cents: 25 },
  mehrweg: { name: "Mehrweg", lang: "Mehrwegpfand", cents: 15 },
  bier: { name: "Mehrweg Bier", lang: "Mehrwegpfand (Bier, Joghurtglas)", cents: 8 },
};

export const KEIN = "kein";

/** Herkunft der Pfand-Angabe (für Kasse und Eltern-Bereich). */
export const PFAND_QUELLE = {
  siegel: "Open Food Facts",
  verpackung: "geschätzt aus der Verpackung",
  kategorie: "geschätzt aus der Produktart",
  eigen: "eigenes Sortiment",
  kind: "vom Kind gewählt",
  eltern: "von den Eltern eingetragen",
};

/**
 * Betrag einer Pfand-Art in Cent. Einweg ist fest, Mehrweg und Bier kommen aus den Einstellungen
 * ({ pfandMehrweg, pfandBier }), sonst die üblichen Beträge.
 */
export function pfandCents(art, einstellungen = {}) {
  if (art === "einweg") return PFAND_ARTEN.einweg.cents;
  if (art === "mehrweg") return gueltig(einstellungen.pfandMehrweg) ?? PFAND_ARTEN.mehrweg.cents;
  if (art === "bier") return gueltig(einstellungen.pfandBier) ?? PFAND_ARTEN.bier.cents;
  return 0;
}

const gueltig = (c) => (Number.isInteger(c) && c >= 0 && c <= 500 ? c : null);

const GETRAENK = /^en:(beverages|waters|mineral-waters|spring-waters|juices|fruit-juices|nectars|sodas|carbonated-drinks|soft-drinks|iced-teas|energy-drinks|beers|alcoholic-beverages|wines|plant-based-milks|milk-drinks|dairy-drinks|flavoured-milks|milks|sports-drinks|lemonades|colas|smoothies)$/;
const BIER = /^en:(beers|beer)$/;

// Siegel und Verpackungsangaben, wie sie bei Open Food Facts stehen (deutsch und englisch)
const EINWEG = /(einweg-?pfand|pfandpflichtig|one-way-deposit|single-use-deposit|^[a-z]{2}:dpg$|deutsches-pfandsystem)/;
const MEHRWEG = /(mehrweg|returnable|refillable|reusable-bottle)/;
const KEIN_PFAND = /(kein-?pfand|pfandfrei|no-deposit)/;
const DOSE = /(^|:|-)(can|cans|drink-can|beverage-can|aluminium-can|aluminum-can|steel-can|dose|dosen|dose-n|getrankedose|getraenkedose|canette)(-|$)/;
const KONSERVE = /food-can|konserve/;
const PLASTIKFLASCHE = /(pet-?flasche|pet-bottle|plastic-bottle|plastikflasche|kunststoffflasche|bouteille-(en-)?plastique)/;
const FLASCHE = /(^|:|-)(bottle|bottles|flasche|flaschen|bouteille)(-|$)/;
const PLASTIK = /(^|:|-)(pet|pet-1|plastic|plastik|kunststoff|hdpe|rpet)(-|$)|polyethylene-terephthalate/;
const GLAS = /(^|:|-)(glass|glas|verre|clear-glass|green-glass|brown-glass)(-|$)|glasflasche|glass-bottle/;
const KARTON = /(brick|tetra|carton|karton|pure-pak|^[a-z]{2}:sig$|combibloc|getrankekarton|beutel|pouch|sachet)/;

/** Ist das ein Getränk? (Kategorien von Open Food Facts oder eigene Kategorie) */
export function istGetraenk({ categoryId, categoriesTags = [] } = {}) {
  return categoryId === "getraenke" || categoriesTags.some((t) => GETRAENK.test(t));
}

/**
 * Pfand aus den Angaben von Open Food Facts.
 * Ergebnis: { pfand: "einweg" | "mehrweg" | "bier" | "kein" | null, pfandQuelle }
 * pfand: null heißt: Getränk, aber unbekannt → das Kind fragen.
 */
export function pfandAusOpenFacts(p = {}, { categoryId } = {}) {
  const lower = (a) => (Array.isArray(a) ? a.map((t) => String(t).toLowerCase()) : []);
  const siegel = [...lower(p.labels_tags), ...lower(p.packaging_tags)];
  const formen = [...lower(p.packaging_shapes_tags), ...lower(p.packaging_materials_tags), ...lower(p.packaging_tags)];
  const kategorien = lower(p.categories_tags);
  const bier = kategorien.some((t) => BIER.test(t));

  if (siegel.some((t) => KEIN_PFAND.test(t))) return { pfand: KEIN, pfandQuelle: "siegel" };
  if (siegel.some((t) => EINWEG.test(t))) return { pfand: "einweg", pfandQuelle: "siegel" };
  if (siegel.some((t) => MEHRWEG.test(t))) return { pfand: bier ? "bier" : "mehrweg", pfandQuelle: "siegel" };

  if (!istGetraenk({ categoryId, categoriesTags: kategorien })) return { pfand: KEIN, pfandQuelle: "kategorie" };

  // Getränk ohne Pfand-Angabe: aus der Verpackung schätzen
  const hat = (re) => formen.some((t) => re.test(t));
  if (hat(KARTON)) return { pfand: KEIN, pfandQuelle: "verpackung" };
  if (hat(DOSE) && !hat(KONSERVE)) return { pfand: "einweg", pfandQuelle: "verpackung" };
  if (hat(PLASTIKFLASCHE) || (hat(FLASCHE) && hat(PLASTIK))) return { pfand: "einweg", pfandQuelle: "verpackung" };
  // Glasflaschen sind oft Mehrweg, Saft und Wein in Glas aber oft ohne Pfand: bei Bier schätzen, sonst fragen
  if (bier && hat(GLAS)) return { pfand: "bier", pfandQuelle: "verpackung" };
  return { pfand: null, pfandQuelle: null };
}

/**
 * Pfand eines Produkts, wie es in der Kasse steht.
 * pfand gesetzt (auch null) → so nehmen; ältere Scans ohne Feld: Getränke fragen, alles andere kein Pfand.
 */
export function pfandVon(product) {
  if (!product) return { pfand: null, pfandQuelle: null };
  if (product.pfand !== undefined) return { pfand: product.pfand, pfandQuelle: product.pfandQuelle ?? (product.source === "eigen" ? "eigen" : null) };
  if (istGetraenk(product)) return { pfand: null, pfandQuelle: null };
  return { pfand: KEIN, pfandQuelle: "kategorie" };
}

/** Text für die Kasse: „Einwegpfand“, „kein Pfand“ … */
export const pfandName = (art) => PFAND_ARTEN[art]?.lang ?? "kein Pfand";
