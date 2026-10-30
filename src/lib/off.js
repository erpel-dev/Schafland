import { categories, SCANNED } from "./catalog.js";

// Open Food Facts und die Schwesterprojekte haben dieselbe Schnittstelle.
const HOSTS = [
  "https://world.openfoodfacts.org",
  "https://world.openbeautyfacts.org",
  "https://world.openproductsfacts.org",
];
const FIELDS = "product_name,product_name_de,brands,quantity,image_front_small_url,categories_tags";

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

async function fetchImage(url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) return await res.blob();
  } catch {
    // Bild ohne CORS: dann bleibt nur die URL, das Bild kommt online trotzdem.
  }
  return null;
}

/** Sucht einen Code in den offenen Datenbanken. Gibt ein fertiges Produkt oder null zurück. */
export async function lookupOpenFacts(ean, { timeoutMs = 6000 } = {}) {
  for (const host of HOSTS) {
    let data;
    try {
      const res = await fetch(`${host}/api/v2/product/${ean}.json?fields=${FIELDS}&lc=de`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }
    const p = data?.product;
    if (data?.status !== 1 || !p) continue;

    const name = (p.product_name_de || p.product_name || p.brands || "").trim();
    if (!name) continue;
    const categoryId = mapCategory(p.categories_tags);
    const cat = categories.find((c) => c.id === categoryId) ?? SCANNED;
    const imageUrl = p.image_front_small_url || null;

    return {
      id: `off-${ean}`,
      ean,
      name,
      brand: p.brands?.split(",")[0]?.trim() || "",
      quantity: p.quantity || "",
      emoji: cat.emoji,
      categoryId,
      priceCents: cat.defaultPrice,
      imageUrl,
      imageBlob: imageUrl ? await fetchImage(imageUrl) : null,
      source: new URL(host).hostname.replace("world.", ""),
      createdAt: Date.now(),
    };
  }
  return null;
}
