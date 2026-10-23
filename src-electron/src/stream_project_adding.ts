// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Adding a stream from the window: choosing a project folder or a new project's directory,
// checking what the folder holds, writing the sample project with `tatolab new`, and running a
// folder kept through the runtime's `run_stream`. A command naming a folder acts only on one this
// module handed the window, from the app's own folder dialog or its proposal, so a page can never
// have the app read, write, run or open a path of its choosing.

import path from "node:path";
import type {
  ListedStream,
  StreamProjectFolderChosenFor,
  StreamProjectFolderReport,
  StreamProjectRunOutcome,
  StreamRunAnswer,
} from "../../src/backend/tatolab_backend_contract.js";
import type { LocalApiRequestFailure, StreamRunRequest } from "./local_api_client.js";
import type { TatolabCommandLineTool } from "./platform/mod.js";
import { describeHowTheProgramEnded, programSucceeded, type ProgramCompletion } from "./platform/run_program_to_completion.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { inspectStreamProjectFolder, somethingIsAt } from "./stream_project_folder_inspection.js";

/** Where a new project goes unless the person chooses elsewhere, under the home directory. */
const NEW_STREAM_PROJECTS_FOLDER_IN_HOME = "streams";

/** The new project's directory name the app proposes first; `hello-2`, `hello-3`, … follow while it is taken. */
const FIRST_PROPOSED_NEW_STREAM_PROJECT_NAME = "hello";

/** The suffix a taken name is offered with first: `<name>-2`. */
const FIRST_FREE_NAME_SUFFIX = 2;

/** Asks the person for a folder in the desktop's dialog, opened at `defaultFolder`: an existing project to run, or a new project's directory, which may not exist yet. `null` when they cancel. */
export type StreamProjectFolderDialog = (chosenFor: StreamProjectFolderChosenFor, defaultFolder: string) => Promise<Result<string | null, string>>;

/** Runs a program to its end, never through a shell. */
export type ProgramRunner = (programPath: string, programArguments: readonly string[]) => Promise<Result<ProgramCompletion, string>>;

/** The runtime's two tools a run needs: `run_stream`, and `list_streams` to tell a taken name. */
export interface StreamRunsOnTheRuntime {
  runStream(streamRunRequest: StreamRunRequest): Promise<Result<StreamRunAnswer, LocalApiRequestFailure>>;
  listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>>;
}

/** What adding a stream reaches: the person's home, the dialog, the `tatolab` CLI and how programs run, and the runtime. */
export interface StreamProjectAddingSources {
  homeDirectory: string;
  streamProjectFolderDialog: StreamProjectFolderDialog;
  tatolabCommandLineTool: TatolabCommandLineTool;
  runProgramToCompletion: ProgramRunner;
  streamRunsOnTheRuntime: StreamRunsOnTheRuntime;
}

/** `streamName` with the first `-<n>` from 2 that no name in `takenNames` has. */
export function firstFreeStreamName(streamName: string, takenNames: readonly string[]): string {
  const taken = new Set(takenNames);
  let suffix = FIRST_FREE_NAME_SUFFIX;
  while (taken.has(`${streamName}-${suffix}`)) suffix += 1;
  return `${streamName}-${suffix}`;
}

/** The refusal of a folder the window names that the app never handed it. */
function folderNotHandedToTheWindowRefusal(folder: string): string {
  return `Tatolab acts only on a folder chosen in its window. Choose ${folder} again.`;
}

/** The folders the window may name, and every command that names one. */
export class StreamProjectAdding {
  private readonly foldersHandedToTheWindow = new Set<string>();

  constructor(private readonly sources: StreamProjectAddingSources) {}

  /** Whether the app handed the window `folder`, which it may then name. */
  isAFolderHandedToTheWindow(folder: string): boolean {
    return this.foldersHandedToTheWindow.has(path.resolve(folder));
  }

  /** Ask the person for a folder in the dialog and answer what it holds; `null` when they cancel. */
  async chooseStreamProjectFolder(chosenFor: StreamProjectFolderChosenFor): Promise<Result<StreamProjectFolderReport | null, string>> {
    const defaultFolder =
      chosenFor === "project_to_run" ? this.sources.homeDirectory : await this.firstFreeNewStreamProjectFolder();
    const chosenFolder = await this.sources.streamProjectFolderDialog(chosenFor, defaultFolder);
    if (!chosenFolder.ok) return chosenFolder;
    return succeeded(chosenFolder.value === null ? null : await this.handToTheWindow(chosenFolder.value));
  }

