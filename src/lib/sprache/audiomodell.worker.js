// LFM3-Audio im Browser (Prototyp): Zuhören und Sprechen mit einem Modell, auf der Grafikkarte (WebGPU).
// Was das Schaf sagt, bestimmt weiter die Kasse; das Modell erkennt nur die Frage und liest die Antwort vor.
// Dateien (ca. 2,4 GB) kommen beim ersten Mal von Hugging Face und bleiben im Browser-Speicher.
import * as ort from "onnxruntime-web/webgpu";
import { AutoTokenizer, env } from "@huggingface/transformers";
import { Lfm3Audio } from "./lfm3audio.js";

const REPO = "LiquidAI/LFM3-Audio-2B-ONNX";
const BASE = `https://huggingface.co/${REPO}/resolve/main/onnx/`;
// Laut Modellkarte für WebGPU: q4f16-Decoder mit den float32-Nebengraphen
const FILES = {
  decoder: ["decoder_q4f16.onnx", "decoder_q4f16.onnx_data"],
  audio_encoder: ["audio_encoder.onnx", "audio_encoder.onnx_data"],
  depth_decoder: ["depth_decoder.onnx", "depth_decoder.onnx_data"],
  codec_decoder: ["codec_decoder.onnx", "codec_decoder.onnx_data"],
};
const CACHE = "lfm3-audio-v1";

env.allowLocalModels = false;
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let model = null;

/** Datei aus dem Browser-Speicher oder (beim ersten Mal) aus dem Internet, mit Fortschritt. */
async function file(name, onBytes) {
  const cache = await caches.open(CACHE);
  const url = BASE + name;
  let res = await cache.match(url);
  if (!res) {
    const net = await fetch(url);
    if (!net.ok) throw new Error(`${name}: HTTP ${net.status}`);
    const total = +net.headers.get("content-length") || 0;
    const reader = net.body.getReader();
    const parts = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      onBytes(loaded, total);
    }
    const blob = new Blob(parts);
    await cache.put(url, new Response(blob, { headers: { "content-length": String(blob.size) } }));
    res = await cache.match(url);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  onBytes(buf.length, buf.length);
  return buf;
}

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
  const tokenizer = await AutoTokenizer.from_pretrained(REPO);
  const sessions = {};
  for (const [role, [graph, data]] of Object.entries(FILES)) {
    const graphBytes = await file(graph, progress(graph));
    const dataBytes = await file(data, progress(data));
    post({ type: "status", text: `Starte ${role} …` });
    sessions[role] = await ort.InferenceSession.create(graphBytes, {
      executionProviders: ["webgpu"],
      externalData: [{ path: data, data: dataBytes }],
      graphOptimizationLevel: "all",
    });
  }
  model = new Lfm3Audio({ ort, sessions, tokenizer });
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
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
    if (type === "speak") {
      const t0 = performance.now();
      const wave = await model.speak(data.text, { voice: data.voice ?? "female", onFrame: (n) => post({ type: "frame", n }) });
      return post({ type: "audio", wave, ms: Math.round(performance.now() - t0) }, [wave.buffer]);
    }
  } catch (err) {
    post({ type: "error", message: err?.message ?? String(err) });
  }
};
