import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { OpenProjectReading, ProjectCreationQueued, ProjectFolderChosenFor, StreamActionFollowed } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import {
  OPEN_PROJECT_REREAD_QUIET_MS,
  OpenProjectOfAStudioWindow,
  PROJECT_DELETION_FOLLOW_INTERVAL_MS,
  PROJECT_DELETION_LONGEST_WAIT_MS,
  ProjectOpening,
  readTheProjectIn,
  type ProjectChangesThroughTheRuntime,
  type ProjectFolderDialogPurpose,
  type ProjectReadingsOfTheRuntime,
  type RecentProjectFolderOpened,
} from "./open_project.js";
import { failedWith, succeeded, type Result } from "./result.js";

const foldersMade: string[] = [];

afterEach(async () => {
  for (const folder of foldersMade.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function aFolder(): Promise<string> {
  const folder = await realpath(await mkdtemp(path.join(os.tmpdir(), "tatolab-open-project-")));
  foldersMade.push(folder);
  return folder;
}

/** Writes the `tatolab-project.json` the fake runtime names a project by, with the description and last edit, in seconds, its `list_assets` serves. */
async function writeAProject(folder: string, name: string, cardFacts: { description?: string; edited_at_seconds?: number } = {}): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "tatolab-project.json"), JSON.stringify({ project: `uuid-of-${name}`, name, ...cardFacts }));
}

/** A fake `tatolab-project.json`: the project's settings, and the path of each media asset it holds, by its UUID. */
interface FakeProjectFile {
  project: string;
  name: string;
  description?: string;
  edited_at_seconds?: number;
  cover?: string;
  asset_paths?: Record<string, string>;
}

async function readAProjectFile(folder: string): Promise<FakeProjectFile | null> {
  try {
    const projectFile: unknown = JSON.parse(await readFile(path.join(folder, "tatolab-project.json"), "utf8"));
    if (typeof projectFile !== "object" || projectFile === null || !("project" in projectFile) || !("name" in projectFile)) return null;
    const description = "description" in projectFile && typeof projectFile.description === "string" ? projectFile.description : undefined;
    const editedAtSeconds = "edited_at_seconds" in projectFile && typeof projectFile.edited_at_seconds === "number" ? projectFile.edited_at_seconds : undefined;
    const cover = "cover" in projectFile && typeof projectFile.cover === "string" ? projectFile.cover : undefined;
    const assetPaths: Record<string, string> = {};
    if ("asset_paths" in projectFile && typeof projectFile.asset_paths === "object" && projectFile.asset_paths !== null) {
      for (const [asset, assetPath] of Object.entries(projectFile.asset_paths)) if (typeof assetPath === "string") assetPaths[asset] = assetPath;
    }
    return { project: String(projectFile.project), name: String(projectFile.name), description, edited_at_seconds: editedAtSeconds, cover, asset_paths: assetPaths };
  } catch {
    return null;
  }
}

async function writeAProjectFile(folder: string, projectFile: FakeProjectFile): Promise<void> {
  await writeFile(path.join(folder, "tatolab-project.json"), JSON.stringify(projectFile));
}

function aRefusalOfTheRuntime(failureDescription: string): { ok: false; failure: LocalApiRequestFailure } {
  return failedWith({ failureDescription, isTheRuntimesRefusal: true });
}

/** The words of a `.zip` the fake runtime's `import_project` refuses, as the real one does a zip holding no project. */
const THE_FAKE_RUNTIMES_REFUSAL_OF_A_ZIP_HOLDING_NO_PROJECT = "import_project failed: the zip holds no tatolab-project.json";

/**
 * A runtime that changes projects on disk as its project verbs do: `rename_project` rewrites the name, `duplicate_project` copies the folder under a new
 * UUID and `<name> copy`, `import_project` unpacks a fake `.zip` (a JSON file naming the project), and `delete_project` queues an action that walks the
 * states `deletionStates` gives, the folder gone once it reaches `done`.
 */
