/** Keine Verbindung. Weitere Datenbanken zu fragen lohnt dann nicht. */
export class NetworkError extends Error {}

/** Server gestört (überlastet, zu langsam, Wartung, kaputte Antwort). Nicht als "unbekannt" merken. */
export class ServiceError extends Error {}

const RETRY_DELAY_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Holt JSON und versucht es bei Störungen einmal erneut (nicht nach einer Zeitüberschreitung,
 * sonst wartet das Kind doppelt so lange).
 * Gibt null zurück, wenn der Server "nicht gefunden" meldet (HTTP 404).
 * Wirft NetworkError (keine Verbindung) oder ServiceError (zu langsam, HTTP 429/5xx, keine JSON-Antwort).
 */
export async function getJson(url, { timeoutMs = 8000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let error;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 404) return null;
      if (!res.ok) throw new ServiceError(res.status === 429 ? "zu viele Anfragen (429)" : `Serverfehler ${res.status}`);
      try {
        return await res.json();
      } catch {
        throw new ServiceError("keine gültige Antwort (Wartungsseite?)");
      }
    } catch (err) {
      if (err instanceof ServiceError) error = err;
      else if (err?.name === "TimeoutError") throw new ServiceError(`keine Antwort nach ${timeoutMs / 1000} s`);
      else error = new NetworkError("keine Verbindung");
    }
    if (attempt >= retries) throw error;
    await sleep(RETRY_DELAY_MS);
  }
}

/** Lädt ein Produktbild für den Offline-Speicher. Ohne CORS oder bei Störung bleibt nur die URL. */
export async function fetchImage(url, timeoutMs = 5000) {
  try {
    const res = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return await res.blob();
  } catch {
    // kein CORS, kein Netz oder zu langsam
  }
  return null;
}
