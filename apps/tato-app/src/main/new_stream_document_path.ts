// Where a stream made from Studio keeps its graph document: in the project's `streams/`, the folder the runtime's
// scaffold writes stream assets to, named for its display name and numbered `-2`, `-3`, … past a name a file
// already holds, as the runtime numbers an import.

import type { ProjectFileTheRuntimeListed } from "./project_files_on_the_wire.js";

/** The project folder stream assets are kept in. */
export const PROJECT_STREAMS_FOLDER = "streams";

/** The file name a display name gives when it has no letter or digit to give one. */
const STREAM_DOCUMENT_NAME_WITH_NO_LETTER_OR_DIGIT = "stream";

function streamDocumentNameOf(displayName: string): string {
  const name = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return name === "" ? STREAM_DOCUMENT_NAME_WITH_NO_LETTER_OR_DIGIT : name;
}

/** The `streams/<name>.graph.json` path for a new stream shown under `displayName` that none of `filesUnderTheStreamsFolder` holds. */
export function newStreamDocumentPathNoFileHolds(displayName: string, filesUnderTheStreamsFolder: readonly ProjectFileTheRuntimeListed[]): string {
  const pathsHeld = new Set(filesUnderTheStreamsFolder.map((file) => file.path));
  const name = streamDocumentNameOf(displayName);
  let number = 1;
  let documentPath = `${PROJECT_STREAMS_FOLDER}/${name}.graph.json`;
  while (pathsHeld.has(documentPath)) {
    number += 1;
    documentPath = `${PROJECT_STREAMS_FOLDER}/${name}-${number}.graph.json`;
  }
  return documentPath;
}
