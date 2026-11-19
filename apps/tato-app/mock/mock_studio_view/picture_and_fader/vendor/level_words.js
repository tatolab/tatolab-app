// A library the fixture view carries itself: an ES module in its `vendor/` folder, served as it is
// written and typed at the import by the declaration beside it.

/** `level`, a fader's position from 0 to 1, in the words the fader shows beside it. */
export function levelWords(level) {
  return level.toFixed(2);
}
