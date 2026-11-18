// Opening a stream's project folder from the window, in the file manager or in a terminal, or its
// log folder in the file manager. The window names only the stream's id; the folder is the
// project directory of the location the runtime listed for it in the status the app last
// published, or the log folder under it, so a page can never have the app open a path of its
// choosing.

import path from "node:path";
import { Effect } from "effect";
import { PROJECT_LOG_FOLDER_IN_THE_PROJECT } from "../shared/tatolab_backend_contract.js";
import { FileManager, ListedStreams, Terminal } from "./studio_runtime.js";
import { CommandRefused } from "./window_command.js";

/** What of a stream's project opens, and where: the project folder in the desktop's file manager or in a terminal whose shell starts in it, or its log folder in the file manager. */
export type StreamProjectFolderOpening = "file_manager" | "terminal" | "log_folder_in_the_file_manager";

/** `open_stream_project_folder`, `open_terminal_at_stream_project` or `open_stream_log_folder`: the project folder the runtime last listed for the stream `stream`, or its log folder, opened as `opening` asks; refused naming why when it is not listed, has no location, or the folder is gone. */
export const openTheStreamsProjectFolder = Effect.fn("openTheStreamsProjectFolder")(function* (stream: string, opening: StreamProjectFolderOpening) {
  const listedStream = (yield* ListedStreams).listedStream(stream);
  if (listedStream === null) return yield* new CommandRefused({ words: `The runtime does not list ${stream}, so Tato Studio has no project folder to open.` });
  const streamDisplayName = listedStream.display_name;
  if (listedStream.location === null) return yield* new CommandRefused({ words: `The runtime lists no project folder for ${streamDisplayName}.` });
  const projectFolder = listedStream.location.project_directory;
  const projectFolderGoneRefusal = `${projectFolder} is no longer a folder on this machine.`;
  switch (opening) {
    case "file_manager":
      return yield* (yield* FileManager).showAnExistingFolder(projectFolder, projectFolderGoneRefusal);
    case "terminal":
      return yield* (yield* Terminal).openInAnExistingFolder(projectFolder, projectFolderGoneRefusal);
    case "log_folder_in_the_file_manager": {
      // Stat only: the runtime's log segments in it are never listed or read.
      const logFolder = path.join(projectFolder, PROJECT_LOG_FOLDER_IN_THE_PROJECT);
      return yield* (yield* FileManager).showAnExistingFolder(logFolder, `${streamDisplayName} has no log folder yet: ${logFolder} is not on this machine.`);
    }
  }
});
