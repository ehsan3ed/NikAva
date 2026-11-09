/**
 * hum2instrument — whistle or hum a tune, get notes + an instrument back.
 * No music theory required: the key is detected, wobbles are pulled into it.
 */

import { trackPitch, hzToMidi, midiToHz, midiToName, nameToMidi } from "./pitch.js";
import { trackToNotes, detectKey, clampRange, scalePitches } from "./notes.js";
import { renderNotes, normalizePeak, INSTRUMENT_NAMES } from "./instrument.js";
import { encodeWav } from "./wav.js";

/**
 * Analyse a recording without rendering anything.
 *
 * @param {Float32Array|number[]} samples mono PCM in [-1, 1]
 * @param {number} sampleRate
 * @param {object} [opts] see `trackPitch` / `trackToNotes`
 * @returns {{notes: object[], key: object, track: object[]}}
 */
export function analyzeHum(samples, sampleRate, opts = {}) {
  const track = trackPitch(samples, sampleRate, opts.pitch);
  const hopMs = (opts.pitch?.hopSize ?? Math.round(sampleRate * 0.0115)) / sampleRate * 1000;
  const { notes, key } = trackToNotes(track, { ...opts.notes, hopMs });
  return { notes, key, track };
}

/**
 * One-shot pipeline: PCM in → notes + rendered instrument audio out.
 *
 * @param {Float32Array|number[]} samples
 * @param {number} sampleRate
 * @param {object} [opts]
 * @param {string} [opts.instrument="piano"]
 * @param {number} [opts.minMidi=36]
 * @param {number} [opts.maxMidi=84]
 * @returns {{notes: object[], key: object, audio: Float32Array, sampleRate: number, wav: ArrayBuffer}}
 */
export function humToInstrument(samples, sampleRate, opts = {}) {
  const { instrument = "piano", minMidi = 36, maxMidi = 84 } = opts;
  const { notes, key } = analyzeHum(samples, sampleRate, opts);
  const ranged = clampRange(notes, minMidi, maxMidi);
  const audio = renderNotes(ranged, { instrument, sampleRate, tailSeconds: opts.tailSeconds ?? 1 });
  return {
    notes: ranged,
    key,
    audio,
    sampleRate,
    wav: encodeWav(audio, sampleRate),
  };
}

/** Decode a WAV/blob buffer to mono PCM (browser only). */
export async function decodeToMono(arrayBuffer) {
  const Ctx = globalThis.OfflineAudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) throw new Error("No Web Audio available in this environment");
  const ctx = new Ctx(1, 1, 44100);
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const channels = decoded.numberOfChannels;
  const out = new Float32Array(decoded.length);
  for (let c = 0; c < channels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / channels;
  }
  return { samples: out, sampleRate: decoded.sampleRate };
}

export {
  trackPitch,
  trackToNotes,
  detectKey,
  scalePitches,
  clampRange,
  renderNotes,
  normalizePeak,
  encodeWav,
  INSTRUMENT_NAMES,
  hzToMidi,
  midiToHz,
  midiToName,
  nameToMidi,
};
