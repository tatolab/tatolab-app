import { expect, test } from "vitest";
import type { ListedStream } from "../shared/tatolab_backend_contract.js";
import { FakeTerminalOpenedInAFolder } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { openStreamProjectFolder, type StreamProjectFolderOpeners } from "./stream_project_folder_opening.js";

function listedStream(displayName: string, projectDirectory: string | null): ListedStream {
  return {
    stream: `${displayName}-main-7a03be`,
    display_name: displayName,
    location: projectDirectory === null ? null : { project_directory: projectDirectory, stream_function: "stream:main" },
    state: "running",
    node_count: 3,
    failed_because: null, capture_devices_whose_access_was_never_asked_for: [], action: null, step: null,
  };
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

const LISTED_STREAMS = [listedStream("front-door", "/Users/jonathanf/streams/front-door"), listedStream("nowhere", null)];

test("the_listed_project_folder_of_the_stream_opens_in_the_file_manager_or_a_terminal", async () => {
  const { openers, foldersShownInTheFileManager, terminal } = openersOverFakes(["/Users/jonathanf/streams/front-door"]);

  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door-main-7a03be", "file_manager", openers)).toEqual(succeeded(undefined));
  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door-main-7a03be", "terminal", openers)).toEqual(succeeded(undefined));

  expect(foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/front-door"]);
  expect(terminal.openedInFolders).toEqual(["/Users/jonathanf/streams/front-door"]);
});

test("a_stream_the_runtime_does_not_list_or_names_no_folder_for_or_whose_folder_is_gone_opens_nothing", async () => {
  const { openers, foldersShownInTheFileManager, terminal } = openersOverFakes([]);

  expect(await openStreamProjectFolder(LISTED_STREAMS, "gone", "terminal", openers)).toEqual(
    failedWith("The runtime does not list gone, so Tatolab has no project folder to open."),
  );
  expect(await openStreamProjectFolder(null, "front-door-main-7a03be", "file_manager", openers)).toEqual(
    failedWith("The runtime does not list front-door-main-7a03be, so Tatolab has no project folder to open."),
  );
  expect(await openStreamProjectFolder(LISTED_STREAMS, "nowhere-main-7a03be", "file_manager", openers)).toEqual(
    failedWith("The runtime lists no project folder for nowhere."),
  );
  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door-main-7a03be", "terminal", openers)).toEqual(
    failedWith("/Users/jonathanf/streams/front-door is no longer a folder on this machine."),
  );
  expect(foldersShownInTheFileManager).toEqual([]);
  expect(terminal.openedInFolders).toEqual([]);
});

test("the_log_folder_under_the_listed_project_folder_opens_in_the_file_manager", async () => {
  const { openers, foldersShownInTheFileManager } = openersOverFakes(["/Users/jonathanf/streams/front-door", "/Users/jonathanf/streams/front-door/.streamlib/logs"]);

  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door-main-7a03be", "log_folder_in_the_file_manager", openers)).toEqual(succeeded(undefined));

  expect(foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/front-door/.streamlib/logs"]);
});

test("a_log_folder_not_written_yet_opens_nothing_and_says_so", async () => {
  const { openers, foldersShownInTheFileManager } = openersOverFakes(["/Users/jonathanf/streams/front-door"]);

  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door-main-7a03be", "log_folder_in_the_file_manager", openers)).toEqual(
    failedWith("front-door has no log folder yet: /Users/jonathanf/streams/front-door/.streamlib/logs is not on this machine."),
  );
  expect(await openStreamProjectFolder(LISTED_STREAMS, "nowhere-main-7a03be", "log_folder_in_the_file_manager", openers)).toEqual(
    failedWith("The runtime lists no project folder for nowhere."),
  );
  expect(foldersShownInTheFileManager).toEqual([]);
});

test("the_terminals_refusal_reaches_the_window_in_its_own_words", async () => {
  const { openers, terminal } = openersOverFakes(["/Users/jonathanf/streams/front-door"]);
  terminal.answer = failedWith("Terminal did not open on /Users/jonathanf/streams/front-door (exit status: 1)");

  expect(await openStreamProjectFolder(LISTED_STREAMS, "front-door-main-7a03be", "terminal", openers)).toEqual(terminal.answer);
});

