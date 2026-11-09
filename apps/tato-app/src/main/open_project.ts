// Opening projects, each in its own studio window: a folder that is itself a project, chosen in the
// app's own dialog, from the Projects window's recent projects, or made new, and remembered among
// the recent projects. A studio window's project is named by the runtime's `list_assets`, its
// imports listed by its `list_dependencies` and each copy under `imports/` named by `list_assets`,
// and read again whenever one of those folders changes or the runtime starts answering.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { newProjectFolderNameRefusal, untitledProjectNameNumbered } from "../shared/new_project_folder_name.js";
import type {
  ChosenProjectFolder,
  ImportedProject,
  NewProjectDefaults,
  OpenProjectReading,
  ProjectCreationQueued,
  RecentProject,
  ProjectFolderChosenFor,
  ProjectTheRuntimeNames,
} from "../shared/tatolab_backend_contract.js";
import { realPathOrAsGiven, somethingIsAt } from "./file_system_entries_on_this_machine.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";
import { importFolderInsideTheWorkspace, PROJECT_IMPORTS_FOLDER } from "./workspace_dependencies.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** How long the folders must stay quiet after a change before they are read again, so one save that touches a file several times reads once. */
export const OPEN_PROJECT_REREAD_QUIET_MS = 150;

/** What the app's project folder dialog is opened for: an existing project, or the folder a new project goes in. */
export type ProjectFolderDialogPurpose = ProjectFolderChosenFor | "new_project_location";

/** Asks the person for a folder in the desktop's dialog, opened at `defaultFolder`. `null` when they cancel. */
export type ProjectFolderDialog = (purpose: ProjectFolderDialogPurpose, defaultFolder: string) => Promise<Result<string | null, string>>;

/** The folder new projects go in, inside the platform's Documents folder. */
export const NEW_PROJECTS_FOLDER_INSIDE_DOCUMENTS = "Tato Studio";

/** How many numbered `Untitled project` names are tried before the sheet suggests the plain one and lets the creation refuse it. */
const UNTITLED_PROJECT_NAMES_TRIED = 1_000;

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

/** What opening a project reaches: the person's home and Documents folders, the dialog, the recent projects, the wall clock, the runtime, and the studio window each project opens in. */
export interface ProjectOpeningSources {
  homeDirectory: string;
  /** The platform's Documents folder, where new projects go under `Tato Studio/`. */
  documentsDirectory: string;
  projectFolderDialog: ProjectFolderDialog;
  recentProjectFolders: RecentProjectFolders;
  /** The wall clock, in milliseconds since the epoch, stamped on a project as it opens for the Projects window to show. */
  readWallClockNowMs: () => number;
  newProjectCreation: NewProjectCreation;
  projectReadingsOfTheRuntime: ProjectReadingsOfTheRuntime;
  /** Open the project in `folder` in its own studio window, or bring that window forward when it is open; answers once the window shows the project. */
  openTheProjectInItsStudioWindow: (folder: string) => Promise<void>;
}

/** What a studio window's project reaches: a folder watch, a timer, its window, and the runtime that lists its imports. */
export interface OpenProjectOfAStudioWindowSources {
  watchFolderEntries: FolderEntriesWatch;
  /** Runs `work` once after `delayMs`; the answer cancels it. */
  runAfter: (delayMs: number, work: () => void) => () => void;
  sendTheWindowTheOpenProject: (reading: OpenProjectReading) => void;
  projectReadingsOfTheRuntime: ProjectReadingsOfTheRuntime;
}

/** What the runtime answers about the project in a folder, each refused in the runtime's words or that no runtime answered. */
export interface ProjectReadingsOfTheRuntime {
  /** Its UUID and name, from `list_assets`. */
  nameTheProject: (projectFolder: string) => Promise<Result<ProjectTheRuntimeNames, string>>;
  /** Each project it imports, from `list_dependencies`. */
  listTheDependencies: (projectFolder: string) => Promise<Result<ListedProjectDependency[], string>>;
}

/** Each import the runtime lists, its copy under `imports/` named by the runtime. */
async function importsOfTheOpenProject(
  projectFolder: string,
  listedDependencies: readonly ListedProjectDependency[],
  projectReadingsOfTheRuntime: ProjectReadingsOfTheRuntime,
): Promise<ImportedProject[]> {
  return Promise.all(
    listedDependencies.map(async ({ dependency }): Promise<ImportedProject> => {
      const listedAs = { project: dependency.project, name: dependency.folder, folder: dependency.folder };
      const importFolder = importFolderInsideTheWorkspace(projectFolder, dependency.folder);
      if (importFolder === null) return { ...listedAs, source: { kind: "folder_unreadable", folder: projectFolder, refusal: `imports/${dependency.folder} is no folder name.` } };
      const importedProject = await projectReadingsOfTheRuntime.nameTheProject(importFolder);
      return importedProject.ok
        ? { ...listedAs, name: importedProject.value.name, source: { kind: "folder", project: importedProject.value } }
        : { ...listedAs, source: { kind: "folder_unreadable", folder: importFolder, refusal: importedProject.failure } };
    }),
  );
}

