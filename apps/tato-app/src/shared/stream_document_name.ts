/** The file name a display name gives when it has no letter or digit to give one. */
const STREAM_DOCUMENT_NAME_WITH_NO_LETTER_OR_DIGIT = "stream";

/** The name a new stream's graph document takes from `displayName`, before any number past a name already held: lowercase letters, digits and `_`. */
export function streamDocumentNameOfTheDisplayName(displayName: string): string {
  const name = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return name === "" ? STREAM_DOCUMENT_NAME_WITH_NO_LETTER_OR_DIGIT : name;
}

/** `name`, or `name-2`, `name-3`, … the first that `isHeld` says nothing holds. */
export function streamDocumentNameNumberedPast(name: string, isHeld: (candidateName: string) => boolean): string {
  let number = 1;
  let candidateName = name;
  while (isHeld(candidateName)) {
    number += 1;
    candidateName = `${name}-${number}`;
  }
  return candidateName;
}
