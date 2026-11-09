/**
 * Self-test: draw a small printed staff on a canvas-less bitmap,
 * read it back with score2sound, compare the detected notes.
 * Run with: node test/run.mjs
 */

import { imageToNotes, stepToMidi } from "../src/score.js";

const W = 820;
const H = 420;

function blank(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  return { width, height, data };
}

function setPx(img, x, y, v) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const p = (y * img.width + x) * 4;
  img.data[p] = v;
  img.data[p + 1] = v;
  img.data[p + 2] = v;
  img.data[p + 3] = 255;
}

function fillRect(img, x0, y0, w, h, v = 0) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(img, x, y, v);
}

function ellipse(img, cx, cy, rx, ry, filled, v = 0) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        if (filled || d > 0.45) setPx(img, x, y, v);
      }
    }
  }
}

/** Draw a five-line staff; returns geometry. */
function staff(img, x0, y0, spacing, thickness = 2) {
  const lines = [];
  for (let i = 0; i < 5; i++) {
    const y = y0 + i * spacing;
    fillRect(img, x0, y, img.width - x0 * 2, thickness, 0);
    lines.push(y);
  }
  return { x0, y0, spacing, lines, bottom: y0 + 4 * spacing };
}

function drawNote(img, st, x, step, filled = true, stem = true) {
  const cy = st.bottom - step * (st.spacing / 2);
  const rx = st.spacing * 0.62;
  const ry = st.spacing * 0.45;
  ellipse(img, x, cy, rx, ry, filled, 0);
  if (stem) {
    const up = step < 4;
    const stemX = Math.round(x + (up ? rx - 1 : -rx));
    fillRect(img, stemX, up ? cy - st.spacing * 3.2 : cy, 1.6, st.spacing * 3.2, 0);
  }
}

const img = blank(W, H);
const st = staff(img, 60, 90, 12);

// A short melody: E4, G4, B4, E5 (filled), then a hollow A4.
const plan = [
  { x: 150, step: 0, filled: true }, // E4
  { x: 250, step: 2, filled: true }, // G4
  { x: 350, step: 4, filled: true }, // B4
  { x: 450, step: 7, filled: true }, // E5
  { x: 560, step: 3, filled: false }, // A4
];
for (const p of plan) drawNote(img, st, p.x, p.step, p.filled);

const result = imageToNotes(img, { clef: "treble", bpm: 120 });
console.log("staves:", result.staves, "warnings:", result.warnings);
console.log("notes :", result.notes.map((n) => `${n.name}(${n.beats}b)`).join(" "));

const expected = plan.map((p) => stepToMidi(p.step, "treble"));
const got = result.notes.map((n) => n.midi);
let matched = 0;
for (let i = 0; i < Math.min(got.length, expected.length); i++) {
  if (got[i] === expected[i]) matched++;
}
console.log(`pitch match: ${matched}/${expected.length}`);

if (matched < expected.length) {
  console.error("FAIL: notes did not match the drawn score");
  process.exitCode = 1;
} else {
  console.log("ALL CHECKS PASSED");
}
