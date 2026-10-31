import { MAGAZINE } from "./catalog.js";

/**
 * Deutscher Pressecode: 414/419 + 5 Ziffern Titelnummer + 4 Ziffern Verkaufspreis in Cent + Prüfziffer.
 * Beispiel c't: 419 91484 0700 3 → Titel 91484, 7,00 €.
 * Solche Codes stehen in keiner freien Datenbank, enthalten aber den Preis.
 */
export const isPressCode = (ean) => /^41[49]\d{10}$/.test(ean);

const MIN_CENTS = 50;
const MAX_CENTS = 3000;

/** Preis in Cent aus dem Code, oder null wenn er nicht plausibel ist. */
export function pressPrice(ean) {
  if (!isPressCode(ean)) return null;
  const cents = Number(ean.slice(8, 12));
  return cents >= MIN_CENTS && cents <= MAX_CENTS ? cents : null;
}

/** Zeitschrift aus dem Pressecode. Der Name lässt sich im Eltern-Bereich ändern. */
export function pressProduct(ean, { issue = "" } = {}) {
  return {
    id: `presse-${ean}`,
    ean,
    name: "Zeitschrift",
    brand: issue ? `Ausgabe ${issue}` : "",
    quantity: `Titel ${ean.slice(3, 8)}`,
    emoji: MAGAZINE.emoji,
    categoryId: MAGAZINE.id,
    priceCents: pressPrice(ean) ?? MAGAZINE.defaultPrice,
    imageUrl: null,
    imageBlob: null,
    source: "Pressecode",
    createdAt: Date.now(),
  };
}
