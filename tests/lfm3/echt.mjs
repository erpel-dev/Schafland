// Echter Test von src/lib/sprache/lfm3audio.js mit LFM3-Audio-2B (q4, auf dem Prozessor, onnxruntime-node).
// Aufruf: node tests/lfm3/echt.mjs <modellordner> <ordner-mit-wavs-16k>
// Die WAVs heißen „<erwartetes Wort>__<Satz>.wav“. Läuft auf GitHub (.github/workflows/lfm3-audio.yml).
import * as ort from "onnxruntime-node";
import { AutoTokenizer, env } from "@huggingface/transformers";
import fs from "node:fs";
import path from "node:path";
import { Lfm3Audio, TOKENS, asrPrompt, ttsPrompt } from "../../src/lib/sprache/lfm3audio.js";

const [MODEL, WAVS] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const secs = (t) => `${((performance.now() - t) / 1000).toFixed(1)} s`;

function readWav(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  let fmt;
  let data;
  while (off < b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === "data") data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (fmt.bits !== 16) throw new Error("nur 16-Bit-WAV");
  const n = data.length / 2 / fmt.channels;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * fmt.channels) / 32768;
  return { wave: out, rate: fmt.rate };
}

function writeWav(file, wave, rate) {
  const b = Buffer.alloc(44 + wave.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + wave.length * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(wave.length * 2, 40);
  for (let i = 0; i < wave.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(wave[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}

/** einfache lineare Umrechnung der Abtastrate (für den Rundlauf TTS → ASR genügt das) */
function resample(wave, from, to) {
  const n = Math.floor((wave.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to;
    const j = Math.floor(x);
    out[i] = (wave[j] ?? 0) * (1 - (x - j)) + (wave[j + 1] ?? 0) * (x - j);
  }
  return out;
}

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = path.dirname(path.resolve(MODEL)) + "/";
const tokenizer = await AutoTokenizer.from_pretrained(path.basename(MODEL));

const asrIds = Array.from(tokenizer.encode(asrPrompt(), { add_special_tokens: false }), Number);
const ttsIds = Array.from(tokenizer.encode(ttsPrompt("Hallo"), { add_special_tokens: false }), Number);
check("Tokenizer: <|audio|> ist ein Token", asrIds.filter((t) => t === TOKENS.audio).length === 1, `${asrIds.length} Tokens, Anfang ${asrIds.slice(0, 4)}`);
check("Tokenizer: TTS endet mit <|audio_start|>", ttsIds.at(-1) === TOKENS.audioStart, `${ttsIds.slice(-3)}`);

let t = performance.now();
const onnx = (name) => path.join(MODEL, "onnx", name);
const opts = { executionProviders: ["cpu"], graphOptimizationLevel: "all" };
const sessions = {
  decoder: await ort.InferenceSession.create(onnx("decoder_q4.onnx"), opts),
  audio_encoder: await ort.InferenceSession.create(onnx("audio_encoder.onnx"), opts),
  depth_decoder: await ort.InferenceSession.create(onnx("depth_decoder.onnx"), opts),
  codec_decoder: await ort.InferenceSession.create(onnx("codec_decoder.onnx"), opts),
};
check("Modell geladen (q4, Prozessor)", true, secs(t));
const model = new Lfm3Audio({ ort, sessions, tokenizer });

// 1. Spracherkennung mit gesprochenen Testsätzen
for (const file of fs.readdirSync(WAVS).filter((f) => f.endsWith(".wav")).sort()) {
  const [expect, sentence] = file.replace(/\.wav$/, "").split("__");
  const { wave, rate } = readWav(path.join(WAVS, file));
  const wave16 = rate === 16000 ? wave : resample(wave, rate, 16000);
  t = performance.now();
  const text = await model.transcribe(wave16);
  check(`Erkennung „${sentence}“`, text.toLowerCase().includes(expect.toLowerCase()), `„${text}“ (${secs(t)})`);
}

// 2. Sprachausgabe, dann zurück durch die Erkennung (Rundlauf)
for (const [say, expect] of [
  ["Die Banane kostet dreißig Cent. Soll ich sie in den Korb legen?", "banane"],
  ["Gelb sind Banane, Zitrone und Ananas.", "zitrone"],
]) {
  t = performance.now();
  let frames = 0;
  const wave = await model.speak(say, { seed: 3, onFrame: (n) => (frames = n) });
  const dur = wave.length / 24000;
  const tts = secs(t);
  writeWav(`tts-${expect}.wav`, wave, 24000);
  let peak = 0;
  for (const v of wave) peak = Math.max(peak, Math.abs(v));
  check(`Sprachausgabe „${say}“`, dur > 1 && dur < 12 && peak > 0.02, `${dur.toFixed(1)} s Ton, ${frames} Frames, Spitze ${peak.toFixed(2)} (${tts})`);
  t = performance.now();
  const back = await model.transcribe(resample(wave, 24000, 16000));
  check(`Rundlauf: Erkennung der eigenen Sprachausgabe`, back.toLowerCase().includes(expect), `„${back}“ (${secs(t)})`);
}

// Erkennung darf sich bei einzelnen Wörtern irren (das Schaf zeigt dann Bilder); alles andere muss klappen
const failed = results.filter((r) => !r).length;
const asr = results.slice(3, 3 + fs.readdirSync(WAVS).filter((f) => f.endsWith(".wav")).length);
const asrOk = asr.filter(Boolean).length;
const otherFailed = failed - (asr.length - asrOk);
console.log(`\n${results.length - failed}/${results.length} bestanden (Erkennung ${asrOk}/${asr.length}, Mindestquote 80 %)`);
process.exit(otherFailed === 0 && asrOk >= Math.ceil(asr.length * 0.8) ? 0 : 1);
