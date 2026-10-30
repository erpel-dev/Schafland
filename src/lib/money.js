const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** 418 → "4,18 €" */
export const euro = (cents) => fmt.format(cents / 100);

/** 418 → "4.18" (für PayPal-Links) */
export const plain = (cents) => (cents / 100).toFixed(2);
