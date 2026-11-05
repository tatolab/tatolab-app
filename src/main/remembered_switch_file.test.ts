import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { RememberedSwitchFile, STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME } from "./remembered_switch_file.js";
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
