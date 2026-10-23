// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ListedStream, StreamProjectFolderChosenFor, StreamRunAnswer } from "../../src/backend/tatolab_backend_contract.js";
import type { LocalApiRequestFailure, StreamRunRequest } from "./local_api_client.js";
import type { TatolabCommandLineTool } from "./platform/mod.js";
import type { ProgramCompletion } from "./platform/run_program_to_completion.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { firstFreeStreamName, StreamProjectAdding, type StreamRunsOnTheRuntime } from "./stream_project_adding.js";

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

const HEAT_MAP_RUN_ANSWER: StreamRunAnswer = {
  stream: "heat_map",
  stream_instance: "9",
  kept: true,
  project_directory: "/tmp/heat-map",
  node_count: 4,
  replaced_the_kept_record: false,
  compile_warnings: [],
};

function listedStreamNamed(name: string): ListedStream {
  return { name, state: "kept", project_directory: `/home/someone/streams/${name}`, node_count: 3, failed_because: null };
}

/** The runtime's two tools, answering as scripted and recording each run asked of them. */
class FakeStreamRunsOnTheRuntime implements StreamRunsOnTheRuntime {
  readonly runsAsked: StreamRunRequest[] = [];
  runAnswer: Result<StreamRunAnswer, LocalApiRequestFailure> = succeeded(HEAT_MAP_RUN_ANSWER);
  listAnswer: Result<ListedStream[], LocalApiRequestFailure> = succeeded([]);

  async runStream(streamRunRequest: StreamRunRequest): Promise<Result<StreamRunAnswer, LocalApiRequestFailure>> {
    this.runsAsked.push(streamRunRequest);
    return this.runAnswer;
  }

  async listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>> {
    return this.listAnswer;
  }
}

interface StreamProjectAddingOverFakes {
  streamProjectAdding: StreamProjectAdding;
  homeDirectory: string;
  dialogAsked: { chosenFor: StreamProjectFolderChosenFor; defaultFolder: string }[];
  programsRun: { programPath: string; programArguments: readonly string[] }[];
  streamRuns: FakeStreamRunsOnTheRuntime;
}

async function streamProjectAddingOverFakes({
  dialogAnswer = succeeded(null),
  tatolabCommandLineTool = { kind: "at", path: "/Applications/Tatolab.app/Contents/MacOS/tatolab-cli" },
  runProgram = async () => succeeded({ exitStatus: 0, endingSignal: null, standardOutput: "", standardError: "" }),
}: {
  dialogAnswer?: Result<string | null, string>;
  tatolabCommandLineTool?: TatolabCommandLineTool;
  runProgram?: (programPath: string, programArguments: readonly string[]) => Promise<Result<ProgramCompletion, string>>;
} = {}): Promise<StreamProjectAddingOverFakes> {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-home-"));
  temporaryHomes.push(homeDirectory);
  const dialogAsked: StreamProjectAddingOverFakes["dialogAsked"] = [];
  const programsRun: StreamProjectAddingOverFakes["programsRun"] = [];
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
    streamRunsOnTheRuntime: streamRuns,
  });
  return { streamProjectAdding, homeDirectory, dialogAsked, programsRun, streamRuns };
}

test("the first free name adds -2, then the next number no listed stream holds", () => {
  expect(firstFreeStreamName("front-door", ["front-door"])).toBe("front-door-2");
  expect(firstFreeStreamName("front-door", ["front-door", "front-door-2", "front-door-3"])).toBe("front-door-4");
});

test("a folder chosen in the dialog is handed to the window with what it holds; a cancelled dialog answers nothing", async () => {
  const { streamProjectAdding, homeDirectory, dialogAsked } = await streamProjectAddingOverFakes({ dialogAnswer: succeeded("/tmp/../tmp/heat-map") });
  const chosen = await streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  expect(chosen.ok && chosen.value?.folder).toBe("/tmp/heat-map");
  expect(dialogAsked).toEqual([{ chosenFor: "project_to_run", defaultFolder: homeDirectory }]);
  expect(streamProjectAdding.isAFolderHandedToTheWindow("/tmp/heat-map")).toBe(true);

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
  expect(streamProjectAdding.isAFolderHandedToTheWindow(proposal.folder)).toBe(true);

  await streamProjectAdding.chooseStreamProjectFolder("new_project_directory");
  expect(dialogAsked).toEqual([{ chosenFor: "new_project_directory", defaultFolder: path.join(homeDirectory, "streams", "hello-3") }]);
});

test("every command naming a folder refuses one the app never handed the window, and touches nothing", async () => {
  const { streamProjectAdding, programsRun, streamRuns } = await streamProjectAddingOverFakes();
  const refusal = failedWith("Tatolab acts only on a folder chosen in its window. Choose /etc again.");
  expect(await streamProjectAdding.checkStreamProjectFolder("/etc")).toEqual(refusal);
  expect(await streamProjectAdding.createStreamProject("/etc")).toEqual(refusal);
  expect(await streamProjectAdding.runStreamProject("/etc", null, "etc")).toEqual(refusal);
  expect(programsRun).toEqual([]);
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

test("a run that loads answers run_stream's reply, asking for the function and name the window gave", async () => {
  const { streamProjectAdding, streamRuns } = await streamProjectAddingOverFakes({ dialogAnswer: succeeded("/tmp/heat-map") });
  await streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  expect(await streamProjectAdding.runStreamProject("/tmp/heat-map", "stream.py:heat_map", "heat_map")).toEqual(
    succeeded({ kind: "running", answer: HEAT_MAP_RUN_ANSWER }),
  );
  expect(streamRuns.runsAsked).toEqual([{ projectDirectory: "/tmp/heat-map", streamFunction: "stream.py:heat_map", streamName: "heat_map" }]);
});

test("a refused name a listed stream holds is name_taken with the first free name; any other failure is the refusal itself", async () => {
  const runtimesRefusal = "the stream name `front-door` is held by a kept stream from /home/someone/streams/front-door; run this one under another name";
  const { streamProjectAdding, streamRuns } = await streamProjectAddingOverFakes({ dialogAnswer: succeeded("/tmp/front-door-v2") });
  await streamProjectAdding.chooseStreamProjectFolder("project_to_run");
  streamRuns.runAnswer = failedWith({ failureDescription: runtimesRefusal, isTheRuntimesRefusal: true });
  streamRuns.listAnswer = succeeded([listedStreamNamed("front-door"), listedStreamNamed("front-door-2")]);
  expect(await streamProjectAdding.runStreamProject("/tmp/front-door-v2", null, "front-door")).toEqual(
    succeeded({ kind: "name_taken", refusal: runtimesRefusal, free_name: "front-door-3" }),
  );

  streamRuns.listAnswer = succeeded([listedStreamNamed("lobby-wall")]);
  expect(await streamProjectAdding.runStreamProject("/tmp/front-door-v2", null, "front-door")).toEqual(failedWith(runtimesRefusal));

  streamRuns.listAnswer = succeeded([listedStreamNamed("front-door")]);
  streamRuns.runAnswer = failedWith({ failureDescription: "POST /mcp did not answer within 360s", isTheRuntimesRefusal: false });
  expect(await streamProjectAdding.runStreamProject("/tmp/front-door-v2", null, "front-door")).toEqual(failedWith("POST /mcp did not answer within 360s"));
});
