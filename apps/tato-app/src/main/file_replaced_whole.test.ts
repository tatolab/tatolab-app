import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { succeeded } from "./result.js";

const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function aTemporaryFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "tl-app-replaced-whole-"));
  temporaryFolders.push(folder);
  return folder;
}

test("two writes of one file at once both succeed, the file holds one of them whole, and no partial file is left", async () => {
  const folder = await aTemporaryFolder();
  const recentProjects = path.join(folder, "recent-projects.json");

  const writes = await Promise.all([replaceFileWhole(recentProjects, '{"opened":"lobby"}'), replaceFileWhole(recentProjects, '{"opened":"night-show"}')]);

  expect(writes).toEqual([succeeded(undefined), succeeded(undefined)]);
  expect(['{"opened":"lobby"}', '{"opened":"night-show"}']).toContain(await readFile(recentProjects, "utf8"));
  expect(await readdir(folder)).toEqual(["recent-projects.json"]);
});

test("a write that fails leaves no partial file behind", async () => {
  const folder = await aTemporaryFolder();
  const aFolderInTheFilesPlace = path.join(folder, "settings.json");
  await replaceFileWhole(path.join(aFolderInTheFilesPlace, "inside.json"), "{}");

  const refused = await replaceFileWhole(aFolderInTheFilesPlace, "{}");

  expect(refused.ok).toBe(false);
  expect(await readdir(folder)).toEqual(["settings.json"]);
});
