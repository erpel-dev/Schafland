// LFM3-Audio-2B / LFM3-Omni-2B (Liquid AI) auf ONNX Runtime: Spracherkennung (ASR), Sprachausgabe (TTS),
// Text-Antworten und (nur Omni) Bilder verstehen.
// Portiert aus Liquids Referenz liquidonnx/lfm3_audio/session.py (github.com/Liquid4All/onnx-export):
// Log-Mel-Merkmale → audio_encoder → Decoder mit Zwischenspeichern; für Sprache sagt der depth_decoder
// je Sprach-Frame 12 Codes in 3 MaskGIT-Durchgängen voraus, der codec_decoder macht daraus STFT-Merkmale
// und eine inverse STFT den 24-kHz-Ton.
// Läuft mit onnxruntime-web/webgpu (Browser) und onnxruntime-node (Tests): ort und die Sitzungen
// werden von außen hereingereicht.

export const TOKENS = {
  bos: "<|startoftext|>",
  eos: 124900, // <|im_end|>
  audio: 125031, // <|audio|>: Platzhalter für Audio-Merkmale
  audioOut: 125032, // <|audio_out|>: Platzhalter für erzeugte Sprach-Frames
  audioStart: 125012,
  textEnd: 125014,
  mixedStart: 125015,
};
const NUM_CODEBOOKS = 12;
const AUDIO_EOS = 2016; // audio_vocab_size - 1
const MASKGIT_SCHEDULE = [4, 4, 4];
const HIDDEN = 2048;

export const MEL = { samplingRate: 16000, nFft: 400, winLength: 400, hop: 160, nMels: 128, logFloor: -12, offset: 4, divisor: 4, encoderStride: 8 };
export const CODEC = { nFft: 1280, hop: 320, samplingRate: 24000 };
// Sprach-Ziehen laut generation_config.json des jeweiligen Modells
export const SPEECH = {
  audio: { temperature: 1.0, topK: 128, repetitionPenalty: 1.1, repetitionWindow: 4096 },
  omni: { temperature: 0.4, topK: null, repetitionPenalty: 1.2, repetitionWindow: 64 },
};
export const VISION = { patch: 16, merge: 2, temporal: 2, minPixels: 65536, imageToken: 125030 };

// ---------- Prompts (Chat-Vorlage des Modells, für unsere zwei Fälle ausgeschrieben) ----------

// Omni: Audio steht zwischen <|vision_start|> und <|vision_end|>, Antworten beginnen nach <think></think>
const clip = (omni) => (omni ? "<|vision_start|><|audio|><|vision_end|>" : "<|audio|>");
const think = (omni) => (omni ? "<think></think>" : "");

export function asrPrompt(language = "German", { omni = false } = {}) {
  return `${TOKENS.bos}<|im_start|>system\nPerform ASR in ${language}.<|im_end|>\n<|im_start|>user\n${clip(omni)}<|im_end|>\n<|im_start|>assistant\n${think(omni)}`;
}

export function ttsPrompt(text, { language = "German", voice = "female", omni = false } = {}) {
  return `${TOKENS.bos}<|im_start|>system\nPerform TTS in ${language} using a ${voice} voice.<|im_end|>\n<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant\n${think(omni)}<|audio_start|>`;
}

/** Bild + Frage (nur Omni) */
export function imagePrompt(system, question) {
  const sys = system ? `<|im_start|>system\n${system}<|im_end|>\n` : "";
  return `${TOKENS.bos}${sys}<|im_start|>user\n<|vision_start|><|image|><|vision_end|>${question}<|im_end|>\n<|im_start|>assistant\n<think></think>`;
}

/** Text-Chat (Antwort als Text, ohne Sprache), wie der „chat“-Modus der Referenz: Denken leer vorgegeben. */
export function chatPrompt(system, user) {
  const sys = system ? `<|im_start|>system\n${system}<|im_end|>\n` : "";
  return `${TOKENS.bos}${sys}<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n<think></think>`;
}

// ---------- Merkmale ----------

