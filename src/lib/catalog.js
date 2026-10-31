import { ownEan } from "./ean.js";

export const categories = [
  { id: "obst", name: "Obst", emoji: "🍎", defaultPrice: 60 },
  { id: "gemuese", name: "Gemüse", emoji: "🥕", defaultPrice: 50 },
  { id: "milch", name: "Milch", emoji: "🥛", defaultPrice: 120 },
  { id: "backwaren", name: "Backwaren", emoji: "🍞", defaultPrice: 90 },
  { id: "suesses", name: "Süßes", emoji: "🍬", defaultPrice: 99 },
  { id: "getraenke", name: "Getränke", emoji: "🧃", defaultPrice: 110 },
];

export const SCANNED = { id: "gescannt", name: "Gescannt", emoji: "📦", defaultPrice: 100 };

// Nur für gescannte Produkte (kein eigener Reiter im Regal)
export const MAGAZINE = { id: "zeitschrift", name: "Zeitschrift", emoji: "📰", defaultPrice: 350 };

export const categoryById = (id) => categories.find((c) => c.id === id) ?? (id === MAGAZINE.id ? MAGAZINE : SCANNED);

// [Name, Emoji, Preis in Cent]
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
  ],
  suesses: [
    ["Schokolade", "🍫", 99], ["Bonbons", "🍬", 50], ["Lolli", "🍭", 40], ["Keks", "🍪", 30],
    ["Donut", "🍩", 120], ["Honig", "🍯", 350], ["Popcorn", "🍿", 150],
  ],
  getraenke: [
    ["Saft", "🧃", 110], ["Wasser", "💧", 50], ["Kakao", "☕", 130], ["Tee", "🍵", 150],
    ["Limo", "🥤", 120], ["Kokosnuss", "🥥", 200],
  ],
};

export const products = categories.flatMap((cat, ci) =>
  raw[cat.id].map(([name, emoji, priceCents], pi) => ({
    id: `${cat.id}-${pi + 1}`,
    name,
    emoji,
    priceCents,
    categoryId: cat.id,
    ean: ownEan(ci + 1, pi + 1),
    source: "eigen",
  })),
);

export const productByEan = new Map(products.map((p) => [p.ean, p]));
