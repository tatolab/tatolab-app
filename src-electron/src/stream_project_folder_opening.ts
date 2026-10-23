// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Opening a stream's project folder from the window, in the file manager or in a terminal. The
// window names only the stream; the folder is the `project_directory` the runtime listed for it in
// the status the app last published, so a page can never have the app open a path of its choosing.

import { stat } from "node:fs/promises";
import type { ListedStream } from "../../src/backend/tatolab_backend_contract.js";
import type { TerminalOpenedInAFolder } from "./platform/mod.js";
import { failedWith, type Result } from "./result.js";

/** Where a stream's project folder opens: the desktop's file manager, or a terminal whose shell starts in it. */
export type StreamProjectFolderOpening = "file_manager" | "terminal";

/** What opens a folder, and how the app tells a folder still exists. */
export interface StreamProjectFolderOpeners {
  /** Show `folder` in the desktop's file manager, refused in the file manager's own words. */
  openAFolderInTheFileManager(folder: string): Promise<Result<void, string>>;
  terminalOpenedInAFolder: TerminalOpenedInAFolder;
  isAnExistingFolder(folderPath: string): Promise<boolean>;
}

/** Whether `folderPath` names a folder on this machine. */
export async function isAnExistingFolderOnThisMachine(folderPath: string): Promise<boolean> {
  try {
    return (await stat(folderPath)).isDirectory();
  } catch {
    return false;
  }
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
  if (!(await streamProjectFolderOpeners.isAnExistingFolder(projectFolder))) return failedWith(`${projectFolder} is no longer a folder on this machine.`);
  return opening === "file_manager"
    ? streamProjectFolderOpeners.openAFolderInTheFileManager(projectFolder)
    : streamProjectFolderOpeners.terminalOpenedInAFolder.openTerminalIn(projectFolder);
}
