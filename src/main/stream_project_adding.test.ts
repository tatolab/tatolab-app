import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { StreamProjectFolderChosenFor, StreamRunAnswer } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure, StreamRunRequest } from "./local_api_client.js";
import type { TatolabCommandLineTool } from "./platform/tatolab_command_line_tool.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { ProgramRunner } from "./platform/run_program_to_completion.js";
import { firstFreeSuffixedName, StreamProjectAdding, type StreamRunsOnTheRuntime } from "./stream_project_adding.js";

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

const HEAT_MAP_RUN_ANSWER: StreamRunAnswer = {
  stream: "heat-map-heat-map-2c71fa",
  display_name: "heat_map",
  stream_instance: "9",
  location: { project_directory: "/tmp/heat-map", stream_function: "stream:heat_map" },
  node_count: 4,
  replaced_a_recorded_stream: false,
  compile_warnings: [],
};

/** The runtime's `run_stream`, answering as scripted and recording each run asked of it. */
class FakeStreamRunsOnTheRuntime implements StreamRunsOnTheRuntime {
  readonly runsAsked: StreamRunRequest[] = [];
  runAnswer: Result<StreamRunAnswer, LocalApiRequestFailure> = succeeded(HEAT_MAP_RUN_ANSWER);

  async runStream(streamRunRequest: StreamRunRequest): Promise<Result<StreamRunAnswer, LocalApiRequestFailure>> {
    this.runsAsked.push(streamRunRequest);
    return this.runAnswer;
  }
}

interface StreamProjectAddingOverFakes {
  streamProjectAdding: StreamProjectAdding;
  homeDirectory: string;
  dialogAsked: { chosenFor: StreamProjectFolderChosenFor; defaultFolder: string }[];
  programsRun: { programPath: string; programArguments: readonly string[] }[];
  pythonEnvironmentsMade: string[];
  streamRuns: FakeStreamRunsOnTheRuntime;
}

async function streamProjectAddingOverFakes({
  dialogAnswer = succeeded(null),
  tatolabCommandLineTool = { kind: "at", path: "/Applications/Tatolab.app/Contents/MacOS/tatolab-cli" },
  runProgram = async () => succeeded({ exitStatus: 0, endingSignal: null, standardOutput: "", standardError: "" }),
  pythonEnvironmentAnswer = succeeded(undefined),
}: {
  dialogAnswer?: Result<string | null, string>;
  tatolabCommandLineTool?: TatolabCommandLineTool;
  runProgram?: ProgramRunner;
  pythonEnvironmentAnswer?: Result<void, string>;
} = {}): Promise<StreamProjectAddingOverFakes> {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-home-"));
  temporaryHomes.push(homeDirectory);
  const dialogAsked: StreamProjectAddingOverFakes["dialogAsked"] = [];
  const programsRun: StreamProjectAddingOverFakes["programsRun"] = [];
  const pythonEnvironmentsMade: string[] = [];
  const streamRuns = new FakeStreamRunsOnTheRuntime();
  const streamProjectAdding = new StreamProjectAdding({
    homeDirectory,
    streamProjectFolderDialog: async (chosenFor, defaultFolder) => {
      dialogAsked.push({ chosenFor, defaultFolder });
      return dialogAnswer;
    },
    tatolabCommandLineTool,
    runProgramToCompletion: async (programPath, programArguments) => {
      programsRun.push({ programPath, programArguments });
      return runProgram(programPath, programArguments);
    },
    makePythonEnvironmentUnlessOneWorks: async (projectFolder) => {
      pythonEnvironmentsMade.push(projectFolder);
      return pythonEnvironmentAnswer;
    },
    streamRunsOnTheRuntime: streamRuns,
  });
  return { streamProjectAdding, homeDirectory, dialogAsked, programsRun, pythonEnvironmentsMade, streamRuns };
}

test("the first free name is the name itself, then -2, then the next number nothing holds", async () => {
  const takenIn = (takenNames: readonly string[]) => (candidate: string) => takenNames.includes(candidate);
  expect(await firstFreeSuffixedName("front-door", takenIn([]))).toBe("front-door");
  expect(await firstFreeSuffixedName("front-door", takenIn(["front-door"]))).toBe("front-door-2");
  expect(await firstFreeSuffixedName("front-door", takenIn(["front-door", "front-door-2", "front-door-3"]))).toBe("front-door-4");
});

