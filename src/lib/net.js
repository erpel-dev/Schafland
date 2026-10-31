/** Kein Internet oder Server antwortet nicht. Weitere Datenbanken zu fragen lohnt dann nicht. */
export class NetworkError extends Error {}

/** Holt JSON. Gibt null bei "nicht gefunden" (HTTP-Fehler) und wirft NetworkError ohne Verbindung. */
export async function getJson(url, timeoutMs) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new NetworkError(String(err));
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Lädt ein Produktbild für den Offline-Speicher. Ohne CORS bleibt nur die URL (online sichtbar). */
export async function fetchImage(url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) return await res.blob();
  } catch {
    // kein CORS oder kein Netz
  }
  return null;
}
