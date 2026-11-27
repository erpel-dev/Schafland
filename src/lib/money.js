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

// Münzen und Scheine, die die Kasse bei einer Pfand-Auszahlung herausgibt (größte zuerst)
const STUECKE = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

/** 60 → [{ cents: 50, anzahl: 1, schein: false }, { cents: 10, anzahl: 1, schein: false }] */
export function muenzen(cents) {
  let rest = Math.max(0, Math.round(cents));
  const out = [];
  for (const c of STUECKE) {
    const anzahl = Math.floor(rest / c);
    if (anzahl) out.push({ cents: c, anzahl, schein: c >= 500 });
    rest -= anzahl * c;
  }
  return out;
}

/** 50 → "50 Cent", 200 → "2 Euro" */
export const stueckName = (c) => (c >= 100 ? `${c / 100} Euro` : `${c} Cent`);
