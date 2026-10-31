import { test } from "node:test";
import assert from "node:assert/strict";
import { isPressCode, pressPrice, pressProduct } from "../../src/lib/presse.js";
import { splitAddOn } from "../../src/lib/barcode.js";

const CT = "4199148407003"; // c't, Ausgabe 23

test("Pressecodes erkennen (414 und 419)", () => {
  assert.ok(isPressCode(CT));
  assert.ok(isPressCode("4140000012340"));
  assert.ok(!isPressCode("4001234567891"));
  assert.ok(!isPressCode("9770724867005"));
  assert.ok(!isPressCode("419914840700"));
});

test("Preis aus dem Pressecode (c't: 7,00 €)", () => {
  assert.equal(pressPrice(CT), 700);
  assert.equal(pressPrice("4199999000499".slice(0, 12) + "9"), null); // 0,49 € ist zu wenig, nicht plausibel
  assert.equal(pressPrice("4001234567891"), null);
});

test("Zeitschrift aus dem Pressecode mit Ausgabe", () => {
  const p = pressProduct(CT, { issue: "23" });
  assert.equal(p.name, "Zeitschrift");
  assert.equal(p.brand, "Ausgabe 23");
  assert.equal(p.quantity, "Titel 91484");
  assert.equal(p.priceCents, 700);
  assert.equal(p.categoryId, "zeitschrift");
  assert.equal(p.id, `presse-${CT}`);
});

test("Unplausibler Preis → Standardpreis für Zeitschriften", () => {
  assert.equal(pressProduct("4199148400023").priceCents, 350);
});

test("Zusatzcode vom Hauptcode trennen", () => {
  assert.deepEqual(splitAddOn({ text: "419914840700323", extra: '{"EanAddOn":"23"}', format: "EAN13" }), { text: CT, addOn: "23", format: "EAN13" });
  assert.deepEqual(splitAddOn({ text: "978055358202450899", extra: '{"EanAddOn":"50899"}', format: "EAN13" }), { text: "9780553582024", addOn: "50899", format: "EAN13" });
  assert.deepEqual(splitAddOn({ text: "9783423533508", extra: "", format: "EAN13" }), { text: "9783423533508", addOn: "", format: "EAN13" });
  assert.deepEqual(splitAddOn({ text: "https://x", extra: undefined, format: "QRCode" }), { text: "https://x", addOn: "", format: "QRCode" });
});

test("Halb gelesener Zusatzcode wird verworfen, Hauptcode bleibt", () => {
  assert.deepEqual(splitAddOn({ text: "41991484070032", extra: '{"EanAddOn":"2"}', format: "EAN13" }), { text: CT, addOn: "", format: "EAN13" });
  assert.deepEqual(splitAddOn({ text: "41991484070032", extra: "", format: "EAN13" }), { text: CT, addOn: "", format: "EAN13" });
});
