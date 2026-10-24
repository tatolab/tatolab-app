// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import type { RuntimeDescription } from "../../src/backend/tatolab_backend_contract.js";
import { FakeTerminalOpenedInAFolder } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { openTheRuntimesLogFolder, RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL } from "./runtime_log_folder_opening.js";
import type { StreamProjectFolderOpeners } from "./stream_project_folder_opening.js";

function openersOverFakes(existingFolders: readonly string[]) {
  const foldersShownInTheFileManager: string[] = [];
  const openers: StreamProjectFolderOpeners = {
    openAFolderInTheFileManager: async (folder): Promise<Result<void, string>> => {
      foldersShownInTheFileManager.push(folder);
      return succeeded(undefined);
    },
    terminalOpenedInAFolder: new FakeTerminalOpenedInAFolder(),
    isAnExistingFolder: async (folderPath) => existingFolders.includes(folderPath),
  };
  return { openers, foldersShownInTheFileManager };
}

function describedWithLogFolder(runtimeLogDirectory: string | null): Result<RuntimeDescription, never> {
  return succeeded({ version: "0.55.2", build_id: "0.55.2+ec6adf5.1a2b3c", up_for_ms: 60_000, runtime_log_directory: runtimeLogDirectory });
}

test("the_folder_the_runtime_names_for_its_own_log_opens_in_the_file_manager", async () => {
  const { openers, foldersShownInTheFileManager } = openersOverFakes(["/Users/u/Library/Application Support/Tatolab/logs"]);

  expect(await openTheRuntimesLogFolder(describedWithLogFolder("/Users/u/Library/Application Support/Tatolab/logs"), openers)).toEqual(succeeded(undefined));
  expect(foldersShownInTheFileManager).toEqual(["/Users/u/Library/Application Support/Tatolab/logs"]);
});

test("a_runtime_keeping_no_log_one_not_describing_itself_or_a_missing_folder_opens_nothing", async () => {
  const { openers, foldersShownInTheFileManager } = openersOverFakes([]);

  expect(await openTheRuntimesLogFolder(describedWithLogFolder(null), openers)).toEqual(failedWith(RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL));
  expect(await openTheRuntimesLogFolder(failedWith({ failureDescription: "no runtime answers at /tmp/x.sock: ENOENT", isTheRuntimesRefusal: false }), openers)).toEqual(
    failedWith("no runtime answers at /tmp/x.sock: ENOENT"),
  );
  expect(await openTheRuntimesLogFolder(describedWithLogFolder("/gone/logs"), openers)).toEqual(failedWith("/gone/logs is not a folder on this machine."));
  expect(foldersShownInTheFileManager).toEqual([]);
});