export const numFrames = (n) => {
  const padded = Math.max(MEL.nFft, n + (((-(n - MEL.nFft)) % MEL.hop) + MEL.hop) % MEL.hop);
  return 1 + Math.floor((padded - MEL.nFft) / MEL.hop);
};
export const numAudioTokens = (frames) => Math.ceil(frames / MEL.encoderStride);

const hzToMel = (f) => (f < 1000 ? (3 * f) / 200 : 15 + (Math.log(f / 1000) * 27) / Math.log(6.4));
const melToHz = (m) => (m < 15 ? (200 * m) / 3 : 1000 * Math.exp((Math.log(6.4) / 27) * (m - 15)));

/** Mel-Filterbank [nBins][nMels] wie transformers.audio_utils.mel_filter_bank (slaney, slaney). */
export function melFilters() {
  const nBins = MEL.nFft / 2 + 1;
  const melMin = hzToMel(0);
  const melMax = hzToMel(MEL.samplingRate / 2);
  const filterFreqs = Array.from({ length: MEL.nMels + 2 }, (_, i) => melToHz(melMin + ((melMax - melMin) * i) / (MEL.nMels + 1)));
  const fftFreqs = Array.from({ length: nBins }, (_, i) => ((MEL.samplingRate / 2) * i) / (nBins - 1));
  const out = Array.from({ length: nBins }, () => new Float64Array(MEL.nMels));
  for (let m = 0; m < MEL.nMels; m++) {
    const enorm = 2 / (filterFreqs[m + 2] - filterFreqs[m]);
    for (let b = 0; b < nBins; b++) {
      const down = (fftFreqs[b] - filterFreqs[m]) / (filterFreqs[m + 1] - filterFreqs[m]);
      const up = (filterFreqs[m + 2] - fftFreqs[b]) / (filterFreqs[m + 2] - filterFreqs[m + 1]);
      out[b][m] = Math.max(0, Math.min(down, up)) * enorm;
    }
  }
  return out;
}

// ---------- FFT (gemischte Radix 2/3/5: 400 = 2⁴·5², 1280 = 2⁸·5) ----------

const fftPlans = new Map();

function fftPlan(n) {
  let plan = fftPlans.get(n);
  if (plan) return plan;
  const cos = new Float64Array(n);
  const sin = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  plan = { n, cos, sin, re: new Float64Array(n), im: new Float64Array(n) };
  fftPlans.set(n, plan);
  return plan;
}

/**
 * Komplexe FFT (vorwärts, e^{-i…}) in place, rekursiv nach dem kleinsten Faktor.
 * stride/offset adressieren die Teilfolge; tw = n_gesamt / n für die Drehfaktoren.
 */
function fftRec(re, im, n, plan, tw, outRe, outIm, inOff, stride, outOff) {
  if (n === 1) {
    outRe[outOff] = re[inOff];
    outIm[outOff] = im[inOff];
    return;
  }
  const p = n % 2 === 0 ? 2 : n % 3 === 0 ? 3 : n % 5 === 0 ? 5 : n;
  const m = n / p;
  if (p === n) {
    // Primzahl-Länge (kommt bei 400/1280 nicht vor): direkte DFT
    for (let k = 0; k < n; k++) {
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        const idx = ((j * k) % n) * tw;
        const xr = re[inOff + j * stride];
        const xi = im[inOff + j * stride];
        sr += xr * plan.cos[idx] + xi * plan.sin[idx];
        si += xi * plan.cos[idx] - xr * plan.sin[idx];
      }
      outRe[outOff + k] = sr;
      outIm[outOff + k] = si;
    }
    return;
  }
  // Teil-FFTs der p Teilfolgen nach outRe/outIm[outOff + r·m …]
  for (let r = 0; r < p; r++) fftRec(re, im, m, plan, tw * p, outRe, outIm, inOff + r * stride, stride * p, outOff + r * m);
  // Zusammensetzen: X[k + q·m] = Σ_r W_n^{r(k+q·m)} · Y_r[k]
  const tr = new Float64Array(p);
  const ti = new Float64Array(p);
  for (let k = 0; k < m; k++) {
    for (let r = 0; r < p; r++) {
      tr[r] = outRe[outOff + r * m + k];
      ti[r] = outIm[outOff + r * m + k];
    }
    for (let q = 0; q < p; q++) {
      const kk = k + q * m;
      let sr = 0;
      let si = 0;
      for (let r = 0; r < p; r++) {
        const idx = ((r * kk) % n) * tw;
        const c = plan.cos[idx];
        const sn = plan.sin[idx];
        sr += tr[r] * c + ti[r] * sn;
        si += ti[r] * c - tr[r] * sn;
      }
      plan.re[kk] = sr;
      plan.im[kk] = si;
    }
  }
  for (let k = 0; k < n; k++) {
    outRe[outOff + k] = plan.re[k];
    outIm[outOff + k] = plan.im[k];
  }
}

