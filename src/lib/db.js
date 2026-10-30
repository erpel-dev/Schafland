import Dexie from "dexie";

// products: nur gescannte Produkte (Open Food Facts). Der eigene Katalog steht in catalog.js.
// kv: Einstellungen und der gespeicherte Musik-Ordner (FileSystemDirectoryHandle).
export const db = new Dexie("schafland");
db.version(1).stores({
  products: "id, &ean, categoryId",
  receipts: "++id, createdAt",
  kv: "key",
});

export async function kvGet(key, fallback) {
  const row = await db.kv.get(key);
  return row ? row.value : fallback;
}

export function kvSet(key, value) {
  return db.kv.put({ key, value });
}
