const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** 418 → "4,18 €" */
export const euro = (cents) => fmt.format(cents / 100);

const num = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 418 → "4,18" (ohne Währung, für Spalten) */
export const amount = (cents) => num.format(cents / 100);

/** 418 → "4,18 €" mit normalem Leerzeichen (für Texte außerhalb der App, z. B. im QR-Code) */
export const euroText = (cents) => euro(cents).replace(/\u00a0/g, " ");

/** 418 → "4.18" (für PayPal-Links) */
export const plain = (cents) => (cents / 100).toFixed(2);
