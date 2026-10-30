// Alle Geräusche werden mit der Web Audio API erzeugt, es gibt keine Audiodateien.
let ctx;
const listeners = new Set();

/** Wird bei jedem Geräusch aufgerufen, damit die Musik kurz leiser werden kann. */
export function onSound(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Muss einmal aus einer Berührung heraus aufgerufen werden (Autoplay-Regel der Browser). */
export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
}

function start(duckMs) {
  unlockAudio();
  listeners.forEach((fn) => fn(duckMs));
  return ctx.currentTime;
}

function tone(t, { type = "sine", freq, to, dur, gain = 0.25, attack = 0.01 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Kurzes "Plopp" beim Antippen einer Kachel. */
export function pop() {
  const t = start(250);
  tone(t, { freq: 520, to: 880, dur: 0.12, gain: 0.2 });
}

/** Scanner-Piep wie an der echten Kasse. */
export function beep() {
  const t = start(350);
  tone(t, { type: "square", freq: 1760, dur: 0.14, gain: 0.08, attack: 0.005 });
}

/** Etwas gefällt dem Schaf nicht (unbekannter Code). */
export function nope() {
  const t = start(500);
  tone(t, { type: "triangle", freq: 330, to: 220, dur: 0.18, gain: 0.25 });
  tone(t + 0.2, { type: "triangle", freq: 260, to: 180, dur: 0.25, gain: 0.25 });
}

/** Kassen-Klingeln. */
export function kaching() {
  const t = start(1200);
  tone(t, { type: "square", freq: 2093, dur: 0.08, gain: 0.06 });
  [1568, 2093, 2637, 3136].forEach((f, i) => tone(t + 0.1 + i * 0.07, { freq: f, dur: 0.6, gain: 0.12 }));
}

/** "Määäh": Sägezahn mit Vibrato durch zwei Formantfilter. */
export function maeh() {
  const t = start(1400);
  const dur = 0.9;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(310, t);
  osc.frequency.linearRampToValueAtTime(340, t + 0.15);
  osc.frequency.linearRampToValueAtTime(260, t + dur);

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 7;
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain).connect(osc.frequency);

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.5, t + 0.06);
  out.gain.setValueAtTime(0.5, t + dur - 0.25);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  for (const [f, q] of [[800, 6], [1250, 8]]) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = q;
    osc.connect(bp).connect(out);
  }
  out.connect(ctx.destination);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + dur + 0.05);
  lfo.stop(t + dur + 0.05);
}