test("a folder chosen through a link is handed to the window with its links resolved, as the runtime lists a project, and runs from there", async () => {
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "tl-app-project-"));
  temporaryHomes.push(projectFolder);
  const linkToTheProject = `${projectFolder}-link`;
  await symlink(projectFolder, linkToTheProject);
  temporaryHomes.push(linkToTheProject);
  const { streamProjectAdding, streamRuns } = await streamProjectAddingOverFakes({ dialogAnswer: succeeded(linkToTheProject) });

  const chosen = await streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  expect(chosen.ok && chosen.value?.folder).toBe(await realpath(projectFolder));
  expect((await streamProjectAdding.runStreamProject(await realpath(projectFolder), null, null)).ok).toBe(true);
  expect(streamRuns.runsAsked.map((runAsked) => runAsked.projectDirectory)).toEqual([await realpath(projectFolder)]);
});

test("a folder chosen in the dialog is handed to the window with what it holds; a cancelled dialog answers nothing", async () => {
  const { streamProjectAdding, homeDirectory, dialogAsked } = await streamProjectAddingOverFakes({ dialogAnswer: succeeded("/tmp/../tmp/heat-map") });
  const chosen = await streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  expect(chosen.ok && chosen.value?.folder).toBe("/tmp/heat-map");
  expect(dialogAsked).toEqual([{ chosenFor: "project_to_run", defaultFolder: homeDirectory }]);
  expect((await streamProjectAdding.runStreamProject("/tmp/heat-map", null, null)).ok).toBe(true);

  const cancelled = await (await streamProjectAddingOverFakes()).streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  expect(cancelled).toEqual(succeeded(null));

  const refusedDialog = await (await streamProjectAddingOverFakes({ dialogAnswer: failedWith("the dialog did not open") })).streamProjectAdding.chooseStreamProjectFolder(
    "project_to_run",
  );
  expect(refusedDialog).toEqual(failedWith("the dialog did not open"));
});

test("a new project is proposed at the first free ~/streams/hello, and its dialog opens there", async () => {
  const { streamProjectAdding, homeDirectory, dialogAsked } = await streamProjectAddingOverFakes();
  await mkdir(path.join(homeDirectory, "streams", "hello"), { recursive: true });
  await writeFile(path.join(homeDirectory, "streams", "hello-2"), "");

  const proposal = await streamProjectAdding.proposeNewStreamProjectFolder();
  expect(proposal).toEqual({
    folder: path.join(homeDirectory, "streams", "hello-3"),
    folder_exists: false,
    stream_file_present: false,
    stream_functions: [],
    python_environment: { kind: "missing" },
  });
  expect((await streamProjectAdding.createStreamProject(proposal.folder)).ok).toBe(true);

  await streamProjectAdding.chooseStreamProjectFolder("new_project_directory");
  expect(dialogAsked).toEqual([{ chosenFor: "new_project_directory", defaultFolder: path.join(homeDirectory, "streams", "hello-3") }]);
});

test("every command naming a folder refuses one the app never handed the window, and touches nothing", async () => {
  const { streamProjectAdding, programsRun, pythonEnvironmentsMade, streamRuns } = await streamProjectAddingOverFakes();
  const refusal = failedWith("Tatolab acts only on a folder chosen in its window. Choose /etc again.");
  expect(await streamProjectAdding.createStreamProject("/etc")).toEqual(refusal);
  expect(await streamProjectAdding.runStreamProject("/etc", null, "etc")).toEqual(refusal);
  expect(programsRun).toEqual([]);
  expect(pythonEnvironmentsMade).toEqual([]);
  expect(streamRuns.runsAsked).toEqual([]);
});

test("creating a project runs tatolab new in the proposed folder, then answers what the folder holds", async () => {
  const { streamProjectAdding, programsRun } = await streamProjectAddingOverFakes({
    runProgram: async (_programPath, programArguments) => {
      const projectFolder = programArguments[1] ?? "";
      await mkdir(projectFolder, { recursive: true });
      await writeFile(path.join(projectFolder, "stream.py"), "@stream\ndef main(stream_builder):\n    pass\n");
      return succeeded({ exitStatus: 0, endingSignal: null, standardOutput: "Created a Tatolab stream project", standardError: "" });
    },
  });
  const proposal = await streamProjectAdding.proposeNewStreamProjectFolder();
  const created = await streamProjectAdding.createStreamProject(proposal.folder);
  expect(programsRun).toEqual([{ programPath: "/Applications/Tatolab.app/Contents/MacOS/tatolab-cli", programArguments: ["new", proposal.folder] }]);
  expect(created).toEqual(
    succeeded({
      folder: proposal.folder,
      folder_exists: true,
      stream_file_present: true,
      stream_functions: ["main"],
      python_environment: { kind: "missing" },
    }),
  );
});