/** FFT der Länge n: (re, im) → neue Arrays */
export function fft(re, im) {
  const n = re.length;
  const plan = fftPlan(n);
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  // Zwischenpuffer je Rekursionsebene: plan.re/im werden pro Aufruf vollständig umkopiert
  fftRec(re, im, n, { ...plan, re: new Float64Array(n), im: new Float64Array(n) }, 1, outRe, outIm, 0, 1, 0);
  return { re: outRe, im: outIm };
}


let melCache = null;

/** Log-Mel-Merkmale [nMels * T] (zeilenweise) eines 16-kHz-Mono-Clips; T = numFrames(n). */
export function logMel(wave) {
  if (!melCache) melCache = { filters: melFilters() };
  const { filters } = melCache;
  const T = numFrames(wave.length);
  const nBins = MEL.nFft / 2 + 1;
  const window = new Float64Array(MEL.nFft);
  for (let i = 0; i < MEL.winLength; i++) window[i] = Math.fround(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / MEL.winLength));
  const out = new Float32Array(MEL.nMels * T);
  const seg = new Float64Array(MEL.nFft);
  const power = new Float64Array(nBins);
  const zero = new Float64Array(MEL.nFft);
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < MEL.nFft; i++) {
      const j = t * MEL.hop + i;
      seg[i] = (j < wave.length ? wave[j] : 0) * window[i];
    }
    const spec = fft(seg, zero);
    for (let k = 0; k < nBins; k++) power[k] = spec.re[k] * spec.re[k] + spec.im[k] * spec.im[k];
    for (let m = 0; m < MEL.nMels; m++) {
      let e = 0;
      for (let k = 0; k < nBins; k++) e += filters[k][m] * power[k];
      const v = Math.max(Math.log10(e), MEL.logFloor);
      out[m * T + t] = (v + MEL.offset) / MEL.divisor;
    }
  }
  return { data: out, frames: T };
}

// ---------- Ton aus STFT-Merkmalen ----------


/** 24-kHz-Ton aus stft_features [rows, nFft + 2] (log-Betrag | Phase), wie istft_same_padding. */
export function stftToWave(features, rows) {
  const { nFft, hop } = CODEC;
  const bins = nFft / 2 + 1;
  const fullRe = new Float64Array(nFft);
  const fullIm = new Float64Array(nFft);
  const window = new Float64Array(nFft);
  for (let i = 0; i < nFft; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft);
  const size = (rows - 1) * hop + nFft;
  const wave = new Float64Array(size);
  const env = new Float64Array(size);
  const re = new Float64Array(bins);
  const im = new Float64Array(bins);
  const frame = new Float64Array(nFft);
  for (let t = 0; t < rows; t++) {
    const row = t * (nFft + 2);
    for (let k = 0; k < bins; k++) {
      const mag = Math.exp(features[row + k]);
      const ph = features[row + bins + k];
      re[k] = mag * Math.cos(ph);
      im[k] = mag * Math.sin(ph);
    }
    // irfft: Spektrum hermitesch ergänzen, inverse FFT über konj(FFT(konj(X))) / N
    fullRe[0] = re[0];
    fullIm[0] = 0; // wie numpy.fft.irfft: Imaginärteil von DC und Nyquist zählt nicht
    fullRe[bins - 1] = re[bins - 1];
    fullIm[bins - 1] = 0;
    for (let k = 1; k < bins - 1; k++) {
      fullRe[k] = re[k];
      fullIm[k] = -im[k];
      fullRe[nFft - k] = re[k];
      fullIm[nFft - k] = im[k];
    }
    const x = fft(fullRe, fullIm);
    for (let n = 0; n < nFft; n++) frame[n] = (x.re[n] / nFft) * window[n];
    for (let n = 0; n < nFft; n++) {
      wave[t * hop + n] += frame[n];
      env[t * hop + n] += window[n] * window[n];
    }
  }
  const pad = (nFft - hop) / 2;
  const out = new Float32Array(size - 2 * pad);
  for (let i = 0; i < out.length; i++) out[i] = wave[i + pad] / env[i + pad];
  return out;
}

