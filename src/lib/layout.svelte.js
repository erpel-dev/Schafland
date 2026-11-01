// Bildschirmform: schmal = Handy hochkant (Korb als Leiste unten), niedrig = Handy quer.
// Die Grenzen passen zu den CSS-Abfragen in den Komponenten (@media (max-width: 760px) usw.).
const NARROW = "(max-width: 760px)";
const SHORT = "(max-height: 500px)";

class Layout {
  narrow = $state(false);
  short = $state(false);

  constructor() {
    if (typeof window === "undefined" || !window.matchMedia) return;
    for (const [key, query] of [["narrow", NARROW], ["short", SHORT]]) {
      const mq = window.matchMedia(query);
      this[key] = mq.matches;
      mq.addEventListener("change", (e) => (this[key] = e.matches));
    }
  }
}

export const layout = new Layout();