test("tatolab new's refusal comes back in its own words, and a build with no CLI says why", async () => {
  const refusing = await streamProjectAddingOverFakes({
    runProgram: async () =>
      succeeded({
        exitStatus: 1,
        endingSignal: null,
        standardOutput: "",
        standardError: "`/home/someone/streams/hello` already has stream.py — scaffolding would overwrite it. Pick an empty directory.\n",
      }),
  });
  const refusingProposal = await refusing.streamProjectAdding.proposeNewStreamProjectFolder();
  expect(await refusing.streamProjectAdding.createStreamProject(refusingProposal.folder)).toEqual(
    failedWith("`/home/someone/streams/hello` already has stream.py — scaffolding would overwrite it. Pick an empty directory."),
  );

  const silent = await streamProjectAddingOverFakes({
    runProgram: async () => succeeded({ exitStatus: null, endingSignal: "SIGKILL", standardOutput: "", standardError: "" }),
  });
  const silentProposal = await silent.streamProjectAdding.proposeNewStreamProjectFolder();
  expect(await silent.streamProjectAdding.createStreamProject(silentProposal.folder)).toEqual(failedWith("tatolab new ended with signal: 9 (SIGKILL)"));

  const withoutTheCli = await streamProjectAddingOverFakes({ tatolabCommandLineTool: { kind: "not_offered", reason: "no tatolab here" } });
  const withoutTheCliProposal = await withoutTheCli.streamProjectAdding.proposeNewStreamProjectFolder();
  expect(await withoutTheCli.streamProjectAdding.createStreamProject(withoutTheCliProposal.folder)).toEqual(failedWith("no tatolab here"));
  expect(withoutTheCli.programsRun).toEqual([]);
});

test("a run that loads answers run_stream's reply, asking for the function and display name the window gave", async () => {
  const { streamProjectAdding, streamRuns } = await streamProjectAddingOverFakes({ dialogAnswer: succeeded("/tmp/heat-map") });
  await streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  expect(await streamProjectAdding.runStreamProject("/tmp/heat-map", "stream.py:heat_map", "heat_map")).toEqual(
    succeeded({ kind: "running", answer: HEAT_MAP_RUN_ANSWER }),
  );
  expect(streamRuns.runsAsked).toEqual([{ projectDirectory: "/tmp/heat-map", streamFunction: "stream.py:heat_map", displayName: "heat_map" }]);
});

test("a run makes the folder's .venv before run_stream, and uv's refusal is python_environment_not_made with no run asked", async () => {
  const made = await streamProjectAddingOverFakes({ dialogAnswer: succeeded("/tmp/heat-map") });
  await made.streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  await made.streamProjectAdding.runStreamProject("/tmp/heat-map", null, "heat_map");
  expect(made.pythonEnvironmentsMade).toEqual(["/tmp/heat-map"]);

  const uvsOwnWords = "error: No interpreter found at path `/opt/homebrew/bin/python3.11`";
  const notMade = await streamProjectAddingOverFakes({ dialogAnswer: succeeded("/tmp/heat-map"), pythonEnvironmentAnswer: failedWith(uvsOwnWords) });
  await notMade.streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  expect(await notMade.streamProjectAdding.runStreamProject("/tmp/heat-map", null, "heat_map")).toEqual(
    succeeded({ kind: "python_environment_not_made", words: uvsOwnWords }),
  );
  expect(notMade.streamRuns.runsAsked).toEqual([]);
});

test("a refusal comes back in the runtime's own words, and a run that never answered in the client's", async () => {
  const compileRefusal = "Runtime error: the stream function in /tmp/front-door-v2 failed to compile: `/tmp/front-door-v2/.venv/bin/python` exited with exit status: 1.";
  const { streamProjectAdding, streamRuns } = await streamProjectAddingOverFakes({ dialogAnswer: succeeded("/tmp/front-door-v2") });
  await streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  streamRuns.runAnswer = failedWith({ failureDescription: compileRefusal, isTheRuntimesRefusal: true });
  expect(await streamProjectAdding.runStreamProject("/tmp/front-door-v2", null, "front-door")).toEqual(failedWith(compileRefusal));

  streamRuns.runAnswer = failedWith({ failureDescription: "POST /mcp did not answer within 360s", isTheRuntimesRefusal: false });
  expect(await streamProjectAdding.runStreamProject("/tmp/front-door-v2", null, "front-door")).toEqual(failedWith("POST /mcp did not answer within 360s"));
});
