import { plain } from "./money.js";

/**
 * GiroCode / EPC-QR-Code (European Payments Council, Version 002): eine SEPA-Überweisung,
 * die Banking-Apps per „Foto-Überweisung“ vorausfüllen. Die Überweisung muss in der App
 * bestätigt werden; der Code selbst bewegt kein Geld.
 */

export const MAX_NAME = 70; // Länge Empfängername laut Standard
export const MAX_TEXT = 140; // Länge Verwendungszweck laut Standard
export const DEFAULT_TEXT = "Schafland Einkauf";

/** "de89 3704 0044 0532 0130 00" → "DE89370400440532013000" */
export const normalizeIban = (iban) => String(iban ?? "").replace(/\s+/g, "").toUpperCase();

/** IBAN mit 2 Buchstaben Land, 2 Prüfziffern, max. 30 Zeichen; Prüfsumme modulo 97 muss 1 ergeben. */
export function isValidIban(raw) {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

/** "DE89370400440532013000" → "DE89 3704 0044 0532 0130 00" */
export const formatIban = (iban) => normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();

/** Zeichen, die im Code nicht vorkommen dürfen (Zeilenumbrüche trennen die Felder). */
const clean = (text, max) => String(text ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

export function isGiroReady({ giroEnabled, giroName, giroIban }) {
  return !!giroEnabled && clean(giroName, MAX_NAME).length > 0 && isValidIban(giroIban);
}

/**
 * Inhalt des GiroCodes. Felder durch Zeilenumbruch getrennt:
 * BCD · 002 · 1 (UTF-8) · SCT · BIC (leer) · Name · IBAN · Betrag · Zweck-Code · Referenz · Verwendungszweck
 */
export function giroPayload({ name, iban, cents, text = DEFAULT_TEXT }) {
  if (!(cents >= 1 && cents <= 99999999999)) throw new RangeError("Betrag außerhalb des erlaubten Bereichs");
  return ["BCD", "002", "1", "SCT", "", clean(name, MAX_NAME), normalizeIban(iban), `EUR${plain(cents)}`, "", "", clean(text, MAX_TEXT) || DEFAULT_TEXT].join("\n");
}
