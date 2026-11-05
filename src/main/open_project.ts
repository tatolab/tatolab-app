// The project open in the studio: a folder that is itself a project, chosen in the
// app's own dialog or from Home's recent projects, and remembered among them. It is read from each `pyproject.toml` it and
// its folder imports hold, and read again whenever one of those folders changes, so the window
// always shows what is on disk.

import path from "node:path";
import type {
  ChosenProjectFolder,
  ImportedProject,
  OpenProjectReading,
  ProjectCreationQueued,
  RecentProject,
  ProjectFolderChosenFor,
} from "../shared/tatolab_backend_contract.js";
import { realPathOrAsGiven } from "./file_system_entries_on_this_machine.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { readProjectFromItsFolder, requirementsPackageName } from "./project_on_disk.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** How long the folders must stay quiet after a change before they are read again, so one save that touches a file several times reads once. */
export const OPEN_PROJECT_REREAD_QUIET_MS = 150;

/** Asks the person for a folder in the desktop's dialog, opened at `defaultFolder`: an existing project, or a new one's folder, which may not exist yet. `null` when they cancel. */
export type ProjectFolderDialog = (chosenFor: ProjectFolderChosenFor, defaultFolder: string) => Promise<Result<string | null, string>>;

/** Calls `onChange` whenever an entry directly in `folder` changes; the answer stops watching, and is `null` for a folder that cannot be watched. */
export type FolderEntriesWatch = (folder: string, onChange: () => void) => (() => void) | null;

/** A project folder opened before, and when, in milliseconds since the epoch on the wall clock, for display. */
export interface RecentProjectFolderOpened {
  folder: string;
  opened_at_wall_clock_ms: number;
}

/** Where the projects opened are remembered between launches, recent first. */
export interface RecentProjectFolders {
  /** The folders remembered, recent first; none when none are. */
  readRecentFolders(): Promise<RecentProjectFolderOpened[]>;
  /** Put `folder` first, opened at `openedAtWallClockMs`; refused in words when it could not be written, though it stays open until the app quits. */
  rememberOpened(folder: string, openedAtWallClockMs: number): Promise<Result<void, string>>;
}

/** The runtime's `create_project`, which makes a new project. */
export interface NewProjectCreation {
  createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>>;
}

/** What the open project reaches: the person's home, the dialog, the recent projects, the wall clock, the runtime, a folder watch, a timer, and the window. */
export interface OpenProjectSources {
  homeDirectory: string;
  projectFolderDialog: ProjectFolderDialog;
  recentProjectFolders: RecentProjectFolders;
  /** The wall clock, in milliseconds since the epoch, stamped on a project as it opens for Home to show. */
  readWallClockNowMs: () => number;
  newProjectCreation: NewProjectCreation;
  watchFolderEntries: FolderEntriesWatch;
  /** Runs `work` once after `delayMs`; the answer cancels it. */
  runAfter: (delayMs: number, work: () => void) => () => void;
  sendTheWindowTheOpenProject: (reading: OpenProjectReading) => void;
}

