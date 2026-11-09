/**
 * Turning a raw pitch track into musical notes — with no music theory needed
 * from the caller: the key is detected automatically and slightly-off
 * semitones are pulled into that key.
 */

import { hzToMidi, midiToName } from "./pitch.js";

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const SCALE = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function median3(values) {
  if (values.length < 3) return values.slice();
  const out = values.slice();
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[i - 1];
    const b = values[i];
    const c = values[i + 1];
    out[i] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  }
  return out;
}

/** Pearson correlation between two equal-length series. */
function correlate(a, b) {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

/**
 * Guess the key from how long each pitch class is held (Krumhansl–Kessler style).
 *
 * @param {{midi: number, duration: number}[]} notes
 * @returns {{tonic: number, mode: "major"|"minor", name: string, score: number}}
 */
export function detectKey(notes) {
  const hist = new Array(12).fill(0);
  for (const n of notes) {
    hist[((Math.round(n.midi) % 12) + 12) % 12] += Math.max(0.02, n.duration);
  }
  let best = { tonic: 0, mode: "major", name: "C major", score: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"]) {
      const profile = mode === "major" ? MAJOR : MINOR;
      const rotated = profile.map((_, i) => profile[(i - tonic + 12) % 12]);
      const score = correlate(hist, rotated);
      if (score > best.score) {
        best = { tonic, mode, name: `${NAMES[tonic]} ${mode}`, score };
      }
    }
  }
  return best;
}

/** Pitch classes (0-11) of a key. */
export function scalePitches(tonic, mode) {
  return SCALE[mode === "minor" ? "minor" : "major"].map((s) => (tonic + s) % 12);
}

/** Nearest in-key MIDI note, at most `maxDistance` semitones away. */
function nearestInKey(midi, tonic, mode, maxDistance) {
  const allowed = scalePitches(tonic, mode);
  const rounded = Math.round(midi);
  const distanceOf = (m) => {
    const pc = ((m % 12) + 12) % 12;
    return allowed.includes(pc) ? 0 : Math.min(...allowed.map((a) => Math.min(Math.abs(a - pc), 12 - Math.abs(a - pc))));
  };
  let best = rounded;
  let bestDistance = distanceOf(rounded);
  for (let delta = -maxDistance; delta <= maxDistance; delta++) {
    const candidate = rounded + delta;
    const d = distanceOf(candidate);
    if (d < bestDistance || (d === bestDistance && Math.abs(delta) < Math.abs(best - rounded))) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= maxDistance ? best : rounded;
}

/**
 * Pitch track → note events.
 *
 * @param {{time: number, hz: number, clarity: number}[]} track
 * @param {object} [opts]
 * @param {number} [opts.minClarity=0.55] frames quieter/less periodic than this are ignored
 * @param {number} [opts.minNoteMs=90] shorter blips are dropped
 * @param {number} [opts.bridgeMs=70] gaps up to this are glued onto notes
 * @param {number} [opts.hopMs=11.5] hop used by the pitch tracker
 * @param {boolean} [opts.snapToKey=true] pull notes that are a semitone off into the detected key
 * @param {number|null} [opts.transpose=null] semitones to shift the whole melody
 * @returns {{notes: {start: number, duration: number, midi: number, name: string, confidence: number}[], key: object}}
 */
export function trackToNotes(track, opts = {}) {
  const {
    minClarity = 0.55,
    minNoteMs = 90,
    bridgeMs = 70,
    hopMs = 11.5,
    snapToKey = true,
    transpose = null,
  } = opts;

  const frames = track.map((f) => ({
    time: f.time,
    midi: f.hz > 0 && f.clarity >= minClarity ? Math.round(hzToMidi(f.hz)) : null,
    clarity: f.clarity,
  }));

  // Median filter kills single-frame octave jumps and vibrato wobble.
  const voicedMidi = frames.map((f) => f.midi).filter((m) => m != null);
  const smoothed = median3(voicedMidi);
  let k = 0;
  for (const f of frames) if (f.midi != null) f.midi = smoothed[k++];

  const hop = hopMs / 1000;
  const raw = [];
  let current = null;
  for (const f of frames) {
    if (f.midi == null) {
      current = null;
      continue;
    }
    if (current && current.midi === f.midi) {
      current.end = f.time + hop;
      current.confidence = Math.max(current.confidence, f.clarity);
    } else {
      current = { start: f.time, end: f.time + hop, midi: f.midi, confidence: f.clarity };
      raw.push(current);
    }
  }

  // Glue notes of the same pitch separated by a very short gap.
  const merged = [];
  for (const n of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.midi === n.midi && n.start - prev.end <= bridgeMs / 1000) {
      prev.end = Math.max(prev.end, n.end);
      prev.confidence = Math.max(prev.confidence, n.confidence);
    } else {
      merged.push({ ...n });
    }
  }

  const kept = merged.filter((n) => (n.end - n.start) * 1000 >= minNoteMs);
  const notes = kept.map((n) => ({
    start: Number(n.start.toFixed(3)),
    duration: Number((n.end - n.start).toFixed(3)),
    midi: n.midi,
    name: midiToName(n.midi),
    confidence: Number(n.confidence.toFixed(2)),
  }));

  if (transpose) {
    for (const n of notes) {
      n.midi += transpose;
      n.name = midiToName(n.midi);
    }
  }

  const key = detectKey(notes);
  if (snapToKey && notes.length) {
    for (const n of notes) {
      const snapped = nearestInKey(n.midi, key.tonic, key.mode, 1);
      n.midi = snapped;
      n.name = midiToName(snapped);
    }
  }

  return { notes, key };
}

/**
 * Restrict notes to a plain scale range (useful when the target instrument
 * sounds bad outside a range).
 */
export function clampRange(notes, minMidi = 36, maxMidi = 84) {
  return notes
    .map((n) => {
      let midi = n.midi;
      while (midi < minMidi) midi += 12;
      while (midi > maxMidi) midi -= 12;
      return midi === n.midi ? n : { ...n, midi, name: midiToName(midi) };
    })
    .sort((a, b) => a.start - b.start);
}