  /** The first of `~/streams/hello`, `~/streams/hello-2`, … that nothing is at yet, for a new project. */
  async proposeNewStreamProjectFolder(): Promise<StreamProjectFolderReport> {
    return this.handToTheWindow(await this.firstFreeNewStreamProjectFolder());
  }

  /** What `folder` holds now; refused for a folder the app never handed the window. */
  async checkStreamProjectFolder(folder: string): Promise<Result<StreamProjectFolderReport, string>> {
    if (!this.isAFolderHandedToTheWindow(folder)) return failedWith(folderNotHandedToTheWindowRefusal(folder));
    return succeeded(await inspectStreamProjectFolder(path.resolve(folder)));
  }

  /** `tatolab new <folder>`, which writes the sample project, then what the folder holds; refused in the CLI's own words, or for a folder the app never handed the window. */
  async createStreamProject(folder: string): Promise<Result<StreamProjectFolderReport, string>> {
    if (!this.isAFolderHandedToTheWindow(folder)) return failedWith(folderNotHandedToTheWindowRefusal(folder));
    const tatolabCommandLineTool = this.sources.tatolabCommandLineTool;
    if (tatolabCommandLineTool.kind === "not_offered") return failedWith(tatolabCommandLineTool.reason);
    const projectFolder = path.resolve(folder);
    const scaffolding = await this.sources.runProgramToCompletion(tatolabCommandLineTool.path, ["new", projectFolder]);
    if (!scaffolding.ok) return scaffolding;
    if (!programSucceeded(scaffolding.value)) {
      const commandLineToolsOwnWords = scaffolding.value.standardError.trim();
      return failedWith(
        commandLineToolsOwnWords === ""
          ? `tatolab new ended with ${describeHowTheProgramEnded(scaffolding.value)}`
          : commandLineToolsOwnWords,
      );
    }
    return succeeded(await inspectStreamProjectFolder(projectFolder));
  }

  /**
   * Run `folder` kept through `run_stream`. A refusal is answered in the runtime's own words; one of a `streamName` a
   * listed stream holds is `name_taken`, with the first `<name>-<n>` no listed stream holds.
   */
  async runStreamProject(folder: string, streamFunction: string | null, streamName: string | null): Promise<Result<StreamProjectRunOutcome, string>> {
    if (!this.isAFolderHandedToTheWindow(folder)) return failedWith(folderNotHandedToTheWindowRefusal(folder));
    const streamRuns = this.sources.streamRunsOnTheRuntime;
    const run = await streamRuns.runStream({ projectDirectory: path.resolve(folder), streamFunction, streamName });
    if (run.ok) return succeeded({ kind: "running", answer: run.value });
    const refusal = run.failure.failureDescription;
    if (!run.failure.isTheRuntimesRefusal || streamName === null) return failedWith(refusal);
    const listedStreams = await streamRuns.listStreams();
    if (!listedStreams.ok) return failedWith(refusal);
    const listedNames = listedStreams.value.map((listedStream) => listedStream.name);
    if (!listedNames.includes(streamName)) return failedWith(refusal);
    return succeeded({ kind: "name_taken", refusal, free_name: firstFreeStreamName(streamName, listedNames) });
  }

  private async firstFreeNewStreamProjectFolder(): Promise<string> {
    const newStreamProjectsFolder = path.join(this.sources.homeDirectory, NEW_STREAM_PROJECTS_FOLDER_IN_HOME);
    let candidate = path.join(newStreamProjectsFolder, FIRST_PROPOSED_NEW_STREAM_PROJECT_NAME);
    let suffix = FIRST_FREE_NAME_SUFFIX;
    while (await somethingIsAt(candidate)) {
      candidate = path.join(newStreamProjectsFolder, `${FIRST_PROPOSED_NEW_STREAM_PROJECT_NAME}-${suffix}`);
      suffix += 1;
    }
    return candidate;
  }

  private async handToTheWindow(folder: string): Promise<StreamProjectFolderReport> {
    const resolvedFolder = path.resolve(folder);
    this.foldersHandedToTheWindow.add(resolvedFolder);
    return inspectStreamProjectFolder(resolvedFolder);
  }
}
