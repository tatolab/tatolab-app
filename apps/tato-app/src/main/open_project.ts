// Opening projects, each in its own studio window: a folder that is itself a project, chosen in the
// app's own dialog, from the Projects window's recent projects, or made new, and remembered among
// the recent projects. A studio window's project is named by the runtime's `list_assets`, its
// imports listed by its `list_dependencies` and each copy under `imports/` named by `list_assets`,
// and read again whenever one of those folders changes or the runtime starts answering.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Clock, Effect, Result } from "effect";
import { newProjectFolderNameRefusal, projectNameNumbered, UNTITLED_PROJECT_NAME } from "../shared/new_project_folder_name.js";
import { streamsOfTheProjectIn, theStreamsListTheProjectOpen } from "../shared/project_playback.js";
import type {
  ChosenProjectFolder,
  ImportedProject,
  NewProjectDefaults,
  OpenProjectReading,
  ProjectArchiveChosenToImport,
  RecentProject,
  ProjectFolderChosenFor,
  ProjectTheRuntimeNames,
} from "../shared/tatolab_backend_contract.js";
import { realFolderOf, realPathOrAsGiven, somethingIsAt } from "./file_system_entries_on_this_machine.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";
import {
  createProject,
  deleteProject,
  describeStreamAction,
  duplicateProject,
  importAsset,
  importProject,
  listStreams,
  openProject,
  readProjectFile,
  renameProject,
  setProjectCover,
  setProjectDescription,
  summarizeTheProject,
} from "./runtime_operations.js";
import { ProjectDialogs, RecentProjects, StudioWindows, thenAStatusRound, ThisMachinesFolders } from "./studio_runtime.js";
import type { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { importFolderInsideTheWorkspace, PROJECT_IMPORTS_FOLDER } from "./workspace_dependencies.js";
import { projectFolderOfTheOpenProject } from "./open_project_files.js";
import { describeCaughtFailure, type Result as PlainResult } from "./result.js";
import { CommandRefused } from "./window_command.js";

/** How long the folders must stay quiet after a change before they are read again, so one save that touches a file several times reads once. */
export const OPEN_PROJECT_REREAD_QUIET_MS = 150;

/** What the app's project folder dialog is opened for: an existing project, or the folder a new project goes in. */
export type ProjectFolderDialogPurpose = ProjectFolderChosenFor | "new_project_location";

/** Asks the person for a folder in the desktop's dialog, opened at `defaultFolder`. `null` when they cancel. */
export type ProjectFolderDialog = (purpose: ProjectFolderDialogPurpose, defaultFolder: string) => Promise<PlainResult<string | null, string>>;

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
  rememberOpened(folder: string, openedAtWallClockMs: number): Promise<PlainResult<void, string>>;
  /** Forget `folder`; nothing changes when it is not remembered, and refused in words when the file could not be written. */
  forget(folder: string): Promise<PlainResult<void, string>>;
}

/** Asks the person for a project `.zip` in the desktop's open dialog, opened at `defaultFolder`. `null` when they cancel. */
export type ProjectArchiveDialog = (defaultFolder: string) => Promise<PlainResult<string | null, string>>;

/** Asks the person for an image to show a project by, in the desktop's open dialog, opened at `defaultFolder`. `null` when they cancel. */
export type ProjectCoverImageDialog = (defaultFolder: string) => Promise<PlainResult<string | null, string>>;

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
  nameTheProject: (projectFolder: string) => Promise<PlainResult<ProjectTheRuntimeNames, string>>;
  /** Each project it imports, from `list_dependencies`. */
  listTheDependencies: (projectFolder: string) => Promise<PlainResult<ListedProjectDependency[], string>>;
}

