import { categories, SCANNED } from "./catalog.js";
import { getJson, fetchImage, ServiceError } from "./net.js";
import { glutenAusOpenFacts } from "./gluten.js";

// Open Food Facts und die Schwesterprojekte haben dieselbe Schnittstelle.
const HOSTS = [
  "https://world.openfoodfacts.org",
  "https://world.openbeautyfacts.org",
  "https://world.openproductsfacts.org",
];
const FIELDS = "product_name,product_name_de,brands,quantity,image_front_small_url,categories_tags,allergens_tags,traces_tags,labels_tags,ingredients_tags,ingredients_text_de,ingredients_text";

// Reihenfolge zählt: die erste passende Kategorie gewinnt.
const CATEGORY_TAGS = [
  ["suesses", ["en:chocolates", "en:confectioneries", "en:sweets", "en:candies", "en:sweet-snacks", "en:biscuits", "en:snacks"]],
  ["getraenke", ["en:beverages", "en:waters", "en:juices", "en:sodas"]],
  ["milch", ["en:dairies", "en:milks", "en:cheeses", "en:yogurts", "en:butters", "en:eggs"]],
  ["backwaren", ["en:breads", "en:pastries", "en:viennoiseries", "en:cakes"]],
  ["obst", ["en:fruits", "en:fresh-fruits", "en:fruits-based-foods"]],
  ["gemuese", ["en:vegetables", "en:fresh-vegetables", "en:vegetables-based-foods"]],
];

function mapCategory(tags = []) {
  for (const [id, wanted] of CATEGORY_TAGS) if (wanted.some((t) => tags.includes(t))) return id;
  return SCANNED.id;
}

const hostName = (host) => new URL(host).hostname.replace("world.", "");

/**
 * Sucht einen Code in den offenen Datenbanken. Gibt ein fertiges Produkt oder null zurück.
 * Wirft NetworkError ohne Verbindung und ServiceError, wenn ein Server gestört war
 * und das Produkt deshalb nicht sicher als "unbekannt" gelten kann.
 * Jeder Schritt wird in trace notiert (für das Scan-Protokoll im Eltern-Bereich).
 */
export async function lookupOpenFacts(ean, { timeoutMs = 8000, trace = [] } = {}) {
  let disturbed = null;
  for (const host of HOSTS) {
    let data;
    try {
      data = await getJson(`${host}/api/v2/product/${ean}.json?fields=${FIELDS}&lc=de`, { timeoutMs });
    } catch (err) {
      trace.push(`${hostName(host)}: ${err.message}`);
      // Ohne Verbindung sind die anderen Server auch nicht erreichbar; bei Störung den nächsten fragen
      if (!(err instanceof ServiceError)) throw err;
      disturbed = err;
      continue;
    }
    const p = data?.product;
    const name = (p?.product_name_de || p?.product_name || p?.brands || "").trim();
    if (data?.status !== 1 || !p || !name) {
      trace.push(`${hostName(host)}: nicht gefunden`);
      continue;
    }
    trace.push(`${hostName(host)}: gefunden`);
    const categoryId = mapCategory(p.categories_tags);
    const cat = categories.find((c) => c.id === categoryId) ?? SCANNED;
    const imageUrl = p.image_front_small_url || null;
    const gluten = glutenAusOpenFacts(p);

    return {
      id: `off-${ean}`,
      ean,
      name,
      brand: p.brands?.split(",")[0]?.trim() || "",
      quantity: p.quantity || "",
      gluten: gluten.gluten,
      glutenGrund: gluten.grund,
      emoji: cat.emoji,
      categoryId,
      priceCents: cat.defaultPrice,
      imageUrl,
      imageBlob: imageUrl ? await fetchImage(imageUrl) : null,
      source: hostName(host),
      createdAt: Date.now(),
    };
  }
  if (disturbed) throw disturbed;
  return null;
}
