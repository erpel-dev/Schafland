import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDigit, ownEan, isValidEan } from "../../src/lib/ean.js";
import { products, productByEan } from "../../src/lib/catalog.js";

test("Prüfziffer bekannter EAN-13-Codes", () => {
  assert.equal(checkDigit("400638133393"), "1");
  assert.equal(checkDigit("590123412345"), "7");
  assert.equal(checkDigit("210100100000"), "1");
});

test("eigene Codes beginnen mit 21 und sind gültig", () => {
  const code = ownEan(3, 12);
  assert.equal(code, "2103012000001".slice(0, 12) + checkDigit("210301200000"));
  assert.match(code, /^21\d{11}$/);
  assert.ok(isValidEan(code));
});

test("isValidEan erkennt falsche Prüfziffern und Längen", () => {
  assert.ok(isValidEan("4006381333931"));
  assert.ok(!isValidEan("4006381333932"));
  assert.ok(isValidEan("96385074")); // EAN-8
  assert.ok(isValidEan("036000291452")); // UPC-A
  assert.ok(!isValidEan("12345"));
  assert.ok(!isValidEan("abcdefghijklm"));
  assert.ok(!isValidEan("https://paypal.me/x"));
});

test("Katalog: jeder eigene Code ist gültig und eindeutig", () => {
  assert.ok(products.length >= 50);
  for (const p of products) assert.ok(isValidEan(p.ean), `${p.name}: ${p.ean}`);
  assert.equal(productByEan.size, products.length);
});

test("Katalog: Preise sind ganze Cent-Beträge, Namen eindeutig", () => {
  for (const p of products) {
    assert.ok(Number.isInteger(p.priceCents) && p.priceCents > 0, p.name);
    assert.ok(p.emoji && p.name);
  }
  assert.equal(new Set(products.map((p) => p.name)).size, products.length);
});

test("Katalog: Codes hängen nur von der Position ab (gedruckte Etiketten bleiben gültig)", () => {
  assert.equal(productByEan.get("2101001000001")?.name, "Apfel");
  assert.equal(productByEan.get("2101002000000")?.name, "Banane");
});
