// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { RUNTIME_RESTARTED_FOR_APP_VERSION_FILE_NAME, RuntimeRestartedForAppVersionFile } from "./runtime_restarted_for_app_version.js";

const appConfigDirectories: string[] = [];

function aFreshAppConfigDirectory(): string {
  const appConfigDirectory = path.join(os.tmpdir(), `tl-runtime-version-${randomUUID()}`);
  appConfigDirectories.push(appConfigDirectory);
  return appConfigDirectory;
}

afterEach(async () => {
  await Promise.all(appConfigDirectories.splice(0).map((appConfigDirectory) => rm(appConfigDirectory, { recursive: true, force: true })));
});

test("no file reads as a runtime never restarted under this app", async () => {
  expect(await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(aFreshAppConfigDirectory()).loadAppVersion()).toBeNull();
});

test("a saved version is read back, and saving again replaces it", async () => {
  const versionFile = RuntimeRestartedForAppVersionFile.inAppConfigDirectory(aFreshAppConfigDirectory());
  expect((await versionFile.saveAppVersion("0.46.3")).ok).toBe(true);
  expect(await versionFile.loadAppVersion()).toBe("0.46.3");
  expect((await versionFile.saveAppVersion("0.47.0")).ok).toBe(true);
  expect(await versionFile.loadAppVersion()).toBe("0.47.0");
});

test("a malformed file reads as no version", async () => {
  const appConfigDirectory = aFreshAppConfigDirectory();
  await mkdir(appConfigDirectory, { recursive: true });
  await writeFile(path.join(appConfigDirectory, RUNTIME_RESTARTED_FOR_APP_VERSION_FILE_NAME), '{"app_version": 47}');
  expect(await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(appConfigDirectory).loadAppVersion()).toBeNull();
});
