// Opening projects, each in its own studio window: a folder that is itself a project, chosen in the
// app's own dialog, from the Projects window's recent projects, or made new, and remembered among
// the recent projects. A studio window's project is named by the runtime's `list_assets`, its
// imports listed by its `list_dependencies` and each copy under `imports/` named by `list_assets`,
// and read again whenever one of those folders changes or the runtime starts answering.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { newProjectFolderNameRefusal, projectNameNumbered, UNTITLED_PROJECT_NAME } from "../shared/new_project_folder_name.js";
import type {
  ChosenProjectFolder,
  ImportedProject,
  NewProjectDefaults,
  OpenProjectReading,
  ProjectArchiveChosenToImport,
  ProjectCreationQueued,
  RecentProject,
  StreamActionFollowed,
  ProjectFolderChosenFor,
  ProjectTheRuntimeNames,
  ProjectTransactionAuthor,
} from "../shared/tatolab_backend_contract.js";
import { realPathOrAsGiven, somethingIsAt } from "./file_system_entries_on_this_machine.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";
import type { ProjectSummaryTheRuntimeServes } from "./project_the_runtime_names.js";
import type { ProjectAssetAtItsPath, ProjectSettingsAfterTheTransaction } from "./project_changes_on_the_wire.js";
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

/** How many numbered names are tried for a new, imported or duplicated project's folder before the plain one is offered and the runtime or the sheet refuses it. */
const NUMBERED_NAMES_TRIED = 1_000;

/** How often a deletion the runtime queued is asked about while the Projects window waits for it. */
export const PROJECT_DELETION_FOLLOW_INTERVAL_MS = 250;
/** How long, on the monotonic clock, the Projects window waits at most for a deletion to end. */
export const PROJECT_DELETION_LONGEST_WAIT_MS = 60_000;

/** The words a duplicate's folder name takes after the original's: `pattern copy`, then `pattern copy 2`, …. */
const DUPLICATE_FOLDER_NAME_SUFFIX = "copy";

/** The name an imported project is suggested when its `.zip`'s name cannot be a folder name. */
const IMPORTED_PROJECT_NAME = "Imported project";

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
  /** Forget `folder`; nothing changes when it is not remembered, and refused in words when the file could not be written. */
  forget(folder: string): Promise<Result<void, string>>;
}

/** The runtime's `create_project`, which makes a new project. */
export interface NewProjectCreation {
  createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>>;
}

