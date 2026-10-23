// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import type { ListedStream } from "../../src/backend/tatolab_backend_contract.js";
import { FakeTerminalOpenedInAFolder } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { isAnExistingFolderOnThisMachine, openStreamProjectFolder, type StreamProjectFolderOpeners } from "./stream_project_folder_opening.js";

function listedStream(name: string, projectDirectory: string): ListedStream {
  return { name, state: "kept", project_directory: projectDirectory, node_count: 3, failed_because: null };
}

function openersOverFakes(existingFolders: readonly string[]) {
  const foldersShownInTheFileManager: string[] = [];
  const terminal = new FakeTerminalOpenedInAFolder();
  const openers: StreamProjectFolderOpeners = {
    openAFolderInTheFileManager: async (folder): Promise<Result<void, string>> => {
      foldersShownInTheFileManager.push(folder);
      return succeeded(undefined);
    },
    terminalOpenedInAFolder: terminal,
    isAnExistingFolder: async (folderPath) => existingFolders.includes(folderPath),
  };
  return { openers, foldersShownInTheFileManager, terminal };
}

const LISTED_STREAMS = [listedStream("front-door", "/Users/jonathanf/streams/front-door"), listedStream("nowhere", "")];

test("the_listed_project_folder_of_the_stream_opens_in_the_file_manager_or_a_terminal", async () => {
  const { openers, foldersShownInTheFileManager, terminal } = openersOverFakes(["/Users/jonathanf/streams/front-door"]);

  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door", "file_manager", openers)).toEqual(succeeded(undefined));
  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door", "terminal", openers)).toEqual(succeeded(undefined));

  expect(foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/front-door"]);
  expect(terminal.openedInFolders).toEqual(["/Users/jonathanf/streams/front-door"]);
});

test("a_stream_the_runtime_does_not_list_or_names_no_folder_for_or_whose_folder_is_gone_opens_nothing", async () => {
  const { openers, foldersShownInTheFileManager, terminal } = openersOverFakes([]);

  expect(await openStreamProjectFolder(LISTED_STREAMS, "gone", "terminal", openers)).toEqual(
    failedWith("The runtime does not list gone, so Tatolab has no project folder to open."),
  );
  expect(await openStreamProjectFolder(null, "front-door", "file_manager", openers)).toEqual(
    failedWith("The runtime does not list front-door, so Tatolab has no project folder to open."),
  );
  expect(await openStreamProjectFolder(LISTED_STREAMS, "nowhere", "file_manager", openers)).toEqual(
    failedWith("The runtime lists no project folder for nowhere."),
  );
  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door", "terminal", openers)).toEqual(
    failedWith("/Users/jonathanf/streams/front-door is no longer a folder on this machine."),
  );
  expect(foldersShownInTheFileManager).toEqual([]);
  expect(terminal.openedInFolders).toEqual([]);
});

test("the_log_folder_under_the_listed_project_folder_opens_in_the_file_manager", async () => {
  const { openers, foldersShownInTheFileManager } = openersOverFakes(["/Users/jonathanf/streams/front-door", "/Users/jonathanf/streams/front-door/.streamlib/logs"]);

  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door", "log_folder_in_the_file_manager", openers)).toEqual(succeeded(undefined));

  expect(foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/front-door/.streamlib/logs"]);
});

test("a_log_folder_not_written_yet_opens_nothing_and_says_so", async () => {
  const { openers, foldersShownInTheFileManager } = openersOverFakes(["/Users/jonathanf/streams/front-door"]);

  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door", "log_folder_in_the_file_manager", openers)).toEqual(
    failedWith("front-door has no log folder yet: /Users/jonathanf/streams/front-door/.streamlib/logs is not on this machine."),
  );
  expect(await openStreamProjectFolder(LISTED_STREAMS, "nowhere", "log_folder_in_the_file_manager", openers)).toEqual(
    failedWith("The runtime lists no project folder for nowhere."),
  );
  expect(foldersShownInTheFileManager).toEqual([]);
});

test("the_terminals_refusal_reaches_the_window_in_its_own_words", async () => {
  const { openers, terminal } = openersOverFakes(["/Users/jonathanf/streams/front-door"]);
  terminal.answer = failedWith("Terminal did not open on /Users/jonathanf/streams/front-door (exit status: 1)");

  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door", "terminal", openers)).toEqual(terminal.answer);
});

test("only_a_folder_counts_as_an_existing_folder", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "tl-app-project-"));
  try {
    await writeFile(path.join(folder, "stream.py"), "");
    expect(await isAnExistingFolderOnThisMachine(folder)).toBe(true);
    expect(await isAnExistingFolderOnThisMachine(path.join(folder, "stream.py"))).toBe(false);
    expect(await isAnExistingFolderOnThisMachine(path.join(folder, "missing"))).toBe(false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