// ---------- Ziehen ----------

/** Zufall mit Startwert (für reproduzierbare Tests), sonst Math.random */
export function makeRng(seed) {
  if (seed == null) return Math.random;
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1e9) / 1e9;
  };
}

function permutation(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ein Code aus logits (Ausschnitt), wie sample_token: Wiederholungsstrafe, Temperatur, Top-k. */
export function sampleCode(logits, offset, size, { temperature, topK, repetitionPenalty, history }, rng) {
  const scores = new Float64Array(size);
  for (let i = 0; i < size; i++) scores[i] = logits[offset + i];
  if (repetitionPenalty && repetitionPenalty !== 1 && history?.length) {
    for (const h of new Set(history)) scores[h] = scores[h] < 0 ? scores[h] * repetitionPenalty : scores[h] / repetitionPenalty;
  }
  if (temperature === 0 || (!temperature && !topK)) {
    let best = 0;
    for (let i = 1; i < size; i++) if (scores[i] > scores[best]) best = i;
    return best;
  }
  if (temperature) for (let i = 0; i < size; i++) scores[i] /= temperature;
  let candidates = Array.from(scores.keys());
  if (topK && topK < size) {
    candidates.sort((a, b) => scores[b] - scores[a]);
    candidates = candidates.slice(0, topK);
  }
  let max = -Infinity;
  for (const i of candidates) max = Math.max(max, scores[i]);
  let sum = 0;
  const probs = candidates.map((i) => {
    const p = Math.exp(scores[i] - max);
    sum += p;
    return p;
  });
  let r = rng() * sum;
  for (let j = 0; j < candidates.length; j++) {
    r -= probs[j];
    if (r <= 0) return candidates[j];
  }
  return candidates.at(-1);
}

function argmax(data, offset, size, suppress) {
  let best = -1;
  let bestV = -Infinity;
  for (let i = 0; i < size; i++) {
    if (suppress.has(i)) continue;
    const v = data[offset + i];
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}

// ---------- Bilder (Qwen2-VL-Vorverarbeitung, wie liquidonnx.lfm3_vl.session.preprocess_images) ----------

/** Zielgröße: Vielfache von 32 Pixeln, zwischen minPixels und maxTokens · 32² (smart_resize). */
export function smartResize(h, w, { maxTokens = 256 } = {}) {
  const f = VISION.patch * VISION.merge;
  const maxPixels = maxTokens * f * f;
  let hb = Math.max(f, Math.round(h / f) * f);
  let wb = Math.max(f, Math.round(w / f) * f);
  if (hb * wb > maxPixels) {
    const beta = Math.sqrt((h * w) / maxPixels);
    hb = Math.max(f, Math.floor(h / beta / f) * f);
    wb = Math.max(f, Math.floor(w / beta / f) * f);
  } else if (hb * wb < VISION.minPixels) {
    const beta = Math.sqrt(VISION.minPixels / (h * w));
    hb = Math.ceil((h * beta) / f) * f;
    wb = Math.ceil((w * beta) / f) * f;
  }
  return { height: hb, width: wb };
}

/**
 * RGB-Bild schon auf smartResize-Größe ({ data Uint8 HWC, width, height }) → Patches
 * [gridH · gridW, 3 · 2 · 16 · 16], blockweise geordnet (2×2-Blöcke), wie Qwen2VLImageProcessor.
 */
export function preprocessImage(rgb, { maxTokens = 256 } = {}) {
  const { width, height } = smartResize(rgb.height, rgb.width, { maxTokens });
  if (width !== rgb.width || height !== rgb.height) throw new Error(`Bild erst auf ${width}×${height} skalieren`);
  const P = VISION.patch;
  const M = VISION.merge;
  const T = VISION.temporal;
  const gridH = height / P;
  const gridW = width / P;
  const dim = 3 * T * P * P;
  const pixels = new Float32Array(gridH * gridW * dim);
  let row = 0;
  for (let bh = 0; bh < gridH / M; bh++)
    for (let bw = 0; bw < gridW / M; bw++)
      for (let mh = 0; mh < M; mh++)
        for (let mw = 0; mw < M; mw++) {
          const y0 = (bh * M + mh) * P;
          const x0 = (bw * M + mw) * P;
          let o = row * dim;
          for (let c = 0; c < 3; c++)
            for (let t = 0; t < T; t++) // ein Bild = zwei gleiche „Zeitschritte“
              for (let y = 0; y < P; y++)
                for (let x = 0; x < P; x++) pixels[o++] = (rgb.data[((y0 + y) * width + (x0 + x)) * 3 + c] / 255 - 0.5) / 0.5;
          row++;
        }
  return { pixels, gridH, gridW };
}

// ---------- Modell ----------

export class Lfm3Audio {
  /**
   * ort: onnxruntime-Modul; sessions: { decoder, audio_encoder, depth_decoder, codec_decoder };
   * tokenizer: transformers.js-Tokenizer (encode/decode).
   */
  constructor({ ort, sessions, tokenizer, variant = "audio" }) {
    this.ort = ort;
    this.omni = variant === "omni";
    this.speech = SPEECH[variant] ?? SPEECH.audio;
    this.s = sessions;
    this.tokenizer = tokenizer;
    this.decoderInputs = new Set(sessions.decoder.inputNames);
    this.cacheInputs = sessions.decoder.inputNames.filter((n) => n.startsWith("past"));
    // fp16-Decoder (q4f16, für die Grafikkarte) halten ihre Zwischenspeicher in fp16
    const meta = sessions.decoder.inputMetadata;
    const typeOf = (name) => {
      if (Array.isArray(meta)) return meta.find((m) => m.name === name)?.type;
      return meta?.[name]?.type;
    };
    this.cacheType = this.cacheInputs.map((n) => typeOf(n)).find(Boolean) ?? "float32";
  }

  tensor(type, data, dims) {
    return new this.ort.Tensor(type, data, dims);
  }

  ids(text) {
    return Array.from(this.tokenizer.encode(text, { add_special_tokens: false }), Number);
  }

  /**
   * Präfix-Speicher: Der lange Systemteil (Sortiment, Wissen) ist bei jeder Frage gleich. Er wird
   * einmal gerechnet; jede Frage startet von einer Kopie dieses Zustands (die Tensoren werden nur
   * gelesen, nie verändert, und bleiben deshalb erhalten).
   */
  async #fromPrefix(system) {
    const text = `${TOKENS.bos}${system ? `<|im_start|>system\n${system}<|im_end|>\n` : ""}`;
    if (this.prefix?.text !== text) {
      if (this.prefix) for (const t of this.prefix.keep) t?.dispose?.();
      if (this.lastState) this.release(this.lastState);
      this.lastState = null;
      const st = { past: 0, cache: this.emptyCache() };
      await this.prefill(st, this.ids(text));
      this.prefix = { text, past: st.past, cache: st.cache, keep: new Set(Object.values(st.cache)) };
    }
    if (this.lastState) this.release(this.lastState);
    this.lastState = { past: this.prefix.past, cache: { ...this.prefix.cache }, keep: this.prefix.keep };
    return this.lastState;
  }

  /** Neue Erzeugung: Speicher der vorigen freigeben (es läuft immer nur eine) */
  newState() {
    if (this.lastState) this.release(this.lastState);
    this.lastState = { past: 0, cache: this.emptyCache() };
    return this.lastState;
  }

  /** Zwischenspeicher einer fertigen Erzeugung freigeben (auf der Grafikkarte sonst ein Leck) */
  release(state) {
    for (const t of Object.values(state.cache)) if (!state.keep?.has(t)) t?.dispose?.();
    state.cache = {};
  }

  emptyCache() {
    const cache = {};
    const fp16 = this.cacheType === "float16";
    for (const name of this.cacheInputs) {
      const conv = name.startsWith("past_conv");
      const dims = conv ? [1, HIDDEN, 7] : [1, 4, 0, 128];
      const size = dims.reduce((a, b) => a * b, 1);
      cache[name] = this.tensor(fp16 ? "float16" : "float32", fp16 ? new Uint16Array(size) : new Float32Array(size), dims);
    }
    return cache;
  }

  /** Ein Decoder-Schritt; gibt { logits (letzte Position), hidden } und aktualisiert den Speicher. */
  async step(state, ids, { audioFeatures = null, audioRows = 0, codes = null, imageFeatures = null, imageRows = 0 } = {}) {
    const n = ids.length;
    const feeds = {
      input_ids: this.tensor("int64", BigInt64Array.from(ids, BigInt), [1, n]),
      attention_mask: this.tensor("int64", new BigInt64Array(state.past + n).fill(1n), [1, state.past + n]),
      position_ids: this.tensor("int64", BigInt64Array.from({ length: n }, (_, i) => BigInt(state.past + i)), [1, n]),
      logits_to_keep: this.tensor("int64", BigInt64Array.from([1n]), [1]),
      audio_features: this.tensor("float32", audioFeatures ?? new Float32Array(0), [audioRows, HIDDEN]),
      audio_out_codes: this.tensor("int64", codes ? BigInt64Array.from(codes, BigInt) : new BigInt64Array(0), [codes ? 1 : 0, NUM_CODEBOOKS]),
      image_features: this.tensor("float32", imageFeatures ?? new Float32Array(0), [imageRows, HIDDEN]),
      video_features: this.tensor("float32", new Float32Array(0), [0, HIDDEN]),
      ...state.cache,
    };
    for (const k of Object.keys(feeds)) if (!this.decoderInputs.has(k)) delete feeds[k];
    const out = await this.s.decoder.run(feeds);
    for (const [name, value] of Object.entries(out)) {
      let past = null;
      if (name.startsWith("present_conv.")) past = name.replace("present_conv.", "past_conv.");
      else if (name.startsWith("present.")) past = name.replace("present.", "past_key_values.");
      if (past) {
        const old = state.cache[past];
        if (old && !state.keep?.has(old)) old.dispose?.();
        state.cache[past] = value;
      }
    }
    state.past += n;
    return { logits: out.logits.data, hidden: out.hidden_states.data };
  }

  /** Lange Eingaben in Stücken von höchstens 1024 Tokens (WebGPU), nur reiner Text. */
  async prefill(state, ids, extra = {}) {
    if (ids.length <= 1024 || extra.audioRows || extra.imageRows) return this.step(state, ids, extra);
    let out;
    for (let i = 0; i < ids.length; i += 1024) out = await this.step(state, ids.slice(i, i + 1024));
    return out;
  }

  /**
   * Antwort als Text auf eine Frage (Stufe 2 mit demselben Modell). messages: [{role, content}] mit
   * höchstens einer System- und einer Nutzer-Nachricht. onText bekommt den Text, während er entsteht.
   */
  async chat(messages, { maxTokens = 90, onText = () => {}, shouldStop = () => false } = {}) {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const user = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const state = await this.#fromPrefix(system);
    const rest = chatPrompt(system, user).slice(this.prefix.text.length);
    let { logits } = await this.prefill(state, this.ids(rest));
    const vocab = logits.length;
    const suppress = new Set([TOKENS.audio, TOKENS.audioOut, TOKENS.audioStart, TOKENS.mixedStart]);
    const out = [];
    const recent = [];
    for (let i = 0; i < maxTokens && !shouldStop(); i++) {
      // leichte Wiederholungsstrafe gegen Endlosschleifen kleiner Modelle
      const scores = Float32Array.from(logits.subarray ? logits.subarray(0, vocab) : logits.slice(0, vocab));
      for (const t of new Set(recent)) scores[t] = scores[t] < 0 ? scores[t] * 1.1 : scores[t] / 1.1;
      const token = argmax(scores, 0, vocab, suppress);
      if (token === TOKENS.eos || token === TOKENS.textEnd) break;
      out.push(token);
      recent.push(token);
      if (recent.length > 32) recent.shift();
      onText(this.tokenizer.decode(out, { skip_special_tokens: true }));
      ({ logits } = await this.step(state, [token]));
    }
    return this.tokenizer.decode(out, { skip_special_tokens: true }).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }

  /** Text nach einem vorbereiteten Prompt (gierig), für Bildfragen. */
  async #generateText(state, first, maxTokens) {
    let { logits } = first;
    const vocab = logits.length;
    const suppress = new Set([TOKENS.audio, TOKENS.audioOut, TOKENS.audioStart, TOKENS.mixedStart, VISION.imageToken]);
    const out = [];
    for (let i = 0; i < maxTokens; i++) {
      const token = argmax(logits, 0, vocab, suppress);
      if (token === TOKENS.eos || token === TOKENS.textEnd) break;
      out.push(token);
      ({ logits } = await this.step(state, [token]));
    }
    return this.tokenizer.decode(out, { skip_special_tokens: true }).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }

  /** Bildmerkmale eines RGB-Bildes { data (Uint8, HWC), width, height } (nur Omni). */
  async encodeImage(rgb, { maxTokens = 256 } = {}) {
    const { pixels, gridH, gridW } = preprocessImage(rgb, { maxTokens });
    const blocks = this.tensor("float32", pixels, [gridH / VISION.merge, gridW / VISION.merge, VISION.merge, VISION.merge, pixels.length / (gridH * gridW)]);
    const out = await this.s.vision_encoder.run({ pixel_values: blocks });
    const f = out.image_features;
    return { features: f.data instanceof Float32Array ? f.data : Float32Array.from(f.data), rows: f.dims[0] };
  }

  /** Antwort (Text) auf eine Frage zu einem Bild (nur Omni). */
  async askImage(rgb, question, { system = "", maxTokens = 24, maxImageTokens = 256 } = {}) {
    if (!this.omni) throw new Error("Bilder versteht nur LFM3-Omni");
    const { features, rows } = await this.encodeImage(rgb, { maxTokens: maxImageTokens });
    const prompt = this.ids(imagePrompt(system, question));
    const at = prompt.indexOf(VISION.imageToken);
    if (at < 0) throw new Error("Tokenizer kennt <|image|> nicht");
    const ids = [...prompt.slice(0, at), ...Array(rows).fill(VISION.imageToken), ...prompt.slice(at + 1)];
    const state = this.newState();
    const first = await this.step(state, ids, { imageFeatures: features, imageRows: rows });
    return this.#generateText(state, first, maxTokens);
  }

  /** Audio-Merkmale [rows * 2048] eines 16-kHz-Clips. */
  async encode(wave16k) {
    const { data, frames } = logMel(wave16k);
    const out = await this.s.audio_encoder.run({ input_features: this.tensor("float32", data, [1, MEL.nMels, frames]) });
    const features = out.audio_features;
    return { features: features.data instanceof Float32Array ? features.data : Float32Array.from(features.data), rows: features.dims[0] };
  }

  /** Spracherkennung: Text eines 16-kHz-Clips. */
  async transcribe(wave16k, { language = "German", maxTokens = 120 } = {}) {
    const { features, rows } = await this.encode(wave16k);
    const prompt = this.ids(asrPrompt(language, { omni: this.omni }));
    const at = prompt.indexOf(TOKENS.audio);
    if (at < 0) throw new Error("Tokenizer kennt <|audio|> nicht");
    const ids = [...prompt.slice(0, at), ...Array(rows).fill(TOKENS.audio), ...prompt.slice(at + 1)];
    const state = this.newState();
    let { logits } = await this.step(state, ids, { audioFeatures: features, audioRows: rows });
    const vocab = logits.length;
    const suppress = new Set([TOKENS.audio, TOKENS.audioOut, TOKENS.audioStart, TOKENS.mixedStart]);
    const out = [];
    for (let i = 0; i < maxTokens; i++) {
      const token = argmax(logits, 0, vocab, suppress);
      if (token === TOKENS.eos || token === TOKENS.textEnd) break;
      out.push(token);
      ({ logits } = await this.step(state, [token]));
    }
    return this.tokenizer.decode(out, { skip_special_tokens: true }).trim();
  }

  /** Sprachausgabe: 24-kHz-Ton eines Textes. onFrame(n) meldet den Fortschritt. */
  async speak(text, { language = "German", voice = "female", maxFrames = 400, seed = null, onFrame = () => {} } = {}) {
    const rng = makeRng(seed);
    const ids = this.ids(ttsPrompt(text, { language, voice, omni: this.omni }));
    const state = this.newState();
    let { hidden } = await this.step(state, ids);
    const frames = [];
    for (let f = 0; f < maxFrames; f++) {
      const frame = await this.sampleFrame(hidden, frames, rng);
      if (frame[0] === AUDIO_EOS) break;
      frames.push(frame);
      onFrame(frames.length);
      ({ hidden } = await this.step(state, [TOKENS.audioOut], { codes: frame }));
    }
    return this.decodeAudio(frames);
  }

  /** 12 Codes eines Sprach-Frames aus dem Decoder-Zustand (MaskGIT, 3 Durchgänge). */
  async sampleFrame(hidden, history, rng) {
    const order = permutation(NUM_CODEBOOKS, rng);
    const codes = new BigInt64Array(NUM_CODEBOOKS);
    const revealed = new Array(NUM_CODEBOOKS).fill(false);
    const hiddenT = this.tensor("float32", hidden instanceof Float32Array ? hidden : Float32Array.from(hidden), [1, HIDDEN]);
    const window = history.slice(-this.speech.repetitionWindow);
    let start = 0;
    for (const count of MASKGIT_SCHEDULE) {
      const pick = order.slice(start, start + count);
      start += count;
      const out = await this.s.depth_decoder.run({
        hidden_states: hiddenT,
        codes: this.tensor("int64", codes.slice(), [1, NUM_CODEBOOKS]),
        masked: this.tensor("bool", Uint8Array.from(revealed, (r) => (r ? 0 : 1)), [1, NUM_CODEBOOKS]),
      });
      const logits = out.logits.data;
      const size = out.logits.dims[2];
      for (const k of pick) {
        const code = sampleCode(logits, k * size, size, { ...this.speech, history: window.map((fr) => fr[k]) }, rng);
        codes[k] = BigInt(code);
      }
      for (const k of pick) revealed[k] = true;
    }
    const frame = Array.from(codes, Number);
    return frame.includes(AUDIO_EOS) ? new Array(NUM_CODEBOOKS).fill(AUDIO_EOS) : frame;
  }

  /** Frames [F][12] → 24-kHz-Ton */
  async decodeAudio(frames) {
    if (!frames.length) return new Float32Array(0);
    const F = frames.length;
    const codes = new BigInt64Array(NUM_CODEBOOKS * F);
    for (let f = 0; f < F; f++) for (let k = 0; k < NUM_CODEBOOKS; k++) codes[k * F + f] = BigInt(frames[f][k]);
    const out = await this.s.codec_decoder.run({ audio_codes: this.tensor("int64", codes, [1, NUM_CODEBOOKS, F]) });
    const feats = out.stft_features;
    const data = feats.data instanceof Float32Array ? feats.data : Float32Array.from(feats.data);
    return stftToWave(data, feats.dims[1]);
  }
}
