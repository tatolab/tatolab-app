// Adding a project from the window: choosing its folder in the app's own dialog, then queuing the
// runtime's creation or run of it. A command naming a folder acts only on one this module handed
// the window from that dialog, so a page can never have the runtime create or run a path of its
// choosing.

import path from "node:path";
import type { ProjectCreationQueued, ProjectRunQueued, StreamProjectFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import { isAnExistingFolderOnThisMachine, realPathOrAsGiven } from "./file_system_entries_on_this_machine.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The folder under the home directory the runtime draws a new project's folder in, where the dialog opens for one. */
const NEW_STREAM_PROJECTS_FOLDER_IN_HOME = "streams";

/** Asks the person for a folder in the desktop's dialog, opened at `defaultFolder`: an existing project to import, or a new project's folder, which may not exist yet. `null` when they cancel. */
export type StreamProjectFolderDialog = (chosenFor: StreamProjectFolderChosenFor, defaultFolder: string) => Promise<Result<string | null, string>>;

/** The runtime's tools a project is added with: `create_project` and `run_project`, each answering at once with the action it queued. */
export interface ProjectLoadsOnTheRuntime {
  createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>>;
  runProject(projectDirectory: string): Promise<Result<ProjectRunQueued, LocalApiRequestFailure>>;
}

/** What adding a project reaches: the person's home, the dialog, and the runtime. */
export interface StreamProjectAddingSources {
  homeDirectory: string;
  streamProjectFolderDialog: StreamProjectFolderDialog;
  projectLoadsOnTheRuntime: ProjectLoadsOnTheRuntime;
}

/** The refusal of a folder the window names that the app never handed it. */
function folderNotHandedToTheWindowRefusal(folder: string): string {
  return `Tato Studio acts only on a folder chosen in its window. Choose ${folder} again.`;
}

/** The folders the window may name, and every command that names one. */
export class StreamProjectAdding {
  private readonly foldersHandedToTheWindow = new Set<string>();

  constructor(private readonly sources: StreamProjectAddingSources) {}

  /** Ask the person for a folder in the dialog, answering it absolute with its links resolved, as the runtime lists a project's folder; `null` when they cancel. */
  async chooseStreamProjectFolder(chosenFor: StreamProjectFolderChosenFor): Promise<Result<string | null, string>> {
    const chosenFolder = await this.sources.streamProjectFolderDialog(chosenFor, await this.dialogsDefaultFolder(chosenFor));
    if (!chosenFolder.ok) return chosenFolder;
    return succeeded(chosenFolder.value === null ? null : await this.handToTheWindow(chosenFolder.value));
  }

  /** Queue `create_project` in `folder`, or with `null` in a folder the runtime draws under `~/streams`; refused in the runtime's own words, or for a folder the app never handed the window. */
  async createStreamProject(folder: string | null): Promise<Result<ProjectCreationQueued, string>> {
    const projectFolder = folder === null ? succeeded(null) : this.folderHandedToTheWindow(folder);
    if (!projectFolder.ok) return projectFolder;
    const queued = await this.sources.projectLoadsOnTheRuntime.createProject(projectFolder.value);
    return queued.ok ? queued : failedWith(queued.failure.failureDescription);
  }

  /** Queue `run_project` in `folder`, which loads every `@stream` in it; refused in the runtime's own words, or for a folder the app never handed the window. */
  async runStreamProject(folder: string): Promise<Result<ProjectRunQueued, string>> {
    const projectFolder = this.folderHandedToTheWindow(folder);
    if (!projectFolder.ok) return projectFolder;
    const queued = await this.sources.projectLoadsOnTheRuntime.runProject(projectFolder.value);
    return queued.ok ? queued : failedWith(queued.failure.failureDescription);
  }

  /** `folder` resolved, when the app handed it to the window; refused otherwise. */
  private folderHandedToTheWindow(folder: string): Result<string, string> {
    const resolvedFolder = path.resolve(folder);
    return this.foldersHandedToTheWindow.has(resolvedFolder) ? succeeded(resolvedFolder) : failedWith(folderNotHandedToTheWindowRefusal(folder));
  }

  private async dialogsDefaultFolder(chosenFor: StreamProjectFolderChosenFor): Promise<string> {
    const newStreamProjectsFolder = path.join(this.sources.homeDirectory, NEW_STREAM_PROJECTS_FOLDER_IN_HOME);
    switch (chosenFor) {
      case "project_to_run":
        return this.sources.homeDirectory;
      case "new_project_directory":
        return (await isAnExistingFolderOnThisMachine(newStreamProjectsFolder)) ? newStreamProjectsFolder : this.sources.homeDirectory;
    }
  }

  private async handToTheWindow(folder: string): Promise<string> {
    const resolvedFolder = await realPathOrAsGiven(path.resolve(folder));
    this.foldersHandedToTheWindow.add(resolvedFolder);
    return resolvedFolder;
  }
}
