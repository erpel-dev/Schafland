// Aufnahme über das Mikrofon: hört zu, bis das Kind fertig gesprochen hat (Pause nach dem
// Sprechen), und liefert den Ton als 16-kHz-Mono, so wie ihn die Spracherkennung braucht.

const SAMPLE_RATE = 16000;

/**
 * Startet eine Aufnahme.
 * onLevel(0…1): Lautstärke für die Anzeige.
 * Ergebnis: { done: Promise<{ audio: Float32Array, heardVoice: boolean }>, stop() }
 */
export async function record({ onLevel = () => {}, maxMs = 8000, silenceMs = 850, noVoiceMs = 5000 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const chunks = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(250);

  const buf = new Float32Array(analyser.fftSize);
  const started = performance.now();
  // Grundrauschen: fällt schnell, steigt nur langsam. So zählt auch Sprechen gleich ab dem
  // ersten Moment als Stimme (Kinder legen oft sofort los).
  let floor = 0.008;
  let voiceAt = 0; // zuletzt Stimme gehört
  let heardVoice = false;
  let timer;
  let finish;
  const stopped = new Promise((r) => (finish = r));

  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();
    if (rms < floor) floor = (floor + rms) / 2;
    else floor += (rms - floor) * 0.004;
    if (rms > Math.max(0.02, floor * 3)) {
      voiceAt = now;
      heardVoice = true;
    }
    onLevel(Math.min(1, rms * 8));
    if (now - started > maxMs) return finish();
    if (heardVoice && now - voiceAt > silenceMs) return finish();
    if (!heardVoice && now - started > noVoiceMs) return finish();
    timer = setTimeout(tick, 50);
  };
  tick();

  const done = (async () => {
    await stopped;
    clearTimeout(timer);
    onLevel(0);
    const ended = new Promise((r) => (recorder.onstop = r));
    if (recorder.state !== "inactive") recorder.stop();
    await ended;
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType });
    let audio = new Float32Array(0);
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      audio = await toMono16k(decoded);
    } finally {
      ctx.close().catch(() => {});
    }
    return { audio, heardVoice };
  })();

  return { done, stop: () => finish() };
}

async function toMono16k(decoded) {
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
