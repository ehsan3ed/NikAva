/**
 * Pitch tracking with YIN (de Cheveigné & Kawahara, 2002).
 * Zero dependencies, works on plain Float32Array PCM in the browser or Node.
 */

/**
 * Estimate the fundamental frequency of one short window of samples.
 *
 * @param {Float32Array|number[]} frame mono samples in [-1, 1]
 * @param {number} sampleRate
 * @param {{minHz?: number, maxHz?: number, threshold?: number}} [opts]
 * @returns {{hz: number, clarity: number}} hz = 0 when the frame is unvoiced
 */
export function detectPitch(frame, sampleRate, opts = {}) {
  const { minHz = 70, maxHz = 1200, threshold = 0.15 } = opts;
  const n = frame.length;
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  if (maxTau <= minTau) return { hz: 0, clarity: 0 };

  // Difference function d(tau) = sum (x[i] - x[i+tau])^2
  const d = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0, len = n - tau; i < len; i++) {
      const diff = frame[i] - frame[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalised difference: removes the "prefer low pitches" bias.
  const cmnd = new Float32Array(maxTau + 1);
  let running = 0;
  for (let tau = minTau; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * (tau - minTau + 1)) / running : 1;
  }

  // First dip below the threshold = the period.
  let tau = minTau;
  for (; tau <= maxTau; tau++) {
    if (cmnd[tau] < threshold) break;
  }
  if (tau > maxTau) return { hz: 0, clarity: 0 };
  while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;

  // Parabolic interpolation for sub-sample accuracy.
  const s0 = cmnd[tau - 1] ?? cmnd[tau];
  const s1 = cmnd[tau];
  const s2 = cmnd[tau + 1] ?? cmnd[tau];
  const denom = 2 * (2 * s1 - s0 - s2);
  const shift = denom !== 0 ? (s2 - s0) / denom : 0;
  const period = tau + Math.max(-0.5, Math.min(0.5, shift));
  const hz = period > 0 ? sampleRate / period : 0;
  return { hz, clarity: Math.max(0, Math.min(1, 1 - s1)) };
}

/**
 * Frame-by-frame pitch track over a whole recording.
 *
 * @param {Float32Array|number[]} samples mono PCM in [-1, 1]
 * @param {number} sampleRate
 * @param {{frameSize?: number, hopSize?: number, minHz?: number, maxHz?: number, threshold?: number}} [opts]
 * @returns {{time: number, hz: number, clarity: number}[]}
 */
export function trackPitch(samples, sampleRate, opts = {}) {
  const {
    frameSize = Math.round(sampleRate * 0.046), // ~46 ms
    hopSize = Math.round(sampleRate * 0.0115), // ~11.5 ms
    minHz = 70,
    maxHz = 1200,
    threshold = 0.15,
  } = opts;

  const frame = new Float32Array(frameSize);
  const out = [];
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    // Hann window keeps the difference function clean at the edges.
    for (let i = 0; i < frameSize; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
      frame[i] = samples[start + i] * w;
    }
    const { hz, clarity } = detectPitch(frame, sampleRate, { minHz, maxHz, threshold });
    out.push({ time: start / sampleRate, hz, clarity });
  }
  return out;
}

/** Equal-tempered MIDI number for a frequency (A4 = 69). */
export function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}

/** Frequency of a MIDI note number. */
export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** MIDI number → "A4", "C#3", … */
export function midiToName(midi) {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Note name → MIDI number ("A4" → 69), or null. */
export function nameToMidi(name) {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(name).trim());
  if (!match) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + base + accidental;
}
