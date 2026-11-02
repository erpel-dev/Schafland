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
import { isOpenQuestion, buildMessages, checkAnswer, productImageQuestion, productImageFreeQuestion, matchImageAnswer } from "./ki.js";
import { topicOf, topicProducts } from "./wissen.js";

export const MODELLE = {
  small: { id: "onnx-community/whisper-small", name: "Sehr genau", mb: 250, info: "versteht am besten, braucht auf älteren Geräten 5–10 Sekunden" },
  base: { id: "onnx-community/whisper-base", name: "Genau", mb: 80, info: "versteht besser, braucht 1–3 Sekunden" },
  tiny: { id: "onnx-community/whisper-tiny", name: "Schnell", mb: 40, info: "für langsame Geräte, versteht weniger" },
};

// Stufe 2: Sprachmodelle für freie Fragen (Liquid AI, LFM Open License: privat frei nutzbar)
export const KI_MODELLE = {
  klein: { id: "LiquidAI/LFM2.5-350M-ONNX", name: "Klein", mb: 300, info: "LFM2.5 mit 350 Mio. Parametern. Für einfache Grafikkarten." },
  gross: { id: "onnx-community/LFM3-1.7B-ONNX", name: "Groß", mb: 1200, info: "LFM3 mit 1,7 Mrd. Parametern. Bessere Antworten, braucht 2 GB freien Grafikspeicher." },
};

