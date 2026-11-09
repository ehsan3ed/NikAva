/**
 * Printed sheet music → notes.
 *
 * Scope (on purpose, and documented in the README): clean, monophonic,
 * single-voice staff notation such as a lead sheet, a hymn line or a
 * beginner exercise. It reads the printed page, not handwriting, and it
 * assumes one note at a time.
 */

import {
  toGray,
  otsuThreshold,
  binarize,
  findHorizontalLines,
  groupStaves,
  removeLines,
  repairRemovedLines,
  components,
} from "./vision.js";
import { midiToName } from "../../hum2instrument/src/pitch.js";

// Semitone offset of each letter inside an octave.
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const SHARP_ORDER = [6, 1, 8, 3, 10, 5, 0]; // F C G D A E B
const FLAT_ORDER = [10, 3, 8, 1, 6, 11, 5]; // B E A D G C F

const CLEFS = {
  treble: { octave: 4, letter: 2 }, // bottom line = E4
  bass: { octave: 2, letter: 4 }, // bottom line = G2
};

/** Accidental per pitch class for a key signature, e.g. 2 sharps → F#, C#. */
function keyAccidentals(sharps = 0, flats = 0) {
  const map = new Map();
  if (sharps > 0) for (let i = 0; i < Math.min(7, sharps); i++) map.set(SHARP_ORDER[i], 1);
  if (flats > 0) for (let i = 0; i < Math.min(7, flats); i++) map.set(FLAT_ORDER[i], -1);
  return map;
}

/** Staff step (0 = bottom line) → MIDI number. */
export function stepToMidi(step, clef = "treble", accidentals = new Map()) {
  const ref = CLEFS[clef] || CLEFS.treble;
  const diatonic = ref.octave * 7 + ref.letter + Math.round(step);
  const octave = Math.floor(diatonic / 7);
  const letter = ((diatonic % 7) + 7) % 7;
  const semitone = LETTER_SEMITONES[letter] + (accidentals.get(letter) || 0);
  return (octave + 1) * 12 + semitone;
}

/**
 * Find noteheads of one staff.
 * @returns {{cx:number, cy:number, step:number, filled:boolean, width:number}[]}
 */
export function detectNoteheads(bin, width, height, staff) {
  const { spacing, top, bottom } = staff;
  const bandTop = Math.max(0, Math.round(top - spacing * 5));
  const bandBottom = Math.min(height - 1, Math.round(bottom + spacing * 5));
  const comps = components(bin, width, height, bandTop, bandBottom, Math.max(6, Math.round(spacing * 1.2)));

  const heads = [];
  for (const comp of comps) {
    const w = comp.x1 - comp.x0 + 1;
    const h = comp.y1 - comp.y0 + 1;
    if (w < spacing * 0.55) continue; // dots, line remnants, text
    if (w > spacing * 3.2) continue; // beams, barlines, lyrics
    if (h > spacing * 4.5) continue; // slurs, ties, tall text

    let headTop = comp.y0;
    let headBottom = comp.y1;
    if (h > spacing * 1.6) {
      // The stem is glued to the head: keep the rows that are as wide as a head.
      const counts = new Array(h).fill(0);
      for (const p of comp.pixels) {
        const y = (p / width) | 0;
        if (y >= comp.y0 && y <= comp.y1) counts[y - comp.y0]++;
      }
      const max = Math.max(...counts);
      const threshold = Math.max(2, max * 0.6);
      let bestStart = 0;
      let bestEnd = 0;
      let bestLen = 0;
      let runStart = -1;
      for (let i = 0; i < counts.length; i++) {
        const wide = counts[i] >= threshold;
        if (wide && runStart < 0) runStart = i;
        if ((!wide || i === counts.length - 1) && runStart >= 0) {
          const runEnd = wide ? i : i - 1;
          if (runEnd - runStart + 1 > bestLen) {
            bestLen = runEnd - runStart + 1;
            bestStart = runStart;
            bestEnd = runEnd;
          }
          runStart = -1;
        }
      }
      if (bestLen > 0) {
        headTop = comp.y0 + bestStart;
        headBottom = comp.y0 + bestEnd;
      }
    }

    const headHeight = headBottom - headTop + 1;
    if (headHeight > spacing * 1.6) continue;

    // Filled heads have ink in the middle; hollow heads (half/whole notes) do not.
    const cx = (comp.x0 + comp.x1) / 2;
    const cy = (headTop + headBottom) / 2;
    let ink = 0;
    let total = 0;
    const halfW = Math.max(1, Math.round((comp.x1 - comp.x0) * 0.18));
    const halfH = Math.max(1, Math.round(headHeight * 0.18));
    for (let y = Math.round(cy - halfH); y <= Math.round(cy + halfH); y++) {
      for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        total++;
        ink += bin[y * width + x];
      }
    }
    if (!total) continue;
    const filled = ink / total > 0.45;

    const step = Math.round((bottom - cy) / (spacing / 2));
    if (Math.abs(step) > 12) continue; // ledger-line noise
    heads.push({ cx, cy, step, filled, width: comp.x1 - comp.x0 + 1 });
  }

  // Merge duplicates from the same notehead split by the line removal.
  heads.sort((a, b) => a.cx - b.cx);
  const merged = [];
  for (const head of heads) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.cx - head.cx) < spacing * 0.7 && Math.abs(prev.cy - head.cy) < spacing * 0.5) {
      continue;
    }
    merged.push(head);
  }
  return merged;
}

