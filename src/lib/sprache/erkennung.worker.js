// Spracherkennung (Whisper) im Hintergrund, damit die Kasse flüssig bleibt.
// Läuft komplett auf dem Gerät. Das Modell wird beim ersten Mal von Hugging Face geladen und
// danach im Browser-Speicher behalten (offline nutzbar).
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

let asr = null;
let loadedModel = null;

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "load") {
      const { model, wasm } = data;
      if (loadedModel === model && asr) return self.postMessage({ id, type: "ready" });
      // Laufzeit liegt bei der App (kein CDN): wichtig für offline und die Android-App
      env.backends.onnx.wasm.wasmPaths = wasm;
      env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const files = new Map();
      asr = await pipeline("automatic-speech-recognition", model, {
        dtype: "q8",
        device: "wasm",
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
      loadedModel = model;
      return self.postMessage({ id, type: "ready" });
    }
    if (type === "transcribe") {
      if (!asr) throw new Error("Modell nicht geladen");
      const t0 = performance.now();
      const out = await asr(data.audio, { language: "german", task: "transcribe" });
      return self.postMessage({ id, type: "text", text: (out.text ?? "").trim(), ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    self.postMessage({ id, type: "error", message: err?.message ?? String(err) });
  }
};
