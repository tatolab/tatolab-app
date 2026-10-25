// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Opening the runtime's own log folder from Settings. The window names nothing: the folder is the
// one the runtime names in `describe_runtime` when asked, so a page can never have the app open a
// path of its choosing.

import type { RuntimeDescription } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { failedWith, type Result } from "./result.js";
import { openedWhenAnExistingFolder, type StreamProjectFolderOpeners } from "./stream_project_folder_opening.js";

/** Why the log folder of a runtime that keeps no own log cannot be opened. */
export const RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL = "The runtime keeps no log of its own, so there is no folder to open.";

/** Show the folder `runtimeDescription` names for the runtime's own log in the file manager; refused naming why when the runtime did not describe itself, keeps no log, or the folder is not on this machine. */
export async function openTheRuntimesLogFolder(
  runtimeDescription: Result<RuntimeDescription, LocalApiRequestFailure>,
  streamProjectFolderOpeners: StreamProjectFolderOpeners,
): Promise<Result<void, string>> {
  if (!runtimeDescription.ok) return failedWith(runtimeDescription.failure.failureDescription);
  const runtimeLogFolder = runtimeDescription.value.runtime_log_directory;
  if (runtimeLogFolder === null) return failedWith(RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL);
  return openedWhenAnExistingFolder(streamProjectFolderOpeners, runtimeLogFolder, `${runtimeLogFolder} is not a folder on this machine.`, (folder) =>
    streamProjectFolderOpeners.openAFolderInTheFileManager(folder),
  );
}
