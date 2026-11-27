/**
 * Merkt sich pro Code, wann er zuletzt im Kamerabild war. Derselbe Code zählt erst wieder,
 * wenn er so lange (ms) nicht mehr zu sehen war, auch wenn dazwischen andere Codes kamen
 * (Wasser → Limo → Wasser in einer Sekunde zählt Wasser nur einmal).
 *
 * sehen(code, now, addOn) → { same, lateAddOn }
 *   same: Code war eben noch zu sehen (nicht neu zählen)
 *   lateAddOn: der Zusatzcode (Ausgabe einer Zeitschrift) kam erst in einem späteren Bild
 */
export function codeSperre(ms) {
  const seen = new Map(); // code → { at, addOn }
  return function sehen(code, now, addOn = "") {
    for (const [c, s] of seen) if (now - s.at >= ms) seen.delete(c);
    const prev = seen.get(code);
    seen.set(code, { at: now, addOn: addOn || prev?.addOn || "" });
    return { same: !!prev, lateAddOn: !!prev && !!addOn && !prev.addOn };
  };
}
