// Sperre gegen Mehrfachzählen beim Scannen (src/lib/sperre.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { codeSperre } from "../../src/lib/sperre.js";

test("derselbe Code zählt erst wieder nach 1,5 s Pause", () => {
  const sehen = codeSperre(1500);
  assert.equal(sehen("A", 0).same, false);
  assert.equal(sehen("A", 100).same, true);
  assert.equal(sehen("A", 1500).same, true, "ruhig gehalten: Zeit läuft ab dem letzten Sehen");
  assert.equal(sehen("A", 2999).same, true);
  assert.equal(sehen("A", 4500).same, false, "1,5 s weg");
});

test("andere Codes dazwischen setzen die Sperre nicht zurück (Wasser → Limo → Wasser)", () => {
  const sehen = codeSperre(1500);
  assert.equal(sehen("Wasser", 0).same, false);
  assert.equal(sehen("Limo", 400).same, false);
  assert.equal(sehen("Wasser", 800).same, true);
  assert.equal(sehen("Limo", 1000).same, true);
  assert.equal(sehen("Wasser", 2200).same, true);
  assert.equal(sehen("Limo", 2600).same, false, "Limo war 1,6 s weg");
});

test("Zusatzcode aus einem späteren Bild wird nachgetragen, aber nur einmal", () => {
  const sehen = codeSperre(1500);
  assert.deepEqual(sehen("Heft", 0), { same: false, lateAddOn: false });
  assert.deepEqual(sehen("Heft", 100, "23"), { same: true, lateAddOn: true });
  assert.deepEqual(sehen("Heft", 200, "23"), { same: true, lateAddOn: false });
  assert.deepEqual(sehen("Heft", 300), { same: true, lateAddOn: false });
  assert.deepEqual(sehen("Neu", 400, "07"), { same: false, lateAddOn: false });
});
