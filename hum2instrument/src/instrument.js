/**
 * Small, dependency-free instrument renderer.
 * Every instrument is plain sample math, so the same code runs in a browser,
 * in a Web Worker, in Node, or inside a mobile WebView.
 */

import { midiToHz } from "./pitch.js";

const TAU = Math.PI * 2;

function envelope(t, duration, attack, decay, sustain, release) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  if (t < attack + decay) {
    const k = (t - attack) / decay;
    return 1 + (sustain - 1) * k;
  }
  if (t < duration) return sustain;
  const r = (t - duration) / release;
  return r >= 1 ? 0 : sustain * (1 - r);
}

function noise(index) {
  // Deterministic pseudo-noise, so renders are reproducible.
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Simple one-pole low-pass, used for the flute's breath noise. */
function lowpass(state, input, alpha) {
  return state + alpha * (input - state);
}

const INSTRUMENTS = {
  piano: { attack: 0.004, decay: 0.5, sustain: 0.28, release: 0.35, gain: 1 },
  epiano: { attack: 0.004, decay: 0.7, sustain: 0.42, release: 0.4, gain: 0.95 },
  strings: { attack: 0.12, decay: 0.25, sustain: 0.75, release: 0.45, gain: 0.8 },
  flute: { attack: 0.045, decay: 0.12, sustain: 0.82, release: 0.25, gain: 0.8 },
  guitar: { attack: 0.002, decay: 0.4, sustain: 0.2, release: 0.3, gain: 0.9 },
  bass: { attack: 0.008, decay: 0.35, sustain: 0.55, release: 0.25, gain: 1 },
};

export const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS);

/** Render one note into `out` at `startSample`. */
function renderNote(out, sampleRate, note, instrument) {
  const preset = INSTRUMENTS[instrument] || INSTRUMENTS.piano;
  const freq = midiToHz(note.midi);
  const startSample = Math.round(note.start * sampleRate);
  const gate = Math.max(0.06, note.duration);
  const total = gate + preset.release;
  const length = Math.round(total * sampleRate);
  const velocity = note.velocity ?? 0.85;

  // Karplus–Strong needs a delay line; keep it per note.
  const pluckDelay = Math.max(2, Math.round(sampleRate / freq));
  const pluck = instrument === "guitar" ? new Float32Array(pluckDelay) : null;
  if (pluck) {
    for (let i = 0; i < pluckDelay; i++) pluck[i] = noise(i + note.midi * 97);
  }
  let pluckIndex = 0;
  let breath = 0;
  let phase = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = envelope(t, gate, preset.attack, preset.decay, preset.sustain, preset.release);
    if (env <= 0) continue;

    let sample = 0;
    const vibrato = 1 + 0.003 * Math.sin(TAU * 5 * t);

    switch (instrument) {
      case "piano": {
        for (let h = 1; h <= 8; h++) {
          const amp = 1 / Math.pow(h, 1.6);
          const decay = Math.exp(-t * (1.4 + 0.55 * h));
          sample += amp * decay * Math.sin(TAU * freq * h * t);
        }
        sample *= 0.55;
        break;
      }
      case "epiano": {
        const index = 2.4 * Math.exp(-t * 5);
        const mod = Math.sin(TAU * freq * 3.5 * t) * index;
        sample = Math.sin(TAU * freq * t + mod) * 0.9;
        sample += 0.12 * Math.sin(TAU * freq * 2 * t);
        break;
      }
      case "strings": {
        phase += (TAU * freq * vibrato) / sampleRate;
        const saw = ((phase / TAU) % 1) * 2 - 1;
        sample = saw * 0.35 + Math.sin(TAU * freq * t) * 0.3;
        break;
      }
      case "flute": {
        phase += (TAU * freq * vibrato) / sampleRate;
        breath = lowpass(breath, noise(i), 0.08);
        sample = Math.sin(phase) * 0.8 + Math.sin(phase * 2) * 0.12 + breath * 0.12;
        break;
      }
      case "guitar": {
        // Karplus–Strong string.
        const current = pluck[pluckIndex];
        const next = pluck[(pluckIndex + 1) % pluckDelay];
        const value = (current + next) * 0.4985;
        pluck[pluckIndex] = value;
        pluckIndex = (pluckIndex + 1) % pluckDelay;
        sample = current * 0.9;
        break;
      }
      case "bass": {
        sample = Math.sin(TAU * freq * t) * 0.75 + Math.sin(TAU * freq * 2 * t) * 0.18;
        break;
      }
      default:
        sample = Math.sin(TAU * freq * t);
    }

    const idx = startSample + i;
    if (idx >= 0 && idx < out.length) out[idx] += sample * env * velocity * preset.gain;
  }
}

/**
 * Render notes into mono PCM.
 *
 * @param {{start: number, duration: number, midi: number, velocity?: number}[]} notes
 * @param {object} [opts]
 * @param {number} [opts.sampleRate=44100]
 * @param {string} [opts.instrument="piano"] one of `INSTRUMENT_NAMES`
 * @param {number} [opts.tailSeconds=1] extra room after the last note
 * @returns {Float32Array}
 */
export function renderNotes(notes, opts = {}) {
  const { sampleRate = 44100, instrument = "piano", tailSeconds = 1 } = opts;
  if (!notes.length) return new Float32Array(0);
  const end = Math.max(...notes.map((n) => n.start + Math.max(0.06, n.duration))) + tailSeconds;
  const out = new Float32Array(Math.ceil(end * sampleRate));
  for (const note of notes) renderNote(out, sampleRate, note, instrument);
  return normalizePeak(out, 0.9);
}

/** Scale so the loudest sample sits at `peak`. */
export function normalizePeak(samples, peak = 0.9) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
  if (max < 1e-6) return samples;
  const k = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i] *= k;
  return samples;
}
