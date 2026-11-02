// LFM3-Omni im Browser (Prototyp): ein Modell zum Zuhören, Sprechen, Antworten und Sehen, auf der
// Grafikkarte (WebGPU). Was das Schaf über Preise und den Korb sagt, bestimmt weiter die Kasse.
// Dateien (ca. 2,6 GB) kommen beim ersten Mal von Hugging Face und bleiben im Browser-Speicher.
import * as ort from "onnxruntime-web/webgpu";
import { AutoTokenizer, env } from "@huggingface/transformers";
import { Lfm3Audio, smartResize } from "./lfm3audio.js";

const REPO = "LiquidAI/LFM3-Omni-2B-ONNX";
const BASE = `https://huggingface.co/${REPO}/resolve/main/onnx/`;
// Laut Modellkarte für WebGPU: q4f16-Decoder mit den float32-Nebengraphen
const FILES = {
  decoder: ["decoder_q4f16.onnx", "decoder_q4f16.onnx_data"],
  audio_encoder: ["audio_encoder.onnx", "audio_encoder.onnx_data"],
  depth_decoder: ["depth_decoder.onnx", "depth_decoder.onnx_data"],
  codec_decoder: ["codec_decoder.onnx", "codec_decoder.onnx_data"],
  vision_encoder: ["vision_encoder_q8.onnx", "vision_encoder_q8.onnx_data"],
};
const CACHE = "lfm3-omni-v1";

env.allowLocalModels = false;
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let model = null;

/** present_conv.N / present.N.key / .value → auf der Grafikkarte lassen (24 Schichten) */
function cacheOutputsOnGpu() {
  const map = {};
  for (let i = 0; i < 24; i++) {
    map[`present_conv.${i}`] = "gpu-buffer";
    map[`present.${i}.key`] = "gpu-buffer";
    map[`present.${i}.value`] = "gpu-buffer";
  }
  return map;
}

/** Datei in den Browser-Speicher holen (gestreamt, ohne Kopie im Arbeitsspeicher), mit Fortschritt. */
async function download(name, onBytes) {
  const cache = await caches.open(CACHE);
  const url = BASE + name;
  const hit = await cache.match(url, { ignoreVary: true });
  if (hit) {
    const size = +hit.headers.get("content-length") || 0;
    onBytes(size, size);
    return;
  }
  const net = await fetch(url);
  if (!net.ok) throw new Error(`${name}: HTTP ${net.status}`);
  const total = +net.headers.get("content-length") || 0;
  let loaded = 0;
  const counted = net.body.pipeThrough(
    new TransformStream({
      transform(chunk, ctrl) {
        loaded += chunk.length;
        onBytes(loaded, total);
        ctrl.enqueue(chunk);
      },
    }),
  );
  await cache.put(url, new Response(counted, { headers: { "content-length": String(total) } }));
}

/** Datei aus dem Browser-Speicher lesen */
async function read(name) {
  const cache = await caches.open(CACHE);
  const res = await cache.match(BASE + name, { ignoreVary: true });
  if (!res) throw new Error(`${name} fehlt im Browser-Speicher`);
  return new Uint8Array(await res.arrayBuffer());
}

let tokenizer = null;
const sessions = {};

/** Einen Teil des Modells starten (nur wenn gebraucht: spart Arbeitsspeicher). */
async function ensure(role, post) {
  if (sessions[role]) return;
  const [graph, data] = FILES[role];
  post?.({ type: "status", text: `Starte ${role} …` });
  let graphBytes = await read(graph);
  let dataBytes = await read(data);
  sessions[role] = await ort.InferenceSession.create(graphBytes, {
    executionProviders: ["webgpu"],
    externalData: [{ path: data, data: dataBytes }],
    graphOptimizationLevel: "all",
    // Browser-Speicher (wasm) ist knapp: keine wachsenden Vorrats-Speicher auf dem Prozessor …
    enableCpuMemArena: false,
    enableMemPattern: false,
    // … und die Zwischenspeicher des Decoders bleiben auf der Grafikkarte, statt bei jedem Schritt
    // hin- und herkopiert zu werden
    ...(role === "decoder" ? { preferredOutputLocation: cacheOutputsOnGpu() } : {}),
  });
  // Kopien sofort freigeben, bevor der nächste große Teil gelesen wird
  graphBytes = dataBytes = null;
  await new Promise((r) => setTimeout(r, 0));
}

/**
 * Laden: alle Dateien in den Browser-Speicher holen (für offline), aber nur Decoder und Audio-Encoder
 * starten (ca. 1,9 GB). Sprachausgabe (Tiefen-Decoder, Codec) und Bilder starten erst bei Bedarf.
 */
async function load(post) {
  if (model) return;
  if (!navigator.gpu || !(await navigator.gpu.requestAdapter())) throw new Error("Keine Grafikkarte (WebGPU) im Browser");
  const totals = new Map();
  const progress = (name) => (loaded, total) => {
    totals.set(name, { loaded, total: total || loaded });
    let l = 0;
    let t = 0;
    for (const v of totals.values()) {
      l += v.loaded;
      t += v.total;
    }
    post({ type: "progress", loaded: l, total: t, file: name });
  };
  for (const [graph, data] of Object.values(FILES)) {
    await download(graph, progress(graph));
    await download(data, progress(data));
  }
  tokenizer = await AutoTokenizer.from_pretrained(REPO);
  await ensure("decoder", post);
  await ensure("audio_encoder", post);
  model = new Lfm3Audio({ ort, sessions, tokenizer, variant: "omni" });
}

let stop = false;

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  if (type === "stop") {
    stop = true;
    return self.postMessage({ id, type: "stopped" });
  }
  const post = (msg, transfer) => self.postMessage({ id, ...msg }, transfer ?? []);
  try {
    if (type === "load") {
      await load(post);
      return post({ type: "ready" });
    }
    if (!model) throw new Error("Audio-Modell nicht geladen");
    if (type === "transcribe") {
      const t0 = performance.now();
      const text = await model.transcribe(data.audio);
      return post({ type: "text", text, ms: Math.round(performance.now() - t0) });
    }
    if (type === "chat") {
      const t0 = performance.now();
      stop = false;
      const text = await model.chat(data.messages, { onText: (t) => post({ type: "token", text: t }), shouldStop: () => stop });
      return post({ type: "text", text, ms: Math.round(performance.now() - t0) });
    }
    if (type === "image") {
      await ensure("vision_encoder", post);
      // Kamerabild (RGBA) auf die Größe bringen, die das Modell erwartet
      const t0 = performance.now();
      const { width, height } = smartResize(data.height, data.width, { maxTokens: data.maxTokens ?? 256 });
      const bitmap = await createImageBitmap(new ImageData(data.rgba, data.width, data.height), { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const rgb = new Uint8Array(width * height * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4) {
        rgb[j++] = rgba[i];
        rgb[j++] = rgba[i + 1];
        rgb[j++] = rgba[i + 2];
      }
      const text = await model.askImage({ data: rgb, width, height }, data.question, { system: data.system ?? "", maxImageTokens: data.maxTokens ?? 256 });
      return post({ type: "text", text, ms: Math.round(performance.now() - t0) });
    }
    if (type === "speak") {
      await ensure("depth_decoder", post);
      await ensure("codec_decoder", post);
      const t0 = performance.now();
      const wave = await model.speak(data.text, { voice: data.voice ?? "female", onFrame: (n) => post({ type: "frame", n }) });
      return post({ type: "audio", wave, ms: Math.round(performance.now() - t0) }, [wave.buffer]);
    }
  } catch (err) {
    post({ type: "error", message: err?.message ?? String(err) });
  }
};
