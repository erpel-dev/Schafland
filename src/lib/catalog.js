import { ownEan } from "./ean.js";
import { aktionen } from "./aktionen.js";

export const categories = [
  { id: "obst", name: "Obst", emoji: "🍎", defaultPrice: 60 },
  { id: "gemuese", name: "Gemüse", emoji: "🥕", defaultPrice: 50 },
  { id: "milch", name: "Milch", emoji: "🥛", defaultPrice: 120 },
  { id: "backwaren", name: "Backwaren", emoji: "🍞", defaultPrice: 90 },
  { id: "suesses", name: "Süßes", emoji: "🍬", defaultPrice: 99 },
  { id: "getraenke", name: "Getränke", emoji: "🧃", defaultPrice: 110 },
  // Neue Kategorien hinten anhängen: die Etiketten-Codes hängen von der Position ab
  { id: "spielzeug", name: "Spielzeug", emoji: "🧸", defaultPrice: 500 },
];

export const SCANNED = { id: "gescannt", name: "Gescannt", emoji: "📦", defaultPrice: 100 };

// Nur für gescannte Produkte (kein eigener Reiter im Regal)
export const MAGAZINE = { id: "zeitschrift", name: "Zeitschrift", emoji: "📰", defaultPrice: 350 };

export const BOOK = { id: "buch", name: "Buch", emoji: "📚", defaultPrice: 500 };

const scannedKinds = [MAGAZINE, BOOK];
export const categoryById = (id) =>
  categories.find((c) => c.id === id) ?? scannedKinds.find((c) => c.id === id) ?? aktionen.find((a) => a.id === id)?.category ?? SCANNED;

// [Name, Emoji, Preis in Cent, eigenes Bild in public/produkte/ (optional, wenn kein passendes Emoji existiert)]
const raw = {
  obst: [
    ["Apfel", "🍎", 50], ["Banane", "🍌", 30], ["Birne", "🍐", 60], ["Trauben", "🍇", 200],
    ["Erdbeeren", "🍓", 250], ["Orange", "🍊", 40], ["Melone", "🍉", 300], ["Zitrone", "🍋", 30],
    ["Pfirsich", "🍑", 70], ["Kiwi", "🥝", 40], ["Kirschen", "🍒", 180], ["Ananas", "🍍", 250],
  ],
  gemuese: [
    ["Karotte", "🥕", 20], ["Tomate", "🍅", 30], ["Gurke", "🥒", 50], ["Paprika", "🫑", 60],
    ["Brokkoli", "🥦", 90], ["Mais", "🌽", 50], ["Kartoffeln", "🥔", 150], ["Salat", "🥬", 80],
    ["Zwiebel", "🧅", 20], ["Pilze", "🍄", 120], ["Aubergine", "🍆", 90], ["Knoblauch", "🧄", 30],
  ],
  milch: [
    ["Milch", "🥛", 110], ["Käse", "🧀", 220], ["Butter", "🧈", 190], ["Eier", "🥚", 250],
    ["Joghurt", "🥣", 60], ["Eis", "🍨", 300],
  ],
  backwaren: [
    ["Brot", "🍞", 250], ["Brezel", "🥨", 80], ["Croissant", "🥐", 90], ["Baguette", "🥖", 120],
    ["Muffin", "🧁", 150], ["Kuchen", "🍰", 200], ["Waffel", "🧇", 100], ["Pfannkuchen", "🥞", 150],
    // Neue Produkte immer hinten anhängen: die Etiketten-Codes hängen von der Position ab.
    // \u00ad ist ein weiches Trennzeichen: lange Namen dürfen dort umbrechen ("Laugen-brötchen").
    ["Brötchen", "🍞", 35, "broetchen"], ["Kaiser\u00adbrötchen", "🍞", 45, "kaiserbroetchen"],
    ["Körner\u00adbrötchen", "🍞", 65, "koernerbroetchen"], ["Laugen\u00adbrötchen", "🥨", 60, "laugenbroetchen"],
    ["Mohn\u00adbrötchen", "🍞", 50, "mohnbroetchen"], ["Sesam\u00adbrötchen", "🍞", 50, "sesambroetchen"],
  ],
  suesses: [
    ["Schokolade", "🍫", 99], ["Bonbons", "🍬", 50], ["Lolli", "🍭", 40], ["Keks", "🍪", 30],
    ["Donut", "🍩", 120], ["Honig", "🍯", 350], ["Popcorn", "🍿", 150],
  ],
  getraenke: [
    ["Saft", "🧃", 110], ["Wasser", "💧", 50], ["Kakao", "☕", 130], ["Tee", "🍵", 150],
    ["Limo", "🥤", 120], ["Kokosnuss", "🥥", 200],
  ],
  // Minecraft und Hot Wheels mit eigenen Bildern im typischen Stil, ohne Original-Logos oder -Figuren
  spielzeug: [
    ["Kuschelschaf", "🐑", 800, "kuschelschaf"], ["Schaf-Puzzle", "🧩", 500], ["Wollknäuel", "🧶", 200],
    ["Schaf-Bilder\u00adbuch", "📘", 600],
    ["Minecraft-Schwert", "⚔️", 600, "pixel-schwert"], ["Minecraft-Spitz\u00adhacke", "⛏️", 600, "pixel-spitzhacke"],
    ["Minecraft-Gras\u00adblock", "🟩", 400, "pixel-grasblock"], ["Minecraft-Diamant", "💎", 300, "pixel-diamant"],
    ["Hot-Wheels-Renn\u00adwagen", "🏎️", 250], ["Hot-Wheels-Monster\u00adtruck", "🛻", 400],
    ["Hot-Wheels-Renn\u00adbahn", "🛤️", 1200, "rennbahn"], ["Hot-Wheels-Polizei\u00adauto", "🚓", 250],
  ],
};

export const products = categories.flatMap((cat, ci) =>
  raw[cat.id].map(([name, emoji, priceCents, icon], pi) => ({
    id: `${cat.id}-${pi + 1}`,
    name,
    emoji,
    icon: icon ? `produkte/${icon}.svg` : null,
    priceCents,
    categoryId: cat.id,
    ean: ownEan(ci + 1, pi + 1),
    source: "eigen",
  })),
);

// Sortiment plus alle Aktionsprodukte: Aktions-Etiketten lassen sich auch scannen, wenn die Aktion aus ist
export const allProducts = [...products, ...aktionen.flatMap((a) => a.products)];

export const productByEan = new Map(allProducts.map((p) => [p.ean, p]));
