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
