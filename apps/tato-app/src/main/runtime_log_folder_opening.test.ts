import { Effect, Layer } from "effect";
import { afterEach, expect, test } from "vitest";
import { controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { failedWith, succeeded } from "./result.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { openTheRuntimesLogFolder, RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL } from "./runtime_log_folder_opening.js";
import { FileManager } from "./studio_runtime.js";
import { CommandRefused } from "./window_command.js";

const localApisStarted: FakeLocalApiServer[] = [];

afterEach(async () => {
  for (const localApi of localApisStarted.splice(0)) await localApi.close();
});

/** Opening the runtime's log folder against a runtime that describes itself with `runtimeLogDirectory`, in a file manager that shows only `existingFolders`. */
async function openingTheLogFolderOf(runtimeLogDirectory: string | null, existingFolders: readonly string[]) {
  const foldersShownInTheFileManager: string[] = [];
  const localApi = await FakeLocalApiServer.answering([
    controlOperationResultResponse({ version: "0.55.2", build_id: "0.55.2+ec6adf5.1a2b3c", up_for_ms: 60_000, runtime_log_directory: runtimeLogDirectory, machine: "jonathanf-macbook" }),
  ]);
  localApisStarted.push(localApi);
  const services = Layer.mergeAll(
    runtimeControlLayer(localApi.localApiSocketPath, 2_000),
    Layer.succeed(FileManager, {
      showAnExistingFolder: (folder, refusalWhenMissing) => {
        if (!existingFolders.includes(folder)) return Effect.fail(new CommandRefused({ words: refusalWhenMissing }));
        return Effect.sync(() => void foldersShownInTheFileManager.push(folder));
      },
    }),
  );
  const opened = await Effect.runPromise(
    openTheRuntimesLogFolder.pipe(
      Effect.match({ onSuccess: (answer) => succeeded(answer), onFailure: ({ words }) => failedWith(words) }),
      Effect.provide(services),
    ),
  );
  return { opened, foldersShownInTheFileManager };
}

test("the_folder_the_runtime_names_for_its_own_log_opens_in_the_file_manager", async () => {
  const logFolder = "/Users/u/Library/Application Support/Tatolab/logs";
  const { opened, foldersShownInTheFileManager } = await openingTheLogFolderOf(logFolder, [logFolder]);

  expect(opened).toEqual(succeeded(undefined));
  expect(foldersShownInTheFileManager).toEqual([logFolder]);
});

test("a_runtime_keeping_no_log_one_not_describing_itself_or_a_missing_folder_opens_nothing", async () => {
  const keepingNoLog = await openingTheLogFolderOf(null, []);
  expect(keepingNoLog.opened).toEqual(failedWith(RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL));

  const missingFolder = await openingTheLogFolderOf("/gone/logs", []);
  expect(missingFolder.opened).toEqual(failedWith("/gone/logs is not a folder on this machine."));

  const nothingAnswers = await Effect.runPromise(
    openTheRuntimesLogFolder.pipe(
      Effect.match({ onSuccess: () => "opened", onFailure: ({ words }) => words }),
      Effect.provide(Layer.mergeAll(runtimeControlLayer("/nowhere/tatolab.sock", 2_000), Layer.mock(FileManager, {}))),
    ),
  );
  expect(nothingAnswers).toMatch(/^no runtime answers at \/nowhere\/tatolab\.sock/);
  expect([...keepingNoLog.foldersShownInTheFileManager, ...missingFolder.foldersShownInTheFileManager]).toEqual([]);
});
