/**
 * Self-test: synthesise a "hummed" melody, detect it back, render an instrument.
 * Run with: node test/run.mjs
 */

import { analyzeHum, humToInstrument, encodeWav, midiToHz, midiToName } from "../src/index.js";

const SR = 22050;

/** A hum: sine + 2nd harmonic + vibrato + a little noise. */
function humMelody(notes, sampleRate = SR) {
  const total = notes.reduce((sum, n) => sum + n.duration + 0.05, 0.2);
  const out = new Float32Array(Math.ceil(total * sampleRate));
  let cursor = 0;
  for (const n of notes) {
    const start = Math.round(cursor * sampleRate);
    const length = Math.round(n.duration * sampleRate);
    const freq = midiToHz(n.midi);
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // slow vibrato + small pitch drift, like a real person humming
      const drift = 1 + 0.004 * Math.sin(2 * Math.PI * 4.5 * t) + 0.0015 * Math.sin(2 * Math.PI * 0.7 * t);
      phase += (2 * Math.PI * freq * drift) / sampleRate;
      const env = Math.min(1, t / 0.02) * Math.min(1, (n.duration - t) / 0.03);
      const noise = (Math.sin((start + i) * 91.7) * 43758.5453) % 1;
      out[start + i] +=
        (Math.sin(phase) * 0.7 + Math.sin(phase * 2) * 0.15 + noise * 0.01) * Math.max(0, env);
    }
    cursor += n.duration + 0.05;
  }
  return out;
}

function fail(message) {
  console.error("FAIL:", message);
  process.exitCode = 1;
}

const truth = [
  { midi: 60, duration: 0.4 }, // C4
  { midi: 62, duration: 0.4 }, // D4
  { midi: 64, duration: 0.4 }, // E4
  { midi: 67, duration: 0.7 }, // G4
  { midi: 65, duration: 0.4 }, // F4
  { midi: 64, duration: 0.8 }, // E4
];

const hum = humMelody(truth);
const { notes, key } = analyzeHum(hum, SR);

console.log("detected key :", key.name, "(score", key.score.toFixed(2) + ")");
console.log("detected notes:", notes.map((n) => n.name + "@" + n.start.toFixed(2)).join(", "));

if (notes.length < truth.length - 2) fail(`too few notes: ${notes.length} of ${truth.length}`);

// Compare note names, allowing one octave of leeway (humming octaves is common).
const gotNames = notes.map((n) => n.midi);
const wantNames = truth.map((n) => n.midi);
let matched = 0;
for (let i = 0; i < Math.min(gotNames.length, wantNames.length); i++) {
  const diff = Math.abs(gotNames[i] - wantNames[i]);
  if (diff === 0 || diff === 12) matched++;
}
const ratio = matched / wantNames.length;
console.log(`pitch match  : ${matched}/${wantNames.length} (${Math.round(ratio * 100)}%)`);
if (ratio < 0.8) fail("pitch accuracy below 80%");

for (const instrument of ["piano", "guitar", "flute", "strings", "epiano", "bass"]) {
  const out = humToInstrument(hum, SR, { instrument });
  let peak = 0;
  let energy = 0;
  for (const s of out.audio) {
    peak = Math.max(peak, Math.abs(s));
    energy += s * s;
  }
  const rms = Math.sqrt(energy / Math.max(1, out.audio.length));
  const ok = out.audio.length > 0 && peak > 0.5 && rms > 0.01;
  console.log(`${instrument.padEnd(8)}: ${out.audio.length} samples, peak ${peak.toFixed(2)}, rms ${rms.toFixed(3)}`, ok ? "ok" : "");
  if (!ok) fail(`instrument ${instrument} rendered silence`);
}

const wav = encodeWav(humToInstrument(hum, SR).audio, SR);
const header = String.fromCharCode(...new Uint8Array(wav, 0, 4));
const wave = String.fromCharCode(...new Uint8Array(wav, 8, 4));
console.log("wav header   :", header, wave, `${wav.byteLength} bytes`);
if (header !== "RIFF" || wave !== "WAVE") fail("bad WAV header");

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
