import Dexie from "dexie";

// products: nur gescannte Produkte (Open Food Facts). Der eigene Katalog steht in catalog.js.
// kv: Einstellungen und der gespeicherte Musik-Ordner (FileSystemDirectoryHandle).
// songs: importierte Lieder, wo es keine Ordnerauswahl gibt (Android-App, Firefox).
export const db = new Dexie("schafland");
db.version(1).stores({
  products: "id, &ean, categoryId",
  receipts: "++id, createdAt",
  kv: "key",
});
db.version(2).stores({ songs: "++id, name" });

export async function kvGet(key, fallback) {
  const row = await db.kv.get(key);
  return row ? row.value : fallback;
}

export function kvSet(key, value) {
  return db.kv.put({ key, value });
}
