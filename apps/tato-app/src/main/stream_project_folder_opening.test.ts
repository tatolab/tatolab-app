import { expect, test } from "vitest";
import { projectPlaybackAsListed } from "../shared/project_playback.js";
import type { ListedStream } from "../shared/tatolab_backend_contract.js";
import { Effect, Layer } from "effect";
import { failedWith, succeeded, type Result } from "./result.js";
import { openTheStreamsProjectFolder, type StreamProjectFolderOpening } from "./stream_project_folder_opening.js";
import { FileManager, ListedStreams, Terminal } from "./studio_runtime.js";
import { CommandRefused } from "./window_command.js";

function listedStream(displayName: string, projectDirectory: string | null): ListedStream {
  return {
    stream: `${displayName}-main-7a03be`,
    display_name: displayName,
    location: projectDirectory === null ? null : { project_directory: projectDirectory, project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
    state: "running",
    node_count: 3,
    failed_because: null, capture_devices_whose_access_was_never_asked_for: [], condition: null, action: null, step: null,
  };
}

/** The stream folders opened against `listedStreams`, with `existingFolders` on this machine and the terminal answering `terminalAnswer`; with every folder shown and every terminal opened. */
function openingOverFakes(existingFolders: readonly string[], terminalRefusal: string | null = null) {
  const foldersShownInTheFileManager: string[] = [];
  const terminalOpenedInFolders: string[] = [];
  const openedWhenAnExistingFolder = (folder: string, refusalWhenMissing: string, opened: string[]) =>
    existingFolders.includes(folder) ? Effect.sync(() => void opened.push(folder)) : Effect.fail(new CommandRefused({ words: refusalWhenMissing }));
  const servicesOfTheOpening = Layer.mergeAll(
    Layer.succeed(ListedStreams, {
      streamAssetsOfTheProject: () => new Set(),
      streamIdsOfTheProject: () => new Set(),
      aStreamIsListedFrom: () => true,
      theProjectIsListedOpen: () => true,
      listedStream: (stream) => LISTED_STREAMS.find((listedStream) => listedStream.stream === stream) ?? null,
      playbackOfTheProject: (projectFolder) => projectPlaybackAsListed(LISTED_STREAMS, projectFolder),
    }),
    Layer.succeed(FileManager, { showAnExistingFolder: (folder, refusalWhenMissing) => openedWhenAnExistingFolder(folder, refusalWhenMissing, foldersShownInTheFileManager) }),
    Layer.succeed(Terminal, {
      openInAnExistingFolder: (folder, refusalWhenMissing) =>
        terminalRefusal === null ? openedWhenAnExistingFolder(folder, refusalWhenMissing, terminalOpenedInFolders) : Effect.fail(new CommandRefused({ words: terminalRefusal })),
    }),
  );
  const open = (stream: string, opening: StreamProjectFolderOpening): Promise<Result<void, string>> =>
    Effect.runPromise(
      openTheStreamsProjectFolder(stream, opening).pipe(
        Effect.match({ onSuccess: () => succeeded(undefined), onFailure: (refused) => failedWith(refused.words) }),
        Effect.provide(servicesOfTheOpening),
      ),
    );
  return { open, foldersShownInTheFileManager, terminalOpenedInFolders };
}

const LISTED_STREAMS = [listedStream("front-door", "/Users/jonathanf/streams/front-door"), listedStream("nowhere", null)];

test("the_listed_project_folder_of_the_stream_opens_in_the_file_manager_or_a_terminal", async () => {
  const { open, foldersShownInTheFileManager, terminalOpenedInFolders } = openingOverFakes(["/Users/jonathanf/streams/front-door"]);

  expect(await open("front-door-main-7a03be", "file_manager")).toEqual(succeeded(undefined));
  expect(await open("front-door-main-7a03be", "terminal")).toEqual(succeeded(undefined));

  expect(foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/front-door"]);
  expect(terminalOpenedInFolders).toEqual(["/Users/jonathanf/streams/front-door"]);
});

test("a_stream_the_runtime_does_not_list_or_names_no_folder_for_or_whose_folder_is_gone_opens_nothing", async () => {
  const { open, foldersShownInTheFileManager, terminalOpenedInFolders } = openingOverFakes([]);

  expect(await open("gone", "terminal")).toEqual(
    failedWith("The runtime does not list gone, so Tato Studio has no project folder to open."),
  );
  expect(await open("nowhere-main-7a03be", "file_manager")).toEqual(
    failedWith("The runtime lists no project folder for nowhere."),
  );
  expect(await open("front-door-main-7a03be", "terminal")).toEqual(
    failedWith("/Users/jonathanf/streams/front-door is no longer a folder on this machine."),
  );
  expect(foldersShownInTheFileManager).toEqual([]);
  expect(terminalOpenedInFolders).toEqual([]);
});

test("the_log_folder_under_the_listed_project_folder_opens_in_the_file_manager", async () => {
  const { open, foldersShownInTheFileManager } = openingOverFakes(["/Users/jonathanf/streams/front-door", "/Users/jonathanf/streams/front-door/.streamlib/logs"]);

  expect(await open("front-door-main-7a03be", "log_folder_in_the_file_manager")).toEqual(succeeded(undefined));

  expect(foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/front-door/.streamlib/logs"]);
});

test("a_log_folder_not_written_yet_opens_nothing_and_says_so", async () => {
  const { open, foldersShownInTheFileManager } = openingOverFakes(["/Users/jonathanf/streams/front-door"]);

  expect(await open("front-door-main-7a03be", "log_folder_in_the_file_manager")).toEqual(
    failedWith("front-door has no log folder yet: /Users/jonathanf/streams/front-door/.streamlib/logs is not on this machine."),
  );
  expect(await open("nowhere-main-7a03be", "log_folder_in_the_file_manager")).toEqual(
    failedWith("The runtime lists no project folder for nowhere."),
  );
  expect(foldersShownInTheFileManager).toEqual([]);
});

test("the_terminals_refusal_reaches_the_window_in_its_own_words", async () => {
  const { open } = openingOverFakes(["/Users/jonathanf/streams/front-door"], "Terminal did not open on /Users/jonathanf/streams/front-door (exit status: 1)");

  expect(await open("front-door-main-7a03be", "terminal")).toEqual(failedWith("Terminal did not open on /Users/jonathanf/streams/front-door (exit status: 1)"));
});

