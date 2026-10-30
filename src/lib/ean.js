/** Prüfziffer für EAN-13 aus den ersten 12 Ziffern. */
export function checkDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

/**
 * Eigene Codes aus dem Präfix 21 ("restricted circulation"),
 * kollidieren nie mit echten Produkten: 21 KK PPP 00000 + Prüfziffer.
 */
export function ownEan(categoryNo, productNo) {
  const base = `21${String(categoryNo).padStart(2, "0")}${String(productNo).padStart(3, "0")}00000`;
  return base + checkDigit(base);
}

export function isValidEan(code) {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  if (code.length === 13) return checkDigit(code.slice(0, 12)) === code[12];
  return true;
}
