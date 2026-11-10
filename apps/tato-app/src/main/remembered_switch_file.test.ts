import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { DEVELOPER_MODE_PREFERENCE_FILE_NAME, HeldRememberedSwitch, RememberedSwitchFile, STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME } from "./remembered_switch_file.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});
const temporaryConfigDirectories: string[] = [];

async function temporaryConfigDirectory(): Promise<string> {
  const configDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  temporaryConfigDirectories.push(configDirectory);
  return configDirectory;
}

afterEach(async () => {
  await Promise.all(temporaryConfigDirectories.splice(0).map((configDirectory) => rm(configDirectory, { recursive: true, force: true })));
});

test("the_switch_is_on_when_nothing_was_remembered", async () => {
  const configDirectory = await temporaryConfigDirectory();
  const notifications = RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(path.join(configDirectory, "new"), quietTatolabAppLog);
  expect(await notifications.loadRememberedSwitch()).toBe(true);
});

test("the_stream_failure_notifications_switch_is_remembered_off_and_on_across_loads_in_its_own_file", async () => {
  const appConfigDirectory = path.join(await temporaryConfigDirectory(), "com.tatolab.tatolab");
  const notifications = RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog);

  expect(await notifications.saveRememberedSwitch(false)).toEqual({ ok: true, value: undefined });
  expect(await RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog).loadRememberedSwitch()).toBe(false);
  expect((await readFile(path.join(appConfigDirectory, STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME), "utf8")).replace(/[ \n]/g, "")).toBe(
    '{"notify_when_a_stream_fails":false}',
  );

  await notifications.saveRememberedSwitch(true);
  expect(await notifications.loadRememberedSwitch()).toBe(true);
});

test("a_malformed_file_reads_as_the_switchs_default", async () => {
  const configDirectory = await temporaryConfigDirectory();
  await writeFile(path.join(configDirectory, STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME), "not json");
  expect(await RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(configDirectory, quietTatolabAppLog).loadRememberedSwitch()).toBe(true);
});

test("developer_mode_is_off_until_it_is_remembered_on_in_its_own_file", async () => {
  const appConfigDirectory = path.join(await temporaryConfigDirectory(), "com.tatolab.tatolab");
  const developerMode = RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog);
  expect(await developerMode.loadRememberedSwitch()).toBe(false);

  expect(await developerMode.saveRememberedSwitch(true)).toEqual({ ok: true, value: undefined });
  expect(await RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog).loadRememberedSwitch()).toBe(true);
  expect((await readFile(path.join(appConfigDirectory, DEVELOPER_MODE_PREFERENCE_FILE_NAME), "utf8")).replace(/[ \n]/g, "")).toBe('{"developer_mode":true}');
  expect(await RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog).loadRememberedSwitch()).toBe(true);
});

test("a_held_switch_turned_on_holds_and_is_on_again_at_the_next_launch", async () => {
  const appConfigDirectory = await temporaryConfigDirectory();
  const developerMode = await HeldRememberedSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog));
  expect(developerMode.isOnNow()).toBe(false);

  expect(await developerMode.setAndRemember(true)).toEqual({ ok: true, value: undefined });
  expect(developerMode.isOnNow()).toBe(true);
  const atTheNextLaunch = await HeldRememberedSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog));
  expect(atTheNextLaunch.isOnNow()).toBe(true);
});

test("a_held_switch_flipped_twice_at_once_remembers_the_last_choice", async () => {
  const appConfigDirectory = await temporaryConfigDirectory();
  const developerMode = await HeldRememberedSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog));

  const answers = await Promise.all([developerMode.setAndRemember(true), developerMode.setAndRemember(false), developerMode.setAndRemember(true)]);
  expect(answers.every((answer) => answer.ok)).toBe(true);
  const atTheNextLaunch = await HeldRememberedSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog));
  expect(atTheNextLaunch.isOnNow()).toBe(true);
});

test("a_held_switch_that_cannot_be_remembered_still_holds_and_says_why", async () => {
  const appConfigDirectory = await temporaryConfigDirectory();
  const unwritableConfigDirectory = path.join(appConfigDirectory, "a-file-not-a-folder");
  await writeFile(unwritableConfigDirectory, "");
  const developerMode = await HeldRememberedSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(unwritableConfigDirectory, quietTatolabAppLog));

  const set = await developerMode.setAndRemember(true);
  expect(set.ok).toBe(false);
  if (!set.ok) expect(set.failure).toMatch(/^Tato Studio couldn't remember this, so it holds only until Tato Studio quits: /);
  expect(developerMode.isOnNow()).toBe(true);
});
