// „Frag das Schaf“: Zuhören → Spracherkennung → verstehen → antworten (vorlesen + Sprechblase).
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import { products, categories } from "../catalog.js";
import { aktionById } from "../aktionen.js";
import { cart, scanned } from "../shop.svelte.js";
import { settings } from "../settings.svelte.js";
import { music } from "../music.svelte.js";
import { kvGet, kvSet } from "../db.js";
import { pop, unlockAudio } from "../sounds.js";
import { understand } from "./verstehen.js";
import { answer } from "./antworten.js";
import { record } from "./aufnahme.js";
import { speak, stopSpeaking } from "./sprechen.js";

export const MODELLE = {
  base: { id: "onnx-community/whisper-base", name: "Genau", mb: 80, info: "versteht besser, braucht 1–3 Sekunden" },
  tiny: { id: "onnx-community/whisper-tiny", name: "Schnell", mb: 40, info: "für langsame Geräte, versteht weniger" },
};

const abs = (url) => new URL(url, location.href).href;

class FragDasSchaf {
  phase = $state("idle"); // idle | loading | listening | thinking | answer | error
  progress = $state(0); // 0…1 beim ersten Laden des Modells
  level = $state(0); // Lautstärke beim Zuhören
  heard = $state(""); // was die Spracherkennung verstanden hat
  reply = $state(null); // { say, choices?, offerAdd?, added?, retry? }
  error = $state("");
  modelReady = $state(false);
  log = $state([]); // die letzten Fragen, für den Eltern-Bereich
  lastMs = $state(0); // Dauer der letzten Erkennung

  #worker = null;
  #seq = 0;
  #pending = new Map();
  #recording = null;
  #musicWasOn = false;

  async restore() {
    this.log = await kvGet("sprachLog", []);
  }