function aFakeRuntimeChangingProjects(options: { deletionStates: readonly StreamActionFollowed[] }) {
  const deletionsQueued: string[] = [];
  const assetsImported: Array<{ projectDirectory: string; source: string; assetPath: string }> = [];
  let describedDeletions = 0;
  const deletionStatesLeft = [...options.deletionStates];
  const projectChanges: ProjectChangesThroughTheRuntime = {
    summarizeTheProject: async (projectDirectory) => {
      const projectFile = await readAProjectFile(projectDirectory);
      if (projectFile === null) return aRefusalOfTheRuntime(refusalOfAFolderHoldingNoProject(projectDirectory));
      return succeeded({
        folder: projectDirectory,
        project: projectFile.project,
        name: projectFile.name,
        description: projectFile.description ?? null,
        last_edited_at_wall_clock_ms: projectFile.edited_at_seconds === undefined ? null : projectFile.edited_at_seconds * 1000,
        cover_path: projectFile.cover === undefined ? null : (projectFile.asset_paths?.[projectFile.cover] ?? null),
      });
    },
    setProjectDescription: async (projectDirectory, description) => {
      const projectFile = await readAProjectFile(projectDirectory);
      if (projectFile === null) return aRefusalOfTheRuntime(refusalOfAFolderHoldingNoProject(projectDirectory));
      await writeAProjectFile(projectDirectory, { ...projectFile, description: description ?? undefined });
      return succeeded({ name: projectFile.name, description, cover: projectFile.cover ?? null });
    },
    setProjectCover: async (projectDirectory, cover) => {
      const projectFile = await readAProjectFile(projectDirectory);
      if (projectFile === null) return aRefusalOfTheRuntime(refusalOfAFolderHoldingNoProject(projectDirectory));
      if (cover !== null && projectFile.asset_paths?.[cover] === undefined) return aRefusalOfTheRuntime(`set_project_cover failed: the project holds no asset ${cover}`);
      await writeAProjectFile(projectDirectory, { ...projectFile, cover: cover ?? undefined });
      return succeeded({ name: projectFile.name, description: projectFile.description ?? null, cover });
    },
    importAsset: async (projectDirectory, source, assetPath) => {
      const projectFile = await readAProjectFile(projectDirectory);
      if (projectFile === null) return aRefusalOfTheRuntime(refusalOfAFolderHoldingNoProject(projectDirectory));
      if (Object.values(projectFile.asset_paths ?? {}).includes(assetPath)) return aRefusalOfTheRuntime(`import_asset failed: the project already holds ${assetPath}`);
      await mkdir(path.dirname(path.join(projectDirectory, assetPath)), { recursive: true });
      await cp(source, path.join(projectDirectory, assetPath));
      const asset = `uuid-of-asset-${assetPath}`;
      assetsImported.push({ projectDirectory, source, assetPath });
      await writeAProjectFile(projectDirectory, { ...projectFile, asset_paths: { ...projectFile.asset_paths, [asset]: assetPath } });
      return succeeded({ asset, path: assetPath });
    },
    readProjectFile: async (projectDirectory, filePath) => {
      try {
        return succeeded(await readFile(path.join(projectDirectory, filePath)));
      } catch {
        return aRefusalOfTheRuntime(`read_project_file failed: ${projectDirectory} holds no ${filePath}`);
      }
    },
    renameProject: async (projectDirectory, name) => {
      const projectFile = await readAProjectFile(projectDirectory);
      if (projectFile === null) return aRefusalOfTheRuntime(refusalOfAFolderHoldingNoProject(projectDirectory));
      await writeFile(path.join(projectDirectory, "tatolab-project.json"), JSON.stringify({ ...projectFile, name }));
      return succeeded(name);
    },
    duplicateProject: async (projectDirectory, into) => {
      const projectFile = await readAProjectFile(projectDirectory);
      if (projectFile === null) return aRefusalOfTheRuntime(refusalOfAFolderHoldingNoProject(projectDirectory));
      await cp(projectDirectory, into, { recursive: true, errorOnExist: true, force: false });
      const duplicate = { ...projectFile, project: `uuid-of-a-copy-of-${projectFile.name}`, name: `${projectFile.name} copy` };
      await writeFile(path.join(into, "tatolab-project.json"), JSON.stringify(duplicate));
      return succeeded({ folder: into, project: duplicate.project, name: duplicate.name });
    },
    deleteProject: async (projectDirectory) => {
      if ((await readAProjectFile(projectDirectory)) === null) return aRefusalOfTheRuntime(refusalOfAFolderHoldingNoProject(projectDirectory));
      deletionsQueued.push(projectDirectory);
      return succeeded(`deletion-${deletionsQueued.length}`);
    },
    describeStreamAction: async (action) => {
      describedDeletions += 1;
      const followed = deletionStatesLeft.length > 1 ? deletionStatesLeft.shift() : deletionStatesLeft[0];
      if (followed === undefined) return aRefusalOfTheRuntime(`no state scripted for ${action}`);
      if (followed.kind === "described" && followed.description.state === "done") await rm(followed.description.project_directory, { recursive: true, force: true });
      return succeeded(followed);
    },
    importProject: async (source, projectDirectory) => {
      const archive: unknown = JSON.parse(await readFile(source, "utf8"));
      if (typeof archive !== "object" || archive === null || !("name" in archive)) return aRefusalOfTheRuntime(THE_FAKE_RUNTIMES_REFUSAL_OF_A_ZIP_HOLDING_NO_PROJECT);
      await writeAProject(projectDirectory, String(archive.name));
      return succeeded({ folder: projectDirectory, project: `uuid-of-${String(archive.name)}`, name: String(archive.name) });
    },
  };
  return { projectChanges, deletionsQueued, assetsImported, describedDeletions: () => describedDeletions };
}

/** The deletion of `projectDirectory` as `describe_stream_action` describes it in `state`. */
function aDeletionIn(projectDirectory: string, state: string, failedBecause: string | null = null): StreamActionFollowed {
  return { kind: "described", description: { action: "deletion-1", project_directory: projectDirectory, kind: "delete", state, step: null, streams: [], failed_because: failedBecause } };
}

function refusalOfAFolderHoldingNoProject(folder: string): string {
  return `list_assets failed: ${folder} holds no project: it has no tatolab-project.json`;
}

/** A runtime that names a project from its folder's `tatolab-project.json`, as `list_assets` does, and lists the imports in `importFolders()`, or answers none. */
function aFakeRuntime(importFolders: () => readonly string[] | null): ProjectReadingsOfTheRuntime {
  return {
    nameTheProject: async (projectFolder) => {
      try {
        const projectFile: unknown = JSON.parse(await readFile(path.join(projectFolder, "tatolab-project.json"), "utf8"));
        if (typeof projectFile !== "object" || projectFile === null || !("project" in projectFile) || !("name" in projectFile)) return failedWith("not a project file");
        return succeeded({ folder: projectFolder, project: String(projectFile.project), name: String(projectFile.name) });
      } catch {
        return failedWith(refusalOfAFolderHoldingNoProject(projectFolder));
      }
    },
    listTheDependencies: async () => {
      const folders = importFolders();
      if (folders === null) return failedWith("no runtime answers at /tmp/local-api.sock");
      return succeeded(
        folders.map((folder) => ({
          dependency: { project: `uuid-of-${folder}`, folder, source: `/shows/${folder}`, version: "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82" },
          edited_files: [],
          newer_version_exists: null,
          check_refused_because: null,
        })),
      );
    },
  };
}

