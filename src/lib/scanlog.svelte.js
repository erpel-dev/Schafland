import { kvGet, kvSet } from "./db.js";

const MAX_ENTRIES = 50;

/** Die letzten Scans mit Ergebnis und Antworten der Datenbanken, für den Eltern-Bereich. */
class ScanLog {
  entries = $state([]);

  async load() {
    this.entries = await kvGet("scanlog", []);
  }

  add(entry) {
    this.entries = [{ at: Date.now(), ...entry }, ...this.entries].slice(0, MAX_ENTRIES);
    kvSet("scanlog", $state.snapshot(this.entries)).catch(() => {});
  }

  clear() {
    this.entries = [];
    kvSet("scanlog", []).catch(() => {});
  }
}

export const scanLog = new ScanLog();
