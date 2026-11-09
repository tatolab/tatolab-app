// The projects the studio has opened, recent first, remembered between launches in one JSON file
// in the app's config directory, so the Projects window can list them.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { isAJsonObject, parseJsonOnTheWire } from "./json_on_the_wire.js";
import type { RecentProjectFolderOpened, RecentProjectFolders } from "./open_project.js";
import { describeCaughtFailure, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The file the recent projects are remembered in, inside the app's config directory. */
export const RECENT_PROJECTS_FILE_NAME = "recent-projects.json";

/** How many projects are remembered; the oldest beyond it is forgotten. */
export const RECENT_PROJECTS_REMEMBERED = 24;

const RECENT_PROJECTS_KEY = "recent_projects";

/** One entry of the file as it was read, or `null` when it is not `{ folder, opened_at_wall_clock_ms }`. */
function recentProjectFolderOpenedFrom(entry: unknown): RecentProjectFolderOpened | null {
  if (!isAJsonObject(entry)) return null;
  const { folder, opened_at_wall_clock_ms: openedAtWallClockMs } = entry;
  if (typeof folder !== "string" || typeof openedAtWallClockMs !== "number" || !Number.isFinite(openedAtWallClockMs)) return null;
  return { folder, opened_at_wall_clock_ms: openedAtWallClockMs };
}

/** The recent projects, remembered in `recent-projects.json` inside `appConfigDirectory`; none when the file is absent or unreadable. */
export function recentProjectFoldersFileIn(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): RecentProjectFolders {
  const rememberedFilePath = path.join(appConfigDirectory, RECENT_PROJECTS_FILE_NAME);
  const readRecentFolders = async (): Promise<RecentProjectFolderOpened[]> => {
    let contents: string;
    try {
      contents = await readFile(rememberedFilePath, "utf8");
    } catch (readFailure) {
      if (!isAMissingFileFailure(readFailure)) {
        tatolabAppLog.warn("the recent projects could not be read; listing none", { path: rememberedFilePath, failure: describeCaughtFailure(readFailure) });
      }
      return [];
    }
    const parsedContents = parseJsonOnTheWire(contents);
    const rememberedEntries = parsedContents.ok && isAJsonObject(parsedContents.value) ? parsedContents.value[RECENT_PROJECTS_KEY] : undefined;
    if (!Array.isArray(rememberedEntries)) {
      tatolabAppLog.warn("the recent projects are malformed; listing none", { path: rememberedFilePath });
      return [];
    }
    return rememberedEntries.flatMap((entry: unknown) => {
      const recentFolder = recentProjectFolderOpenedFrom(entry);
      return recentFolder === null ? [] : [recentFolder];
    });
  };
  return {
    readRecentFolders,
    rememberOpened: async (folder, openedAtWallClockMs): Promise<Result<void, string>> => {
      const othersRecentFirst = (await readRecentFolders()).filter((recentFolder) => recentFolder.folder !== folder);
      const recentProjects = [{ folder, opened_at_wall_clock_ms: openedAtWallClockMs }, ...othersRecentFirst].slice(0, RECENT_PROJECTS_REMEMBERED);
      return replaceFileWhole(rememberedFilePath, JSON.stringify({ [RECENT_PROJECTS_KEY]: recentProjects }, null, 2));
    },
  };
}