test("an open project is named by the runtime, and each import the runtime lists is named from its copy under imports/", async () => {
  const projectFolder = await aFolder();
  await writeAProject(projectFolder, "studio");
  await writeAProject(path.join(projectFolder, "imports/hall-of-light"), "Hall of Light");

  const reading = await readTheProjectIn(projectFolder, aFakeRuntime(() => ["hall-of-light", "stage-lights"]));

  expect(reading).toEqual({
    kind: "read",
    open_project: {
      project: { folder: projectFolder, project: "uuid-of-studio", name: "studio" },
      imports: [
        {
          project: "uuid-of-hall-of-light",
          name: "Hall of Light",
          folder: "hall-of-light",
          source: { kind: "folder", project: { folder: path.join(projectFolder, "imports/hall-of-light"), project: "uuid-of-Hall of Light", name: "Hall of Light" } },
        },
        {
          project: "uuid-of-stage-lights",
          name: "stage-lights",
          folder: "stage-lights",
          source: { kind: "folder_unreadable", folder: path.join(projectFolder, "imports/stage-lights"), refusal: refusalOfAFolderHoldingNoProject(path.join(projectFolder, "imports/stage-lights")) },
        },
      ],
      imports_not_listed_because: null,
    },
  } satisfies OpenProjectReading);
});

test("an open project whose imports the runtime does not list says why, and lists none", async () => {
  const projectFolder = await aFolder();
  await writeAProject(projectFolder, "studio");

  expect(await readTheProjectIn(projectFolder, aFakeRuntime(() => null))).toEqual({
    kind: "read",
    open_project: { project: { folder: projectFolder, project: "uuid-of-studio", name: "studio" }, imports: [], imports_not_listed_because: "no runtime answers at /tmp/local-api.sock" },
  });
});

test("a folder the runtime names no project in is unreadable, in the runtime's words", async () => {
  const notAProjectFolder = await aFolder();
  expect(await readTheProjectIn(notAProjectFolder, aFakeRuntime(() => []))).toEqual({ kind: "unreadable", folder: notAProjectFolder, refusal: refusalOfAFolderHoldingNoProject(notAProjectFolder) });
});

