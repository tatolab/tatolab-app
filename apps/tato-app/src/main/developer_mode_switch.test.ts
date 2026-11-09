import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { DeveloperModeSwitch } from "./developer_mode_switch.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});
const temporaryConfigDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryConfigDirectories.splice(0).map((configDirectory) => rm(configDirectory, { recursive: true, force: true })));
});

test("developer_mode_turned_on_holds_and_is_on_again_at_the_next_launch", async () => {
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  temporaryConfigDirectories.push(appConfigDirectory);
  const developerMode = await DeveloperModeSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog), quietTatolabAppLog);
  expect(developerMode.isOnNow()).toBe(false);

  expect(await developerMode.setDeveloperMode(true)).toEqual({ ok: true, value: undefined });
  expect(developerMode.isOnNow()).toBe(true);
  const atTheNextLaunch = await DeveloperModeSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog), quietTatolabAppLog);
  expect(atTheNextLaunch.isOnNow()).toBe(true);
});

test("developer_mode_that_cannot_be_remembered_still_holds_and_says_why", async () => {
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  temporaryConfigDirectories.push(appConfigDirectory);
  const unwritableConfigDirectory = path.join(appConfigDirectory, "a-file-not-a-folder");
  await writeFile(unwritableConfigDirectory, "");
  const developerMode = await DeveloperModeSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(unwritableConfigDirectory, quietTatolabAppLog), quietTatolabAppLog);

  const set = await developerMode.setDeveloperMode(true);
  expect(set.ok).toBe(false);
  if (!set.ok) expect(set.failure).toMatch(/^Tato Studio couldn't remember this, so it holds only until Tato Studio quits: /);
  expect(developerMode.isOnNow()).toBe(true);
});
