// The workspace open in the studio: a folder that is itself the workspace project, chosen in the
// app's own dialog and remembered between launches. It is read from each `pyproject.toml` it and
// its folder imports hold, and read again whenever one of those folders changes, so the window
// always shows what is on disk.

import path from "node:path";
import type {
  ChosenWorkspaceFolder,
  ImportedProject,
  OpenWorkspaceReading,
  ProjectCreationQueued,
  WorkspaceFolderChosenFor,
} from "../shared/tatolab_backend_contract.js";
import { realPathOrAsGiven } from "./file_system_entries_on_this_machine.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { readProjectFromItsFolder, requirementsPackageName } from "./project_on_disk.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** How long the folders must stay quiet after a change before they are read again, so one save that touches a file several times reads once. */
export const OPEN_WORKSPACE_REREAD_QUIET_MS = 150;

/** Asks the person for a folder in the desktop's dialog, opened at `defaultFolder`: an existing workspace, or a new one's folder, which may not exist yet. `null` when they cancel. */
export type WorkspaceFolderDialog = (chosenFor: WorkspaceFolderChosenFor, defaultFolder: string) => Promise<Result<string | null, string>>;

/** Calls `onChange` whenever an entry directly in `folder` changes; the answer stops watching, and is `null` for a folder that cannot be watched. */
export type FolderEntriesWatch = (folder: string, onChange: () => void) => (() => void) | null;

/** Where the open workspace's folder is remembered between launches. */
export interface RememberedOpenWorkspaceFolder {
  /** The folder remembered, or `null` when none is. */
  readRememberedFolder(): Promise<string | null>;
  /** Remember `folder`; refused in words when it could not be written, though it stays open until the app quits. */
  rememberFolder(folder: string): Promise<Result<void, string>>;
}

/** The runtime's `create_project`, which makes a new workspace's project. */
export interface WorkspaceProjectCreation {
  createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>>;
}

/** What the open workspace reaches: the person's home, the dialog, the remembered folder, the runtime, a folder watch, a timer, and the window. */
export interface OpenWorkspaceSources {
  homeDirectory: string;
  workspaceFolderDialog: WorkspaceFolderDialog;
  rememberedOpenWorkspaceFolder: RememberedOpenWorkspaceFolder;
  workspaceProjectCreation: WorkspaceProjectCreation;
  watchFolderEntries: FolderEntriesWatch;
  /** Runs `work` once after `delayMs`; the answer cancels it. */
  runAfter: (delayMs: number, work: () => void) => () => void;
  sendTheWindowTheOpenWorkspace: (reading: OpenWorkspaceReading) => void;
}

/** Each requirement of the workspace project as an import, its folder read when a uv `path` source names one. */
async function importsOfTheWorkspaceProject(
  requirements: readonly string[],
  pathSourceFoldersByRequirementName: ReadonlyMap<string, string>,
): Promise<ImportedProject[]> {
  return Promise.all(
    requirements.map(async (requirement): Promise<ImportedProject> => {
      const name = requirementsPackageName(requirement) ?? requirement;
      const sourceFolder = pathSourceFoldersByRequirementName.get(name);
      if (sourceFolder === undefined) return { name, requirement, source: { kind: "package_index" } };
      const importedProject = await readProjectFromItsFolder(sourceFolder);
      return {
        name,
        requirement,
        source: importedProject.ok
          ? { kind: "folder", project: importedProject.value.project }
          : { kind: "folder_unreadable", folder: sourceFolder, refusal: importedProject.failure },
      };
    }),
  );
}

/** The workspace in `workspaceFolder` as its `pyproject.toml` and its folder imports describe it. */
export async function readTheWorkspaceIn(workspaceFolder: string): Promise<OpenWorkspaceReading> {
  const workspaceProject = await readProjectFromItsFolder(workspaceFolder);
  if (!workspaceProject.ok) return { kind: "unreadable", folder: workspaceFolder, refusal: workspaceProject.failure };
  const { project, pathSourceFoldersByRequirementName } = workspaceProject.value;
  return {
    kind: "read",
    workspace: { workspace_project: project, imports: await importsOfTheWorkspaceProject(project.requirements, pathSourceFoldersByRequirementName) },
  };
}