/** An open project over a scripted dialog, a Documents folder of its own, recent projects in memory, a wall clock the test sets, a runtime that creates projects on disk, watches the test fires by hand, and timers it runs by hand. */
async function anOpenProject(options: {
  dialogAnswers: string | null;
  archiveDialogAnswers?: string | null;
  coverImageDialogAnswers?: string | null;
  recentFolders?: RecentProjectFolderOpened[];
  creationRefusal?: string;
  deletionStates?: readonly StreamActionFollowed[];
}) {
  const sentReadings: OpenProjectReading[] = [];
  const dialogsAsked: Array<{ purpose: ProjectFolderDialogPurpose; defaultFolder: string }> = [];
  const projectDirectoriesCreated: string[] = [];
  const documentsDirectory = path.join(await aFolder(), "Documents");
  const watchedFolders = new Map<string, () => void>();
  let importFoldersTheRuntimeLists: string[] = [];
  const fakeRuntime = aFakeRuntime(() => importFoldersTheRuntimeLists);
  const pendingTimers: Array<() => void> = [];
  let recentFolders = options.recentFolders ?? [];
  let wallClockNowMs = 1_790_000_000_000;
  let projectOpenedLast: OpenProjectOfAStudioWindow | null = null;
  const studioWindowsClosed: string[] = [];
  const waitsMs: number[] = [];
  const archiveDialogsAsked: string[] = [];
  const coverImageDialogsAsked: string[] = [];
  let monotonicClockMs = 0;
  const { projectChanges, deletionsQueued, assetsImported, describedDeletions } = aFakeRuntimeChangingProjects({ deletionStates: options.deletionStates ?? [] });
  const homeDirectory = await aFolder();
  const projectOpening = new ProjectOpening({
    homeDirectory,
    documentsDirectory,
    projectFolderDialog: async (purpose, defaultFolder) => {
      dialogsAsked.push({ purpose, defaultFolder });
      return succeeded(options.dialogAnswers);
    },
    projectArchiveDialog: async (defaultFolder) => {
      archiveDialogsAsked.push(defaultFolder);
      return succeeded(options.archiveDialogAnswers ?? null);
    },
    projectCoverImageDialog: async (defaultFolder) => {
      coverImageDialogsAsked.push(defaultFolder);
      return succeeded(options.coverImageDialogAnswers ?? null);
    },
    recentProjectFolders: {
      readRecentFolders: async () => recentFolders,
      rememberOpened: async (folder, openedAtWallClockMs) => {
        recentFolders = [{ folder, opened_at_wall_clock_ms: openedAtWallClockMs }, ...recentFolders.filter((recentFolder) => recentFolder.folder !== folder)];
        return succeeded(undefined);
      },
      forget: async (folder) => {
        recentFolders = recentFolders.filter((recentFolder) => recentFolder.folder !== folder);
        return succeeded(undefined);
      },
    },
    readWallClockNowMs: () => wallClockNowMs,
    newProjectCreation: {
      createProject: async (projectDirectory): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> => {
        if (options.creationRefusal !== undefined) return failedWith({ failureDescription: options.creationRefusal, isTheRuntimesRefusal: true });
        projectDirectoriesCreated.push(projectDirectory ?? "");
        await writeAProject(projectDirectory ?? "", "fresh");
        return succeeded({ action: "action-1", stream: "fresh-main-0a1b2c", project_directory: projectDirectory ?? "" });
      },
    },
    projectReadingsOfTheRuntime: fakeRuntime,
    projectChanges,
    waitFor: async (delayMs) => {
      waitsMs.push(delayMs);
      monotonicClockMs += delayMs;
    },
    readMonotonicClockMs: () => monotonicClockMs,
    closeTheStudioWindowOf: (folder) => {
      studioWindowsClosed.push(folder);
      if (projectOpenedLast?.projectFolder !== folder) return;
      projectOpenedLast.stopWatching();
      projectOpenedLast = null;
    },
    openTheProjectInItsStudioWindow: async (folder) => {
      projectOpenedLast?.stopWatching();
      projectOpenedLast = new OpenProjectOfAStudioWindow(folder, {
        watchFolderEntries: (watchedFolder, onChange) => {
          watchedFolders.set(watchedFolder, onChange);
          return () => watchedFolders.delete(watchedFolder);
        },
        runAfter: (delayMs, work) => {
          expect(delayMs).toBe(OPEN_PROJECT_REREAD_QUIET_MS);
          pendingTimers.push(work);
          return () => pendingTimers.splice(pendingTimers.indexOf(work), 1);
        },
        sendTheWindowTheOpenProject: (reading) => sentReadings.push(reading),
        projectReadingsOfTheRuntime: fakeRuntime,
      });
      await projectOpenedLast.readAndWatch();
    },
  });
  // Opening from the studio window of the project opened last, as the person would after opening one.
  const openProject = {
    chooseProjectFolder: (chosenFor: ProjectFolderChosenFor) => projectOpening.chooseProjectFolder(chosenFor, projectOpenedLast?.projectFolder ?? null),
    readNewProjectDefaults: () => projectOpening.readNewProjectDefaults(),
    chooseNewProjectLocation: (startingAt: string) => projectOpening.chooseNewProjectLocation(startingAt),
    createNewProject: (name: string, location: string) => projectOpening.createNewProject(name, location),
    openRecentProject: (folder: string) => projectOpening.openRecentProject(folder),
    readRecentProjects: () => projectOpening.readRecentProjects(),
    renameRecentProject: (folder: string, name: string) => projectOpening.renameRecentProject(folder, name),
    duplicateRecentProject: (folder: string) => projectOpening.duplicateRecentProject(folder),
    deleteRecentProject: (folder: string) => projectOpening.deleteRecentProject(folder),
    chooseProjectArchiveToImport: () => projectOpening.chooseProjectArchiveToImport(),
    importProjectArchive: (archive: string, name: string, location: string) => projectOpening.importProjectArchive(archive, name, location),
    readRecentProjectCover: (folder: string) => projectOpening.readRecentProjectCover(folder),
    setRecentProjectDescription: (folder: string, description: string) => projectOpening.setRecentProjectDescription(folder, description),
    chooseProjectCoverImage: () => projectOpening.chooseProjectCoverImage(),
    setRecentProjectCover: (folder: string, image: string | null) => projectOpening.setRecentProjectCover(folder, image),
    readOpenProject: (): OpenProjectReading => projectOpenedLast?.readOpenProject() ?? { kind: "none_open" },
  };
  return {
    openProject,
    documentsDirectory,
    sentReadings,
    dialogsAsked,
    projectDirectoriesCreated,
    watchedFolders,
    setTheImportsTheRuntimeLists: (folders: string[]) => {
      importFoldersTheRuntimeLists = folders;
    },
    pendingTimers,
    homeDirectory,
    archiveDialogsAsked,
    coverImageDialogsAsked,
    assetsImported,
    deletionsQueued,
    describedDeletions,
    studioWindowsClosed,
    waitsMs,
    recentFolders: () => recentFolders.map((recentFolder) => recentFolder.folder),
    rememberedFolder: () => recentFolders[0]?.folder ?? null,
    setTheWallClock: (nowMs: number) => {
      wallClockNowMs = nowMs;
    },
  };
}

test("no project is open at launch, even with recent ones, until one is chosen, and a cancelled dialog opens none", async () => {
  const { openProject, sentReadings } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: "/somewhere/opened-before", opened_at_wall_clock_ms: 1 }] });
  expect(openProject.readOpenProject()).toEqual({ kind: "none_open" });
  expect(await openProject.chooseProjectFolder("project_to_open")).toEqual(succeeded(null));
  expect(sentReadings).toEqual([]);
});