/**
 * Read a page of printed music.
 *
 * @param {{width:number, height:number, data:Uint8ClampedArray|number[]}} imageData RGBA pixels (canvas ImageData)
 * @param {object} [opts]
 * @param {"treble"|"bass"} [opts.clef="treble"]
 * @param {number} [opts.sharps=0] key signature sharps
 * @param {number} [opts.flats=0] key signature flats
 * @param {number} [opts.bpm=96] tempo used to turn written durations into seconds
 * @param {number} [opts.filledBeats=1] duration of a filled notehead (quarter by default)
 * @param {number} [opts.hollowBeats=2] duration of a hollow notehead (half by default)
 * @returns {{notes: object[], staves: number, warnings: string[]}}
 */
export function imageToNotes(imageData, opts = {}) {
  const {
    clef = "treble",
    sharps = 0,
    flats = 0,
    bpm = 96,
    filledBeats = 1,
    hollowBeats = 2,
    threshold: fixedThreshold,
  } = opts;

  const warnings = [];
  const { width, height } = imageData;
  const gray = toGray(imageData);
  const threshold = fixedThreshold ?? otsuThreshold(gray);
  const bin = binarize(gray, threshold);

  const lines = findHorizontalLines(bin, width, height);
  const staves = groupStaves(lines);
  if (!staves.length) {
    warnings.push("پنج خط حامل پیدا نشد؛ عکس را صاف، روشن و بدون سایه بگیرید.");
    return { notes: [], staves: 0, warnings };
  }

  const accidentals = keyAccidentals(sharps, flats);
  const secondsPerBeat = 60 / Math.max(30, Math.min(240, bpm));
  const raw = [];
  const perStaff = [];

  staves.forEach((staff, staffIndex) => {
    // Work on a copy: removing lines destroys the ink we still need for later staves.
    const staffBin = new Uint8Array(bin);
    removeLines(staffBin, width, staff);
    repairRemovedLines(staffBin, width, height, staff);
    const heads = detectNoteheads(staffBin, width, height, staff);
    if (!heads.length) return;
    perStaff.push(heads.length);

    for (const head of heads) {
      const midi = stepToMidi(head.step, clef, accidentals);
      raw.push({
        x: head.cx,
        step: head.step,
        staffIndex,
        staffTop: staff.top,
        midi,
        beats: head.filled ? filledBeats : hollowBeats,
      });
    }
  });

  if (!raw.length) warnings.push("خط حامل پیدا شد ولی نتی خوانده نشد (شاید عکس تار است).");

  // Reading order: staff by staff, left to right.
  raw.sort((a, b) => a.staffTop - b.staffTop || a.x - b.x);

  const notes = [];
  let cursor = 0;
  for (const item of raw) {
    const duration = item.beats * secondsPerBeat;
    notes.push({
      start: Number(cursor.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      midi: item.midi,
      name: midiToName(item.midi),
      beats: item.beats,
      step: item.step,
      x: Math.round(item.x),
      staffIndex: item.staffIndex,
    });
    cursor += duration;
  }

  if (staves.length > 1 && perStaff.length > 1) {
    warnings.push(`${staves.length} خط حامل دیده شد؛ نتها به ترتیب از بالا به پایین خوانده شدند.`);
  }

  return {
    notes,
    staves: staves.length,
    staffs: staves.map((s) => ({ top: s.top, bottom: s.bottom, spacing: s.spacing })),
    warnings,
  };
}
