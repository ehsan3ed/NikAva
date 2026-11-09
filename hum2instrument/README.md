# hum2instrument

Whistle or hum a melody — get the notes and a real instrument back. No music theory needed: the key
is detected automatically and slightly-off notes are pulled into it.

Zero dependencies. Plain ES modules. Runs in the browser, a Web Worker, a mobile WebView or Node.

**[Open the demo](demo/index.html)** (record with the mic or drop an audio file).

## Quick start

```js
import { humToInstrument, encodeWav } from "./src/index.js";

// samples: mono Float32Array in [-1, 1]
const { notes, key, audio, wav } = humToInstrument(samples, 44100, {
  instrument: "piano", // piano | epiano | strings | flute | guitar | bass
});

console.log(key.name);                       // "C major"
console.log(notes.map((n) => n.name));       // ["C4", "D4", "E4", …]
download(new Blob([wav], { type: "audio/wav" }));
```

Audio path from a recording (browser):

```js
import { decodeToMono, analyzeHum, renderNotes } from "./src/index.js";

const { samples, sampleRate } = await decodeToMono(await file.arrayBuffer());
const { notes, key } = analyzeHum(samples, sampleRate);
const audio = renderNotes(notes, { instrument: "flute", sampleRate });
```

## API

### `humToInstrument(samples, sampleRate, options?)`

| option | default | meaning |
| --- | --- | --- |
| `instrument` | `"piano"` | one of `INSTRUMENT_NAMES` |
| `minMidi` / `maxMidi` | `36` / `84` | octave-folds notes into a playable range |
| `tailSeconds` | `1` | silence kept after the last note |

Returns `{ notes, key, audio, sampleRate, wav }`.

### `analyzeHum(samples, sampleRate, options?)`

Same detection without rendering; returns `{ notes, key, track }`. The raw `track` is useful for
drawing a pitch curve.

Useful options (passed through `options.pitch` / `options.notes`):

| option | default | meaning |
| --- | --- | --- |
| `pitch.frameSize` | `46 ms` | analysis window |
| `pitch.hopSize` | `11.5 ms` | step between windows |
| `pitch.minHz` / `maxHz` | `70` / `1200` | human hum/whistle range |
| `notes.minClarity` | `0.55` | how periodic a frame must be to count |
| `notes.minNoteMs` | `90` | shorter blips are dropped |
| `notes.bridgeMs` | `70` | tiny gaps are glued onto the note |
| `notes.snapToKey` | `true` | pull notes a semitone off into the detected key |
| `notes.transpose` | `null` | shift the whole melody by semitones |

### `renderNotes(notes, { instrument, sampleRate, tailSeconds })`

Renders note events (`{ start, duration, midi }`) to a normalised mono `Float32Array`.

### `trackPitch(samples, sampleRate, options?)`

YIN pitch tracking, frame by frame: `[{ time, hz, clarity }]`. `hz === 0` means unvoiced.

### Helpers

`detectPitch(frame, sampleRate)`, `trackToNotes(track, options)`, `detectKey(notes)`,
`midiToName(midi)`, `nameToMidi("A4")`, `midiToHz(midi)`, `hzToMidi(hz)`, `encodeWav(audio, sr)`,
`decodeToMono(arrayBuffer)` (browser), `clampRange(notes, minMidi, maxMidi)`.

## How it works

1. **Pitch track** — YIN with cumulative-mean normalised difference, ~11 ms hop, 70–1200 Hz.
2. **Note segmentation** — median filter over the pitch track, merge equal-pitch frames, drop
   blips shorter than 90 ms, glue gaps under 70 ms.
3. **Key detection** — duration-weighted pitch-class histogram correlated with the
   Krumhansl–Kessler major/minor profiles.
4. **Key snapping** — a note at most one semitone outside the detected key is moved onto the scale.
5. **Synthesis** — additive / FM / Karplus–Strong oscillators with a shared ADSR envelope, per
   instrument, rendered sample by sample.

## Measured behaviour

`npm test` synthesises a hummed melody (vibrato + drift + small noise) and checks the result:

```
detected key : E minor
pitch match  : 5/6 (83%)
piano / guitar / flute / strings / epiano / bass: all render non-silent audio
```

`83%` is the expected ballpark for a six-note phrase with vibrato — the one miss is an F4 that the
key snapper pulled to E4. Longer phrases with a clear tonal centre score higher.

## Limitations

- Monophonic only: chords and simultaneous voices are not supported (by design — humming is
  monophonic).
- Very noisy rooms or heavy reverb can produce spurious short notes; raise `minClarity` and
  `minNoteMs`.
- The synthesiser is intentionally simple — it is a sketch instrument, not a sample library.
- Octave errors are possible by nature of pitch tracking; `clampRange` folds them into one octave
  band when that is musically correct for you.

## Roadmap

- [ ] optional scale override (`C major`, `D dorian`, …) instead of detection
- [ ] MIDI export
- [ ] rhythm quantisation to a chosen BPM
- [ ] more instruments (marimba, music box, brass)

MIT licensed.
