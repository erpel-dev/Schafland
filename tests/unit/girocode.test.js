import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidIban, normalizeIban, formatIban, giroPayload, isGiroReady } from "../../src/lib/girocode.js";

const IBAN = "DE89370400440532013000"; // Beispiel-IBAN aus der Bundesbank-Dokumentation

test("IBAN prüfen: gültig, mit Leerzeichen, klein geschrieben", () => {
  assert.ok(isValidIban(IBAN));
  assert.ok(isValidIban("de89 3704 0044 0532 0130 00"));
  assert.ok(isValidIban("AT611904300234573201")); // Österreich, 20 Stellen
  assert.ok(isValidIban("GB29 NWBK 6016 1331 9268 19")); // mit Buchstaben
});

test("IBAN prüfen: Tippfehler und falsche Längen fallen auf", () => {
  assert.ok(!isValidIban("DE89370400440532013001")); // eine Ziffer falsch
  assert.ok(!isValidIban("DE98370400440532013000")); // Prüfziffern vertauscht
  assert.ok(!isValidIban("DE8937040044053201300")); // eine Stelle zu kurz
  assert.ok(!isValidIban(""));
  assert.ok(!isValidIban("Hallo"));
});

test("IBAN normalisieren und lesbar formatieren", () => {
  assert.equal(normalizeIban(" de89 3704\t0044 "), "DE8937040044");
  assert.equal(formatIban(IBAN), "DE89 3704 0044 0532 0130 00");
});

test("GiroCode-Inhalt nach EPC-Standard", () => {
  assert.equal(
    giroPayload({ name: "Familie Müller", iban: "de89 3704 0044 0532 0130 00", cents: 418 }),
    "BCD\n002\n1\nSCT\n\nFamilie Müller\nDE89370400440532013000\nEUR4.18\n\n\nSchafland Einkauf",
  );
});

test("GiroCode: Zeilenumbrüche und Überlängen werden entschärft", () => {
  const p = giroPayload({ name: "Zeile1\nZeile2" + "x".repeat(100), iban: IBAN, cents: 100, text: "Danke\r\nfür alles" });
  const fields = p.split("\n");
  assert.equal(fields.length, 11);
  assert.equal(fields[5].length, 70);
  assert.ok(fields[5].startsWith("Zeile1 Zeile2"));
  assert.equal(fields[10], "Danke für alles");
});

test("GiroCode: leerer Verwendungszweck → Standardtext; Betrag muss passen", () => {
  assert.ok(giroPayload({ name: "A", iban: IBAN, cents: 1, text: "  " }).endsWith("\nSchafland Einkauf"));
  assert.ok(giroPayload({ name: "A", iban: IBAN, cents: 123456 }).includes("\nEUR1234.56\n"));
  assert.throws(() => giroPayload({ name: "A", iban: IBAN, cents: 0 }), RangeError);
});

test("GiroCode nur nutzbar mit Schalter, Name und gültiger IBAN", () => {
  assert.ok(isGiroReady({ giroEnabled: true, giroName: "Familie", giroIban: IBAN }));
  assert.ok(!isGiroReady({ giroEnabled: false, giroName: "Familie", giroIban: IBAN }));
  assert.ok(!isGiroReady({ giroEnabled: true, giroName: "  ", giroIban: IBAN }));
  assert.ok(!isGiroReady({ giroEnabled: true, giroName: "Familie", giroIban: "DE00123" }));
});
