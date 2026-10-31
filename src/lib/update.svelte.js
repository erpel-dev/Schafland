import { registerSW } from "virtual:pwa-register";

/**
 * Neue Version nach git pull: Der Offline-Speicher (Service Worker) liefert beim Start zuerst die
 * alte Version und lädt die neue im Hintergrund. Sobald sie bereit ist, wird sie aktiviert:
 * sofort, solange der Startbildschirm steht, sonst in der nächsten Pause (nach dem Bezahlen).
 */
class Update {
  ready = $state(false);
  #activate = null;

  init() {
    if (!("serviceWorker" in navigator)) return;
    this.#activate = registerSW({
      immediate: true,
      onNeedRefresh: () => (this.ready = true),
    });
  }

  /** Neue Version aktivieren und neu laden, falls eine bereitliegt. */
  apply() {
    if (this.ready && this.#activate) this.#activate(true);
  }
}

export const update = new Update();
