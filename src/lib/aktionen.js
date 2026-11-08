import { ownEan } from "./ean.js";

// Aktionen: eigenes Aussehen und ein eigener Reiter mit Aktionsprodukten.
// Etiketten-Codes ab Kategorie 50 (2150…), damit sie nie mit dem normalen Sortiment kollidieren.
// Neue Aktionen hinten anhängen, neue Produkte hinten in die Liste: die Codes hängen von der Position ab.
// \u00ad ist ein weiches Trennzeichen für lange Namen im Korb ("Weihnachts-baum").
const FIRST_CATEGORY_NO = 50;

const raw = [
  {
    id: "halloween",
    name: "Halloween",
    emoji: "🎃",
    description: "Gruselige Nacht in Schafland: Nachthimmel mit Fledermäusen, Kürbis-Farben und Schafe mit Hexenhut.",
    startText: "Halloween in Schafland",
    thanksText: "Süßes oder Saures!",
    ground: ["🎃", "🎃", "🎃"], // Deko auf der Wiese (Start)
    // [Name, Emoji, Preis in Cent]
    products: [
      ["Kürbis", "🎃", 150], ["Gespenster-Marsh\u00admallows", "👻", 120], ["Fledermaus-Kekse", "🦇", 90],
      ["Spinnen-Lolli", "🕷️", 50], ["Hexenhut", "🧙", 300], ["Monster-Gummis", "👾", 80],
      ["Vampir-Zähne", "🧛", 60], ["Grusel-Kerze", "🕯️", 200], ["Kürbissuppe", "🍲", 220],
      ["Totenkopf-Schoko\u00adlade", "💀", 99], ["Zauberbesen", "🧹", 250], ["Süßes-oder-Saures-Tüte", "🛍️", 150],
    ],
  },
  {
    id: "weihnachten",
    name: "Weihnachten",
    emoji: "🎄",
    description: "Winternacht in Schafland: Schneeflocken, Stern, verschneite Wiese, Weihnachtsrot und Schafe mit Weihnachtsmütze.",
    startText: "Weihnachten in Schafland",
    thanksText: "Frohe Weihnachten!",
    ground: ["🎄", "🎁", "🎄"],
    products: [
      ["Weihnachts\u00adbaum", "🎄", 500], ["Geschenk", "🎁", 300], ["Lebkuchen", "🍪", 80],
      ["Schoko-Nikolaus", "🎅", 150], ["Marzipan-Schnee\u00admann", "⛄", 120], ["Glöckchen", "🔔", 90],
      ["Weihnachts\u00adstern", "🌟", 200], ["Kuschel\u00adsocken", "🧦", 250], ["Mandarinen", "🍊", 180],
      ["Nüsse", "🌰", 120], ["Rentier-Kekse", "🦌", 90], ["Schlitten", "🛷", 400],
    ],
  },
  {
    id: "baustelle",
    name: "Baustellen- und Landmaschinen-Wochen",
    kurz: "Baustelle & Feld", // Reiter im Regal (der ganze Name ist dafür zu lang)
    emoji: "🚜",
    description: "Schafland wird zur Baustelle: Kran am Himmel, Warnstreifen, Baustellen-Orange, Schafe mit Bauhelm. Mit Baumaschinen, Landmaschinen und Werkstatt-Service.",
    startText: "Baustellen- und Landmaschinen-Wochen in Schafland",
    thanksText: "Danke! Gute Fahrt!",
    ground: ["🚜", "🚧", "🏗️"],
    // [Name, Emoji, Preis in Cent, eigenes Bild in public/produkte/ (wo es kein Emoji gibt)]
    products: [
      ["Traktor", "🚜", 450], ["Bagger", "🏗️", 600, "bagger"], ["Gabel\u00adstapler", "🏗️", 500, "gabelstapler"],
      ["Rüttel\u00adhüpfer", "🚧", 350, "ruettelhuepfer"], ["Mäh\u00addrescher", "🌾", 800, "maehdrescher"], ["Beton\u00admischer", "🚛", 550, "betonmischer"],
      ["Kipplaster", "🚚", 400], ["Baukran", "🏗️", 700], ["Bauhelm", "⛑️", 150],
      ["Warnweste", "🦺", 120], ["Ölwechsel", "🛢️", 300], ["Reifen\u00adwechsel", "🛞", 250],
      ["Fahrzeug\u00adwäsche", "🫧", 200], ["Inspektion", "🔧", 400],
    ],
  },
];

export const aktionen = raw.map((a, ai) => ({
  id: a.id,
  name: a.name,
  emoji: a.emoji,
  description: a.description,
  startText: a.startText,
  thanksText: a.thanksText,
  ground: a.ground,
  // Reiter im Regal; zählt wie eine Kategorie
  category: { id: a.id, name: a.kurz ?? a.name, emoji: a.emoji, defaultPrice: 100, aktion: true },
  products: a.products.map(([name, emoji, priceCents, icon], pi) => ({
    id: `${a.id}-${pi + 1}`,
    name,
    emoji,
    icon: icon ? `produkte/${icon}.svg` : null,
    priceCents,
    categoryId: a.id,
    ean: ownEan(FIRST_CATEGORY_NO + ai, pi + 1),
    source: "eigen",
  })),
}));

export const aktionById = (id) => aktionen.find((a) => a.id === id) ?? null;