/** The folders whose entries decide what the workspace reads: its own and each import's folder. */
function foldersTheReadingDependsOn(workspaceFolder: string, reading: OpenWorkspaceReading): string[] {
  // A folder not made yet, as a new workspace's before the runtime creates its project, appears in its parent.
  if (reading.kind !== "read") return [workspaceFolder, path.dirname(workspaceFolder)];
  const importFolders = reading.workspace.imports.flatMap((importedProject) => {
    switch (importedProject.source.kind) {
      case "folder":
        return [importedProject.source.project.folder];
      case "folder_unreadable":
        return [importedProject.source.folder];
      case "package_index":
        return [];
    }
  });
  return [...new Set([reading.workspace.workspace_project.folder, ...importFolders])];
}

/** The one workspace the studio has open, which the window reads and is sent each change of. */
export class OpenWorkspaceFolder {
  private openFolder: string | null = null;
  private lastReading: OpenWorkspaceReading = { kind: "none_open" };
  private stopWatchingTheFolders: Array<() => void> = [];
  private cancelThePendingReread: (() => void) | null = null;

  constructor(private readonly sources: OpenWorkspaceSources) {}

  /** Open the workspace remembered from the last launch, when one is. */
  async openTheRememberedWorkspace(): Promise<void> {
    const rememberedFolder = await this.sources.rememberedOpenWorkspaceFolder.readRememberedFolder();
    if (rememberedFolder !== null) await this.openTheFolder(rememberedFolder);
  }

  /** The open workspace as last read. */
  readOpenWorkspace(): OpenWorkspaceReading {
    return this.lastReading;
  }

  /**
   * Ask the person for a workspace folder and open it, remembering it for the next launch; for a new workspace,
   * queue the runtime's `create_project` in it first. `null` when they cancel; refused in the dialog's or the
   * runtime's own words, the open workspace unchanged.
   */
  async chooseWorkspaceFolder(chosenFor: WorkspaceFolderChosenFor): Promise<Result<ChosenWorkspaceFolder | null, string>> {
    const chosenFolder = await this.sources.workspaceFolderDialog(chosenFor, this.openFolder === null ? this.sources.homeDirectory : path.dirname(this.openFolder));
    if (!chosenFolder.ok || chosenFolder.value === null) return chosenFolder.ok ? succeeded(null) : chosenFolder;
    let projectCreation: ProjectCreationQueued | null = null;
    if (chosenFor === "new_workspace") {
      const queued = await this.sources.workspaceProjectCreation.createProject(chosenFolder.value);
      if (!queued.ok) return failedWith(queued.failure.failureDescription);
      projectCreation = queued.value;
    }
    const folder = await realPathOrAsGiven(path.resolve(projectCreation?.project_directory ?? chosenFolder.value));
    await this.openTheFolder(folder);
    const remembered = await this.sources.rememberedOpenWorkspaceFolder.rememberFolder(folder);
    if (!remembered.ok) return failedWith(`${folder} is open, but Spudnik Studio could not remember it for next time: ${remembered.failure}`);
    return succeeded({ folder, project_creation: projectCreation });
  }

  /** Stop watching the open workspace's folders, as the app quits. */
  stopWatching(): void {
    this.cancelThePendingReread?.();
    this.cancelThePendingReread = null;
    for (const stopWatching of this.stopWatchingTheFolders) stopWatching();
    this.stopWatchingTheFolders = [];
  }

  private async openTheFolder(folder: string): Promise<void> {
    this.openFolder = folder;
    await this.readAgainAndSend();
  }

  private async readAgainAndSend(): Promise<void> {
    const folderRead = this.openFolder;
    if (folderRead === null) return;
    const reading = await readTheWorkspaceIn(folderRead);
    if (this.openFolder !== folderRead) return;
    this.lastReading = reading;
    this.watchTheFoldersOf(folderRead, reading);
    this.sources.sendTheWindowTheOpenWorkspace(reading);
  }

  private watchTheFoldersOf(workspaceFolder: string, reading: OpenWorkspaceReading): void {
    this.stopWatching();
    this.stopWatchingTheFolders = foldersTheReadingDependsOn(workspaceFolder, reading).flatMap((folder) => {
      const stopWatching = this.sources.watchFolderEntries(folder, () => this.readAgainOnceQuiet());
      return stopWatching === null ? [] : [stopWatching];
    });
  }

  private readAgainOnceQuiet(): void {
    this.cancelThePendingReread?.();
    this.cancelThePendingReread = this.sources.runAfter(OPEN_WORKSPACE_REREAD_QUIET_MS, () => {
      this.cancelThePendingReread = null;
      void this.readAgainAndSend();
    });
  }
}