/** Grafikkarte im Browser nutzbar? { webgpu, f16 } */
export async function gpuInfo() {
  // Nur für Tests: Sprachmodell auch auf dem Prozessor (dort 40–180 s pro Antwort, für Kinder zu langsam)
  if (globalThis.localStorage?.getItem("schaf-ki-cpu") === "1") return { webgpu: false, f16: false, cpuErlaubt: true };
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    return { webgpu: !!adapter, f16: !!adapter?.features?.has("shader-f16") };
  } catch {
    return { webgpu: false, f16: false };
  }
}

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

  // Stufe 2
  ki = $state("aus"); // aus | lädt | bereit | fehler
  kiProgress = $state(0);
  kiError = $state("");
  kiDevice = $state(""); // webgpu | wasm
  kiLastMs = $state(0);
  #ki = null;
  #kiSeq = 0;
  #kiPending = new Map();
  #kiLoad = null;

  // LFM3-Audio (Prototyp): zuhören und vorlesen mit einem Modell, nur mit Grafikkarte
  audio = $state("aus"); // aus | lädt | bereit | fehler
  audioProgress = $state(0);
  audioStatus = $state("");
  audioError = $state("");
  audioLastMs = $state({ asr: 0, tts: 0 });
  #audioWorker = null;
  #audioSeq = 0;
  #audioPending = new Map();
  #audioLoad = null;
  #player = null;

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
      const lfm3 = settings.value.audioModell && this.audio === "bereit";
      if (!lfm3 && !this.modelReady) {
        this.phase = "loading";
        await this.loadModel();
      }
      // Stufe 2 im Hintergrund vorbereiten (aus dem Speicher, wenn schon einmal geladen)
      if (settings.value.kiAn && this.ki === "aus" && !this.kiViaAudio) this.loadKi();
      this.phase = "listening";
      this.#recording = await record({ onLevel: (l) => (this.level = l) });
      const { audio, heardVoice } = await this.#recording.done;
      this.#recording = null;
      if (this.phase !== "listening") return; // inzwischen geschlossen
      let text = "";
      if (heardVoice && audio.length > 1600) {
        this.phase = "thinking";
        const fake = globalThis.__schafFakeErkennung;
        let out = null;
        if (fake) out = { text: await fake(audio), ms: 0 };
        else if (lfm3) {
          // LFM3-Audio hört zu; klappt es nicht, übernimmt Whisper
          out = await this.#audioCall({ type: "transcribe", audio: audio.slice() }).then((o) => {
            this.audioLastMs = { ...this.audioLastMs, asr: o.ms };
            return o;
          }, (err) => {
            console.warn("LFM3-Audio: Erkennung", err);
            return null;
          });
        }
        if (!out) {
          if (!this.modelReady) await this.loadModel();
          out = await this.#call({ type: "transcribe", audio });
        }
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
    // Fragen zu Eigenschaften („Was ist gesund?“, „Welches Obst ist gelb?“, „Ist die Banane gesund?“)
    const topic = topicOf(text);
    if (topic && ["unknown", "product", "category"].includes(result.intent)) {
      result.topic = topic;
      result.topicList = topicProducts(topic, pool, result.category?.id ?? null);
      result.intent = "topic";
    }
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
    // Stufe 2: offene Fragen an das Sprachmodell, wenn es eingeschaltet und geladen ist
    if (settings.value.kiAn && (this.ki === "bereit" || this.kiViaAudio) && isOpenQuestion(result)) {
      this.heard = text;
      this.reply = { say: "", streaming: true };
      this.phase = "answer";
      try {
        const ki = await this.askKi(text, (raw) => {
          if (this.reply?.streaming) this.reply = { say: raw, streaming: true };
        });
        if (this.phase !== "answer") return;
        if (ki) {
          this.reply = { say: ki.text, choices: ki.products, ki: true };
          this.#remember({ text, intent: "ki", product: ki.products.map((p) => p.name.replace(/\u00ad/g, "")).join(", ") || null, answer: ki.text });
          await this.#say(ki.text);
          if (this.phase === "answer") this.#resumeMusic();
          return this.reply;
        }
      } catch (err) {
        console.warn("Sprachmodell", err);
      }
      // nichts Brauchbares: Antwort aus Stufe 1
    }
    if (reply.added) {
      pop();
      cart.add(reply.added);
    }
    this.heard = text;
    this.reply = reply;
    this.phase = "answer";
    this.#remember({ text, intent: result.intent, product: result.product?.name.replace(/\u00ad/g, "") ?? null, category: result.category?.name ?? null });
    await this.#say(reply.say);
    if (this.phase === "answer") this.#resumeMusic();
    return reply;
  }

  /** „Ja, in den Korb“ */
  async confirmAdd(product) {
    pop();
    cart.add(product);
    const reply = answer({ intent: "add", product, candidates: [] });
    this.reply = reply;
    await this.#say(reply.say);
  }

  /** Bild aus der Auswahl angetippt: wie „Was kostet …?“. Die Eltern sehen die Zuordnung im Protokoll. */
  async choose(product) {
    const heard = this.heard;
    const reply = answer({ intent: "product", product, candidates: [] });
    this.reply = reply;
    if (heard) this.#remember({ text: heard, intent: "gewählt", product: product.name.replace(/\u00ad/g, ""), productId: product.id });
    await this.#say(reply.say);
  }

  #kiCall(msg, onEvent) {
    if (!this.#ki) {
      this.#ki = new Worker(new URL("./sprachmodell.worker.js", import.meta.url), { type: "module" });
      this.#ki.onmessage = ({ data }) => {
        const p = this.#kiPending.get(data.id);
        if (!p) return;
        if (data.type === "progress" || data.type === "token") return p.onEvent?.(data);
        this.#kiPending.delete(data.id);
        if (data.type === "error") p.reject(new Error(data.message));
        else p.resolve(data);
      };
    }
    const id = ++this.#kiSeq;
    return new Promise((resolve, reject) => {
      this.#kiPending.set(id, { resolve, reject, onEvent });
      this.#ki.postMessage({ id, ...msg });
    });
  }

  /** Lädt das Sprachmodell (Stufe 2). Mehrfach aufrufen ist harmlos. */
  loadKi() {
    if (this.ki === "bereit") return Promise.resolve();
    if (globalThis.__schafFakeKi) return void (this.ki = "bereit", (this.kiDevice = "test")); // Tests ohne Modell
    if (this.#kiLoad) return this.#kiLoad;
    this.#kiLoad = (async () => {
      const model = KI_MODELLE[settings.value.kiModell] ?? KI_MODELLE.klein;
      this.ki = "lädt";
      this.kiError = "";
      this.kiProgress = 0;
      try {
        const gpu = await gpuInfo();
        if (!gpu.webgpu && !gpu.cpuErlaubt) throw new Error("Freie Fragen brauchen eine Grafikkarte im Browser (WebGPU). Auf diesem Gerät beantwortet Stufe 1 die Fragen.");
        const device = gpu.webgpu ? "webgpu" : "wasm";
        const dtype = device === "webgpu" && gpu.f16 && model.id.includes("LFM3") ? "q4f16" : "q4";
        await this.#kiCall({ type: "load", model: model.id, dtype, device, wasm: { wasm: abs(ortWasm), mjs: abs(ortMjs) } }, ({ loaded, total }) => {
          this.kiProgress = total ? loaded / total : 0;
        });
        this.kiDevice = device;
        this.ki = "bereit";
      } catch (err) {
        console.warn("Sprachmodell", err);
        this.ki = "fehler";
        this.kiError = describeKi(err);
        this.#ki?.terminate();
        this.#ki = null;
        this.#kiPending.clear();
      } finally {
        this.#kiLoad = null;
      }
    })();
    return this.#kiLoad;
  }

  resetKi() {
    this.#ki?.terminate();
    this.#ki = null;
    this.#kiPending.clear();
    this.#kiLoad = null;
    this.ki = "aus";
  }

  /** Fragt das Sprachmodell; onText bekommt den Text, während er entsteht. Ergebnis: geprüfte Antwort oder null. */
  async askKi(question, onText = () => {}) {
    const messages = buildMessages(question, {
      products: this.pool,
      categories: [...(aktionById(settings.value.aktion) ? [aktionById(settings.value.aktion).category] : []), ...categories],
      cart: cart.lines,
    });
    let raw = "";
    const fake = globalThis.__schafFakeKi;
    if (fake) {
      raw = await fake(messages);
      onText(raw);
      return checkAnswer(raw, { products: this.pool });
    }
    // Ist LFM3-Audio geladen, antwortet es selbst: kein zweites Sprachmodell nötig
    if (this.kiViaAudio) {
      const timer = setTimeout(() => this.#audioCall({ type: "stop" }).catch(() => {}), 30000);
      try {
        const out = await this.#audioCall({ type: "chat", messages: $state.snapshot(messages) }, (e) => onText(e.text));
        this.kiLastMs = out.ms;
        return checkAnswer(out.text, { products: this.pool });
      } finally {
        clearTimeout(timer);
      }
    }
    const timer = setTimeout(() => this.#kiCall({ type: "stop" }).catch(() => {}), 30000);
    try {
      const out = await this.#kiCall({ type: "generate", messages: $state.snapshot(messages), maxNewTokens: 90 }, (e) => {
        raw += e.text;
        onText(raw);
      });
      this.kiLastMs = out.ms;
      return checkAnswer(out.text || raw, { products: this.pool });
    } finally {
      clearTimeout(timer);
    }
  }

  #audioCall(msg, onEvent) {
    if (!this.#audioWorker) {
      this.#audioWorker = new Worker(new URL("./audiomodell.worker.js", import.meta.url), { type: "module" });
      this.#audioWorker.onmessage = ({ data }) => {
        const p = this.#audioPending.get(data.id);
        if (!p) return;
        if (["progress", "status", "frame", "token"].includes(data.type)) return p.onEvent?.(data);
        this.#audioPending.delete(data.id);
        if (data.type === "error") {
          p.reject(new Error(data.message));
          // Speicher der Rechen-Engine übergelaufen: Modell im Hintergrund neu starten (aus dem Browser-Speicher)
          if (/memory access out of bounds|out of memory|Aborted|RuntimeError|unreachable/i.test(data.message)) this.#restartAudioModel(data.message);
        } else p.resolve(data);
      };
      this.#audioWorker.onerror = (e) => this.#restartAudioModel(e.message ?? "Absturz");
    }
    const id = ++this.#audioSeq;
    return new Promise((resolve, reject) => {
      this.#audioPending.set(id, { resolve, reject, onEvent });
      this.#audioWorker.postMessage({ id, ...msg }, msg.audio ? [msg.audio.buffer] : []);
    });
  }

  /** Beantwortet LFM3-Audio die freien Fragen? (dann wird kein eigenes Stufe-2-Modell geladen) */
  get kiViaAudio() {
    return settings.value.audioModell && this.audio === "bereit" && !globalThis.__schafFakeAudio;
  }

  /** Lädt LFM3-Omni (Eltern-Bereich). Beim ersten Mal ca. 2,6 GB. */
  loadAudioModel() {
    if (this.audio === "bereit") return Promise.resolve();
    if (this.#audioLoad) return this.#audioLoad;
    this.#audioLoad = (async () => {
      this.audio = "lädt";
      this.audioError = "";
      this.audioProgress = 0;
      try {
        if (globalThis.__schafFakeAudio) {
          // Tests: Modell ersetzt
          this.audio = "bereit";
          return;
        }
        await this.#audioCall({ type: "load" }, (e) => {
          if (e.type === "progress") this.audioProgress = e.total ? e.loaded / e.total : 0;
          if (e.type === "status") this.audioStatus = e.text;
        });
        this.audio = "bereit";
      } catch (err) {
        console.warn("LFM3-Audio", err);
        this.audio = "fehler";
        this.audioError = /WebGPU|Grafikkarte/.test(err?.message) ? "Dieses Gerät hat keine Grafikkarte im Browser (WebGPU)." : /memory|Memory|allocation|OOM|Array buffer/i.test(err?.message) ? "Zu wenig Speicher für LFM3-Omni auf diesem Gerät." : "LFM3-Omni ließ sich nicht starten: " + (err?.message ?? "").slice(0, 160);
        this.resetAudioModel(true);
      } finally {
        this.#audioLoad = null;
        this.audioStatus = "";
      }
    })();
    return this.#audioLoad;
  }

  audioRestarts = $state(0);

  #restartAudioModel(reason) {
    if (this.audio !== "bereit") return;
    console.warn("LFM3-Omni neu starten:", reason);
    this.audioRestarts++;
    for (const p of this.#audioPending.values()) p.reject(new Error("Modell wird neu gestartet"));
    this.resetAudioModel();
    setTimeout(() => this.loadAudioModel(), 500);
  }

  resetAudioModel(keepError = false) {
    this.#audioWorker?.terminate();
    this.#audioWorker = null;
    this.#audioPending.clear();
    this.#audioLoad = null;
    if (!keepError) this.audio = "aus";
  }

  /** Vorlesen: mit LFM3-Audio, wenn eingeschaltet und geladen, sonst mit der Stimme des Systems. */
  async #say(text) {
    if (settings.value.audioModell && settings.value.omniStimme && this.audio === "bereit" && !globalThis.__schafFakeAudio) {
      try {
        const out = await this.#audioCall({ type: "speak", text });
        this.audioLastMs = { ...this.audioLastMs, tts: out.ms };
        if (this.phase === "idle") return;
        await this.#play(out.wave, 24000);
        return;
      } catch (err) {
        console.warn("LFM3-Audio: Vorlesen", err);
      }
    }
    await speak(text);
  }

  /** Darf die Kamera Produkte ohne Strichcode erkennen? (LFM3-Omni geladen) */
  get canSeeProducts() {
    return settings.value.audioModell && this.audio === "bereit";
  }

  /**
   * Welches Produkt ist auf dem Kamerabild? images: { crop, full } (ImageData; crop = Bildmitte).
   * Versuche: Mitte mit Sortimentsliste → Mitte frei benennen → ganzes Bild mit Liste.
   * Ergebnis: { product, candidates, tries: [{ what, answer }], ms }
   */
  async recognizeProduct({ crop, full }) {
    // eigenes Sortiment und Aktionsprodukte (gescannte Produkte haben lange Markennamen)
    const aktion = aktionById(settings.value.aktion);
    const pool = [...(aktion ? aktion.products : []), ...products];
    const t0 = performance.now();
    const tries = [];
    const candidates = [];
    const attempts = [
      ["Bildmitte, Liste", crop, productImageQuestion(pool)],
      ["Bildmitte, frei", crop, productImageFreeQuestion()],
      ["ganzes Bild, Liste", full, productImageQuestion(pool)],
    ];
    for (const [what, image, { system, question }] of attempts) {
      if (!image) continue;
      let answer;
      if (globalThis.__schafFakeAudio?.image) answer = await globalThis.__schafFakeAudio.image(question, what);
      else {
        const out = await this.#audioCall({ type: "image", rgba: new Uint8ClampedArray(image.data), width: image.width, height: image.height, system, question });
        answer = out.text;
      }
      tries.push({ what, answer });
      const m = matchImageAnswer(answer, pool);
      if (m.product) {
        this.audioLastMs = { ...this.audioLastMs, bild: Math.round(performance.now() - t0) };
        return { product: m.product, candidates: m.candidates, tries, ms: performance.now() - t0 };
      }
      for (const c of m.candidates) if (!candidates.includes(c)) candidates.push(c);
    }
    this.audioLastMs = { ...this.audioLastMs, bild: Math.round(performance.now() - t0) };
    return { product: null, candidates: candidates.slice(0, 3), tries, ms: performance.now() - t0 };
  }

  /** Probe im Eltern-Bereich */
  async sayWithAudioModel(text) {
    const out = await this.#audioCall({ type: "speak", text });
    this.audioLastMs = { ...this.audioLastMs, tts: out.ms };
    await this.#play(out.wave, 24000);
  }

  async #play(wave, rate) {
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(1, wave.length, rate);
    buf.copyToChannel(wave, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    this.#player = { ctx, src };
    await new Promise((resolve) => {
      src.onended = resolve;
      src.start();
    });
    ctx.close().catch(() => {});
    this.#player = null;
  }

  close() {
    try {
      this.#player?.src.stop();
    } catch {
      // schon zu Ende
    }
    if (this.ki === "bereit") this.#kiCall({ type: "stop" }).catch(() => {});
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

function describeKi(err) {
  const msg = err?.message ?? "";
  if (/Grafikkarte/.test(msg)) return msg;
  if (/fetch|network|Failed to|load/i.test(msg)) return "Das Sprachmodell konnte nicht geladen werden. Beim ersten Mal braucht es Internet.";
  if (/memory|Memory|OOM|allocation/i.test(msg)) return "Zu wenig Speicher für dieses Modell. „Klein“ wählen.";
  return "Das Sprachmodell läuft auf diesem Gerät nicht: " + msg.slice(0, 120);
}

export const schaf = new FragDasSchaf();

// Für Tests und zum Ausprobieren ohne Mikrofon: __fragDasSchaf.hear("Was kostet die Banane?")
globalThis.__fragDasSchaf = schaf;
