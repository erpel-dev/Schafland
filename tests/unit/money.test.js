import { test } from "node:test";
import assert from "node:assert/strict";
import { euro, amount, euroText, plain, muenzen, stueckName } from "../../src/lib/money.js";

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

test("muenzen: Pfand-Auszahlung mit möglichst wenig Münzen und Scheinen", () => {
  assert.deepEqual(muenzen(60), [{ cents: 50, anzahl: 1, schein: false }, { cents: 10, anzahl: 1, schein: false }]);
  assert.deepEqual(muenzen(45).map((m) => [m.cents, m.anzahl]), [[20, 2], [5, 1]]);
  assert.deepEqual(muenzen(388).map((m) => [m.cents, m.anzahl]), [[200, 1], [100, 1], [50, 1], [20, 1], [10, 1], [5, 1], [2, 1], [1, 1]]);
  assert.deepEqual(muenzen(1250).map((m) => [m.cents, m.anzahl, m.schein]), [[1000, 1, true], [200, 1, false], [50, 1, false]]);
  assert.deepEqual(muenzen(500), [{ cents: 500, anzahl: 1, schein: true }]);
  assert.deepEqual(muenzen(0), []);
  assert.deepEqual(muenzen(-30), [], "negativ: nichts");
  assert.deepEqual(muenzen(24.6).map((m) => [m.cents, m.anzahl]), [[20, 1], [5, 1]], "gerundet");
  for (const c of [1, 8, 15, 25, 99, 137, 999, 12345]) {
    assert.equal(muenzen(c).reduce((s, m) => s + m.cents * m.anzahl, 0), c, `Summe ${c}`);
  }
});

test("stueckName: zum Vorlesen und Anzeigen", () => {
  assert.equal(stueckName(50), "50 Cent");
  assert.equal(stueckName(1), "1 Cent");
  assert.equal(stueckName(100), "1 Euro");
  assert.equal(stueckName(200), "2 Euro");
  assert.equal(stueckName(1000), "10 Euro");
});
