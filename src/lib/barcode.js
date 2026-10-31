/**
 * Hauptcode und Zusatzcode trennen. Mit gelesenem Zusatzcode (EAN-2/EAN-5, z. B. Ausgabe einer
 * Zeitschrift oder Preis eines US-Buchs) hängt er hinten am Text: "419914840700323" → "4199148407003" + "23".
 */
export function splitAddOn(result) {
  let addOn = "";
  try {
    addOn = JSON.parse(result.extra || "{}").EanAddOn ?? "";
  } catch {
    // kein Zusatzcode
  }
  let text = addOn && result.text.endsWith(addOn) ? result.text.slice(0, -addOn.length) : result.text;
  // EAN-13 hat immer 13 Ziffern; was dahinter hängt, ist Zusatzcode
  if (result.format === "EAN13" && /^\d{14,}$/.test(text)) text = text.slice(0, 13);
  // Zusatzcodes haben genau 2 oder 5 Ziffern, halb gelesene verwerfen
  if (!/^(\d{2}|\d{5})$/.test(addOn)) addOn = "";
  return { text, addOn, format: result.format };
}
