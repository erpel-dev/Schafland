// Kartenzahlung (src/lib/nfc.js): Starter am PC, Web NFC im Browser, Test-Attrappe.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { nfcInfo, watchCards, openNfcSettings } from "../../src/lib/nfc.js";

const realFetch = globalThis.fetch;
const realPermissions = Object.getOwnPropertyDescriptor(globalThis.navigator, "permissions");
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.__schafFakeNfc;
  delete globalThis.NDEFReader;
  delete globalThis.EventSource;
  if (realPermissions) Object.defineProperty(globalThis.navigator, "permissions", realPermissions);
  else delete globalThis.navigator.permissions;
});

const starter = (body, { status = 200 } = {}) => {
  const urls = [];
  globalThis.fetch = async (url, opts) => {
    urls.push({ url: String(url), opts });
    if (body instanceof Error) throw body;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return urls;
};
const permission = (state) =>
  Object.defineProperty(globalThis.navigator, "permissions", {
    configurable: true,
    value: { query: async ({ name }) => (assert.equal(name, "nfc"), typeof state === "function" ? state() : { state }) },
  });

class FakeReader {
  static last = null;
  constructor() {
    FakeReader.last = this;
  }
  async scan({ signal }) {
    this.signal = signal;
  }
}

class FakeEventSource {
  static last = null;
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    FakeEventSource.last = this;
    setTimeout(() => this.onopen?.(), 5);
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  close() {
    this.closed = true;
  }
}

test("Test-Attrappe: Angaben werden übernommen, Erlaubnis entscheidet über Antippen", async () => {
  globalThis.__schafFakeNfc = { granted: true };
  assert.deepEqual(await nfcInfo(), { available: true, enabled: true, needsTap: false });
  globalThis.__schafFakeNfc = { available: false, enabled: false };
  assert.deepEqual(await nfcInfo(), { available: false, enabled: false, needsTap: true });
  let stopped = false;
  let fire;
  globalThis.__schafFakeNfc = { watch: (onCard) => ((fire = onCard), () => (stopped = true)) };
  let cards = 0;
  const stop = await watchCards(() => cards++);
  fire();
  assert.equal(cards, 1);
  stop();
  assert.ok(stopped);
  globalThis.__schafFakeNfc = { watch: () => undefined };
  assert.equal(typeof (await watchCards(() => {})), "function", "ohne eigenes stop() trotzdem eine Funktion");
});

test("PC mit Starter: Leser gefunden → Karte über den Ereignis-Stream", async () => {
  const urls = starter({ starter: true, leser: ["Bawanfa NFC"] });
  const info = await nfcInfo();
  assert.deepEqual(info, { available: true, enabled: true, needsTap: false, pc: true, leser: ["Bawanfa NFC"] });
  assert.equal(urls[0].url, "/starter.json");
  assert.equal(urls[0].opts.cache, "no-store");

  globalThis.EventSource = FakeEventSource;
  let cards = 0;
  const stop = await watchCards(() => cards++);
  const es = FakeEventSource.last;
  assert.equal(es.url, "/__schafland/karte/warten");
  es.listeners.karte();
  es.listeners.karte();
  assert.equal(cards, 2);
  stop();
  assert.ok(es.closed);
});

test("PC ohne Leser oder ohne Starter: kein Kartenleser, Hinweis des Starters bleibt erhalten", async () => {
  starter({ starter: true, leser: [], fehler: "pcscd läuft nicht" });
  assert.deepEqual(await nfcInfo(), { available: false, enabled: false, needsTap: false, hinweis: "pcscd läuft nicht" });
  starter({ starter: false, leser: [] }); // App-Datei auf normalen Servern
  assert.deepEqual(await nfcInfo(), { available: false, enabled: false, needsTap: false, hinweis: "" });
  starter({ starter: true, leser: "kaputt" });
  assert.equal((await nfcInfo()).available, false);
  starter("nicht da", { status: 404 });
  assert.equal((await nfcInfo()).available, false);
  starter("<html>", { status: 200 }); // Wartungsseite statt JSON
  assert.equal((await nfcInfo()).available, false);
  starter(new TypeError("Failed to fetch"));
  assert.equal((await nfcInfo()).available, false);
});

test("Web NFC: schon erlaubt → ohne Antippen; sonst erst nach Antippen", async () => {
  starter({ starter: false, leser: [] });
  globalThis.NDEFReader = FakeReader;
  permission("granted");
  assert.deepEqual(await nfcInfo(), { available: true, enabled: true, needsTap: false });
  permission("prompt");
  assert.equal((await nfcInfo()).needsTap, true);
  permission(() => {
    throw new TypeError("nfc unbekannt");
  });
  assert.equal((await nfcInfo()).needsTap, true, "Berechtigungs-Abfrage geht nicht: nach Antippen");
});

test("Web NFC: lesbare und unlesbare Karten (Bankkarten) zählen beide; stop() beendet das Lesen", async () => {
  starter({ starter: false, leser: [] });
  globalThis.NDEFReader = FakeReader;
  let cards = 0;
  const stop = await watchCards(() => cards++);
  const r = FakeReader.last;
  r.onreading();
  r.onreadingerror();
  assert.equal(cards, 2);
  assert.equal(r.signal.aborted, false);
  stop();
  assert.equal(r.signal.aborted, true);
});

test("Einstellungen öffnen: im Browser ohne Wirkung", () => {
  assert.doesNotThrow(() => openNfcSettings());
});