/** The runtime's verbs on a project itself, and the description of an action one queued, each refused in the runtime's own words. */
export interface ProjectChangesThroughTheRuntime {
  /** The project's name, description and last edit, from `list_assets`. */
  summarizeTheProject(projectDirectory: string): Promise<Result<ProjectSummaryTheRuntimeServes, LocalApiRequestFailure>>;
  /** `rename_project`, answering the name it now has. */
  renameProject(projectDirectory: string, name: string): Promise<Result<string, LocalApiRequestFailure>>;
  /** `duplicate_project` into `into`, a folder that does not exist yet. */
  duplicateProject(projectDirectory: string, into: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>>;
  /** `delete_project`, answering the id of the action it queued. */
  deleteProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>>;
  /** Where the deletion `deleteProject` queued stands now. */
  describeStreamAction(action: string): Promise<Result<StreamActionFollowed, LocalApiRequestFailure>>;
  /** `import_project` of the `.zip` `source` into `projectDirectory`, a folder that does not exist yet. */
  importProject(source: string, projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>>;
  /** `set_project_description`; `null` clears it. */
  setProjectDescription(projectDirectory: string, description: string | null): Promise<Result<ProjectSettingsAfterTheTransaction, LocalApiRequestFailure>>;
  /** `set_project_cover` with the media asset `cover`, a UUID the project holds; `null` clears it. */
  setProjectCover(projectDirectory: string, cover: string | null): Promise<Result<ProjectSettingsAfterTheTransaction, LocalApiRequestFailure>>;
  /** `import_asset` of the file at `source` to `assetPath` in the project, or for `null` into its kind's folder, by `author` or, for `null`, the runtime's own. */
  importAsset(projectDirectory: string, source: string, assetPath: string | null, author: ProjectTransactionAuthor | null): Promise<Result<ProjectAssetAtItsPath, LocalApiRequestFailure>>;
  /** `read_project_file`: the bytes of `filePath` in the project. */
  readProjectFile(projectDirectory: string, filePath: string): Promise<Result<Buffer, LocalApiRequestFailure>>;
}

/** Asks the person for a project `.zip` in the desktop's open dialog, opened at `defaultFolder`. `null` when they cancel. */
export type ProjectArchiveDialog = (defaultFolder: string) => Promise<Result<string | null, string>>;

/** Asks the person for an image to show a project by, in the desktop's open dialog, opened at `defaultFolder`. `null` when they cancel. */
export type ProjectCoverImageDialog = (defaultFolder: string) => Promise<Result<string | null, string>>;

/** The image files a project cover can be chosen from, by extension, with the media type each is read back as. */
export const PROJECT_COVER_IMAGE_MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** The media type a window shows the image at `imagePath` as, by its extension; `undefined` for a file no window shows as a cover. */
function projectCoverImageMediaTypeOf(imagePath: string): string | undefined {
  return PROJECT_COVER_IMAGE_MEDIA_TYPES[path.extname(imagePath).toLowerCase()];
}

/** The folder in a project a chosen cover image is imported into. */
const PROJECT_COVER_IMAGES_FOLDER = "media";

/** What opening a project reaches: the person's home and Documents folders, the dialogs, the recent projects, the wall clock, the runtime, and the studio window each project opens in. */
export interface ProjectOpeningSources {
  homeDirectory: string;
  /** The platform's Documents folder, where new projects go under `Tato Studio/`. */
  documentsDirectory: string;
  projectFolderDialog: ProjectFolderDialog;
  projectArchiveDialog: ProjectArchiveDialog;
  projectCoverImageDialog: ProjectCoverImageDialog;
  recentProjectFolders: RecentProjectFolders;
  /** The wall clock, in milliseconds since the epoch, stamped on a project as it opens for the Projects window to show. */
  readWallClockNowMs: () => number;
  newProjectCreation: NewProjectCreation;
  projectReadingsOfTheRuntime: ProjectReadingsOfTheRuntime;
  projectChanges: ProjectChangesThroughTheRuntime;
  /** Answers once `delayMs` have passed. */
  waitFor: (delayMs: number) => Promise<void>;
  /** The monotonic clock, in milliseconds, that a deletion's longest wait is measured on. */
  readMonotonicClockMs: () => number;
  /** Open the project in `folder` in its own studio window, or bring that window forward when it is open; answers once the window shows the project. */
  openTheProjectInItsStudioWindow: (folder: string) => Promise<StudioWindowOfTheProjectShown>;
  /** Close the studio window of the project in `folder` and the windows it opened, without asking; nothing when none is open. */
  closeTheStudioWindowOf: (folder: string) => void;
  /** Open the project in `folder` on the runtime when it holds it closed, since it draws and edits only a loaded stream's graph; refused in the runtime's own words. */
  openTheProjectWhenTheRuntimeHoldsItClosed: (folder: string) => Promise<Result<void, string>>;
}

/** What opening a project in its studio window did: opened a new window for it, or brought the one already open forward. */
export type StudioWindowOfTheProjectShown = "opened_its_studio_window" | "brought_its_studio_window_forward";

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

/** The first of `name`, `name 2`, `name 3`, … that nothing in `location` holds as `<that name><extension>`; `name` itself when every one tried is taken, for the runtime or the sheet to refuse. */
async function firstNumberedNameNothingHoldsIn(location: string, name: string, extension = ""): Promise<string> {
  for (let number = 1; number <= NUMBERED_NAMES_TRIED; number += 1) {
    const numberedName = projectNameNumbered(name, number);
    if (!(await somethingIsAt(path.join(location, `${numberedName}${extension}`)))) return numberedName;
  }
  return name;
}

/** The name a project imported from `archive` suggests: the `.zip`'s file name without its extension, or `Imported project` for a name that is only the extension. */
function projectNameOfTheArchive(archive: string): string {
  const archiveName = path.basename(archive).replace(/\.zip$/i, "").trim();
  return newProjectFolderNameRefusal(archiveName) !== null ? IMPORTED_PROJECT_NAME : archiveName;
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
    return { location, name: await firstNumberedNameNothingHoldsIn(location, UNTITLED_PROJECT_NAME) };
  }

  /** Ask the person for a project `.zip`, the dialog opened at home, and answer where the Import project sheet starts for it; `null` when they cancel. */
  async chooseProjectArchiveToImport(): Promise<Result<ProjectArchiveChosenToImport | null, string>> {
    const chosenArchive = await this.sources.projectArchiveDialog(this.sources.homeDirectory);
    if (!chosenArchive.ok) return chosenArchive;
    if (chosenArchive.value === null) return succeeded(null);
    const location = this.defaultNewProjectLocation();
    const archive = path.resolve(chosenArchive.value);
    return succeeded({ archive, location, name: await firstNumberedNameNothingHoldsIn(location, projectNameOfTheArchive(archive)) });
  }

  /**
   * Make the project `name` in `location` from the `.zip` `archive` with the runtime's `import_project`, making `location` when it is missing, and
   * open it. Refused with nothing made for a name that is no folder name or that something in `location` already holds; the runtime's refusal in its own words.
   */
  async importProjectArchive(archive: string, name: string, location: string): Promise<Result<ChosenProjectFolder, string>> {
    if (!path.isAbsolute(archive)) return failedWith(`${archive} is not a full path to a .zip.`);
    const projectDirectory = await this.newProjectDirectoryFor(name, location);
    if (!projectDirectory.ok) return projectDirectory;
    const imported = await this.sources.projectChanges.importProject(archive, projectDirectory.value);
    if (!imported.ok) return failedWith(imported.failure.failureDescription);
    const folder = await realPathOrAsGiven(path.resolve(imported.value.folder));
    const opened = await this.openAndRememberTheFolder(folder);
    return opened.ok ? succeeded({ folder, project_creation: null }) : opened;
  }

  /** Name the project in `folder`, one of the recent projects, `name` through the runtime; its folder keeps its name. Refused for a blank name or any other folder, and in the runtime's own words. */
  async renameRecentProject(folder: string, name: string): Promise<Result<void, string>> {
    const recentFolder = await this.oneOfTheRecentFolders(folder);
    if (!recentFolder.ok) return recentFolder;
    if (name.trim() === "") return failedWith("Give the project a name.");
    const renamed = await this.sources.projectChanges.renameProject(folder, name.trim());
    return renamed.ok ? succeeded(undefined) : failedWith(renamed.failure.failureDescription);
  }

  /**
   * Duplicate the project in `folder`, one of the recent projects, with its history into the first of `<folder> copy`, `<folder> copy 2`, … that nothing
   * holds, and put the duplicate first among the recent projects; it does not open. Answers the duplicate's folder; refused for any other folder, and in the runtime's own words.
   */
  async duplicateRecentProject(folder: string): Promise<Result<string, string>> {
    const recentFolder = await this.oneOfTheRecentFolders(folder);
    if (!recentFolder.ok) return recentFolder;
    const duplicateFolderName = await firstNumberedNameNothingHoldsIn(path.dirname(folder), `${path.basename(folder)} ${DUPLICATE_FOLDER_NAME_SUFFIX}`);
    const duplicated = await this.sources.projectChanges.duplicateProject(folder, path.join(path.dirname(folder), duplicateFolderName));
    if (!duplicated.ok) return failedWith(duplicated.failure.failureDescription);
    const duplicateFolder = await realPathOrAsGiven(path.resolve(duplicated.value.folder));
    const remembered = await this.sources.recentProjectFolders.rememberOpened(duplicateFolder, this.sources.readWallClockNowMs());
    return remembered.ok ? succeeded(duplicateFolder) : failedWith(`The duplicate is in ${duplicateFolder}, but Tato Studio could not remember it for next time: ${remembered.failure}`);
  }

  /** The cover of the project in `folder`, one of the recent projects, as a `data:` URL of its image; `null` when it has none or one that is no image a window shows. Refused for any other folder, and in the runtime's own words. */
  async readRecentProjectCover(folder: string): Promise<Result<string | null, string>> {
    const recentFolder = await this.oneOfTheRecentFolders(folder);
    if (!recentFolder.ok) return recentFolder;
    const summary = await this.sources.projectChanges.summarizeTheProject(folder);
    if (!summary.ok) return failedWith(summary.failure.failureDescription);
    const coverPath = summary.value.cover_path;
    if (coverPath === null) return succeeded(null);
    const mediaType = projectCoverImageMediaTypeOf(coverPath);
    if (mediaType === undefined) return succeeded(null);
    const coverBytes = await this.sources.projectChanges.readProjectFile(folder, coverPath);
    if (!coverBytes.ok) return failedWith(coverBytes.failure.failureDescription);
    return succeeded(`data:${mediaType};base64,${coverBytes.value.toString("base64")}`);
  }

  /** Describe the project in `folder`, one of the recent projects, as `description` through the runtime; a blank one clears it. Refused for any other folder, and in the runtime's own words. */
  async setRecentProjectDescription(folder: string, description: string): Promise<Result<void, string>> {
    const recentFolder = await this.oneOfTheRecentFolders(folder);
    if (!recentFolder.ok) return recentFolder;
    const described = await this.sources.projectChanges.setProjectDescription(folder, description.trim() === "" ? null : description.trim());
    return described.ok ? succeeded(undefined) : failedWith(described.failure.failureDescription);
  }

  /** The image the person chooses to show a project by, in the dialog opened at home; `null` when they cancel. */
  async chooseProjectCoverImage(): Promise<Result<string | null, string>> {
    const chosenImage = await this.sources.projectCoverImageDialog(this.sources.homeDirectory);
    if (!chosenImage.ok) return chosenImage;
    return succeeded(chosenImage.value === null ? null : path.resolve(chosenImage.value));
  }

  /**
   * Show the project in `folder`, one of the recent projects, by `image`, an image file on this machine, which the runtime imports into its `media/`
   * under the image's own name, numbered past one already there; `null` shows it by its plain cover again. Refused for any other folder, an image of a
   * kind a window cannot show, and in the runtime's own words.
   */
  async setRecentProjectCover(folder: string, image: string | null): Promise<Result<void, string>> {
    const recentFolder = await this.oneOfTheRecentFolders(folder);
    if (!recentFolder.ok) return recentFolder;
    if (image === null) {
      const uncovered = await this.sources.projectChanges.setProjectCover(folder, null);
      return uncovered.ok ? succeeded(undefined) : failedWith(uncovered.failure.failureDescription);
    }
    if (!path.isAbsolute(image)) return failedWith(`${image} is not a full path to an image.`);
    const extension = path.extname(image);
    if (projectCoverImageMediaTypeOf(image) === undefined) return failedWith(`${path.basename(image)} is not a PNG, JPEG, WebP or GIF image.`);
    const coverImagesFolder = path.join(folder, PROJECT_COVER_IMAGES_FOLDER);
    const imageFileName = `${await firstNumberedNameNothingHoldsIn(coverImagesFolder, path.basename(image, extension), extension)}${extension}`;
    const imported = await this.sources.projectChanges.importAsset(folder, image, `${PROJECT_COVER_IMAGES_FOLDER}/${imageFileName}`, null);
    if (!imported.ok) return failedWith(imported.failure.failureDescription);
    const covered = await this.sources.projectChanges.setProjectCover(folder, imported.value.asset);
    return covered.ok ? succeeded(undefined) : failedWith(covered.failure.failureDescription);
  }

  /**
   * Delete the project in `folder`, one of the recent projects, through the runtime, which stops and forgets its streams and moves its folder to the Trash;
   * answers once it has, its studio window closed and the project forgotten here. Refused for any other folder, in the runtime's words when it failed, and
   * when the runtime has not finished within `PROJECT_DELETION_LONGEST_WAIT_MS`.
   */
  async deleteRecentProject(folder: string): Promise<Result<void, string>> {
    const recentFolder = await this.oneOfTheRecentFolders(folder);
    if (!recentFolder.ok) return recentFolder;
    const queued = await this.sources.projectChanges.deleteProject(folder);
    if (!queued.ok) return failedWith(queued.failure.failureDescription);
    const deleted = await this.followTheDeletionToItsEnd(queued.value, folder);
    if (!deleted.ok) return deleted;
    this.sources.closeTheStudioWindowOf(folder);
    const forgotten = await this.sources.recentProjectFolders.forget(folder);
    return forgotten.ok ? succeeded(undefined) : failedWith(`The project is in the Trash, but Tato Studio could not forget it: ${forgotten.failure}`);
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
    const projectDirectory = await this.newProjectDirectoryFor(name, location);
    if (!projectDirectory.ok) return projectDirectory;
    const queued = await this.sources.newProjectCreation.createProject(projectDirectory.value);
    if (!queued.ok) return failedWith(queued.failure.failureDescription);
    const folder = await realPathOrAsGiven(path.resolve(queued.value.project_directory));
    const opened = await this.openAndRememberTheFolder(folder, "the_runtime_opens_the_new_project_itself");
    return opened.ok ? succeeded({ folder, project_creation: queued.value }) : opened;
  }

  /** Open `folder`, one of the recent projects, and put it first among them; refused for any other folder, and in words when it could not be remembered, though it opens. */
  async openRecentProject(folder: string): Promise<Result<void, string>> {
    const recentFolders = await this.sources.recentProjectFolders.readRecentFolders();
    if (!recentFolders.some((recentFolder) => recentFolder.folder === folder)) return failedWith(`${folder} is not one of the recent projects.`);
    return this.openAndRememberTheFolder(folder);
  }

  /** The recent projects, recent first, each with its project's name, description and last edit as the runtime reads them now, `null` where it could not. */
  async readRecentProjects(): Promise<RecentProject[]> {
    const recentFolders = await this.sources.recentProjectFolders.readRecentFolders();
    return Promise.all(
      recentFolders.map(async ({ folder, opened_at_wall_clock_ms }): Promise<RecentProject> => {
        const summary = await this.sources.projectChanges.summarizeTheProject(folder);
        return {
          folder,
          project_name: summary.ok ? summary.value.name : null,
          project_description: summary.ok ? summary.value.description : null,
          last_edited_at_wall_clock_ms: summary.ok ? summary.value.last_edited_at_wall_clock_ms : null,
          has_a_chosen_cover: summary.ok && summary.value.cover_path !== null && projectCoverImageMediaTypeOf(summary.value.cover_path) !== undefined,
          last_opened_at_wall_clock_ms: opened_at_wall_clock_ms,
        };
      }),
    );
  }

  private defaultNewProjectLocation(): string {
    return path.join(this.sources.documentsDirectory, NEW_PROJECTS_FOLDER_INSIDE_DOCUMENTS);
  }

  /** `<location>/<name>` for a project the runtime makes there, `location` made when missing; refused for a name that is no folder name, a relative `location`, or a folder that exists. */
  private async newProjectDirectoryFor(name: string, location: string): Promise<Result<string, string>> {
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
    return succeeded(projectDirectory);
  }

  private async oneOfTheRecentFolders(folder: string): Promise<Result<void, string>> {
    const recentFolders = await this.sources.recentProjectFolders.readRecentFolders();
    return recentFolders.some((recentFolder) => recentFolder.folder === folder) ? succeeded(undefined) : failedWith(`${folder} is not one of the recent projects.`);
  }

  /** Ask about the deletion `action` until it ends: done, or refused with why it failed, was cancelled, is no longer held, or is still running past the longest wait. */
  private async followTheDeletionToItsEnd(action: string, folder: string): Promise<Result<void, string>> {
    const followedSinceMs = this.sources.readMonotonicClockMs();
    while (this.sources.readMonotonicClockMs() - followedSinceMs <= PROJECT_DELETION_LONGEST_WAIT_MS) {
      const followed = await this.sources.projectChanges.describeStreamAction(action);
      if (!followed.ok) return failedWith(followed.failure.failureDescription);
      if (followed.value.kind === "not_held") return failedWith(followed.value.words);
      const { state, failed_because: failedBecause } = followed.value.description;
      if (state === "done") return succeeded(undefined);
      if (state === "failed") return failedWith(failedBecause ?? `The runtime could not delete ${folder}.`);
      if (state === "cancelled") return failedWith(`Deleting ${folder} was cancelled; the project is where it was.`);
      await this.sources.waitFor(PROJECT_DELETION_FOLLOW_INTERVAL_MS);
    }
    return failedWith(`The runtime is still deleting ${folder}. Its card stays here, and reads as gone from disk once the folder is in the Trash.`);
  }

  /** Open `folder` in its studio window and remember it; a project opened in a new window is opened on the runtime when it holds it closed, one whose window was open already is left as the person left it. */
  private async openAndRememberTheFolder(
    folder: string,
    howTheRuntimeOpensTheProject: "open_it_when_the_runtime_holds_it_closed" | "the_runtime_opens_the_new_project_itself" = "open_it_when_the_runtime_holds_it_closed",
  ): Promise<Result<void, string>> {
    const studioWindowShown = await this.sources.openTheProjectInItsStudioWindow(folder);
    const remembered = await this.sources.recentProjectFolders.rememberOpened(folder, this.sources.readWallClockNowMs());
    const opened =
      howTheRuntimeOpensTheProject === "open_it_when_the_runtime_holds_it_closed" && studioWindowShown === "opened_its_studio_window"
        ? await this.sources.openTheProjectWhenTheRuntimeHoldsItClosed(folder)
        : succeeded(undefined);
    const failuresAfterTheWindowOpened = [
      ...(opened.ok ? [] : [`the runtime did not open it: ${opened.failure}`]),
      ...(remembered.ok ? [] : [`Tato Studio could not remember it for next time: ${remembered.failure}`]),
    ];
    return failuresAfterTheWindowOpened.length === 0 ? succeeded(undefined) : failedWith(`${folder} is open, but ${failuresAfterTheWindowOpened.join("; and ")}`);
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
