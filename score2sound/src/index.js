/**
 * score2sound — a photo of printed sheet music in, instrument audio out.
 * The synthesiser is shared with hum2instrument so both demos sound the same.
 */

export { imageToNotes, stepToMidi, detectNoteheads } from "./score.js";
export {
  toGray,
  binarize,
  otsuThreshold,
  findHorizontalLines,
  groupStaves,
} from "./vision.js";
export {
  renderNotes,
  encodeWav,
  INSTRUMENT_NAMES,
  midiToName,
} from "../../hum2instrument/src/index.js";
