import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { RECENT_PROJECTS_FILE_NAME, RECENT_PROJECTS_REMEMBERED, recentProjectFoldersFileIn } from "./recent_project_folders_file.js";
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

test("no project is recent before one is remembered, in a config directory not made yet", async () => {
  const recentProjects = recentProjectFoldersFileIn(path.join(await temporaryConfigDirectory(), "new"), quietTatolabAppLog);
  expect(await recentProjects.readRecentFolders()).toEqual([]);
});

test("each project opened moves first, once, across loads", async () => {
  const appConfigDirectory = path.join(await temporaryConfigDirectory(), "com.tatolab.tatolab");
  const recentProjects = recentProjectFoldersFileIn(appConfigDirectory, quietTatolabAppLog);
  expect(await recentProjects.rememberOpened("/streams/pattern", 100)).toEqual({ ok: true, value: undefined });
  expect(await recentProjects.rememberOpened("/streams/lobby", 200)).toEqual({ ok: true, value: undefined });
  expect(await recentProjects.rememberOpened("/streams/pattern", 300)).toEqual({ ok: true, value: undefined });

  expect(await recentProjectFoldersFileIn(appConfigDirectory, quietTatolabAppLog).readRecentFolders()).toEqual([
    { folder: "/streams/pattern", opened_at_wall_clock_ms: 300 },
    { folder: "/streams/lobby", opened_at_wall_clock_ms: 200 },
  ]);
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, RECENT_PROJECTS_FILE_NAME), "utf8"))).toEqual({
    recent_projects: [
      { folder: "/streams/pattern", opened_at_wall_clock_ms: 300 },
      { folder: "/streams/lobby", opened_at_wall_clock_ms: 200 },
    ],
  });
});

test("only the most recent projects are remembered", async () => {
  const recentProjects = recentProjectFoldersFileIn(await temporaryConfigDirectory(), quietTatolabAppLog);
  for (let opened = 0; opened <= RECENT_PROJECTS_REMEMBERED; opened++) await recentProjects.rememberOpened(`/streams/project-${opened}`, opened);
  const remembered = await recentProjects.readRecentFolders();
  expect(remembered).toHaveLength(RECENT_PROJECTS_REMEMBERED);
  expect(remembered[0]).toEqual({ folder: `/streams/project-${RECENT_PROJECTS_REMEMBERED}`, opened_at_wall_clock_ms: RECENT_PROJECTS_REMEMBERED });
  expect(remembered.some(({ folder }) => folder === "/streams/project-0")).toBe(false);
});

test("a malformed file lists none, and a malformed entry is passed over", async () => {
  const configDirectory = await temporaryConfigDirectory();
  const recentProjects = recentProjectFoldersFileIn(configDirectory, quietTatolabAppLog);
  await writeFile(path.join(configDirectory, RECENT_PROJECTS_FILE_NAME), "{ not json");
  expect(await recentProjects.readRecentFolders()).toEqual([]);
  await writeFile(
    path.join(configDirectory, RECENT_PROJECTS_FILE_NAME),
    JSON.stringify({ recent_projects: [{ folder: "/streams/pattern", opened_at_wall_clock_ms: 5 }, { folder: 7 }, "/streams/lobby"] }),
  );
  expect(await recentProjects.readRecentFolders()).toEqual([{ folder: "/streams/pattern", opened_at_wall_clock_ms: 5 }]);
});