test("a chosen project opens, is sent to the window, is remembered, and is read again once its folder goes quiet after a change", async () => {
  const projectFolder = await aFolder();
  await writeAProject(projectFolder, "studio");
  const { openProject, sentReadings, dialogsAsked, watchedFolders, pendingTimers, rememberedFolder, setTheImportsTheRuntimeLists } = await anOpenProject({ dialogAnswers: projectFolder });

  expect(await openProject.chooseProjectFolder("project_to_open")).toEqual(succeeded({ folder: projectFolder, project_creation: null }));
  expect(dialogsAsked.map((dialogAsked) => dialogAsked.purpose)).toEqual(["project_to_open"]);
  expect(rememberedFolder()).toBe(projectFolder);
  expect(sentReadings.map((reading) => reading.kind === "read" && reading.open_project.project.name)).toEqual(["studio"]);
  expect([...watchedFolders.keys()]).toEqual([projectFolder, path.join(projectFolder, "imports")]);

  await writeAProject(path.join(projectFolder, "imports/camera"), "tatolab-camera");
  setTheImportsTheRuntimeLists(["camera"]);
  watchedFolders.get(projectFolder)?.();
  watchedFolders.get(projectFolder)?.();
  expect(pendingTimers).toHaveLength(1);
  pendingTimers[0]?.();
  await expect.poll(() => sentReadings.length).toBe(2);
  expect(openProject.readOpenProject()).toMatchObject({ kind: "read", open_project: { imports: [{ name: "tatolab-camera", folder: "camera" }] } });
  expect([...watchedFolders.keys()]).toEqual([projectFolder, path.join(projectFolder, "imports"), path.join(projectFolder, "imports/camera")]);
});

test("a new project is suggested in Documents/Tato Studio, numbered past the names already taken there", async () => {
  const { openProject, documentsDirectory } = await anOpenProject({ dialogAnswers: null });
  const tatoStudioFolder = path.join(documentsDirectory, "Tato Studio");
  expect(await openProject.readNewProjectDefaults()).toEqual({ location: tatoStudioFolder, name: "Untitled project" });

  await mkdir(path.join(tatoStudioFolder, "Untitled project"), { recursive: true });
  await writeFile(path.join(tatoStudioFolder, "Untitled project 2"), "");
  expect(await openProject.readNewProjectDefaults()).toEqual({ location: tatoStudioFolder, name: "Untitled project 3" });
});

test("Browse… opens the folder dialog where the sheet's location is, or at the default for a location that is no full path", async () => {
  const { openProject, documentsDirectory, dialogsAsked } = await anOpenProject({ dialogAnswers: "/Volumes/Show/projects" });
  expect(await openProject.chooseNewProjectLocation("/Users/someone/Work")).toEqual(succeeded("/Volumes/Show/projects"));
  expect(await openProject.chooseNewProjectLocation("somewhere relative")).toEqual(succeeded("/Volumes/Show/projects"));
  expect(dialogsAsked).toEqual([
    { purpose: "new_project_location", defaultFolder: "/Users/someone/Work" },
    { purpose: "new_project_location", defaultFolder: path.join(documentsDirectory, "Tato Studio") },
  ]);
  expect(openProject.readOpenProject()).toEqual({ kind: "none_open" });
});

test("a new project is made in its location, which is made when missing, created by the runtime, opened and remembered", async () => {
  const { openProject, documentsDirectory, projectDirectoriesCreated, rememberedFolder } = await anOpenProject({ dialogAnswers: null });
  const location = path.join(documentsDirectory, "Tato Studio");
  const projectFolder = path.join(location, "Night Show");

  expect(await openProject.createNewProject("  Night Show ", location)).toEqual(
    succeeded({ folder: projectFolder, project_creation: { action: "action-1", stream: "fresh-main-0a1b2c", project_directory: projectFolder } }),
  );
  expect(projectDirectoriesCreated).toEqual([projectFolder]);
  expect(rememberedFolder()).toBe(projectFolder);
  expect(openProject.readOpenProject()).toMatchObject({ kind: "read", open_project: { project: { folder: projectFolder, name: "fresh" } } });
});

test("a new project is refused before the runtime is asked for a name that is no folder name, a location that is no full path, or a folder already there", async () => {
  const { openProject, documentsDirectory, projectDirectoriesCreated } = await anOpenProject({ dialogAnswers: null });
  await mkdir(path.join(documentsDirectory, "Taken"), { recursive: true });

  expect(await openProject.createNewProject("   ", documentsDirectory)).toEqual(failedWith("Give the project a name."));
  expect(await openProject.createNewProject("lights/left", documentsDirectory)).toEqual(failedWith("A project's name can't hold a /."));
  expect(await openProject.createNewProject(".hidden", documentsDirectory)).toEqual(failedWith("A project's name can't start with a dot, which hides its folder."));
  expect(await openProject.createNewProject("Show", "Documents")).toEqual(failedWith("Documents is not a full path to a folder."));
  expect(await openProject.createNewProject("Taken", documentsDirectory)).toEqual(
    failedWith(`${path.join(documentsDirectory, "Taken")} already exists. Choose another name or location.`),
  );
  expect(projectDirectoriesCreated).toEqual([]);
  expect(openProject.readOpenProject()).toEqual({ kind: "none_open" });
});

test("a new project the runtime refuses is refused in its own words and opens nothing", async () => {
  const refused = await anOpenProject({ dialogAnswers: null, creationRefusal: "the folder already holds a project" });
  expect(await refused.openProject.createNewProject("Night Show", refused.documentsDirectory)).toEqual(failedWith("the folder already holds a project"));
  expect(refused.openProject.readOpenProject()).toEqual({ kind: "none_open" });
  expect(refused.rememberedFolder()).toBeNull();
});

