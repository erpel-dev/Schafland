import { BOOK } from "./catalog.js";
import { getJson, fetchImage } from "./net.js";

/** Bücher: EAN mit Präfix 978 oder 979 ist zugleich die ISBN-13. */
export const isBookEan = (ean) => /^97[89]\d{10}$/.test(ean);

/**
 * Alle möglichen Schreibweisen der ISBN mit Bindestrichen (Präfix-Gruppe-Verlag-Titel-Prüfziffer).
 * Wo die Striche stehen, hängt von Land und Verlag ab; Wikidata speichert die richtige Schreibweise.
 * Gruppen mit 1 bis 3 Ziffern decken fast alle Bücher ab (3 = deutschsprachig).
 */
export function isbnHyphenations(ean) {
  if (!isBookEan(ean)) return [];
  const prefix = ean.slice(0, 3);
  const body = ean.slice(3, 12);
  const out = [];
  for (let g = 1; g <= 3; g++) {
    for (let p = 1; g + p < 9; p++) out.push(`${prefix}-${body.slice(0, g)}-${body.slice(g, g + p)}-${body.slice(g + p)}-${ean[12]}`);
  }
  return out;
}

const httpsUrl = (url) => url?.replace(/^http:/, "https:").replace(/&edge=curl/, "") || null;

function bookProduct(ean, { title, authors = [], publisher = "", imageUrl, imageBlob, source }) {
  return {
    id: `book-${ean}`,
    ean,
    name: title,
    brand: authors.slice(0, 2).join(", ") + (authors.length > 2 ? " u. a." : ""),
    quantity: publisher,
    emoji: BOOK.emoji,
    categoryId: BOOK.id,
    priceCents: BOOK.defaultPrice,
    imageUrl,
    imageBlob,
    source,
    createdAt: Date.now(),
  };
}

/** Google Books (ohne API-Schlüssel). Wirft NetworkError/ServiceError wie getJson. */
export async function lookupGoogleBooks(ean, { timeoutMs = 8000, trace = [] } = {}) {
  let data;
  try {
    data = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${ean}&maxResults=3&printType=books`, { timeoutMs });
  } catch (err) {
    trace.push(`books.google.com: ${err.message}`);
    throw err;
  }
  // Die Suche ist unscharf: nur einen Treffer nehmen, dessen ISBN wirklich passt
  const item = (data?.items ?? []).find((it) => {
    const ids = it.volumeInfo?.industryIdentifiers;
    return !ids?.length || ids.some((x) => x.type === "ISBN_13" && x.identifier === ean);
  });
  const info = item?.volumeInfo;
  if (!info?.title) {
    trace.push("books.google.com: nicht gefunden");
    return null;
  }
  trace.push("books.google.com: gefunden");
  const imageUrl = httpsUrl(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail);
  return bookProduct(ean, {
    title: info.title.trim(),
    authors: info.authors ?? [],
    publisher: info.publisher ?? "",
    imageUrl,
    imageBlob: imageUrl ? await fetchImage(imageUrl) : null,
    source: "books.google.com",
  });
}

/** Open Library (Internet Archive). Wirft NetworkError/ServiceError wie getJson. */
export async function lookupOpenLibrary(ean, { timeoutMs = 8000, trace = [] } = {}) {
  let data;
  try {
    data = await getJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${ean}&format=json&jscmd=data`, { timeoutMs });
  } catch (err) {
    trace.push(`openlibrary.org: ${err.message}`);
    throw err;
  }
  const book = data?.[`ISBN:${ean}`];
  if (!book?.title) {
    trace.push("openlibrary.org: nicht gefunden");
    return null;
  }
  trace.push("openlibrary.org: gefunden");
  const imageUrl = book.cover?.medium ?? book.cover?.small ?? null;
  return bookProduct(ean, {
    title: book.title.trim(),
    authors: (book.authors ?? []).map((a) => a.name).filter(Boolean),
    publisher: book.publishers?.[0]?.name ?? "",
    imageUrl,
    imageBlob: imageUrl ? await fetchImage(imageUrl) : null,
    source: "openlibrary.org",
  });
}
