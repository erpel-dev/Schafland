import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { logMel, melFilters, stftToWave, numFrames, numAudioTokens, asrPrompt, ttsPrompt, sampleCode, makeRng } from "../../src/lib/sprache/lfm3audio.js";

// Referenzwerte aus Liquids Python-Code (liquidonnx.lfm3_audio: log_mel, istft_same_padding)
const ref = JSON.parse(fs.readFileSync(new URL("./fixtures/lfm3-referenz.json", import.meta.url)));

test("LFM3-Audio: Log-Mel wie die Referenz", () => {
  const { data, frames } = logMel(Float32Array.from(ref.wave));
  assert.equal(frames, 26);
  let diff = 0;
  for (let m = 0; m < 128; m++) for (let t = 0; t < frames; t++) diff = Math.max(diff, Math.abs(data[m * frames + t] - ref.mel[m][t]));
  assert.ok(diff < 1e-5, `Abweichung ${diff}`);
  let sum = 0;
  for (const row of melFilters()) for (const v of row) sum += v;
  assert.ok(Math.abs(sum - ref.filters_sum) < 1e-4);
});

test("LFM3-Audio: inverse STFT wie die Referenz", () => {
  const wave = stftToWave(Float32Array.from(ref.feats), 5);
  assert.equal(wave.length, ref.istft.length);
  let diff = 0;
  for (let i = 0; i < wave.length; i++) diff = Math.max(diff, Math.abs(wave[i] - ref.istft[i]));
  assert.ok(diff < 1e-5, `Abweichung ${diff}`);
});

test("LFM3-Audio: Frames, Prompts, Ziehen", () => {
  assert.equal(numFrames(16000), 99); // wie liquidonnx MelConfig.num_frames
  assert.equal(numAudioTokens(99), 13);
  assert.equal(numFrames(100), 1);
  assert.match(asrPrompt(), /^<\|startoftext\|><\|im_start\|>system\nPerform ASR in German\.<\|im_end\|>\n<\|im_start\|>user\n<\|audio\|><\|im_end\|>\n<\|im_start\|>assistant\n$/);
  assert.ok(ttsPrompt("Hallo").endsWith("<|im_start|>assistant\n<|audio_start|>"));
  const logits = Float32Array.from([0, 5, 1, 0.5]);
  assert.equal(sampleCode(logits, 0, 4, { temperature: 0 }, Math.random), 1);
  const rng = makeRng(7);
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 2000; i++) counts[sampleCode(logits, 0, 4, { temperature: 1, topK: 2 }, rng)]++;
  assert.equal(counts[0] + counts[3], 0); // Top-2: nur 1 und 2
  assert.ok(counts[1] > counts[2] * 20);
  // Wiederholungsstrafe senkt den Favoriten
  assert.equal(sampleCode(Float32Array.from([2, 2.1]), 0, 2, { temperature: 0, repetitionPenalty: 1.1, history: [1] }, rng), 0);
});

import { Lfm3Audio, TOKENS, prefixText, smartResize } from "../../src/lib/sprache/lfm3audio.js";

/** Nachgebauter Decoder: zählt gerechnete Tokens, antwortet nach zwei Tokens mit Ende */
function fakeModel() {
  const live = new Set();
  const seen = [];
  class Tensor {
    constructor(type, data, dims) {
      Object.assign(this, { type, data, dims });
      live.add(this);
    }
    dispose() {
      if (!live.has(this)) throw new Error("doppelt freigegeben");
      live.delete(this);
    }
  }
  const vocab = 125100;
  const decoder = {
    inputNames: ["input_ids", "attention_mask", "position_ids", "image_features", "past_conv.0", "past_key_values.0.key"],
    inputMetadata: {},
    async run(feeds) {
      for (const k of ["past_conv.0", "past_key_values.0.key"]) if (!live.has(feeds[k])) throw new Error(`${k} schon freigegeben`);
      const ids = Array.from(feeds.input_ids.data, Number);
      seen.push(ids.length);
      const logits = new Float32Array(vocab);
      logits[seen.length % 3 === 0 ? TOKENS.eos : 42] = 1;
      return {
        logits: new Tensor("float32", logits, [1, 1, vocab]),
        hidden_states: new Tensor("float32", new Float32Array(4), [1, 4]),
        "present_conv.0": new Tensor("float32", new Float32Array(1), [1]),
        "present.0.key": new Tensor("float32", new Float32Array(1), [1]),
      };
    },
  };
  const tokenizer = {
    encode: (t) => t.split("<|image|>").flatMap((part, i) => [...(i ? [125030] : []), ...Array.from(part, (c) => c.charCodeAt(0) % 1000)]),
    decode: (ids) => "x".repeat(ids.length),
  };
  const vision_encoder = { run: async () => ({ image_features: { data: new Float32Array(2048 * 4), dims: [4, 2048] } }) };
  const model = new Lfm3Audio({ ort: { Tensor }, sessions: { decoder, vision_encoder }, tokenizer, variant: "omni" });
  return { model, seen };
}

test("LFM3: Präfix-Speicher rechnet Systemteile einmal und gibt nichts doppelt frei", async () => {
  const { model, seen } = fakeModel();
  const sys = (n) => `System ${n} `.repeat(50);
  const ask = (n) => model.chat([{ role: "system", content: sys(n) }, { role: "user", content: "Frage" }]);
  await ask(1);
  const first = seen.length;
  const firstPrefill = seen[0];
  assert.equal(firstPrefill, prefixText(sys(1)).length); // Systemteil einzeln gerechnet
  seen.length = 0;
  await ask(1);
  assert.ok(!seen.includes(firstPrefill), "Systemteil nicht nochmal gerechnet");
  assert.ok(seen.length <= first);
  // drei Systemteile passen, ein vierter wirft den ältesten hinaus
  await ask(2);
  await ask(3);
  seen.length = 0;
  await ask(1);
  assert.ok(!seen.includes(firstPrefill), "1 noch im Speicher");
  await ask(4); // wirft 2 hinaus
  seen.length = 0;
  await ask(2);
  assert.ok(seen.includes(prefixText(sys(2)).length), "2 neu gerechnet");
  // Bildfrage mit Systemteil: auch aus dem Speicher, das Bild steht im Rest
  await model.warmPrefix(sys(9));
  seen.length = 0;
  const { width, height } = smartResize(64, 64);
  const rgb = { data: new Uint8Array(width * height * 3), width, height };
  const text = await model.askImage(rgb, "Was ist das?", { system: sys(9) });
  assert.ok(text.length > 0);
  // erster Schritt: nur Bild und Frage, nicht der Systemteil
  assert.ok(seen[0] < prefixText(sys(9)).length, `${seen[0]} Tokens im ersten Bildschritt`);
});
