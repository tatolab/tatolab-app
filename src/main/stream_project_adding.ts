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
} from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure, StreamRunRequest } from "./local_api_client.js";
import { isAnExistingFolderOnThisMachine, realPathOrAsGiven, somethingIsAt } from "./file_system_entries_on_this_machine.js";
import type { TatolabCommandLineTool } from "./platform/tatolab_command_line_tool.js";
import type { TerminalOpenedInAFolder } from "./platform/terminal_opened_in_a_folder.js";
import { describeHowTheProgramEnded, programSucceeded, type ProgramRunner } from "./platform/run_program_to_completion.js";
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

/** The runtime's two tools a run needs: `run_stream`, and `list_streams` to tell a taken name. */
export interface StreamRunsOnTheRuntime {
  runStream(streamRunRequest: StreamRunRequest): Promise<Result<StreamRunAnswer, LocalApiRequestFailure>>;
  listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>>;
}

/** What adding a stream reaches: the person's home, the dialog, the desktop's terminal, the `tatolab` CLI and how programs run, and the runtime. */
export interface StreamProjectAddingSources {
  homeDirectory: string;
  streamProjectFolderDialog: StreamProjectFolderDialog;
  terminalOpenedInAFolder: TerminalOpenedInAFolder;
  tatolabCommandLineTool: TatolabCommandLineTool;
  runProgramToCompletion: ProgramRunner;
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

  /** What `folder` holds now; refused for a folder the app never handed the window. */
  async checkStreamProjectFolder(folder: string): Promise<Result<StreamProjectFolderReport, string>> {
    const projectFolder = this.folderHandedToTheWindow(folder);
    return projectFolder.ok ? succeeded(await inspectStreamProjectFolder(projectFolder.value)) : projectFolder;
  }

  /** A terminal whose shell starts in `folder`; refused naming why, or for a folder the app never handed the window. */
  async openTerminalInStreamProjectFolder(folder: string): Promise<Result<void, string>> {
    const projectFolder = this.folderHandedToTheWindow(folder);
    if (!projectFolder.ok) return projectFolder;
    if (!(await isAnExistingFolderOnThisMachine(projectFolder.value))) return failedWith(`${projectFolder.value} is not a folder on this machine.`);
    return this.sources.terminalOpenedInAFolder.openTerminalIn(projectFolder.value);
  }

  /** `tatolab new <folder>`, which writes the sample project, then what the folder holds; refused in the CLI's own words, or for a folder the app never handed the window. */
  async createStreamProject(folder: string): Promise<Result<StreamProjectFolderReport, string>> {
    const projectFolder = this.folderHandedToTheWindow(folder);
    if (!projectFolder.ok) return projectFolder;
    const tatolabCommandLineTool = this.sources.tatolabCommandLineTool;
    if (tatolabCommandLineTool.kind === "not_offered") return failedWith(tatolabCommandLineTool.reason);
    const scaffolding = await this.sources.runProgramToCompletion(tatolabCommandLineTool.path, ["new", projectFolder.value]);
    if (!scaffolding.ok) return scaffolding;
    if (!programSucceeded(scaffolding.value)) {
      const commandLineToolsOwnWords = scaffolding.value.standardError.trim();
      return failedWith(
        commandLineToolsOwnWords === ""
          ? `tatolab new ended with ${describeHowTheProgramEnded(scaffolding.value)}`
          : commandLineToolsOwnWords,
      );
    }
    return succeeded(await inspectStreamProjectFolder(projectFolder.value));
  }

  /**
   * Run `folder` kept through `run_stream`. A refusal is answered in the runtime's own words; one of a `streamName` a
   * listed stream from another folder holds is `name_taken`, with the first `<name>-<n>` no listed stream holds. The
   * runtime compiles before it reads the name and replaces a stream of the same folder and function, so a refusal while
   * this folder's own stream holds the name is answered as it is: the listing names no function to tell the two apart.
   */
  async runStreamProject(folder: string, streamFunction: string | null, streamName: string | null): Promise<Result<StreamProjectRunOutcome, string>> {
    const projectFolder = this.folderHandedToTheWindow(folder);
    if (!projectFolder.ok) return projectFolder;
    const streamRuns = this.sources.streamRunsOnTheRuntime;
    const run = await streamRuns.runStream({ projectDirectory: projectFolder.value, streamFunction, streamName });
    if (run.ok) return succeeded({ kind: "running", answer: run.value });
    const refusal = run.failure.failureDescription;
    if (!run.failure.isTheRuntimesRefusal || streamName === null) return failedWith(refusal);
    const listedStreams = await streamRuns.listStreams();
    if (!listedStreams.ok) return failedWith(refusal);
    const holder = listedStreams.value.find((listedStream) => listedStream.name === streamName);
    if (holder === undefined) return failedWith(refusal);
    if ((await realPathOrAsGiven(holder.project_directory)) === (await realPathOrAsGiven(projectFolder.value))) return failedWith(refusal);
    const listedNames = listedStreams.value.map((listedStream) => listedStream.name);
    return succeeded({ kind: "name_taken", refusal, free_name: await firstFreeSuffixedName(streamName, (candidate) => listedNames.includes(candidate)) });
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
