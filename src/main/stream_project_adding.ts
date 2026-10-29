// Adding a stream from the window: choosing a project folder or a new project's directory,
// checking what the folder holds, writing the sample project with `tatolab new`, and running a
// folder through the runtime's `run_stream`, its `.venv` made first when it has none that runs. A command naming a folder acts only on one this module handed the window, from the app's
// own folder dialog or its proposal, so a page can never have the app read, write or run a path of
// its choosing.

import path from "node:path";
import type { StreamProjectFolderChosenFor, StreamProjectFolderReport, StreamProjectRunOutcome, StreamRunAnswer } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure, StreamRunRequest } from "./local_api_client.js";
import { somethingIsAt } from "./file_system_entries_on_this_machine.js";
import type { TatolabCommandLineTool } from "./platform/tatolab_command_line_tool.js";
import { programsOwnWordsOrHowItEnded, programSucceeded, type ProgramRunner } from "./platform/run_program_to_completion.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { inspectStreamProjectFolder } from "./stream_project_folder_inspection.js";

/** Where a new project goes unless the person chooses elsewhere, under the home directory. */
const NEW_STREAM_PROJECTS_FOLDER_IN_HOME = "streams";

/** The new project's directory name the app proposes first; `hello-2`, `hello-3`, … follow while it is taken. */
const FIRST_PROPOSED_NEW_STREAM_PROJECT_NAME = "hello";

/** The suffix a taken name is tried with first: `<name>-2`. */
const FIRST_SUFFIX_OF_A_TAKEN_NAME = 2;

/** Asks the person for a folder in the desktop's dialog, opened at `defaultFolder`: an existing project to run, or a new project's directory, which may not exist yet. `null` when they cancel. */
export type StreamProjectFolderDialog = (chosenFor: StreamProjectFolderChosenFor, defaultFolder: string) => Promise<Result<string | null, string>>;

/** The runtime's tool a run needs: `run_stream`. */
export interface StreamRunsOnTheRuntime {
  runStream(streamRunRequest: StreamRunRequest): Promise<Result<StreamRunAnswer, LocalApiRequestFailure>>;
}

/** What adding a stream reaches: the person's home, the dialog, the `tatolab` CLI and how programs run, the app's making of a project's `.venv`, and the runtime. */
export interface StreamProjectAddingSources {
  homeDirectory: string;
  streamProjectFolderDialog: StreamProjectFolderDialog;
  tatolabCommandLineTool: TatolabCommandLineTool;
  runProgramToCompletion: ProgramRunner;
  /** Leaves a project's `.venv` that runs as it is, else makes one; refused in uv's own words. */
  makePythonEnvironmentUnlessOneWorks: (projectFolder: string) => Promise<Result<void, string>>;
  streamRunsOnTheRuntime: StreamRunsOnTheRuntime;
}

/** The first of `baseName`, `baseName-2`, `baseName-3`, … that `isTaken` says is free. */
export async function firstFreeSuffixedName(baseName: string, isTaken: (candidate: string) => boolean | Promise<boolean>): Promise<string> {
  let candidate = baseName;
  for (let suffix = FIRST_SUFFIX_OF_A_TAKEN_NAME; await isTaken(candidate); suffix += 1) candidate = `${baseName}-${suffix}`;
  return candidate;
}

/** The refusal of a folder the window names that the app never handed it. */
function folderNotHandedToTheWindowRefusal(folder: string): string {
  return `Tatolab acts only on a folder chosen in its window. Choose ${folder} again.`;
}

/** The folders the window may name, and every command that names one. */
export class StreamProjectAdding {
  private readonly foldersHandedToTheWindow = new Set<string>();

  constructor(private readonly sources: StreamProjectAddingSources) {}

  /** Ask the person for a folder in the dialog and answer what it holds; `null` when they cancel. */
  async chooseStreamProjectFolder(chosenFor: StreamProjectFolderChosenFor): Promise<Result<StreamProjectFolderReport | null, string>> {
    const defaultFolder = await this.dialogsDefaultFolder(chosenFor);
    const chosenFolder = await this.sources.streamProjectFolderDialog(chosenFor, defaultFolder);
    if (!chosenFolder.ok) return chosenFolder;
    return succeeded(chosenFolder.value === null ? null : await this.handToTheWindow(chosenFolder.value));
  }

