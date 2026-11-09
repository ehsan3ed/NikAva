# score2sound

A photo of **printed sheet music** in, instrument audio out. Built for people who can read a little
music on paper but cannot play it — and for anyone who wants a tiny, dependency-free optical music
reader instead of a full OMR stack.

**[Open the demo](demo/index.html)** (upload a photo, or press "نمونهٔ آزمایشی" for a built-in score).

## Quick start

```js
import { imageToNotes, renderNotes, encodeWav } from "./src/index.js";

const canvas = document.createElement("canvas");
// … draw or load the photo into the canvas …
const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);

const { notes, staves, warnings } = imageToNotes(imageData, {
  clef: "treble", // "treble" | "bass"
  sharps: 0,      // key signature, in accidentals
  flats: 0,
  bpm: 96,        // written durations → seconds
});

const audio = renderNotes(notes, { instrument: "piano", sampleRate: 44100 });
const wav = encodeWav(audio, 44100);
```

## API

### `imageToNotes(imageData, options?)`

`imageData` is anything shaped like a canvas `ImageData` (`{ width, height, data }` with RGBA
bytes), so the function also runs in Node on a bitmap you built yourself — that is exactly what
`test/run.mjs` does.

| option | default | meaning |
| --- | --- | --- |
| `clef` | `"treble"` | bottom staff line = E4 (treble) or G2 (bass) |
| `sharps` / `flats` | `0` | key signature, applied to every matching pitch class |
| `bpm` | `96` | tempo used to convert written durations to seconds |
| `filledBeats` | `1` | duration of a filled notehead (quarter note) |
| `hollowBeats` | `2` | duration of a hollow notehead (half note) |
| `threshold` | Otsu | override for badly lit scans |

Returns:

```js
{
  notes: [{ start, duration, midi, name, beats, step, x, staffIndex }],
  staves: 1,                      // number of staves found
  staffs: [{ top, bottom, spacing }],
  warnings: ["…"]
}
```

### Other exports

`stepToMidi(step, clef, accidentals)`, `detectNoteheads(bin, width, height, staff)`,
`findHorizontalLines`, `groupStaves`, `toGray`, `binarize`, `otsuThreshold`, and the shared
synthesiser (`renderNotes`, `encodeWav`, `INSTRUMENT_NAMES`).

## Pipeline

1. **Binarise** — grayscale + Otsu threshold.
2. **Find staves** — rows that are dark across most of the page, grouped into five evenly spaced
   lines (2–25% spacing tolerance).
3. **Clear the lines** — then *bridge* the cleared rows wherever ink continues above and below, so a
   notehead sitting on a line stays one blob instead of two halves.
4. **Connected components** — flood fill per staff band; wide-enough blobs with a notehead-sized
   bounding box are candidates.
5. **Head inside the stem** — when a stem is glued to the head, the rows that are as wide as a head
   are kept, so the centre line is correct.
6. **Pitch** — vertical position → staff step → diatonic letter → MIDI, with the key signature
   applied.
7. **Duration** — hollow head = `hollowBeats`, filled head = `filledBeats` (a deliberate
   simplification, see below).
8. **Read order** — staff by staff, left to right, durations laid out from the chosen tempo.

## What it handles — and what it does not

Supported:

- printed (not handwritten) monophonic scores: lead sheets, hymn lines, beginner exercises
- treble and bass clef, key signatures up to four sharps/flats
- filled (quarter) and hollow (half/whole) noteheads, notes on lines and in spaces, ledger lines up
  to two steps outside the staff

Not supported yet:

- chords and multiple simultaneous voices (only the topmost note would be found)
- beams, flags and therefore eighth/sixteenth durations; dots and tuplets
- accidentals printed *next to* a single note (use the key-signature options instead)
- handwriting, curved or rotated pages, low light, strong shadows
- lyrics and performance marks (ignored, but they can confuse detection on dense pages)

These are explicit roadmap items, not bugs — a complete OMR engine is far larger than this module,
and the point here is a readable, hackable core.

## Tests

```bash
node test/run.mjs
```

The test draws a synthetic staff bitmap (no canvas), reads it back and compares the notes:

```
staves: 1  warnings: []
notes : E4(1b) G4(1b) B4(1b) E5(1b) A4(2b)
pitch match: 5/5
ALL CHECKS PASSED
```

## Roadmap

- [ ] stems and flags → eighth / sixteenth durations
- [ ] beams
- [ ] accidentals beside notes
- [ ] multi-staff scores played together instead of sequence
- [ ] straighten / de-skew the photo before detection
- [ ] MusicXML export

MIT licensed.
