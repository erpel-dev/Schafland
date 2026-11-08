// Misst die Gluten-Erkennung mit echten Daten von Open Food Facts (läuft auf GitHub, siehe
// .github/workflows/gluten-echt.yml): beliebte und weniger beliebte Produkte aus Deutschland je
// Produktart, alte Regel (nur Allergene, Siegel, Spuren) gegen neue (plus Zutaten und Produktart).
import { glutenAusOpenFacts } from "../../src/lib/gluten.js";

const ARTEN = ["breads", "biscuits", "pastas", "breakfast-cereals", "chocolates", "candies", "beers", "chips-and-fries", "cheeses", "yogurts", "pizzas", "sodas", "cakes", "crackers"];
const FIELDS = "code,product_name,allergens_tags,traces_tags,labels_tags,ingredients_tags,ingredients_text_de,ingredients_text,categories_tags,ingredients_n,unknown_ingredients_n";
const alt = (p) => {
  const has = (f, ...t) => Array.isArray(p[f]) && t.some((x) => p[f].includes(x));
  if (has("allergens_tags", "en:gluten")) return "enthalten";
  if (has("labels_tags", "en:no-gluten", "en:gluten-free")) return "frei";
  if (has("traces_tags", "en:gluten")) return "spuren";
  return null;
};

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Schafland-Test/1.0 (Spielkasse, Gluten-Messung)" }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

const rows = [];
for (const art of ARTEN) {
  for (const page of [1, 8]) {
    const data = await get(`https://world.openfoodfacts.org/api/v2/search?countries_tags_en=germany&categories_tags_en=${art}&fields=${FIELDS}&page_size=8&page=${page}&sort_by=unique_scans_n`);
    for (const p of data?.products ?? []) rows.push({ art, beliebt: page === 1, p, alt: alt(p), neu: glutenAusOpenFacts(p) });
    await new Promise((r) => setTimeout(r, 1500)); // Open Food Facts schonen
  }
}

const zahl = (f) => rows.filter(f).length;
const pct = (n) => `${n} (${Math.round((100 * n) / Math.max(rows.length, 1))} %)`;
console.log(`\n${rows.length} Produkte\n`);
console.log("art                  | alt: Angabe | neu: Angabe | neu dazu: Zutaten | Produktart | laut Zutaten ohne");
for (const art of ARTEN) {
  const r = rows.filter((x) => x.art === art);
  const a = r.filter((x) => x.alt).length;
  const n = r.filter((x) => x.neu.gluten).length;
  const z = r.filter((x) => !x.alt && x.neu.grund === "zutaten").length;
  const k = r.filter((x) => x.neu.grund === "produktart").length;
  const o = r.filter((x) => x.neu.gluten === "ohne").length;
  console.log(`${art.padEnd(20)} | ${String(a).padStart(4)}/${r.length}     | ${String(n).padStart(4)}/${r.length}     | ${String(z).padStart(4)}              | ${String(k).padStart(4)}       | ${o}`);
}
console.log(`\nMit Angabe vorher: ${pct(zahl((x) => x.alt))}`);
console.log(`Mit Angabe jetzt:  ${pct(zahl((x) => x.neu.gluten))}`);
console.log(`  davon neu aus Zutaten:    ${zahl((x) => !x.alt && x.neu.grund === "zutaten")}`);
console.log(`  davon neu aus Produktart: ${zahl((x) => x.neu.grund === "produktart")}`);
console.log(`Weniger beliebte Produkte: vorher ${zahl((x) => !x.beliebt && x.alt)}, jetzt ${zahl((x) => !x.beliebt && x.neu.gluten)} von ${zahl((x) => !x.beliebt)}`);
// Widersprüche zeigen: neue Regel sagt „enthalten“, alte „frei“ (oder umgekehrt) – sollte nie passieren
const wider = rows.filter((x) => (x.alt === "frei" && x.neu.gluten === "enthalten") || (x.alt === "enthalten" && x.neu.gluten !== "enthalten") || (x.alt === "spuren" && x.neu.gluten === "ohne"));
console.log(`Widersprüche alt/neu: ${wider.length}`);
for (const x of wider) console.log(`  ${x.p.code} ${x.p.product_name}: alt ${x.alt}, neu ${x.neu.gluten}`);
// Stichprobe der neu erkannten zur Kontrolle von Hand
console.log("\nNeu erkannt (Stichprobe):");
for (const x of rows.filter((x) => !x.alt && x.neu.gluten && x.neu.gluten !== "ohne").slice(0, 25)) {
  const grund = x.neu.grund === "zutaten" ? (x.p.ingredients_tags ?? []).filter((t) => /wheat|barley|rye|spelt|oat|malt|durum|gluten/.test(t)).slice(0, 2).join(",") || (x.p.ingredients_text_de ?? "").slice(0, 60) : x.neu.grund;
  console.log(`  ${x.p.code} ${(x.p.product_name ?? "?").slice(0, 32).padEnd(32)} ${x.neu.gluten.padEnd(14)} ${grund}`);
}
// „laut Zutaten ohne“ zur Kontrolle: Produktarten, in denen meist Gluten steckt, fallen hier auf
console.log(`\nLaut Zutaten ohne Gluten: ${zahl((x) => x.neu.gluten === "ohne")}`);
const verdaechtig = rows.filter((x) => x.neu.gluten === "ohne" && ["breads", "biscuits", "pastas", "beers", "pizzas", "cakes", "breakfast-cereals"].includes(x.art));
console.log(`  davon in Brot/Keks/Nudel/Bier/Pizza/Kuchen/Müsli (von Hand prüfen): ${verdaechtig.length}`);
for (const x of verdaechtig) console.log(`    ${x.p.code} ${(x.p.product_name ?? "?").slice(0, 40)} | ${(x.p.ingredients_tags ?? []).slice(0, 6).join(",")}`);
for (const x of rows.filter((x) => x.neu.gluten === "ohne").slice(0, 15)) console.log(`  ${x.p.code} ${(x.p.product_name ?? "?").slice(0, 32).padEnd(32)} ${x.art}`);
// Ohne Angabe: warum? (keine Zutaten = Datenbank leer)
const ohne = rows.filter((x) => !x.neu.gluten);
console.log(`\nOhne Angabe: ${ohne.length}, davon ohne Zutatenliste: ${ohne.filter((x) => !(x.p.ingredients_tags ?? []).length && !x.p.ingredients_text_de).length}`);
if (rows.length < 50) process.exit(1);