/** The project in `projectFolder` as the runtime names it, with each import the runtime lists. */
export async function readTheProjectIn(projectFolder: string, projectReadingsOfTheRuntime: ProjectReadingsOfTheRuntime): Promise<OpenProjectReading> {
  const named = await projectReadingsOfTheRuntime.nameTheProject(await realPathOrAsGiven(path.resolve(projectFolder)));
  if (!named.ok) return { kind: "unreadable", folder: projectFolder, refusal: named.failure };
  const project = named.value;
  const listed = await projectReadingsOfTheRuntime.listTheDependencies(project.folder);
  return {
    kind: "read",
    open_project: listed.ok
      ? { project, imports: await importsOfTheOpenProject(project.folder, listed.value, projectReadingsOfTheRuntime), imports_not_listed_because: null }
      : { project, imports: [], imports_not_listed_because: listed.failure },
  };
}

/** The folders whose entries decide what the project reads: its own, its `imports/`, and each import's folder. */
function foldersTheReadingDependsOn(projectFolder: string, reading: OpenProjectReading): string[] {
  // A folder not made yet, as a new project's before the runtime creates its project, appears in its parent.
  if (reading.kind !== "read") return [projectFolder, path.dirname(projectFolder)];
  const importFolders = reading.open_project.imports.map((importedProject) => (importedProject.source.kind === "folder" ? importedProject.source.project.folder : importedProject.source.folder));
  return [...new Set([reading.open_project.project.folder, path.join(reading.open_project.project.folder, PROJECT_IMPORTS_FOLDER), ...importFolders])];
}

/** Opening a project, from any window: a folder chosen in the dialog, a recent project, or a new one the runtime creates, each in its own studio window and remembered among the recent projects. */
export class ProjectOpening {
  constructor(private readonly sources: ProjectOpeningSources) {}

  /** Ask the person for a project folder, the dialog opened beside `openProjectFolder` (the asking window's) or at home, and open it. `null` when they cancel; refused in the dialog's own words. */
  async chooseProjectFolder(chosenFor: ProjectFolderChosenFor, openProjectFolder: string | null): Promise<Result<ChosenProjectFolder | null, string>> {
    const chosenFolder = await this.sources.projectFolderDialog(chosenFor, openProjectFolder === null ? this.sources.homeDirectory : path.dirname(openProjectFolder));
    if (!chosenFolder.ok || chosenFolder.value === null) return chosenFolder.ok ? succeeded(null) : chosenFolder;
    const folder = await realPathOrAsGiven(path.resolve(chosenFolder.value));
    const opened = await this.openAndRememberTheFolder(folder);
    return opened.ok ? succeeded({ folder, project_creation: null }) : opened;
  }

  /** `<Documents>/Tato Studio`, and the first of `Untitled project`, `Untitled project 2`, … that nothing there holds. */
  async readNewProjectDefaults(): Promise<NewProjectDefaults> {
    const location = this.defaultNewProjectLocation();
    for (let number = 1; number <= UNTITLED_PROJECT_NAMES_TRIED; number += 1) {
      const name = untitledProjectNameNumbered(number);
      if (!(await somethingIsAt(path.join(location, name)))) return { location, name };
    }
    return { location, name: untitledProjectNameNumbered(1) };
  }

  /** Ask the person for the folder a new project goes in, the dialog opened at `startingAt`, or at the default location when that is not absolute. `null` when they cancel. */
  chooseNewProjectLocation(startingAt: string): Promise<Result<string | null, string>> {
    return this.sources.projectFolderDialog("new_project_location", path.isAbsolute(startingAt) ? startingAt : this.defaultNewProjectLocation());
  }

