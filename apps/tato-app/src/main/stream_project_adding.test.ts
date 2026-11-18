import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterEach, expect, test } from "vitest";
import type { StreamProjectFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import { controlOperationFailedResponse, controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { cleanUps, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy } from "./runtime_operations_test_support.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { chooseAStreamProjectFolder, createAStreamProject, openAStreamProject } from "./stream_project_adding.js";
import { foldersChosenInTheWindowLayer, ProjectDialogs, StatusRounds, ThisMachinesFolders, type FoldersChosenInTheWindow } from "./studio_runtime.js";
import type { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";

afterEach(cleanUpWhatTheTestStarted);

/**
 * Adding a project from a home folder of its own, the dialog answering `dialogAnswer` and recording each time it is asked, and a runtime
 * queuing each `create_project` and `open_project`, refusing a creation in `creationRefusal` when given; with the status rounds asked for.
 */
async function addingAProjectOverFakes(options: { dialogAnswer?: string | null; creationRefusal?: string } = {}) {
  const homeDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "tl-app-home-")));
  cleanUps.push(() => rm(homeDirectory, { recursive: true, force: true }));
  const dialogAsked: { chosenFor: StreamProjectFolderChosenFor; defaultFolder: string }[] = [];
  let statusRounds = 0;
  const runtime = await FakeLocalApiServer.answeringEachControlOperation(async (method, params) => {
    const projectDirectory = typeof params["project_directory"] === "string" ? params["project_directory"] : "/tmp/streams/kind-butte";
    switch (method) {
      case "create_project":
        return options.creationRefusal === undefined
          ? controlOperationResultResponse({ action: "R1-2", stream: `${path.basename(projectDirectory)}-main-caa719`, project_directory: projectDirectory })
          : controlOperationFailedResponse(options.creationRefusal);
      case "open_project":
        return controlOperationResultResponse({ action: "R1-3", project_directory: projectDirectory });
      default:
        return null;
    }
  });
  cleanUps.push(() => runtime.close());
  const servicesOfAdding = Layer.mergeAll(
    runtimeControlLayer(runtime.localApiSocketPath, 2_000),
    Layer.succeed(ThisMachinesFolders, { homeDirectory, documentsDirectory: path.join(homeDirectory, "Documents") }),
    Layer.mock(ProjectDialogs, {
      chooseAStreamProjectFolder: (chosenFor, defaultFolder) =>
        Effect.sync(() => {
          dialogAsked.push({ chosenFor, defaultFolder });
          return options.dialogAnswer ?? null;
        }),
    }),
    Layer.mock(StatusRounds, { requestARound: Effect.sync(() => void (statusRounds += 1)) }),
    foldersChosenInTheWindowLayer,
  );
  const studioRuntime = ManagedRuntime.make(servicesOfAdding);
  cleanUps.push(() => studioRuntime.dispose());
  const run = <Answer>(adding: Effect.Effect<Answer, { readonly words: string }, RuntimeControl | ThisMachinesFolders | ProjectDialogs | StatusRounds | FoldersChosenInTheWindow>): Promise<Result<Answer, string>> =>
    studioRuntime.runPromise(adding.pipe(Effect.match({ onSuccess: (answer) => succeeded(answer), onFailure: (failure) => failedWith(failure.words) })));
  return { homeDirectory, dialogAsked, statusRounds: () => statusRounds, callsReceived: () => controlOperationCallsReceivedBy(runtime), run };
}

test("the dialog opens at home for a project to import, and at ~/streams for a new one once that folder exists", async () => {
  const adding = await addingAProjectOverFakes();

  await adding.run(chooseAStreamProjectFolder("project_to_open"));
  await adding.run(chooseAStreamProjectFolder("new_project_directory"));
  await mkdir(path.join(adding.homeDirectory, "streams"));
  await adding.run(chooseAStreamProjectFolder("new_project_directory"));

  expect(adding.dialogAsked).toEqual([
    { chosenFor: "project_to_open", defaultFolder: adding.homeDirectory },
    { chosenFor: "new_project_directory", defaultFolder: adding.homeDirectory },
    { chosenFor: "new_project_directory", defaultFolder: path.join(adding.homeDirectory, "streams") },
  ]);
});

test("a chosen folder comes back with its links resolved, and only a folder handed to the window is created or opened", async () => {
  const { homeDirectory } = await addingAProjectOverFakes();
  const hallways = path.join(homeDirectory, "hallways");
  await mkdir(hallways);
  await symlink(hallways, path.join(homeDirectory, "hallways-link"));
  const adding = await addingAProjectOverFakes({ dialogAnswer: path.join(homeDirectory, "hallways-link") });

  expect(await adding.run(openAStreamProject(hallways))).toEqual(failedWith(`Tato Studio acts only on a folder chosen in its window. Choose ${hallways} again.`));
  expect(await adding.run(chooseAStreamProjectFolder("project_to_open"))).toEqual(succeeded(hallways));
  expect(await adding.run(createAStreamProject("/etc"))).toEqual(failedWith("Tato Studio acts only on a folder chosen in its window. Choose /etc again."));
  expect(adding.callsReceived()).toEqual([]);
  expect(await adding.run(openAStreamProject(hallways))).toEqual(succeeded({ action: "R1-3", project_directory: hallways }));
  expect(adding.callsReceived()).toEqual([["open_project", { project_directory: hallways }]]);
});

test("a chosen folder is created or opened through the runtime then a status round, and a new project with no folder lets the runtime draw one", async () => {
  const { homeDirectory } = await addingAProjectOverFakes();
  const lobby = path.join(homeDirectory, "lobby");
  const adding = await addingAProjectOverFakes({ dialogAnswer: lobby });

  expect(await adding.run(chooseAStreamProjectFolder("new_project_directory"))).toEqual(succeeded(lobby));
  expect(await adding.run(createAStreamProject(lobby))).toEqual(succeeded({ action: "R1-2", stream: "lobby-main-caa719", project_directory: lobby }));
  expect(await adding.run(createAStreamProject(null))).toEqual(succeeded({ action: "R1-2", stream: "kind-butte-main-caa719", project_directory: "/tmp/streams/kind-butte" }));
  expect(await adding.run(openAStreamProject(lobby))).toEqual(succeeded({ action: "R1-3", project_directory: lobby }));
  expect(adding.callsReceived()).toEqual([
    ["create_project", { project_directory: lobby }],
    ["create_project", {}],
    ["open_project", { project_directory: lobby }],
  ]);
  expect(adding.statusRounds()).toBe(3);
});

test("a refusal of the runtime reaches the window in its own words after a status round, and a cancelled dialog answers null", async () => {
  const adding = await addingAProjectOverFakes({ creationRefusal: "Invalid configuration: HOME is not set" });

  expect(await adding.run(chooseAStreamProjectFolder("project_to_open"))).toEqual(succeeded(null));
  expect(await adding.run(createAStreamProject(null))).toEqual(failedWith("Invalid configuration: HOME is not set"));
  expect(adding.statusRounds()).toBe(1);
});
