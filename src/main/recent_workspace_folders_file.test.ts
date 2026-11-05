import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { RECENT_WORKSPACES_FILE_NAME, RECENT_WORKSPACES_REMEMBERED, recentWorkspaceFoldersFileIn } from "./recent_workspace_folders_file.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});
const temporaryConfigDirectories: string[] = [];

async function temporaryConfigDirectory(): Promise<string> {
  const configDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-recent-"));
  temporaryConfigDirectories.push(configDirectory);
  return configDirectory;
}

afterEach(async () => {
  await Promise.all(temporaryConfigDirectories.splice(0).map((configDirectory) => rm(configDirectory, { recursive: true, force: true })));
});

test("no workspace is recent before one is remembered, in a config directory not made yet", async () => {
  const recentWorkspaces = recentWorkspaceFoldersFileIn(path.join(await temporaryConfigDirectory(), "new"), quietTatolabAppLog);
  expect(await recentWorkspaces.readRecentFolders()).toEqual([]);
});

test("each workspace opened moves first, once, across loads", async () => {
  const appConfigDirectory = path.join(await temporaryConfigDirectory(), "com.tatolab.tatolab");
  const recentWorkspaces = recentWorkspaceFoldersFileIn(appConfigDirectory, quietTatolabAppLog);
  expect(await recentWorkspaces.rememberOpened("/streams/pattern", 100)).toEqual({ ok: true, value: undefined });
  expect(await recentWorkspaces.rememberOpened("/streams/lobby", 200)).toEqual({ ok: true, value: undefined });
  expect(await recentWorkspaces.rememberOpened("/streams/pattern", 300)).toEqual({ ok: true, value: undefined });

  expect(await recentWorkspaceFoldersFileIn(appConfigDirectory, quietTatolabAppLog).readRecentFolders()).toEqual([
    { folder: "/streams/pattern", opened_at_wall_clock_ms: 300 },
    { folder: "/streams/lobby", opened_at_wall_clock_ms: 200 },
  ]);
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, RECENT_WORKSPACES_FILE_NAME), "utf8"))).toEqual({
    recent_workspaces: [
      { folder: "/streams/pattern", opened_at_wall_clock_ms: 300 },
      { folder: "/streams/lobby", opened_at_wall_clock_ms: 200 },
    ],
  });
});

test("only the most recent workspaces are remembered", async () => {
  const recentWorkspaces = recentWorkspaceFoldersFileIn(await temporaryConfigDirectory(), quietTatolabAppLog);
  for (let opened = 0; opened <= RECENT_WORKSPACES_REMEMBERED; opened++) await recentWorkspaces.rememberOpened(`/streams/project-${opened}`, opened);
  const remembered = await recentWorkspaces.readRecentFolders();
  expect(remembered).toHaveLength(RECENT_WORKSPACES_REMEMBERED);
  expect(remembered[0]).toEqual({ folder: `/streams/project-${RECENT_WORKSPACES_REMEMBERED}`, opened_at_wall_clock_ms: RECENT_WORKSPACES_REMEMBERED });
  expect(remembered.some(({ folder }) => folder === "/streams/project-0")).toBe(false);
});

test("a malformed file lists none, and a malformed entry is passed over", async () => {
  const configDirectory = await temporaryConfigDirectory();
  const recentWorkspaces = recentWorkspaceFoldersFileIn(configDirectory, quietTatolabAppLog);
  await writeFile(path.join(configDirectory, RECENT_WORKSPACES_FILE_NAME), "{ not json");
  expect(await recentWorkspaces.readRecentFolders()).toEqual([]);
  await writeFile(
    path.join(configDirectory, RECENT_WORKSPACES_FILE_NAME),
    JSON.stringify({ recent_workspaces: [{ folder: "/streams/pattern", opened_at_wall_clock_ms: 5 }, { folder: 7 }, "/streams/lobby"] }),
  );
  expect(await recentWorkspaces.readRecentFolders()).toEqual([{ folder: "/streams/pattern", opened_at_wall_clock_ms: 5 }]);
});
