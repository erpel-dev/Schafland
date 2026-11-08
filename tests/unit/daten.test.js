// Stammdaten (Sortiment und Aktionen): vollständig und stimmig. Fängt Tippfehler und leere
// Einträge ab, die beim Mutationstesten sonst unbemerkt blieben.
import { test } from "node:test";
import assert from "node:assert/strict";
import { products, allProducts, categories, categoryById, productByEan, SCANNED, MAGAZINE, BOOK } from "../../src/lib/catalog.js";
import { aktionen, aktionById } from "../../src/lib/aktionen.js";
import { isValidEan } from "../../src/lib/ean.js";
import fs from "node:fs";

const emoji = /\p{Extended_Pictographic}/u;

test("Jedes Produkt: Name, Emoji oder Bild, Preis, gültiger eigener Code, eindeutige id", () => {
  const ids = new Set();
  for (const p of allProducts) {
    assert.ok(p.name?.trim().length >= 2, `Name: ${JSON.stringify(p.name)}`);
    assert.ok(emoji.test(p.emoji ?? "") || p.icon, `${p.name}: Emoji oder Bild`);
    assert.ok(Number.isInteger(p.priceCents) && p.priceCents > 0 && p.priceCents <= 2000, `${p.name}: Preis ${p.priceCents}`);
    assert.ok(isValidEan(p.ean) && p.ean.startsWith("2"), `${p.name}: Code ${p.ean}`);
    assert.equal(p.source, "eigen");
    assert.ok(!ids.has(p.id), `doppelte id ${p.id}`);
    ids.add(p.id);
  }
  assert.equal(productByEan.size, allProducts.length, "Codes eindeutig");
});

test("Aktionen: Texte, Deko, Kategorie, fortlaufende ids", () => {
  assert.ok(aktionen.length >= 2);
  for (const a of aktionen) {
    for (const k of ["name", "description", "startText", "thanksText"]) assert.ok(a[k]?.trim().length > 3, `${a.id}.${k}`);
    assert.ok(emoji.test(a.emoji), `${a.id}: Emoji`);
    assert.ok(a.ground.length >= 3 && a.ground.every((g) => emoji.test(g)), `${a.id}: Deko`);
    assert.deepEqual(a.category, { id: a.id, name: a.category.name, emoji: a.emoji, defaultPrice: 100, aktion: true });
    assert.ok(a.category.name.length >= 3 && a.category.name.length <= 20, `${a.id}: Reitername kurz genug`);
    a.products.forEach((p, i) => {
      assert.equal(p.id, `${a.id}-${i + 1}`);
      assert.equal(p.categoryId, a.id);
      assert.ok(p.icon === null || fs.existsSync(new URL(`../../public/${p.icon}`, import.meta.url)), `${p.name}: Bild ${p.icon}`);
    });
    assert.equal(aktionById(a.id), a);
    assert.equal(categoryById(a.id).name, a.category.name);
  }
});

test("Kategorien: Namen, Emojis, Standardpreise; besondere Kategorien findbar", () => {
  for (const c of categories) {
    assert.ok(c.name?.length >= 3 && emoji.test(c.emoji), c.id);
    assert.ok(products.some((p) => p.categoryId === c.id), `${c.id} hat Produkte`);
  }
  for (const c of [SCANNED, MAGAZINE, BOOK]) {
    assert.equal(categoryById(c.id), c);
    assert.ok(c.defaultPrice > 0);
  }
});
