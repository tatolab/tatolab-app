// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { RememberedSwitchFile, RUN_TATOLAB_PREFERENCE_FILE_NAME, STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME } from "./remembered_switch_file.js";
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
  const preference = RememberedSwitchFile.runTatolabInAppConfigDirectory(path.join(configDirectory, "new"), quietTatolabAppLog);
  expect(await preference.loadRememberedSwitch()).toBe(true);
});

test("the_switch_is_remembered_off_and_on_across_loads", async () => {
  const appConfigDirectory = path.join(await temporaryConfigDirectory(), "com.tatolab.tatolab");
  const preference = RememberedSwitchFile.runTatolabInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog);

  expect(await preference.saveRememberedSwitch(false)).toEqual({ ok: true, value: undefined });
  expect(await RememberedSwitchFile.runTatolabInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog).loadRememberedSwitch()).toBe(false);
  expect((await readFile(path.join(appConfigDirectory, RUN_TATOLAB_PREFERENCE_FILE_NAME), "utf8")).replace(/[ \n]/g, "")).toBe(
    '{"run_tatolab":false}',
  );

  await preference.saveRememberedSwitch(true);
  expect(await preference.loadRememberedSwitch()).toBe(true);
});

test("a_malformed_file_reads_as_on", async () => {
  const configDirectory = await temporaryConfigDirectory();
  await writeFile(path.join(configDirectory, RUN_TATOLAB_PREFERENCE_FILE_NAME), "not json");
  expect(await RememberedSwitchFile.runTatolabInAppConfigDirectory(configDirectory, quietTatolabAppLog).loadRememberedSwitch()).toBe(true);
});

test("a file an earlier build wrote is read as it remembered the switch", async () => {
  const configDirectory = await temporaryConfigDirectory();
  await writeFile(path.join(configDirectory, RUN_TATOLAB_PREFERENCE_FILE_NAME), '{\n  "run_tatolab": false\n}');
  expect(await RememberedSwitchFile.runTatolabInAppConfigDirectory(configDirectory, quietTatolabAppLog).loadRememberedSwitch()).toBe(false);
});

test("the_stream_failure_notifications_switch_is_on_until_turned_off_and_kept_in_its_own_file", async () => {
  const appConfigDirectory = await temporaryConfigDirectory();
  const notifications = RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog);
  expect(await notifications.loadRememberedSwitch()).toBe(true);

  expect(await notifications.saveRememberedSwitch(false)).toEqual({ ok: true, value: undefined });
  expect(await notifications.loadRememberedSwitch()).toBe(false);
  expect(await RememberedSwitchFile.runTatolabInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog).loadRememberedSwitch()).toBe(true);
  expect((await readFile(path.join(appConfigDirectory, STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME), "utf8")).replace(/[ \n]/g, "")).toBe(
    '{"notify_when_a_stream_fails":false}',
  );
});
