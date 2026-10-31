import { categoryById, MAGAZINE, SCANNED } from "./catalog.js";
import { getJson, fetchImage } from "./net.js";

// MediaWiki-API von Wikidata. origin=* erlaubt anonyme Abfragen direkt aus dem Browser.
const API = "https://www.wikidata.org/w/api.php";

// Wikidata-Eigenschaften
const P_GTIN = "P3962"; // Globale Artikelnummer (EAN/GTIN)
const P_ISSN = "P236";
const P_INSTANCE_OF = "P31";
const P_IMAGE = "P18";
const P_LOGO = "P154";

// "ist ein(e)": Zeitschrift, Periodikum, Zeitung, wissenschaftliche Fachzeitschrift, Fachzeitschrift
const PERIODICALS = new Set(["Q41298", "Q1002697", "Q11032", "Q5633421", "Q737498"]);

/**
 * Zeitschriften-Codes (Präfix 977) enthalten die ISSN:
 * 977 + 7 ISSN-Ziffern + 2 Ziffern Ausgabe/Preis + Prüfziffer.
 * Die ISSN-Prüfziffer (Gewichte 8…2, modulo 11, 10 = X) wird neu berechnet.
 */
export function issnFromEan(ean) {
  if (!/^977\d{10}$/.test(ean)) return null;
  const d = ean.slice(3, 10);
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(d[i]) * (8 - i);
  const c = (11 - (sum % 11)) % 11;
  return `${d.slice(0, 4)}-${d.slice(4)}${c === 10 ? "X" : c}`;
}

const claimValues = (entity, prop) =>
  (entity.claims?.[prop] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter(Boolean);

const pickLang = (map) => (map?.de ?? map?.en ?? Object.values(map ?? {})[0])?.value ?? "";

/** Vorschaubild über Wikimedia Commons */
export const commonsThumb = (file, width = 256) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;

/**
 * Sucht einen Strichcode in Wikidata: über die GTIN, bei Zeitschriften zusätzlich über die ISSN.
 * Gibt ein fertiges Produkt oder null zurück. Wirft NetworkError ohne Verbindung.
 */
export async function lookupWikidata(ean, { timeoutMs = 8000, trace = [] } = {}) {
  const issn = issnFromEan(ean);
  // GTIN steht teils 13-, teils 14-stellig (mit führender 0) in Wikidata
  const statements = [`${P_GTIN}=${ean}`, `${P_GTIN}=0${ean}`];
  if (issn) statements.unshift(`${P_ISSN}=${issn}`);

  let search;
  let data;
  try {
    search = await getJson(
      `${API}?action=query&list=search&srsearch=${encodeURIComponent(`haswbstatement:${statements.join("|")}`)}&srlimit=1&format=json&origin=*`,
      { timeoutMs },
    );
    const id = search?.query?.search?.[0]?.title;
    if (!/^Q\d+$/.test(id ?? "")) {
      trace.push(`wikidata.org: nicht gefunden${issn ? ` (ISSN ${issn})` : ""}`);
      return null;
    }
    data = await getJson(
      `${API}?action=wbgetentities&ids=${id}&props=labels|descriptions|claims&languages=de|en&format=json&origin=*`,
      { timeoutMs },
    );
  } catch (err) {
    trace.push(`wikidata.org: ${err.message}`);
    throw err;
  }
  const id = search.query.search[0].title;
  const entity = data?.entities?.[id];
  const name = pickLang(entity?.labels).trim();
  if (!entity || !name) {
    trace.push(`wikidata.org: ${id} ohne Namen`);
    return null;
  }
  trace.push(`wikidata.org: gefunden (${id})`);

  const isPeriodical = !!issn || claimValues(entity, P_INSTANCE_OF).some((v) => PERIODICALS.has(v.id));
  const cat = isPeriodical ? MAGAZINE : categoryById(SCANNED.id);
  const file = claimValues(entity, P_LOGO)[0] ?? claimValues(entity, P_IMAGE)[0];
  const imageUrl = typeof file === "string" ? commonsThumb(file) : null;

  return {
    id: `wd-${ean}`,
    ean,
    name,
    brand: pickLang(entity.descriptions),
    quantity: issn ? `ISSN ${issn}` : "",
    emoji: cat.emoji,
    categoryId: cat.id,
    priceCents: cat.defaultPrice,
    imageUrl,
    imageBlob: imageUrl ? await fetchImage(imageUrl) : null,
    source: "wikidata.org",
    wikidataId: id,
    createdAt: Date.now(),
  };
}