  #call(msg, onProgress) {
    if (!this.#worker) {
      this.#worker = new Worker(new URL("./erkennung.worker.js", import.meta.url), { type: "module" });
      this.#worker.onmessage = ({ data }) => {
        const p = this.#pending.get(data.id);
        if (!p) return;
        if (data.type === "progress") return p.onProgress?.(data);
        this.#pending.delete(data.id);
        if (data.type === "error") p.reject(new Error(data.message));
        else p.resolve(data);
      };
    }
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, onProgress });
      this.#worker.postMessage({ id, ...msg }, msg.audio ? [msg.audio.buffer] : []);
    });
  }

  /** Lädt das Erkennungsmodell (beim ersten Mal aus dem Internet, danach aus dem Speicher). */
  async loadModel() {
    if (globalThis.__schafFakeErkennung) return void (this.modelReady = true); // Tests ohne Modell
    const model = MODELLE[settings.value.fragModell] ?? MODELLE.base;
    this.progress = 0;
    await this.#call({ type: "load", model: model.id, wasm: { wasm: abs(ortWasm), mjs: abs(ortMjs) } }, ({ loaded, total }) => {
      this.progress = total ? loaded / total : 0;
    });
    this.modelReady = true;
    this.progress = 1;
  }

  /** Modell neu laden, z. B. nach einem Wechsel zwischen „Genau“ und „Schnell“. */
  resetModel() {
    this.#worker?.terminate();
    this.#worker = null;
    this.#pending.clear();
    this.modelReady = false;
  }

  /** Knopf „Frag das Schaf“: zuhören, verstehen, antworten. Nochmal tippen beendet das Zuhören. */
  async ask() {
    if (this.phase === "listening") return this.#recording?.stop();
    if (this.phase === "loading" || this.phase === "thinking") return;
    unlockAudio();
    stopSpeaking();
    this.error = "";
    this.reply = null;
    this.heard = "";
    this.#pauseMusic();
    try {
      if (!this.modelReady) {
        this.phase = "loading";
        await this.loadModel();
      }
      this.phase = "listening";
      this.#recording = await record({ onLevel: (l) => (this.level = l) });
      const { audio, heardVoice } = await this.#recording.done;
      this.#recording = null;
      if (this.phase !== "listening") return; // inzwischen geschlossen
      let text = "";
      if (heardVoice && audio.length > 1600) {
        this.phase = "thinking";
        const fake = globalThis.__schafFakeErkennung;
        const out = fake ? { text: await fake(audio), ms: 0 } : await this.#call({ type: "transcribe", audio });
        text = out.text;
        this.lastMs = out.ms;
      }
      if (this.phase !== "thinking" && this.phase !== "listening") return;
      await this.hear(text);
    } catch (err) {
      console.warn("Frag das Schaf", err);
      this.phase = "error";
      this.error = describe(err);
      this.#resumeMusic();
    }
  }

  /** Was würde das Schaf antworten? Ohne Vorlesen und ohne den Korb zu ändern (Eltern-Bereich). */
  preview(text) {
    return this.#resolve(text);
  }

  /** Alle Produkte, nach denen gefragt werden kann. */
  get pool() {
    const aktion = aktionById(settings.value.aktion);
    return [...(aktion ? aktion.products : []), ...products, ...scanned.list];
  }

  #resolve(text) {
    const aktion = aktionById(settings.value.aktion);
    const pool = this.pool;
    const cats = [...(aktion ? [aktion.category] : []), ...categories];
    const result = understand(text, { products: pool, categories: cats, aliases: settings.value.sprachAliases ?? [] });
    const categoryProducts = result.category
      ? aktion && result.category.id === aktion.category.id
        ? aktion.products
        : products.filter((p) => p.categoryId === result.category.id)
      : [];
    return { result, reply: answer(result, { cartCount: cart.count, cartTotal: cart.totalCents, categoryProducts }) };
  }

  /** Versteht einen Satz und antwortet (auch für Tests: ohne Mikrofon). */
  async hear(text) {
    const { result, reply } = this.#resolve(text);
    if (reply.added) {
      pop();
      cart.add(reply.added);
    }
    this.heard = text;
    this.reply = reply;
    this.phase = "answer";
    this.#remember({ text, intent: result.intent, product: result.product?.name.replace(/\u00ad/g, "") ?? null, category: result.category?.name ?? null });
    await speak(reply.say);
    if (this.phase === "answer") this.#resumeMusic();
    return reply;
  }

  /** „Ja, in den Korb“ */
  async confirmAdd(product) {
    pop();
    cart.add(product);
    const reply = answer({ intent: "add", product, candidates: [] });
    this.reply = reply;
    await speak(reply.say);
  }

  /** Bild aus der Auswahl angetippt: wie „Was kostet …?“. Die Eltern sehen die Zuordnung im Protokoll. */
  async choose(product) {
    const heard = this.heard;
    const reply = answer({ intent: "product", product, candidates: [] });
    this.reply = reply;
    if (heard) this.#remember({ text: heard, intent: "gewählt", product: product.name.replace(/\u00ad/g, ""), productId: product.id });
    await speak(reply.say);
  }

  close() {
    this.#recording?.stop();
    stopSpeaking();
    this.phase = "idle";
    this.reply = null;
    this.level = 0;
    this.#resumeMusic();
  }

  /** Eltern: „Wenn das Kind X sagt, ist Y gemeint.“ */
  addAlias(heard, productId) {
    const aliases = (settings.value.sprachAliases ?? []).filter((a) => a.heard !== heard);
    settings.set({ sprachAliases: [...aliases, { heard, productId }] });
  }

  removeAlias(heard) {
    settings.set({ sprachAliases: (settings.value.sprachAliases ?? []).filter((a) => a.heard !== heard) });
  }

  clearLog() {
    this.log = [];
    kvSet("sprachLog", []);
  }

  #remember(entry) {
    this.log = [{ at: Date.now(), ...entry }, ...this.log].slice(0, 40);
    kvSet("sprachLog", $state.snapshot(this.log));
  }

  #pauseMusic() {
    this.#musicWasOn = music.playing;
    if (music.playing) music.pause();
  }

  #resumeMusic() {
    if (this.#musicWasOn) music.play();
    this.#musicWasOn = false;
  }
}

function describe(err) {
  const name = err?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Das Mikrofon ist nicht erlaubt. Im Eltern-Bereich oder in den Browser-Einstellungen freigeben.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Kein Mikrofon gefunden.";
  if (/fetch|network|Failed to|load/i.test(err?.message ?? "")) return "Die Ohren des Schafs konnten nicht geladen werden. Beim ersten Mal braucht es Internet.";
  return "Das hat nicht geklappt. Nochmal versuchen?";
}

export const schaf = new FragDasSchaf();

// Für Tests und zum Ausprobieren ohne Mikrofon: __fragDasSchaf.hear("Was kostet die Banane?")
globalThis.__fragDasSchaf = schaf;