test("a recent project opens, moves first, and one that is gone reads as unreadable, watched from its parent", async () => {
  const parentFolder = await aFolder();
  const goneFolder = path.join(parentFolder, "gone");
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject, watchedFolders, setTheWallClock } = await anOpenProject({
    dialogAnswers: null,
    recentFolders: [
      { folder: studioFolder, opened_at_wall_clock_ms: 200 },
      { folder: goneFolder, opened_at_wall_clock_ms: 100 },
    ],
  });
  expect(await openProject.readRecentProjects()).toEqual([
    { folder: studioFolder, project_name: "studio", project_description: null, last_edited_at_wall_clock_ms: null, has_a_chosen_cover: false, last_opened_at_wall_clock_ms: 200 },
    { folder: goneFolder, project_name: null, project_description: null, last_edited_at_wall_clock_ms: null, has_a_chosen_cover: false, last_opened_at_wall_clock_ms: 100 },
  ]);

  setTheWallClock(300);
  expect(await openProject.openRecentProject(goneFolder)).toEqual(succeeded(undefined));
  expect(openProject.readOpenProject()).toEqual({ kind: "unreadable", folder: goneFolder, refusal: refusalOfAFolderHoldingNoProject(goneFolder) });
  expect([...watchedFolders.keys()]).toEqual([goneFolder, parentFolder]);
  expect((await openProject.readRecentProjects()).map(({ folder, last_opened_at_wall_clock_ms }) => [folder, last_opened_at_wall_clock_ms])).toEqual([
    [goneFolder, 300],
    [studioFolder, 200],
  ]);
});

test("a folder that is not a recent project is refused, and the open project stays as it was", async () => {
  const { openProject } = await anOpenProject({ dialogAnswers: null });
  expect(await openProject.openRecentProject("/etc")).toEqual(failedWith("/etc is not one of the recent projects."));
  expect(openProject.readOpenProject()).toEqual({ kind: "none_open" });
});

test("a project opened before the runtime answers says so, and reads again once asked as the runtime starts answering", async () => {
  const projectFolder = await aFolder();
  await writeAProject(projectFolder, "studio");
  let theRuntimeAnswers = false;
  const answeringRuntime = aFakeRuntime(() => []);
  const sentReadings: OpenProjectReading[] = [];
  const openProject = new OpenProjectOfAStudioWindow(projectFolder, {
    watchFolderEntries: () => null,
    runAfter: () => () => {},
    sendTheWindowTheOpenProject: (reading) => sentReadings.push(reading),
    projectReadingsOfTheRuntime: {
      nameTheProject: (folder) => (theRuntimeAnswers ? answeringRuntime.nameTheProject(folder) : Promise.resolve(failedWith("Tato Studio has not reached the runtime yet."))),
      listTheDependencies: answeringRuntime.listTheDependencies,
    },
  });

  await openProject.readAndWatch();
  theRuntimeAnswers = true;
  await openProject.readAgain();

  expect(sentReadings).toEqual([
    { kind: "unreadable", folder: projectFolder, refusal: "Tato Studio has not reached the runtime yet." },
    { kind: "read", open_project: { project: { folder: projectFolder, project: "uuid-of-studio", name: "studio" }, imports: [], imports_not_listed_because: null } },
  ]);
  openProject.stopWatching();
  await openProject.readAgain();
  expect(sentReadings).toHaveLength(2);
});

test("a recent project's card reads its description and its last edit, in milliseconds, from the runtime", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio", { description: "A test pattern through a halftone effect.", edited_at_seconds: 1_790_000_100 });
  const { openProject } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }] });
  expect(await openProject.readRecentProjects()).toEqual([
    {
      folder: studioFolder,
      project_name: "studio",
      project_description: "A test pattern through a halftone effect.",
      last_edited_at_wall_clock_ms: 1_790_000_100_000,
      has_a_chosen_cover: false,
      last_opened_at_wall_clock_ms: 200,
    },
  ]);
});

test("a recent project is renamed through the runtime, its folder kept; a blank name and a folder not among the recent projects are refused before the runtime is asked", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }] });

  expect(await openProject.renameRecentProject(studioFolder, "  Night Show  ")).toEqual(succeeded(undefined));
  expect(await openProject.readRecentProjects()).toMatchObject([{ folder: studioFolder, project_name: "Night Show" }]);
  expect(await openProject.renameRecentProject(studioFolder, "   ")).toEqual(failedWith("Give the project a name."));
  expect(await openProject.renameRecentProject("/etc", "Night Show")).toEqual(failedWith("/etc is not one of the recent projects."));
  expect(await openProject.readRecentProjects()).toMatchObject([{ project_name: "Night Show" }]);
});

test("a recent project is described through the runtime, trimmed, and a blank description clears it; a folder not among the recent projects is refused", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }] });

  expect(await openProject.setRecentProjectDescription(studioFolder, "  Projection for the night market.  ")).toEqual(succeeded(undefined));
  expect(await openProject.readRecentProjects()).toMatchObject([{ project_description: "Projection for the night market." }]);
  expect(await openProject.setRecentProjectDescription(studioFolder, "   ")).toEqual(succeeded(undefined));
  expect(await openProject.readRecentProjects()).toMatchObject([{ project_description: null }]);
  expect(await openProject.setRecentProjectDescription("/etc", "a show")).toEqual(failedWith("/etc is not one of the recent projects."));
});

test("a cover image is asked for in the dialog opened at home, and a cancel answers null", async () => {
  const { openProject, coverImageDialogsAsked, homeDirectory } = await anOpenProject({ dialogAnswers: null, coverImageDialogAnswers: "/pictures/poster.png" });
  expect(await openProject.chooseProjectCoverImage()).toEqual(succeeded("/pictures/poster.png"));
  expect(coverImageDialogsAsked).toEqual([homeDirectory]);
  const cancelled = await anOpenProject({ dialogAnswers: null });
  expect(await cancelled.openProject.chooseProjectCoverImage()).toEqual(succeeded(null));
});

