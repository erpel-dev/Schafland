import { ownEan } from "./ean.js";

// Aktionen: eigenes Aussehen und ein eigener Reiter mit Aktionsprodukten.
// Etiketten-Codes ab Kategorie 50 (2150…), damit sie nie mit dem normalen Sortiment kollidieren.
// Neue Aktionen hinten anhängen, neue Produkte hinten in die Liste: die Codes hängen von der Position ab.
const FIRST_CATEGORY_NO = 50;

const raw = [
  {
    id: "halloween",
    name: "Halloween",
    emoji: "🎃",
    description: "Gruselige Nacht in Schafland: Nachthimmel mit Fledermäusen, Kürbis-Farben und Schafe mit Hexenhut.",
    // [Name, Emoji, Preis in Cent]
    products: [
      ["Kürbis", "🎃", 150], ["Gespenster-Marshmallows", "👻", 120], ["Fledermaus-Kekse", "🦇", 90],
      ["Spinnen-Lolli", "🕷️", 50], ["Hexenhut", "🧙", 300], ["Monster-Gummis", "👾", 80],
      ["Vampir-Zähne", "🧛", 60], ["Grusel-Kerze", "🕯️", 200], ["Kürbissuppe", "🍲", 220],
      ["Totenkopf-Schokolade", "💀", 99], ["Zauberbesen", "🧹", 250], ["Süßes-oder-Saures-Tüte", "🛍️", 150],
    ],
  },
];

export const aktionen = raw.map((a, ai) => ({
  id: a.id,
  name: a.name,
  emoji: a.emoji,
  description: a.description,
  // Reiter im Regal; zählt wie eine Kategorie
  category: { id: a.id, name: a.name, emoji: a.emoji, defaultPrice: 100, aktion: true },
  products: a.products.map(([name, emoji, priceCents], pi) => ({
    id: `${a.id}-${pi + 1}`,
    name,
    emoji,
    icon: null,
    priceCents,
    categoryId: a.id,
    ean: ownEan(FIRST_CATEGORY_NO + ai, pi + 1),
    source: "eigen",
  })),
}));

export const aktionById = (id) => aktionen.find((a) => a.id === id) ?? null;
