import { test } from "node:test";
import assert from "node:assert/strict";
import { euro, amount, euroText, plain } from "../../src/lib/money.js";

test("euro: deutsche Schreibweise mit geschütztem Leerzeichen", () => {
  assert.equal(euro(418), "4,18 €");
  assert.equal(euro(5), "0,05 €");
  assert.equal(euro(0), "0,00 €");
  assert.equal(euro(123456), "1.234,56 €");
});

test("amount: ohne Währung", () => {
  assert.equal(amount(300), "3,00");
  assert.equal(amount(99), "0,99");
});

test("euroText: normales Leerzeichen (für den QR-Code)", () => {
  assert.equal(euroText(418), "4,18 €");
  assert.ok(!euroText(418).includes(" "));
});

test("plain: Punkt als Dezimaltrenner (für PayPal.me)", () => {
  assert.equal(plain(599), "5.99");
  assert.equal(plain(5), "0.05");
  assert.equal(plain(100000), "1000.00");
});

test("Cent-Rechnung hat keine Rundungsfehler", () => {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += 30;
  assert.equal(euroText(sum), "3,00 €");
});
