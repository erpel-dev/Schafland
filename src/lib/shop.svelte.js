import { db } from "./db.js";
import { productByEan } from "./catalog.js";
import { lookupOpenFacts } from "./off.js";

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

/**
 * Reihenfolge: eigener Katalog → lokal gespeichert → Open Food Facts (nur online).
 * Gibt { product, source } oder null zurück.
 */
export async function findByEan(ean) {
  const own = productByEan.get(ean);
  if (own) return { product: own, source: "eigen" };

  const cached = await db.products.where("ean").equals(ean).first();
  if (cached) return { product: cached, source: "gespeichert" };

  if (!navigator.onLine) return null;
  const found = await lookupOpenFacts(ean);
  if (!found) return null;
  await scanned.save(found);
  return { product: found, source: found.source };
}

class Cart {
  lines = $state([]); // { product, qty }
  lastId = $state(null);
  lastTick = $state(0); // erhöht sich bei jedem Hinzufügen, für Animationen

  get count() {
    return this.lines.reduce((n, l) => n + l.qty, 0);
  }

  get totalCents() {
    return this.lines.reduce((s, l) => s + l.qty * l.product.priceCents, 0);
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
    });
    this.clear();
  }
}
export const cart = new Cart();
