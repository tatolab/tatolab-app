// Opening a stream's project folder from the window, in the file manager or in a terminal, or its
// log folder in the file manager. The window names only the stream; the folder is the
// `project_directory` the runtime listed for it in the status the app last published, or the log
// folder under it, so a page can never have the app open a path of its choosing.

import path from "node:path";
import { STREAM_LOG_FOLDER_IN_THE_PROJECT, type ListedStream } from "../shared/tatolab_backend_contract.js";
import type { TerminalOpenedInAFolder } from "./platform/mod.js";
import { failedWith, type Result } from "./result.js";

/** What of a stream's project opens, and where: the project folder in the desktop's file manager or in a terminal whose shell starts in it, or its log folder in the file manager. */
export type StreamProjectFolderOpening = "file_manager" | "terminal" | "log_folder_in_the_file_manager";

/** What opens a folder, and how the app tells a folder still exists. */
export interface StreamProjectFolderOpeners {
  /** Show `folder` in the desktop's file manager, refused in the file manager's own words. */
  openAFolderInTheFileManager(folder: string): Promise<Result<void, string>>;
  terminalOpenedInAFolder: TerminalOpenedInAFolder;
  isAnExistingFolder(folderPath: string): Promise<boolean>;
}

/** `folder` opened by `openTheFolder` while it is a folder on this machine; refused with `refusalWhenMissing` once it is not. */
export async function openedWhenAnExistingFolder(
  streamProjectFolderOpeners: StreamProjectFolderOpeners,
  folder: string,
  refusalWhenMissing: string,
  openTheFolder: (existingFolder: string) => Promise<Result<void, string>>,
): Promise<Result<void, string>> {
  return (await streamProjectFolderOpeners.isAnExistingFolder(folder)) ? openTheFolder(folder) : failedWith(refusalWhenMissing);
}

/** Open the project folder the runtime listed for `streamName` in `listedStreams` as `opening` asks; refused naming why when it is not listed, names no folder, or the folder is gone. */
export async function openStreamProjectFolder(
  listedStreams: readonly ListedStream[] | null,
  streamName: string,
  opening: StreamProjectFolderOpening,
  streamProjectFolderOpeners: StreamProjectFolderOpeners,
): Promise<Result<void, string>> {
  const listedStream = listedStreams?.find((stream) => stream.name === streamName) ?? null;
  if (listedStream === null) return failedWith(`The runtime does not list ${streamName}, so Tatolab has no project folder to open.`);
  const projectFolder = listedStream.project_directory;
  if (projectFolder === "") return failedWith(`The runtime lists no project folder for ${streamName}.`);
  const projectFolderGoneRefusal = `${projectFolder} is no longer a folder on this machine.`;
  const openInTheFileManager = (folder: string) => streamProjectFolderOpeners.openAFolderInTheFileManager(folder);
  switch (opening) {
    case "file_manager":
      return openedWhenAnExistingFolder(streamProjectFolderOpeners, projectFolder, projectFolderGoneRefusal, openInTheFileManager);
    case "terminal":
      return openedWhenAnExistingFolder(streamProjectFolderOpeners, projectFolder, projectFolderGoneRefusal, (folder) =>
        streamProjectFolderOpeners.terminalOpenedInAFolder.openTerminalIn(folder),
      );
    case "log_folder_in_the_file_manager": {
      // Stat only: the runtime's log segments in it are never listed or read.
      const logFolder = path.join(projectFolder, STREAM_LOG_FOLDER_IN_THE_PROJECT);
      return openedWhenAnExistingFolder(streamProjectFolderOpeners, logFolder, `${streamName} has no log folder yet: ${logFolder} is not on this machine.`, openInTheFileManager);
    }
  }
}