test("a recent project is covered by an image the runtime imports into media/ under its own name, numbered past one already there, and read back as a data URL", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const picturesFolder = await aFolder();
  const poster = path.join(picturesFolder, "Poster.PNG");
  await writeFile(poster, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await mkdir(path.join(studioFolder, "media"));
  await writeFile(path.join(studioFolder, "media/Poster.PNG"), "someone else's poster");
  const { openProject, assetsImported } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }] });

  expect(await openProject.readRecentProjects()).toMatchObject([{ has_a_chosen_cover: false }]);
  expect(await openProject.readRecentProjectCover(studioFolder)).toEqual(succeeded(null));
  expect(await openProject.setRecentProjectCover(studioFolder, poster)).toEqual(succeeded(undefined));
  expect(assetsImported).toEqual([{ projectDirectory: studioFolder, source: poster, assetPath: "media/Poster 2.PNG" }]);
  expect(await openProject.readRecentProjects()).toMatchObject([{ has_a_chosen_cover: true }]);
  expect(await openProject.readRecentProjectCover(studioFolder)).toEqual(succeeded("data:image/png;base64,iVBORw=="));

  expect(await openProject.setRecentProjectCover(studioFolder, null)).toEqual(succeeded(undefined));
  expect(await openProject.readRecentProjects()).toMatchObject([{ has_a_chosen_cover: false }]);
  expect(await openProject.readRecentProjectCover(studioFolder)).toEqual(succeeded(null));
});

test("a cover that is no image a window shows, a relative path, or a folder not among the recent projects is refused before the runtime is asked", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject, assetsImported } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }] });

  expect(await openProject.setRecentProjectCover(studioFolder, "/pictures/poster.tiff")).toEqual(failedWith("poster.tiff is not a PNG, JPEG, WebP or GIF image."));
  expect(await openProject.setRecentProjectCover(studioFolder, "poster.png")).toEqual(failedWith("poster.png is not a full path to an image."));
  expect(await openProject.setRecentProjectCover("/etc", "/pictures/poster.png")).toEqual(failedWith("/etc is not one of the recent projects."));
  expect(await openProject.readRecentProjectCover("/etc")).toEqual(failedWith("/etc is not one of the recent projects."));
  expect(assetsImported).toEqual([]);
});

test("a recent project is duplicated beside itself into the first free `<folder> copy`, put first among the recent projects and left unopened", async () => {
  const parentFolder = await aFolder();
  const studioFolder = path.join(parentFolder, "studio");
  await writeAProject(studioFolder, "studio");
  await mkdir(path.join(parentFolder, "studio copy"));
  const { openProject, recentFolders, setTheWallClock } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }] });
  setTheWallClock(500);

  const duplicateFolder = path.join(parentFolder, "studio copy 2");
  expect(await openProject.duplicateRecentProject(studioFolder)).toEqual(succeeded(duplicateFolder));
  expect(recentFolders()).toEqual([duplicateFolder, studioFolder]);
  expect(await openProject.readRecentProjects()).toMatchObject([
    { folder: duplicateFolder, project_name: "studio copy", last_opened_at_wall_clock_ms: 500 },
    { folder: studioFolder, project_name: "studio" },
  ]);
  expect(openProject.readOpenProject()).toEqual({ kind: "none_open" });
  expect(await openProject.duplicateRecentProject("/etc")).toEqual(failedWith("/etc is not one of the recent projects."));
});

test("a recent project the runtime cannot duplicate is refused in its own words and nothing is remembered", async () => {
  const goneFolder = path.join(await aFolder(), "gone");
  const { openProject, recentFolders } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: goneFolder, opened_at_wall_clock_ms: 200 }] });
  expect(await openProject.duplicateRecentProject(goneFolder)).toEqual(failedWith(refusalOfAFolderHoldingNoProject(goneFolder)));
  expect(recentFolders()).toEqual([goneFolder]);
});

test("a deleted recent project is followed until the runtime has moved it to the Trash, then its studio window closes and it is forgotten", async () => {
  const studioFolder = await aFolder();
  const otherFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject, deletionsQueued, studioWindowsClosed, waitsMs, recentFolders } = await anOpenProject({
    dialogAnswers: null,
    recentFolders: [
      { folder: studioFolder, opened_at_wall_clock_ms: 200 },
      { folder: otherFolder, opened_at_wall_clock_ms: 100 },
    ],
    deletionStates: [aDeletionIn(studioFolder, "queued"), aDeletionIn(studioFolder, "in_progress"), aDeletionIn(studioFolder, "done")],
  });
  await openProject.openRecentProject(studioFolder);

  expect(await openProject.deleteRecentProject(studioFolder)).toEqual(succeeded(undefined));
  expect(deletionsQueued).toEqual([studioFolder]);
  expect(waitsMs).toEqual([PROJECT_DELETION_FOLLOW_INTERVAL_MS, PROJECT_DELETION_FOLLOW_INTERVAL_MS]);
  expect(studioWindowsClosed).toEqual([studioFolder]);
  expect(recentFolders()).toEqual([otherFolder]);
  expect(openProject.readOpenProject()).toEqual({ kind: "none_open" });
});