  /** The first of `~/streams/hello`, `~/streams/hello-2`, … that nothing is at yet, for a new project. */
  async proposeNewStreamProjectFolder(): Promise<StreamProjectFolderReport> {
    return this.handToTheWindow(await this.firstFreeNewStreamProjectFolder());
  }

  /** `tatolab new <folder>`, which writes the sample project, then what the folder holds; refused in the CLI's own words, or for a folder the app never handed the window. */
  async createStreamProject(folder: string): Promise<Result<StreamProjectFolderReport, string>> {
    const projectFolder = this.folderHandedToTheWindow(folder);
    if (!projectFolder.ok) return projectFolder;
    const tatolabCommandLineTool = this.sources.tatolabCommandLineTool;
    if (tatolabCommandLineTool.kind === "not_offered") return failedWith(tatolabCommandLineTool.reason);
    const scaffolding = await this.sources.runProgramToCompletion(tatolabCommandLineTool.path, ["new", projectFolder.value]);
    if (!scaffolding.ok) return scaffolding;
    if (!programSucceeded(scaffolding.value)) return failedWith(programsOwnWordsOrHowItEnded("tatolab new", scaffolding.value));
    return succeeded(await inspectStreamProjectFolder(projectFolder.value));
  }

  /**
   * Run `folder` through `run_stream` under `displayName`, `null` for the function's own or the one its recorded stream
   * keeps, making its `.venv` first when it has none that runs; uv failing to is `python_environment_not_made`, in uv's
   * own words. A refusal is answered in the runtime's own words.
   */
  async runStreamProject(folder: string, streamFunction: string | null, displayName: string | null): Promise<Result<StreamProjectRunOutcome, string>> {
    const projectFolder = this.folderHandedToTheWindow(folder);
    if (!projectFolder.ok) return projectFolder;
    const pythonEnvironment = await this.sources.makePythonEnvironmentUnlessOneWorks(projectFolder.value);
    if (!pythonEnvironment.ok) return succeeded({ kind: "python_environment_not_made", words: pythonEnvironment.failure });
    const run = await this.sources.streamRunsOnTheRuntime.runStream({ projectDirectory: projectFolder.value, streamFunction, displayName });
    return run.ok ? succeeded({ kind: "running", answer: run.value }) : failedWith(run.failure.failureDescription);
  }

  /** `folder` resolved, when the app handed it to the window; refused otherwise. */
  private folderHandedToTheWindow(folder: string): Result<string, string> {
    const resolvedFolder = path.resolve(folder);
    return this.foldersHandedToTheWindow.has(resolvedFolder) ? succeeded(resolvedFolder) : failedWith(folderNotHandedToTheWindowRefusal(folder));
  }

  private async dialogsDefaultFolder(chosenFor: StreamProjectFolderChosenFor): Promise<string> {
    switch (chosenFor) {
      case "project_to_run":
        return this.sources.homeDirectory;
      case "new_project_directory":
        return this.firstFreeNewStreamProjectFolder();
    }
  }

  private async firstFreeNewStreamProjectFolder(): Promise<string> {
    const newStreamProjectsFolder = path.join(this.sources.homeDirectory, NEW_STREAM_PROJECTS_FOLDER_IN_HOME);
    const freeName = await firstFreeSuffixedName(FIRST_PROPOSED_NEW_STREAM_PROJECT_NAME, (candidate) => somethingIsAt(path.join(newStreamProjectsFolder, candidate)));
    return path.join(newStreamProjectsFolder, freeName);
  }

  private async handToTheWindow(folder: string): Promise<StreamProjectFolderReport> {
    const resolvedFolder = path.resolve(folder);
    this.foldersHandedToTheWindow.add(resolvedFolder);
    return inspectStreamProjectFolder(resolvedFolder);
  }
}
