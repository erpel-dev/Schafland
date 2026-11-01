// Stufe 2 von „Frag das Schaf“: kleines Sprachmodell (LFM) für freie Fragen, im Hintergrund.
// Läuft auf dem Gerät: mit Grafikkarte (WebGPU) schnell, sonst auf dem Prozessor (nur das kleine Modell).
// Die Modelldateien kommen beim ersten Mal von Hugging Face und bleiben dann im Browser-Speicher.
import { pipeline, env, TextStreamer, InterruptableStoppingCriteria } from "@huggingface/transformers";

env.allowLocalModels = false;

let generator = null;
let loadedKey = "";
const stopper = new InterruptableStoppingCriteria();

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "load") {
      const { model, dtype, device, wasm } = data;
      const key = `${model}|${dtype}|${device}`;
      if (generator && loadedKey === key) return self.postMessage({ id, type: "ready" });
      // Ohne Grafikkarte: die eingebaute Laufzeit der App. Mit WebGPU: die WebGPU-Laufzeit (vom CDN,
      // der Service Worker behält sie für offline).
      if (device === "wasm" && wasm) env.backends.onnx.wasm.wasmPaths = wasm;
      env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const files = new Map();
      generator = await pipeline("text-generation", model, {
        dtype,
        device,
        progress_callback: (p) => {
          if (p.status === "progress" && p.total) {
            files.set(p.file, { loaded: p.loaded, total: p.total });
            let loaded = 0;
            let total = 0;
            for (const f of files.values()) {
              loaded += f.loaded;
              total += f.total;
            }
            self.postMessage({ id, type: "progress", loaded, total });
          }
        },
      });
      loadedKey = key;
      return self.postMessage({ id, type: "ready" });
    }
    if (type === "generate") {
      if (!generator) throw new Error("Sprachmodell nicht geladen");
      stopper.reset();
      const t0 = performance.now();
      let tokens = 0;
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text) => {
          tokens++;
          self.postMessage({ id, type: "token", text });
        },
      });
      const out = await generator(data.messages, {
        max_new_tokens: data.maxNewTokens ?? 90,
        do_sample: false,
        repetition_penalty: 1.1,
        streamer,
        stopping_criteria: stopper,
      });
      const last = out[0].generated_text;
      const text = Array.isArray(last) ? last.at(-1)?.content ?? "" : String(last);
      return self.postMessage({ id, type: "text", text, ms: Math.round(performance.now() - t0), tokens });
    }
    if (type === "stop") {
      stopper.interrupt();
      return self.postMessage({ id, type: "stopped" });
    }
  } catch (err) {
    self.postMessage({ id, type: "error", message: err?.message ?? String(err) });
  }
};
