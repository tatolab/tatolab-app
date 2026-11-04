// The workspace the studio had open, remembered between launches in one JSON file in the app's
// config directory, so the next launch opens it again.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { isAJsonObject, parseJsonOnTheWire } from "./json_on_the_wire.js";
import type { RememberedOpenWorkspaceFolder } from "./open_workspace.js";
import { describeCaughtFailure, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The file the open workspace's folder is remembered in, inside the app's config directory. */
export const OPEN_WORKSPACE_FILE_NAME = "open-workspace.json";

const OPEN_WORKSPACE_FOLDER_KEY = "open_workspace_folder";

/** The open workspace's folder, remembered in `open-workspace.json` inside `appConfigDirectory`; none when the file is absent or unreadable. */
export function rememberedOpenWorkspaceFileIn(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): RememberedOpenWorkspaceFolder {
  const rememberedFilePath = path.join(appConfigDirectory, OPEN_WORKSPACE_FILE_NAME);
  return {
    readRememberedFolder: async () => {
      let contents: string;
      try {
        contents = await readFile(rememberedFilePath, "utf8");
      } catch (readFailure) {
        if (!isAMissingFileFailure(readFailure)) {
          tatolabAppLog.warn("the open workspace could not be read; opening none", { path: rememberedFilePath, failure: describeCaughtFailure(readFailure) });
        }
        return null;
      }
      const parsedContents = parseJsonOnTheWire(contents);
      const rememberedFolder = parsedContents.ok && isAJsonObject(parsedContents.value) ? parsedContents.value[OPEN_WORKSPACE_FOLDER_KEY] : undefined;
      if (typeof rememberedFolder === "string") return rememberedFolder;
      tatolabAppLog.warn("the open workspace is malformed; opening none", { path: rememberedFilePath });
      return null;
    },
    rememberFolder: (folder): Promise<Result<void, string>> =>
      replaceFileWhole(rememberedFilePath, JSON.stringify({ [OPEN_WORKSPACE_FOLDER_KEY]: folder }, null, 2)),
  };
}
