// Where a stream made from Studio keeps its graph document: in the project's `streams/`, the folder the runtime's
// scaffold writes stream assets to.

import { streamDocumentNameNumberedPast, streamDocumentNameOfTheDisplayName } from "../shared/stream_document_name.js";
import type { ProjectFileTheRuntimeListed } from "./project_files_on_the_wire.js";

/** The project folder stream assets are kept in. */
export const PROJECT_STREAMS_FOLDER = "streams";

/** The `streams/<name>.graph.json` path for a new stream shown under `displayName` that none of `filesUnderTheStreamsFolder` holds. */
export function newStreamDocumentPathNoFileHolds(displayName: string, filesUnderTheStreamsFolder: readonly ProjectFileTheRuntimeListed[]): string {
  // A project can sit on APFS, which folds case, so `streams/Preview.graph.json` holds `streams/preview.graph.json`.
  const pathsHeld = new Set(filesUnderTheStreamsFolder.map((file) => file.path.toLowerCase()));
  const documentPathOf = (name: string) => `${PROJECT_STREAMS_FOLDER}/${name}.graph.json`;
  return documentPathOf(streamDocumentNameNumberedPast(streamDocumentNameOfTheDisplayName(displayName), (candidateName) => pathsHeld.has(documentPathOf(candidateName))));
}