  /**
   * Create the project `name` in `location` with the runtime's `create_project`, making `location` when it is missing, and open it. Refused with nothing
   * created for a name that is no folder name or that something in `location` already holds; the runtime's refusal in its own words.
   */
  async createNewProject(name: string, location: string): Promise<Result<ChosenProjectFolder, string>> {
    const nameRefusal = newProjectFolderNameRefusal(name);
    if (nameRefusal !== null) return failedWith(nameRefusal);
    if (!path.isAbsolute(location)) return failedWith(`${location} is not a full path to a folder.`);
    const projectDirectory = path.join(location, name.trim());
    if (await somethingIsAt(projectDirectory)) return failedWith(`${projectDirectory} already exists. Choose another name or location.`);
    try {
      await mkdir(location, { recursive: true });
    } catch (mkdirFailure) {
      return failedWith(`Tato Studio couldn't make the folder ${location}: ${describeCaughtFailure(mkdirFailure)}`);
    }
    const queued = await this.sources.newProjectCreation.createProject(projectDirectory);
    if (!queued.ok) return failedWith(queued.failure.failureDescription);
    const folder = await realPathOrAsGiven(path.resolve(queued.value.project_directory));
    const opened = await this.openAndRememberTheFolder(folder);
    return opened.ok ? succeeded({ folder, project_creation: queued.value }) : opened;
  }

  /** Open `folder`, one of the recent projects, and put it first among them; refused for any other folder, and in words when it could not be remembered, though it opens. */
  async openRecentProject(folder: string): Promise<Result<void, string>> {
    const recentFolders = await this.sources.recentProjectFolders.readRecentFolders();
    if (!recentFolders.some((recentFolder) => recentFolder.folder === folder)) return failedWith(`${folder} is not one of the recent projects.`);
    return this.openAndRememberTheFolder(folder);
  }

  /** The recent projects, recent first, each with its project's name as the runtime reads it now, `null` where it could not. */
  async readRecentProjects(): Promise<RecentProject[]> {
    const recentFolders = await this.sources.recentProjectFolders.readRecentFolders();
    return Promise.all(
      recentFolders.map(async ({ folder, opened_at_wall_clock_ms }): Promise<RecentProject> => {
        const project = await this.sources.projectReadingsOfTheRuntime.nameTheProject(folder);
        return { folder, project_name: project.ok ? project.value.name : null, last_opened_at_wall_clock_ms: opened_at_wall_clock_ms };
      }),
    );
  }

  private defaultNewProjectLocation(): string {
    return path.join(this.sources.documentsDirectory, NEW_PROJECTS_FOLDER_INSIDE_DOCUMENTS);
  }

  private async openAndRememberTheFolder(folder: string): Promise<Result<void, string>> {
    await this.sources.openTheProjectInItsStudioWindow(folder);
    const remembered = await this.sources.recentProjectFolders.rememberOpened(folder, this.sources.readWallClockNowMs());
    return remembered.ok ? succeeded(undefined) : failedWith(`${folder} is open, but Tato Studio could not remember it for next time: ${remembered.failure}`);
  }
}

/** The project one studio window shows, read from its folder and read again whenever one of its folders changes. */
export class OpenProjectOfAStudioWindow {
  private lastReading: OpenProjectReading;
  private stopWatchingTheFolders: Array<() => void> = [];
  private cancelThePendingReread: (() => void) | null = null;
  private hasStopped = false;

  constructor(
    readonly projectFolder: string,
    private readonly sources: OpenProjectOfAStudioWindowSources,
  ) {
    this.lastReading = { kind: "unreadable", folder: projectFolder, refusal: "The project has not been read yet." };
  }

  /** The project as last read. */
  readOpenProject(): OpenProjectReading {
    return this.lastReading;
  }

  /** Read the project, send it to the window and watch its folders; answers once it is read. */
  readAndWatch(): Promise<void> {
    return this.readAgainAndSend();
  }

  /** Read the project again and send it to the window, as the runtime starts answering. */
  readAgain(): Promise<void> {
    if (this.hasStopped) return Promise.resolve();
    this.cancelThePendingReread?.();
    this.cancelThePendingReread = null;
    return this.readAgainAndSend();
  }

  /** Stop watching the project's folders, as its window closes or the app quits. */
  stopWatching(): void {
    this.hasStopped = true;
    this.stopWatchingWhatIsWatched();
  }

  private stopWatchingWhatIsWatched(): void {
    this.cancelThePendingReread?.();
    this.cancelThePendingReread = null;
    for (const stopWatching of this.stopWatchingTheFolders) stopWatching();
    this.stopWatchingTheFolders = [];
  }

  private async readAgainAndSend(): Promise<void> {
    const reading = await readTheProjectIn(this.projectFolder, this.sources.projectReadingsOfTheRuntime);
    if (this.hasStopped) return;
    this.lastReading = reading;
    this.watchTheFoldersOf(reading);
    this.sources.sendTheWindowTheOpenProject(reading);
  }

  private watchTheFoldersOf(reading: OpenProjectReading): void {
    this.stopWatchingWhatIsWatched();
    this.stopWatchingTheFolders = foldersTheReadingDependsOn(this.projectFolder, reading).flatMap((folder) => {
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