/** The first of `name`, `name 2`, `name 3`, … that nothing in `location` holds as `<that name><extension>`; `name` itself when every one tried is taken, for the runtime or the sheet to refuse. */
function firstNumberedNameNothingHoldsIn(location: string, name: string, extension = ""): Effect.Effect<string> {
  return Effect.promise(async () => {
    for (let number = 1; number <= NUMBERED_NAMES_TRIED; number += 1) {
      const numberedName = projectNameNumbered(name, number);
      if (!(await somethingIsAt(path.join(location, `${numberedName}${extension}`)))) return numberedName;
    }
    return name;
  });
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

/** `<Documents>/Tato Studio`, where new projects go. */
const defaultNewProjectLocation = ThisMachinesFolders.use(({ documentsDirectory }) => Effect.succeed(path.join(documentsDirectory, NEW_PROJECTS_FOLDER_INSIDE_DOCUMENTS)));

/** Nothing when `folder` is one of the recent projects; refused naming it otherwise. */
const oneOfTheRecentFolders = Effect.fn("oneOfTheRecentFolders")(function* (folder: string) {
  const recentFolders = yield* (yield* RecentProjects).readRecentFolders;
  if (!recentFolders.some((recentFolder) => recentFolder.folder === folder)) return yield* new CommandRefused({ words: `${folder} is not one of the recent projects.` });
});

/** `folder` put first among the recent projects, stamped with the wall clock now. */
const rememberAmongTheRecentProjects = Effect.fn("rememberAmongTheRecentProjects")(function* (folder: string) {
  const openedAtWallClockMs = yield* Clock.currentTimeMillis;
  yield* (yield* RecentProjects).rememberOpened(folder, openedAtWallClockMs);
});

/** `<location>/<name>` for a project the runtime makes there, `location` made when missing; refused for a name that is no folder name, a relative `location`, or a folder that exists. */
const newProjectDirectoryFor = Effect.fn("newProjectDirectoryFor")(function* (name: string, location: string) {
  const nameRefusal = newProjectFolderNameRefusal(name);
  if (nameRefusal !== null) return yield* new CommandRefused({ words: nameRefusal });
  if (!path.isAbsolute(location)) return yield* new CommandRefused({ words: `${location} is not a full path to a folder.` });
  const projectDirectory = path.join(location, name.trim());
  if (yield* Effect.promise(() => somethingIsAt(projectDirectory))) return yield* new CommandRefused({ words: `${projectDirectory} already exists. Choose another name or location.` });
  yield* Effect.tryPromise({
    try: () => mkdir(location, { recursive: true }),
    catch: (mkdirFailure) => new CommandRefused({ words: `Tato Studio couldn't make the folder ${location}: ${describeCaughtFailure(mkdirFailure)}` }),
  });
  return projectDirectory;
});

/** The project in `folder` opened on the runtime when it holds it closed, since it draws and edits only a loaded stream's graph, then a status round; left as it is while open. */
export const openTheProjectWhenTheRuntimeHoldsItClosed = Effect.fn("openTheProjectWhenTheRuntimeHoldsItClosed")(function* (folder: string) {
  const listedStreams = yield* listStreams();
  if (theStreamsListTheProjectOpen(streamsOfTheProjectIn(listedStreams, folder))) return;
  yield* thenAStatusRound(openProject(folder));
});

/**
 * `folder` opened in its studio window and remembered among the recent projects; a project opened in a new window is opened on the runtime when it holds it
 * closed, one whose window was open already is left as the person left it. Refused, once its window shows it, saying what did not happen.
 */
const openAndRememberTheFolder = Effect.fn("openAndRememberTheFolder")(function* (
  folder: string,
  howTheRuntimeOpensTheProject: "open_it_when_the_runtime_holds_it_closed" | "the_runtime_opens_the_new_project_itself" = "open_it_when_the_runtime_holds_it_closed",
) {
  const studioWindowShown = yield* (yield* StudioWindows).openTheProjectInItsStudioWindow(folder);
  const remembered = yield* Effect.result(rememberAmongTheRecentProjects(folder));
  const opened =
    howTheRuntimeOpensTheProject === "open_it_when_the_runtime_holds_it_closed" && studioWindowShown === "opened_its_studio_window"
      ? yield* Effect.result(openTheProjectWhenTheRuntimeHoldsItClosed(folder))
      : Result.succeed(undefined);
  const failuresAfterTheWindowOpened = [
    ...(Result.isFailure(opened) ? [`the runtime did not open it: ${opened.failure.words}`] : []),
    ...(Result.isFailure(remembered) ? [`Tato Studio could not remember it for next time: ${remembered.failure.words}`] : []),
  ];
  if (failuresAfterTheWindowOpened.length > 0) return yield* new CommandRefused({ words: `${folder} is open, but ${failuresAfterTheWindowOpened.join("; and ")}` });
});

/** The folder the person chooses in the project folder dialog, opened beside `openProjectFolder` (the asking window's project) or at home, opened in its studio window; `null` when they cancel. */
export const chooseProjectFolder = Effect.fn("chooseProjectFolder")(function* (chosenFor: ProjectFolderChosenFor, openProjectFolder: string | null) {
  const { homeDirectory } = yield* ThisMachinesFolders;
  const chosenFolder = yield* (yield* ProjectDialogs).chooseAProjectFolder(chosenFor, openProjectFolder === null ? homeDirectory : path.dirname(openProjectFolder));
  if (chosenFolder === null) return null;
  const folder = yield* realFolderOf(chosenFolder);
  yield* openAndRememberTheFolder(folder);
  return { folder, project_creation: null } satisfies ChosenProjectFolder;
});

/** `<Documents>/Tato Studio`, and the first of `Untitled project`, `Untitled project 2`, … that nothing there holds. */
export const readNewProjectDefaults: Effect.Effect<NewProjectDefaults, never, ThisMachinesFolders> = Effect.gen(function* () {
  const location = yield* defaultNewProjectLocation;
  return { location, name: yield* firstNumberedNameNothingHoldsIn(location, UNTITLED_PROJECT_NAME) };
});

/** The project `.zip` the person chooses in the dialog opened at home, with where the Import project sheet starts for it; `null` when they cancel. */
export const chooseProjectArchiveToImport: Effect.Effect<ProjectArchiveChosenToImport | null, CommandRefused, ThisMachinesFolders | ProjectDialogs> = Effect.gen(function* () {
  const { homeDirectory } = yield* ThisMachinesFolders;
  const chosenArchive = yield* (yield* ProjectDialogs).chooseAProjectArchive(homeDirectory);
  if (chosenArchive === null) return null;
  const location = yield* defaultNewProjectLocation;
  const archive = path.resolve(chosenArchive);
  return { archive, location, name: yield* firstNumberedNameNothingHoldsIn(location, projectNameOfTheArchive(archive)) };
});

/**
 * The project `name` made in `location` from the `.zip` `archive` by the runtime's `import_project`, `location` made when missing, and opened. Refused with
 * nothing made for a name that is no folder name or that something in `location` already holds; the runtime's refusal in its own words.
 */
export const importProjectArchive = Effect.fn("importProjectArchive")(function* (archive: string, name: string, location: string) {
  if (!path.isAbsolute(archive)) return yield* new CommandRefused({ words: `${archive} is not a full path to a .zip.` });
  const projectDirectory = yield* newProjectDirectoryFor(name, location);
  const imported = yield* importProject(archive, projectDirectory);
  const folder = yield* realFolderOf(imported.folder);
  yield* openAndRememberTheFolder(folder);
  return { folder, project_creation: null } satisfies ChosenProjectFolder;
});

/** A new project made from the `.zip` `archive` in `<Documents>/Tato Studio`, under the first of `name`, `name 2`, … that nothing there holds, and opened, as `importProjectArchive` does. */
export const makeAProjectOfItsOwnFromTheArchive = Effect.fn("makeAProjectOfItsOwnFromTheArchive")(function* (archive: string, name: string) {
  const location = yield* defaultNewProjectLocation;
  return yield* importProjectArchive(archive, yield* firstNumberedNameNothingHoldsIn(location, name), location);
});

/** The project in `folder`, one of the recent projects, named `name` through the runtime; its folder keeps its name. Refused for a blank name or any other folder, and in the runtime's own words. */
export const renameRecentProject = Effect.fn("renameRecentProject")(function* (folder: string, name: string) {
  yield* oneOfTheRecentFolders(folder);
  if (name.trim() === "") return yield* new CommandRefused({ words: "Give the project a name." });
  yield* renameProject(folder, name.trim());
});

/**
 * The project in `folder`, one of the recent projects, duplicated with its history into the first of `<folder> copy`, `<folder> copy 2`, … that nothing holds,
 * and the duplicate put first among the recent projects; it does not open. Answers the duplicate's folder; refused for any other folder, and in the runtime's own words.
 */
export const duplicateRecentProject = Effect.fn("duplicateRecentProject")(function* (folder: string) {
  yield* oneOfTheRecentFolders(folder);
  const duplicateFolderName = yield* firstNumberedNameNothingHoldsIn(path.dirname(folder), `${path.basename(folder)} ${DUPLICATE_FOLDER_NAME_SUFFIX}`);
  const duplicated = yield* duplicateProject(folder, path.join(path.dirname(folder), duplicateFolderName));
  const duplicateFolder = yield* realFolderOf(duplicated.folder);
  yield* rememberAmongTheRecentProjects(duplicateFolder).pipe(
    Effect.mapError(({ words }) => new CommandRefused({ words: `The duplicate is in ${duplicateFolder}, but Tato Studio could not remember it for next time: ${words}` })),
  );
  return duplicateFolder;
});

/** The cover of the project in `folder`, one of the recent projects, as a `data:` URL of its image; `null` when it has none or one that is no image a window shows. Refused for any other folder, and in the runtime's own words. */
export const readRecentProjectCover = Effect.fn("readRecentProjectCover")(function* (folder: string) {
  yield* oneOfTheRecentFolders(folder);
  const { cover_path: coverPath } = yield* summarizeTheProject(folder);
  if (coverPath === null) return null;
  const mediaType = projectCoverImageMediaTypeOf(coverPath);
  if (mediaType === undefined) return null;
  const coverBytes = yield* readProjectFile(folder, coverPath);
  return `data:${mediaType};base64,${coverBytes.toString("base64")}`;
});

/** The project in `folder`, one of the recent projects, described as `description` through the runtime; a blank one clears it. Refused for any other folder, and in the runtime's own words. */
export const setRecentProjectDescription = Effect.fn("setRecentProjectDescription")(function* (folder: string, description: string) {
  yield* oneOfTheRecentFolders(folder);
  yield* setProjectDescription(folder, description.trim() === "" ? null : description.trim());
});

/** The image the person chooses to show a project by, in the dialog opened at home; `null` when they cancel. */
export const chooseProjectCoverImage: Effect.Effect<string | null, CommandRefused, ThisMachinesFolders | ProjectDialogs> = Effect.gen(function* () {
  const { homeDirectory } = yield* ThisMachinesFolders;
  const chosenImage = yield* (yield* ProjectDialogs).chooseAProjectCoverImage(homeDirectory);
  return chosenImage === null ? null : path.resolve(chosenImage);
});

/**
 * The project in `folder`, one of the recent projects, shown by `image`, an image file on this machine, which the runtime imports into its `media/` under the
 * image's own name, numbered past one already there; `null` shows it by its plain cover again. Refused for any other folder, an image of a kind a window
 * cannot show, and in the runtime's own words.
 */
export const setRecentProjectCover = Effect.fn("setRecentProjectCover")(function* (folder: string, image: string | null) {
  yield* oneOfTheRecentFolders(folder);
  if (image === null) {
    yield* setProjectCover(folder, null);
    return;
  }
  if (!path.isAbsolute(image)) return yield* new CommandRefused({ words: `${image} is not a full path to an image.` });
  if (projectCoverImageMediaTypeOf(image) === undefined) return yield* new CommandRefused({ words: `${path.basename(image)} is not a PNG, JPEG, WebP or GIF image.` });
  const extension = path.extname(image);
  const imageFileName = `${yield* firstNumberedNameNothingHoldsIn(path.join(folder, PROJECT_COVER_IMAGES_FOLDER), path.basename(image, extension), extension)}${extension}`;
  const imported = yield* importAsset(folder, image, `${PROJECT_COVER_IMAGES_FOLDER}/${imageFileName}`, null);
  yield* setProjectCover(folder, imported.asset);
});

/** The deletion `action` of the project in `folder`, asked about until it ends: done, or refused with why it failed, was cancelled, is no longer held, or is still running past the longest wait. */
const followTheDeletionToItsEnd = Effect.fn("followTheDeletionToItsEnd")(function* (action: string, folder: string) {
  const followedSinceNanos = yield* Clock.monotonicTimeNanos;
  const longestWaitNanos = BigInt(PROJECT_DELETION_LONGEST_WAIT_MS) * 1_000_000n;
  while ((yield* Clock.monotonicTimeNanos) - followedSinceNanos <= longestWaitNanos) {
    const followed = yield* describeStreamAction(action);
    if (followed.kind === "not_held") return yield* new CommandRefused({ words: followed.words });
    const { state, failed_because: failedBecause } = followed.description;
    if (state === "done") return;
    if (state === "failed") return yield* new CommandRefused({ words: failedBecause ?? `The runtime could not delete ${folder}.` });
    if (state === "cancelled") return yield* new CommandRefused({ words: `Deleting ${folder} was cancelled; the project is where it was.` });
    yield* Effect.sleep(PROJECT_DELETION_FOLLOW_INTERVAL_MS);
  }
  return yield* new CommandRefused({ words: `The runtime is still deleting ${folder}. Its card stays here, and reads as gone from disk once the folder is in the Trash.` });
});

/**
 * The project in `folder`, one of the recent projects, deleted through the runtime, which stops and forgets its streams and moves its folder to the Trash;
 * answers once it has, its studio window closed and the project forgotten here. Refused for any other folder, in the runtime's words when it failed, and
 * when the runtime has not finished within `PROJECT_DELETION_LONGEST_WAIT_MS`.
 */
export const deleteRecentProject = Effect.fn("deleteRecentProject")(function* (folder: string) {
  yield* oneOfTheRecentFolders(folder);
  const action = yield* deleteProject(folder);
  yield* followTheDeletionToItsEnd(action, folder);
  yield* (yield* StudioWindows).closeTheStudioWindowOf(folder);
  yield* (yield* RecentProjects).forget(folder).pipe(Effect.mapError(({ words }) => new CommandRefused({ words: `The project is in the Trash, but Tato Studio could not forget it: ${words}` })));
});

/** The folder the person chooses for a new project, the dialog opened at `startingAt`, or at the default location when that is not absolute; `null` when they cancel. */
export const chooseNewProjectLocation = Effect.fn("chooseNewProjectLocation")(function* (startingAt: string) {
  const defaultFolder = path.isAbsolute(startingAt) ? startingAt : yield* defaultNewProjectLocation;
  return yield* (yield* ProjectDialogs).chooseAProjectFolder("new_project_location", defaultFolder);
});

/**
 * The project `name` created in `location` by the runtime's `create_project`, `location` made when missing, and opened. Refused with nothing created for a
 * name that is no folder name or that something in `location` already holds; the runtime's refusal in its own words.
 */
export const createNewProject = Effect.fn("createNewProject")(function* (name: string, location: string) {
  const projectDirectory = yield* newProjectDirectoryFor(name, location);
  const queued = yield* createProject(projectDirectory);
  const folder = yield* realFolderOf(queued.project_directory);
  yield* openAndRememberTheFolder(folder, "the_runtime_opens_the_new_project_itself");
  return { folder, project_creation: queued } satisfies ChosenProjectFolder;
});

/** `folder`, one of the recent projects, opened and put first among them; refused for any other folder, and in words when it could not be remembered, though it opens. */
export const openRecentProject = Effect.fn("openRecentProject")(function* (folder: string) {
  yield* oneOfTheRecentFolders(folder);
  yield* openAndRememberTheFolder(folder);
});

/** The recent projects, recent first, each with its project's name, description and last edit as the runtime reads them now, `null` where it could not. */
export const readRecentProjects: Effect.Effect<RecentProject[], never, RecentProjects | RuntimeControl> = Effect.gen(function* () {
  const recentFolders = yield* (yield* RecentProjects).readRecentFolders;
  return yield* Effect.forEach(
    recentFolders,
    ({ folder, opened_at_wall_clock_ms }) =>
      Effect.result(summarizeTheProject(folder)).pipe(
        Effect.map((summary): RecentProject => {
          const summarized = Result.isSuccess(summary) ? summary.success : null;
          return {
            folder,
            project_name: summarized?.name ?? null,
            project_description: summarized?.description ?? null,
            last_edited_at_wall_clock_ms: summarized?.last_edited_at_wall_clock_ms ?? null,
            has_a_chosen_cover: summarized !== null && summarized.cover_path !== null && projectCoverImageMediaTypeOf(summarized.cover_path) !== undefined,
            last_opened_at_wall_clock_ms: opened_at_wall_clock_ms,
          };
        }),
      ),
    { concurrency: "unbounded" },
  );
});

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

  /** `folder` as the folder of the project as last read or of one of its imports, or why it is not one. */
  projectFolderOfTheOpenProject(folder: string): PlainResult<string, string> {
    return projectFolderOfTheOpenProject(this.lastReading, folder);
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
