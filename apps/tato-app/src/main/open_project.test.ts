import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { OpenProjectReading, ProjectCreationQueued, ProjectFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import {
  OPEN_PROJECT_REREAD_QUIET_MS,
  OpenProjectOfAStudioWindow,
  ProjectOpening,
  readTheProjectIn,
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

/** Writes the `tatolab-project.json` the fake runtime names a project by. */
async function writeAProject(folder: string, name: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "tatolab-project.json"), JSON.stringify({ project: `uuid-of-${name}`, name }));
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
async function anOpenProject(options: { dialogAnswers: string | null; recentFolders?: RecentProjectFolderOpened[]; creationRefusal?: string }) {
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
  const projectOpening = new ProjectOpening({
    homeDirectory: await aFolder(),
    documentsDirectory,
    projectFolderDialog: async (purpose, defaultFolder) => {
      dialogsAsked.push({ purpose, defaultFolder });
      return succeeded(options.dialogAnswers);
    },
    recentProjectFolders: {
      readRecentFolders: async () => recentFolders,
      rememberOpened: async (folder, openedAtWallClockMs) => {
        recentFolders = [{ folder, opened_at_wall_clock_ms: openedAtWallClockMs }, ...recentFolders.filter((recentFolder) => recentFolder.folder !== folder)];
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
    { folder: studioFolder, project_name: "studio", last_opened_at_wall_clock_ms: 200 },
    { folder: goneFolder, project_name: null, last_opened_at_wall_clock_ms: 100 },
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