test("a deletion that fails, is cancelled or is no longer held is refused in the runtime's words, and the project stays among the recent projects with its window open", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const recentFolders = [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }];
  const notHeld: StreamActionFollowed = { kind: "not_held", words: "describe_stream_action failed: no action deletion-1" };
  const refusalsOfEachEnd = [
    { deletionStates: [aDeletionIn(studioFolder, "failed", "the folder is on another disk than the Trash")], refusal: "the folder is on another disk than the Trash" },
    { deletionStates: [aDeletionIn(studioFolder, "failed")], refusal: `The runtime could not delete ${studioFolder}.` },
    { deletionStates: [aDeletionIn(studioFolder, "cancelled")], refusal: `Deleting ${studioFolder} was cancelled; the project is where it was.` },
    { deletionStates: [notHeld], refusal: notHeld.words },
  ];
  for (const { deletionStates, refusal } of refusalsOfEachEnd) {
    const deleting = await anOpenProject({ dialogAnswers: null, recentFolders, deletionStates });
    expect(await deleting.openProject.deleteRecentProject(studioFolder)).toEqual(failedWith(refusal));
    expect(deleting.recentFolders()).toEqual([studioFolder]);
    expect(deleting.studioWindowsClosed).toEqual([]);
  }
});

test("a deletion still running past the longest wait is refused saying so, and one of a folder not among the recent projects is never queued", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject, waitsMs, deletionsQueued, describedDeletions, recentFolders } = await anOpenProject({
    dialogAnswers: null,
    recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 200 }],
    deletionStates: [aDeletionIn(studioFolder, "in_progress")],
  });
  expect(await openProject.deleteRecentProject("/etc")).toEqual(failedWith("/etc is not one of the recent projects."));
  expect(deletionsQueued).toEqual([]);

  expect(await openProject.deleteRecentProject(studioFolder)).toEqual(failedWith(`The runtime is still deleting ${studioFolder}. Its card stays here, and reads as gone from disk once the folder is in the Trash.`));
  expect(waitsMs.reduce((waitedMs, waitMs) => waitedMs + waitMs, 0)).toBe(PROJECT_DELETION_LONGEST_WAIT_MS + PROJECT_DELETION_FOLLOW_INTERVAL_MS);
  expect(describedDeletions()).toBe(PROJECT_DELETION_LONGEST_WAIT_MS / PROJECT_DELETION_FOLLOW_INTERVAL_MS + 1);
  expect(recentFolders()).toEqual([studioFolder]);
});

test("a project .zip chosen to import suggests Documents/Tato Studio and the zip's own name, numbered past one taken there; a cancelled dialog suggests nothing", async () => {
  const downloadsFolder = await aFolder();
  const archive = path.join(downloadsFolder, "halftone-webcam-main.ZIP");
  const chosen = await anOpenProject({ dialogAnswers: null, archiveDialogAnswers: archive });
  const tatoStudioFolder = path.join(chosen.documentsDirectory, "Tato Studio");
  await mkdir(path.join(tatoStudioFolder, "halftone-webcam-main"), { recursive: true });

  expect(await chosen.openProject.chooseProjectArchiveToImport()).toEqual(succeeded({ archive, location: tatoStudioFolder, name: "halftone-webcam-main 2" }));
  expect(chosen.archiveDialogsAsked).toEqual([chosen.homeDirectory]);

  const cancelled = await anOpenProject({ dialogAnswers: null, archiveDialogAnswers: null });
  expect(await cancelled.openProject.chooseProjectArchiveToImport()).toEqual(succeeded(null));

  const onlyAnExtension = await anOpenProject({ dialogAnswers: null, archiveDialogAnswers: path.join(downloadsFolder, ".zip") });
  expect(await onlyAnExtension.openProject.chooseProjectArchiveToImport()).toMatchObject(succeeded({ name: "Imported project" }));
});

test("a project .zip is imported by the runtime into its location, which is made when missing, then opened and remembered", async () => {
  const archive = path.join(await aFolder(), "pattern.zip");
  await writeFile(archive, JSON.stringify({ name: "Pattern" }));
  const { openProject, documentsDirectory, rememberedFolder } = await anOpenProject({ dialogAnswers: null });
  const location = path.join(documentsDirectory, "Tato Studio");
  const projectFolder = path.join(location, "Pattern show");

  expect(await openProject.importProjectArchive(archive, " Pattern show ", location)).toEqual(succeeded({ folder: projectFolder, project_creation: null }));
  expect(rememberedFolder()).toBe(projectFolder);
  expect(openProject.readOpenProject()).toMatchObject({ kind: "read", open_project: { project: { folder: projectFolder, name: "Pattern" } } });
});

test("a project .zip import is refused before the runtime is asked for a relative zip, a bad name or a folder already there, and in the runtime's words for a zip holding no project", async () => {
  const archive = path.join(await aFolder(), "not-a-project.zip");
  await writeFile(archive, JSON.stringify({ files: [] }));
  const { openProject, documentsDirectory, rememberedFolder } = await anOpenProject({ dialogAnswers: null });
  await mkdir(path.join(documentsDirectory, "Taken"), { recursive: true });

  expect(await openProject.importProjectArchive("pattern.zip", "Show", documentsDirectory)).toEqual(failedWith("pattern.zip is not a full path to a .zip."));
  expect(await openProject.importProjectArchive(archive, "lights/left", documentsDirectory)).toEqual(failedWith("A project's name can't hold a /."));
  expect(await openProject.importProjectArchive(archive, "Taken", documentsDirectory)).toEqual(
    failedWith(`${path.join(documentsDirectory, "Taken")} already exists. Choose another name or location.`),
  );
  expect(await openProject.importProjectArchive(archive, "Show", documentsDirectory)).toEqual(failedWith(THE_FAKE_RUNTIMES_REFUSAL_OF_A_ZIP_HOLDING_NO_PROJECT));
  expect(rememberedFolder()).toBeNull();
  expect(openProject.readOpenProject()).toEqual({ kind: "none_open" });
});
