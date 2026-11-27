import { db, kvGet, kvSet } from "./db.js";
import { productByEan } from "./catalog.js";
import { lookupOpenFacts } from "./off.js";
import { lookupWikidata, issnFromEan } from "./wikidata.js";
import { isBookEan, lookupGoogleBooks, lookupOpenLibrary } from "./books.js";
import { isPressCode, pressProduct } from "./presse.js";
import { NetworkError, ServiceError } from "./net.js";
import { pfandVon } from "./pfand.js";

/** Gescannte Produkte aus IndexedDB, für den Reiter "Gescannt". */
class Scanned {
  list = $state([]);

  async load() {
    this.list = await db.products.orderBy("id").toArray();
    this.list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  async save(product) {
    await db.products.put(product);
    await this.load();
  }

  async update(id, patch) {
    await db.products.update(id, patch);
    await this.load();
  }

  async remove(id) {
    await db.products.delete(id);
    await this.load();
  }
}
export const scanned = new Scanned();

// Codes, die online sicher in keiner Datenbank standen. Werden kurz nicht erneut abgefragt,
// damit ein Code vor der Kamera keine Anfragen-Flut auslöst.
const misses = new Map();
const MISS_TTL_MS = 2 * 60 * 1000;

/**
 * Reihenfolge: eigener Katalog → lokal gespeichert → Open Food Facts & Co. → Wikidata.
 * Zeitschriften (Präfix 977) zuerst bei Wikidata, dort sind sie über die ISSN zu finden.
 * Bücher (Präfix 978/979) bei Google Books → Open Library → Wikidata, nicht bei den Lebensmitteln.
 *
 * Ergebnis:
 *   { product, source }                gefunden
 *   { error: "unknown", trace }        in keiner Datenbank
 *   { error: "unavailable", trace }    Datenbanken gestört, später nochmal versuchen
 *   { error: "offline", trace }        keine Internetverbindung
 *
 * issue: Ausgabe aus dem Zusatzcode (bei Zeitschriften), falls mitgelesen.
 */
export async function findByEan(ean, { issue = "" } = {}) {
  const own = productByEan.get(ean);
  if (own) return { product: own, source: "eigen", trace: ["eigener Katalog"] };

  const cached = await db.products.where("ean").equals(ean).first();
  if (cached) {
    // Neue Ausgabe derselben Zeitschrift: Ausgabe aktualisieren, Name und Preis bleiben
    if (issue && isPressCode(ean) && cached.brand !== `Ausgabe ${issue}`) {
      cached.brand = `Ausgabe ${issue}`;
      await scanned.update(cached.id, { brand: cached.brand });
    }
    return { product: cached, source: "gespeichert", trace: ["schon einmal gescannt"] };
  }

  // Deutsche Pressecodes stehen in keiner Datenbank, enthalten aber den Preis: gleich anlegen
  if (isPressCode(ean)) {
    const product = pressProduct(ean, { issue });
    await scanned.save(product);
    return { product, source: "Pressecode", trace: [`Pressecode: Titel ${ean.slice(3, 8)}, Preis aus dem Code`] };
  }

  if (Date.now() - (misses.get(ean) ?? 0) < MISS_TTL_MS) {
    return { error: "unknown", trace: ["vor Kurzem in keiner Datenbank gefunden"] };
  }

  const trace = [];
  const sources = isBookEan(ean)
    ? [lookupGoogleBooks, lookupOpenLibrary, lookupWikidata]
    : issnFromEan(ean)
      ? [lookupWikidata, lookupOpenFacts]
      : [lookupOpenFacts, lookupWikidata];
  let disturbed = false;
  let unreachable = 0;
  for (const lookup of sources) {
    try {
      const found = await lookup(ean, { trace });
      if (found) {
        await scanned.save(found);
        return { product: found, source: found.source, trace };
      }
    } catch (err) {
      // Auch ohne Verbindung zu einem Server die anderen fragen: ein einzelner Dienst kann
      // gesperrt oder weg sein. Ist wirklich kein Netz da, scheitern alle in Millisekunden.
      if (err instanceof NetworkError) unreachable++;
      else if (err instanceof ServiceError) disturbed = true;
      else throw err;
    }
  }
  if (unreachable === sources.length) return { error: "offline", trace };
  if (disturbed || unreachable) return { error: "unavailable", trace };
  misses.set(ean, Date.now());
  return { error: "unknown", trace };
}

/**
 * Gemerkte Pfand-Angaben für einzelne Codes: was das Kind gewählt oder die Eltern eingetragen haben.
 * Gilt vor allen anderen Quellen (auch für Codes, die in keiner Datenbank stehen).
 * map: ean → { art: "einweg" | "mehrweg" | "bier" | "kein", name, quelle: "kind" | "eltern", at }
 */
class PfandWahl {
  map = $state({});

  async load() {
    this.map = await kvGet("pfandWahl", {});
  }

