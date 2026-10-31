import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ProjectCreationQueued, ProjectRunQueued, StreamProjectFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { StreamProjectAdding, type ProjectLoadsOnTheRuntime } from "./stream_project_adding.js";

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

/** The runtime's `create_project` and `run_project`, answering as scripted and recording each folder asked of them. */
class FakeProjectLoadsOnTheRuntime implements ProjectLoadsOnTheRuntime {
  readonly creationsAsked: (string | null)[] = [];
  readonly runsAsked: string[] = [];
  creationAnswer: Result<ProjectCreationQueued, LocalApiRequestFailure> = succeeded({ action: "R1-2", stream: "lobby-main-caa719", project_directory: "/tmp/lobby" });
  runAnswer: Result<ProjectRunQueued, LocalApiRequestFailure> = succeeded({ action: "R1-3", project_directory: "/tmp/hallways" });

  async createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> {
    this.creationsAsked.push(projectDirectory);
    return this.creationAnswer;
  }

  async runProject(projectDirectory: string): Promise<Result<ProjectRunQueued, LocalApiRequestFailure>> {
    this.runsAsked.push(projectDirectory);
    return this.runAnswer;
  }
}

async function streamProjectAddingOverFakes(dialogAnswer: Result<string | null, string> = succeeded(null)) {
  const homeDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "tl-app-home-")));
  temporaryHomes.push(homeDirectory);
  const dialogAsked: { chosenFor: StreamProjectFolderChosenFor; defaultFolder: string }[] = [];
  const projectLoads = new FakeProjectLoadsOnTheRuntime();
  const streamProjectAdding = new StreamProjectAdding({
    homeDirectory,
    streamProjectFolderDialog: async (chosenFor, defaultFolder) => {
      dialogAsked.push({ chosenFor, defaultFolder });
      return dialogAnswer;
    },
    projectLoadsOnTheRuntime: projectLoads,
  });
  return { streamProjectAdding, homeDirectory, dialogAsked, projectLoads };
}

test("the dialog opens at home for a project to import, and at ~/streams for a new one once that folder exists", async () => {
  const { streamProjectAdding, homeDirectory, dialogAsked } = await streamProjectAddingOverFakes();

  await streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  await streamProjectAdding.chooseStreamProjectFolder("new_project_directory");
  await mkdir(path.join(homeDirectory, "streams"));
  await streamProjectAdding.chooseStreamProjectFolder("new_project_directory");

  expect(dialogAsked).toEqual([
    { chosenFor: "project_to_run", defaultFolder: homeDirectory },
    { chosenFor: "new_project_directory", defaultFolder: homeDirectory },
    { chosenFor: "new_project_directory", defaultFolder: path.join(homeDirectory, "streams") },
  ]);
});

test("a chosen folder comes back with its links resolved, and only a folder handed to the window is created or run", async () => {
  const { streamProjectAdding, homeDirectory, projectLoads } = await streamProjectAddingOverFakes();
  const hallways = path.join(homeDirectory, "hallways");
  await mkdir(hallways);
  await symlink(hallways, path.join(homeDirectory, "hallways-link"));
  const choosingThroughALink = await (await streamProjectAddingOverFakes(succeeded(path.join(homeDirectory, "hallways-link")))).streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  expect(choosingThroughALink).toEqual(succeeded(hallways));

  expect(await streamProjectAdding.runStreamProject(hallways)).toEqual(failedWith(`Tatolab acts only on a folder chosen in its window. Choose ${hallways} again.`));
  expect(await streamProjectAdding.createStreamProject("/etc")).toEqual(failedWith("Tatolab acts only on a folder chosen in its window. Choose /etc again."));
  expect(projectLoads.runsAsked).toEqual([]);
  expect(projectLoads.creationsAsked).toEqual([]);
});

test("a chosen folder is created or run through the runtime, and a new project with no folder lets the runtime draw one", async () => {
  const { homeDirectory } = await streamProjectAddingOverFakes();
  const lobby = path.join(homeDirectory, "lobby");
  const { streamProjectAdding, projectLoads } = await streamProjectAddingOverFakes(succeeded(lobby));

  expect(await streamProjectAdding.chooseStreamProjectFolder("new_project_directory")).toEqual(succeeded(lobby));
  expect(await streamProjectAdding.createStreamProject(lobby)).toEqual(succeeded({ action: "R1-2", stream: "lobby-main-caa719", project_directory: "/tmp/lobby" }));
  expect(await streamProjectAdding.createStreamProject(null)).toEqual(succeeded({ action: "R1-2", stream: "lobby-main-caa719", project_directory: "/tmp/lobby" }));
  expect(await streamProjectAdding.runStreamProject(lobby)).toEqual(succeeded({ action: "R1-3", project_directory: "/tmp/hallways" }));
  expect(projectLoads.creationsAsked).toEqual([lobby, null]);
  expect(projectLoads.runsAsked).toEqual([lobby]);
});

test("a refusal of the runtime reaches the window in its own words, and a cancelled dialog answers null", async () => {
  const { streamProjectAdding, projectLoads } = await streamProjectAddingOverFakes();
  projectLoads.creationAnswer = failedWith({ failureDescription: "Invalid configuration: HOME is not set", isTheRuntimesRefusal: true });

  expect(await streamProjectAdding.chooseStreamProjectFolder("project_to_run")).toEqual(succeeded(null));
  expect(await streamProjectAdding.createStreamProject(null)).toEqual(failedWith("Invalid configuration: HOME is not set"));
});