/** Each requirement of the open project as an import, its folder read when a uv `path` source names one. */
async function importsOfTheOpenProject(
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

/** The project in `projectFolder` as its `pyproject.toml` and its folder imports describe it. */
export async function readTheProjectIn(projectFolder: string): Promise<OpenProjectReading> {
  const openProject = await readProjectFromItsFolder(projectFolder);
  if (!openProject.ok) return { kind: "unreadable", folder: projectFolder, refusal: openProject.failure };
  const { project, pathSourceFoldersByRequirementName } = openProject.value;
  return {
    kind: "read",
    open_project: { project: project, imports: await importsOfTheOpenProject(project.requirements, pathSourceFoldersByRequirementName) },
  };
}

/** The folders whose entries decide what the project reads: its own and each import's folder. */
function foldersTheReadingDependsOn(projectFolder: string, reading: OpenProjectReading): string[] {
  // A folder not made yet, as a new project's before the runtime creates its project, appears in its parent.
  if (reading.kind !== "read") return [projectFolder, path.dirname(projectFolder)];
  const importFolders = reading.open_project.imports.flatMap((importedProject) => {
    switch (importedProject.source.kind) {
      case "folder":
        return [importedProject.source.project.folder];
      case "folder_unreadable":
        return [importedProject.source.folder];
      case "package_index":
        return [];
    }
  });
  return [...new Set([reading.open_project.project.folder, ...importFolders])];
}

/** The one project the studio has open, which the window reads and is sent each change of. */
export class OpenProjectFolder {
  private openFolder: string | null = null;
  private lastReading: OpenProjectReading = { kind: "none_open" };
  private stopWatchingTheFolders: Array<() => void> = [];
  private cancelThePendingReread: (() => void) | null = null;

  constructor(private readonly sources: OpenProjectSources) {}

  /** The open project as last read. */
  readOpenProject(): OpenProjectReading {
    return this.lastReading;
  }

  /**
   * Ask the person for a project folder and open it, remembering it among the recent projects; for a new
   * project, queue the runtime's `create_project` in it first. `null` when they cancel; refused in the dialog's or
   * the runtime's own words, the open project unchanged.
   */
  async chooseProjectFolder(chosenFor: ProjectFolderChosenFor): Promise<Result<ChosenProjectFolder | null, string>> {
    const chosenFolder = await this.sources.projectFolderDialog(chosenFor, this.openFolder === null ? this.sources.homeDirectory : path.dirname(this.openFolder));
    if (!chosenFolder.ok || chosenFolder.value === null) return chosenFolder.ok ? succeeded(null) : chosenFolder;
    let projectCreation: ProjectCreationQueued | null = null;
    if (chosenFor === "new_project") {
      const queued = await this.sources.newProjectCreation.createProject(chosenFolder.value);
      if (!queued.ok) return failedWith(queued.failure.failureDescription);
      projectCreation = queued.value;
    }
    const folder = await realPathOrAsGiven(path.resolve(projectCreation?.project_directory ?? chosenFolder.value));
    const opened = await this.openAndRememberTheFolder(folder);
    return opened.ok ? succeeded({ folder, project_creation: projectCreation }) : opened;
  }

  /** Open `folder`, one of the recent projects, and put it first among them; refused for any other folder, and in words when it could not be remembered, though it opens. */
  async openRecentProject(folder: string): Promise<Result<void, string>> {
    const recentFolders = await this.sources.recentProjectFolders.readRecentFolders();
    if (!recentFolders.some((recentFolder) => recentFolder.folder === folder)) return failedWith(`${folder} is not one of the recent projects.`);
    return this.openAndRememberTheFolder(folder);
  }

  /** The recent projects, recent first, each with its project's name as its `pyproject.toml` reads now. */
  async readRecentProjects(): Promise<RecentProject[]> {
    const recentFolders = await this.sources.recentProjectFolders.readRecentFolders();
    return Promise.all(
      recentFolders.map(async ({ folder, opened_at_wall_clock_ms }): Promise<RecentProject> => {
        const project = await readProjectFromItsFolder(folder);
        return { folder, project_name: project.ok ? project.value.project.name : null, last_opened_at_wall_clock_ms: opened_at_wall_clock_ms };
      }),
    );
  }

  /** Stop watching the open project's folders, as the app quits. */
  stopWatching(): void {
    this.cancelThePendingReread?.();
    this.cancelThePendingReread = null;
    for (const stopWatching of this.stopWatchingTheFolders) stopWatching();
    this.stopWatchingTheFolders = [];
  }

  private async openAndRememberTheFolder(folder: string): Promise<Result<void, string>> {
    this.openFolder = folder;
    await this.readAgainAndSend();
    const remembered = await this.sources.recentProjectFolders.rememberOpened(folder, this.sources.readWallClockNowMs());
    return remembered.ok ? succeeded(undefined) : failedWith(`${folder} is open, but Tato Studio could not remember it for next time: ${remembered.failure}`);
  }

  private async readAgainAndSend(): Promise<void> {
    const folderRead = this.openFolder;
    if (folderRead === null) return;
    const reading = await readTheProjectIn(folderRead);
    if (this.openFolder !== folderRead) return;
    this.lastReading = reading;
    this.watchTheFoldersOf(folderRead, reading);
    this.sources.sendTheWindowTheOpenProject(reading);
  }

  private watchTheFoldersOf(projectFolder: string, reading: OpenProjectReading): void {
    this.stopWatching();
    this.stopWatchingTheFolders = foldersTheReadingDependsOn(projectFolder, reading).flatMap((folder) => {
      const stopWatching = this.sources.watchFolderEntries(folder, () => this.readAgainOnceQuiet());
      return stopWatching === null ? [] : [stopWatching];
    });
  }

  private readAgainOnceQuiet(): void {
    this.cancelThePendingReread?.();
    this.cancelThePendingReread = this.sources.runAfter(OPEN_PROJECT_REREAD_QUIET_MS, () => {
      this.cancelThePendingReread = null;
      void this.readAgainAndSend();
    });
  }
}