  async set(ean, { art, name = "", quelle = "kind" }) {
    const map = { ...(await kvGet("pfandWahl", {})), [ean]: { art, name, quelle, at: Date.now() } };
    await kvSet("pfandWahl", map);
    this.map = map;
  }

  async remove(ean) {
    const { [ean]: _weg, ...map } = await kvGet("pfandWahl", {});
    await kvSet("pfandWahl", map);
    this.map = map;
  }
}
export const pfandWahl = new PfandWahl();

/**
 * Pfand für einen gescannten Code („Pfand abgeben“). Sucht das Produkt wie beim Einkaufen (findByEan),
 * eine gemerkte Wahl geht aber vor.
 *
 * Ergebnis: { product, name, pfand, pfandQuelle, error, trace }
 *   pfand: "einweg" | "mehrweg" | "bier" | "kein" | null (unbekannt → Kind fragen)
 *   product: null, wenn der Code in keiner Datenbank steht (oder offline)
 */
export async function findPfand(ean) {
  const wahl = (await kvGet("pfandWahl", {}))[ean];
  let result;
  try {
    result = await findByEan(ean);
  } catch (err) {
    result = { error: "unavailable", trace: [`Fehler: ${err?.message ?? err}`] };
  }
  const product = result.product ?? null;
  const { pfand, pfandQuelle } = wahl ? { pfand: wahl.art, pfandQuelle: wahl.quelle } : pfandVon(product);
  const trace = [...(result.trace ?? []), wahl ? `Pfand gemerkt (${wahl.quelle})` : `Pfand: ${pfand ?? "unbekannt"}${pfandQuelle ? ` (${pfandQuelle})` : ""}`];
  return { product, name: product?.name || wahl?.name || "", pfand, pfandQuelle, error: result.error ?? null, trace };
}

class Cart {
  lines = $state([]); // { product, qty }
  lastId = $state(null);
  lastTick = $state(0); // erhöht sich bei jedem Hinzufügen, für Animationen
  // Zurückgegebenes Pfand: eigene Liste, damit Anzahl der Sachen und Produkte unverändert bleiben
  pfand = $state([]); // { art, cents, qty }
  pfandTick = $state(0);

  get count() {
    return this.lines.reduce((n, l) => n + l.qty, 0);
  }

  /** Summe der Waren (ohne Pfand). */
  get warenCents() {
    return this.lines.reduce((s, l) => s + l.qty * l.product.priceCents, 0);
  }

  /** Summe des zurückgegebenen Pfands. */
  get pfandCents() {
    return this.pfand.reduce((s, p) => s + p.qty * p.cents, 0);
  }

  /** Anzahl zurückgegebener Flaschen und Dosen. */
  get pfandCount() {
    return this.pfand.reduce((n, p) => n + p.qty, 0);
  }

  /** Zu zahlen: Waren minus Pfand. Negativ heißt: Die Kasse zahlt aus. */
  get totalCents() {
    return this.warenCents - this.pfandCents;
  }

  /** Weder Waren noch Pfand: nichts zu bezahlen. */
  get isEmpty() {
    return !this.lines.length && !this.pfand.length;
  }

  /** Eine Flasche oder Dose zurück. Gleiche Art und gleicher Betrag werden zusammengezählt. */
  addPfand(art, cents) {
    if (!art || art === "kein" || !(cents > 0)) return;
    const line = this.pfand.find((p) => p.art === art && p.cents === cents);
    if (line) line.qty++;
    else this.pfand = [...this.pfand, { art, cents, qty: 1 }];
    this.pfandTick++;
  }

  changePfand(art, cents, delta) {
    const line = this.pfand.find((p) => p.art === art && p.cents === cents);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) this.pfand = this.pfand.filter((p) => p !== line);
  }

  add(product) {
    const line = this.lines.find((l) => l.product.id === product.id);
    if (line) {
      line.qty++;
      // Zuletzt hinzugefügt wandert nach oben
      this.lines = [line, ...this.lines.filter((l) => l !== line)];
    } else {
      this.lines = [{ product, qty: 1 }, ...this.lines];
    }
    this.lastId = product.id;
    this.lastTick++;
  }

  change(id, delta) {
    const line = this.lines.find((l) => l.product.id === id);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) this.lines = this.lines.filter((l) => l !== line);
  }

  clear() {
    this.lines = [];
    this.pfand = [];
    this.lastId = null;
  }

  async checkout(payment) {
    await db.receipts.add({
      createdAt: Date.now(),
      payment,
      totalCents: this.totalCents,
      lines: this.lines.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        qty: l.qty,
        priceCents: l.product.priceCents,
      })),
      ...(this.pfand.length && {
        pfandCents: this.pfandCents,
        pfand: this.pfand.map((p) => ({ art: p.art, qty: p.qty, cents: p.cents })),
      }),
    });
    this.clear();
  }
}
export const cart = new Cart();
