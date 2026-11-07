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

test("Pressecode: genau 13 Ziffern mit 414/419, Preisgrenzen 0,50 € bis 30 €", () => {
  assert.equal(isPressCode("4191234500001"), true);
  assert.equal(isPressCode("4141234500001"), true);
  assert.equal(isPressCode("4151234500001"), false);
  assert.equal(isPressCode("x4191234500001"), false, "Anfang");
  assert.equal(isPressCode("41912345000012"), false, "Ende");
  assert.equal(isPressCode("419123450000"), false, "zu kurz");
  const code = (cents) => `41912345${String(cents).padStart(4, "0")}0`;
  assert.equal(pressPrice(code(50)), 50);
  assert.equal(pressPrice(code(49)), null);
  assert.equal(pressPrice(code(3000)), 3000);
  assert.equal(pressPrice(code(3001)), null);
  assert.equal(pressPrice("4001234567890"), null, "kein Pressecode");
  const p = pressProduct(code(9999));
  assert.equal(p.priceCents, 350, "unplausibler Preis: Standardpreis Zeitschrift");
  assert.equal(p.brand, "");
  assert.equal(p.source, "Pressecode");
  assert.equal(pressProduct(code(400), { issue: "07" }).brand, "Ausgabe 07");
});

test("Zusatzcode: nur 2 oder 5 Ziffern, nur hinten abtrennen, EAN-13 auf 13 Ziffern kürzen", () => {
  const r = (text, extra, format = "EAN13") => splitAddOn({ text, extra, format });
  assert.deepEqual(r("419914840700323", '{"EanAddOn":"23"}'), { text: "4199148407003", addOn: "23", format: "EAN13" });
  assert.deepEqual(r("978316148410051299", '{"EanAddOn":"51299"}'), { text: "9783161484100", addOn: "51299", format: "EAN13" });
  // Zusatzcode steht nicht hinten: Text bleibt, nur auf 13 Ziffern gekürzt
  assert.deepEqual(r("234199148407003", '{"EanAddOn":"23"}'), { text: "2341991484070", addOn: "23", format: "EAN13" });
  // halb gelesen (3 Ziffern): verworfen, aber der Text wird trotzdem auf 13 gekürzt
  assert.deepEqual(r("4199148407003123", '{"EanAddOn":"123"}'), { text: "4199148407003", addOn: "", format: "EAN13" });
  assert.deepEqual(r("4199148407003", '{"EanAddOn":"x5"}'), { text: "4199148407003", addOn: "", format: "EAN13" });
  // kaputtes oder fehlendes extra
  assert.deepEqual(r("4199148407003", "{kaputt"), { text: "4199148407003", addOn: "", format: "EAN13" });
  assert.deepEqual(r("4199148407003", undefined), { text: "4199148407003", addOn: "", format: "EAN13" });
  assert.deepEqual(r("4199148407003", "{}"), { text: "4199148407003", addOn: "", format: "EAN13" });
  // andere Formate werden nicht gekürzt, Buchstaben auch nicht
  assert.equal(r("12345678901234", "{}", "Code128").text, "12345678901234");
  assert.equal(r("1234567890123a", "{}").text, "1234567890123a");
  assert.equal(r("a12345678901234", "{}").text, "a12345678901234");
});
