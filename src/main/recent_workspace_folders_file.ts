// The workspaces the studio has opened, recent first, remembered between launches in one JSON file
// in the app's config directory, so Home can list them.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { isAJsonObject, parseJsonOnTheWire } from "./json_on_the_wire.js";
import type { RecentWorkspaceFolderOpened, RecentWorkspaceFolders } from "./open_workspace.js";
import { describeCaughtFailure, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The file the recent workspaces are remembered in, inside the app's config directory. */
export const RECENT_WORKSPACES_FILE_NAME = "recent-workspaces.json";

/** How many workspaces are remembered; the oldest beyond it is forgotten. */
export const RECENT_WORKSPACES_REMEMBERED = 24;

const RECENT_WORKSPACES_KEY = "recent_workspaces";

/** One entry of the file as it was read, or `null` when it is not `{ folder, opened_at_wall_clock_ms }`. */
function recentWorkspaceFolderOpenedFrom(entry: unknown): RecentWorkspaceFolderOpened | null {
  if (!isAJsonObject(entry)) return null;
  const { folder, opened_at_wall_clock_ms: openedAtWallClockMs } = entry;
  if (typeof folder !== "string" || typeof openedAtWallClockMs !== "number" || !Number.isFinite(openedAtWallClockMs)) return null;
  return { folder, opened_at_wall_clock_ms: openedAtWallClockMs };
}

/** The recent workspaces, remembered in `recent-workspaces.json` inside `appConfigDirectory`; none when the file is absent or unreadable. */
export function recentWorkspaceFoldersFileIn(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): RecentWorkspaceFolders {
  const rememberedFilePath = path.join(appConfigDirectory, RECENT_WORKSPACES_FILE_NAME);
  const readRecentFolders = async (): Promise<RecentWorkspaceFolderOpened[]> => {
    let contents: string;
    try {
      contents = await readFile(rememberedFilePath, "utf8");
    } catch (readFailure) {
      if (!isAMissingFileFailure(readFailure)) {
        tatolabAppLog.warn("the recent workspaces could not be read; listing none", { path: rememberedFilePath, failure: describeCaughtFailure(readFailure) });
      }
      return [];
    }
    const parsedContents = parseJsonOnTheWire(contents);
    const rememberedEntries = parsedContents.ok && isAJsonObject(parsedContents.value) ? parsedContents.value[RECENT_WORKSPACES_KEY] : undefined;
    if (!Array.isArray(rememberedEntries)) {
      tatolabAppLog.warn("the recent workspaces are malformed; listing none", { path: rememberedFilePath });
      return [];
    }
    return rememberedEntries.flatMap((entry: unknown) => {
      const recentFolder = recentWorkspaceFolderOpenedFrom(entry);
      return recentFolder === null ? [] : [recentFolder];
    });
  };
  return {
    readRecentFolders,
    rememberOpened: async (folder, openedAtWallClockMs): Promise<Result<void, string>> => {
      const othersRecentFirst = (await readRecentFolders()).filter((recentFolder) => recentFolder.folder !== folder);
      const recentWorkspaces = [{ folder, opened_at_wall_clock_ms: openedAtWallClockMs }, ...othersRecentFirst].slice(0, RECENT_WORKSPACES_REMEMBERED);
      return replaceFileWhole(rememberedFilePath, JSON.stringify({ [RECENT_WORKSPACES_KEY]: recentWorkspaces }, null, 2));
    },
  };
}
