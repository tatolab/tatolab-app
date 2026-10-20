// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { RUN_TATOLAB_PREFERENCE_FILE_NAME, RunTatolabPreferenceFile } from "./run_tatolab_preference.js";
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
  const preference = RunTatolabPreferenceFile.inAppConfigDirectory(path.join(configDirectory, "new"), quietTatolabAppLog);
  expect(await preference.loadRunTatolab()).toBe(true);
});

test("the_switch_is_remembered_off_and_on_across_loads", async () => {
  const appConfigDirectory = path.join(await temporaryConfigDirectory(), "com.tatolab.tatolab");
  const preference = RunTatolabPreferenceFile.inAppConfigDirectory(appConfigDirectory, quietTatolabAppLog);

  expect(await preference.saveRunTatolab(false)).toEqual({ ok: true, value: undefined });
  expect(await RunTatolabPreferenceFile.inAppConfigDirectory(appConfigDirectory, quietTatolabAppLog).loadRunTatolab()).toBe(false);
  expect((await readFile(path.join(appConfigDirectory, RUN_TATOLAB_PREFERENCE_FILE_NAME), "utf8")).replace(/[ \n]/g, "")).toBe(
    '{"run_tatolab":false}',
  );

  await preference.saveRunTatolab(true);
  expect(await preference.loadRunTatolab()).toBe(true);
});

test("a_malformed_file_reads_as_on", async () => {
  const configDirectory = await temporaryConfigDirectory();
  await writeFile(path.join(configDirectory, RUN_TATOLAB_PREFERENCE_FILE_NAME), "not json");
  expect(await RunTatolabPreferenceFile.inAppConfigDirectory(configDirectory, quietTatolabAppLog).loadRunTatolab()).toBe(true);
});

test("a file the Tauri app wrote is read as it remembered the switch", async () => {
  const configDirectory = await temporaryConfigDirectory();
  await writeFile(path.join(configDirectory, RUN_TATOLAB_PREFERENCE_FILE_NAME), '{\n  "run_tatolab": false\n}');
  expect(await RunTatolabPreferenceFile.inAppConfigDirectory(configDirectory, quietTatolabAppLog).loadRunTatolab()).toBe(false);
});
