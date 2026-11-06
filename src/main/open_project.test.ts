import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { OpenProjectReading, ProjectCreationQueued } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { OPEN_PROJECT_REREAD_QUIET_MS, OpenProjectFolder, readTheProjectIn, type ProjectFolderDialogPurpose, type RecentProjectFolderOpened } from "./open_project.js";
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

async function writeAProject(folder: string, pyprojectText: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "pyproject.toml"), pyprojectText);
}

const PROJECT_PYPROJECT = `[project]
name = "studio"
dependencies = ["tatolab-stream>=0.55", "Hall_Of.Light", "stage-lights", "tatolab-camera"]

[tool.uv.sources]
hall-of-light = { path = "imports/hall-of-light" }
stage_lights = { path = "imports/stage-lights" }
`;

test("an open project reads its own pyproject.toml and each import, by folder where a uv path source names one", async () => {
  const projectFolder = await aFolder();
  await writeAProject(projectFolder, PROJECT_PYPROJECT);
  await writeAProject(path.join(projectFolder, "imports/hall-of-light"), `[project]\nname = "hall-of-light"\ndependencies = ["tatolab-stream"]\n`);

  const reading = await readTheProjectIn(projectFolder);

  expect(reading).toEqual({
    kind: "read",
    open_project: {
      project: { folder: projectFolder, name: "studio", requirements: ["tatolab-stream>=0.55", "Hall_Of.Light", "stage-lights", "tatolab-camera"] },
      imports: [
        { name: "tatolab-stream", requirement: "tatolab-stream>=0.55", source: { kind: "package_index" } },
        {
          name: "hall-of-light",
          requirement: "Hall_Of.Light",
          source: { kind: "folder", project: { folder: path.join(projectFolder, "imports/hall-of-light"), name: "hall-of-light", requirements: ["tatolab-stream"] } },
        },
        {
          name: "stage-lights",
          requirement: "stage-lights",
          source: {
            kind: "folder_unreadable",
            folder: path.join(projectFolder, "imports/stage-lights"),
            refusal: `${path.join(projectFolder, "imports/stage-lights")} has no pyproject.toml.`,
          },
        },
        { name: "tatolab-camera", requirement: "tatolab-camera", source: { kind: "package_index" } },
      ],
    },
  } satisfies OpenProjectReading);
});

test("a project whose pyproject.toml is missing, is not TOML, or names no project is unreadable, with why", async () => {
  const missingFolder = await aFolder();
  expect(await readTheProjectIn(missingFolder)).toEqual({ kind: "unreadable", folder: missingFolder, refusal: `${missingFolder} has no pyproject.toml.` });

  const notTomlFolder = await aFolder();
  await writeAProject(notTomlFolder, `[project\nname = "studio"\n`);
  const notToml = await readTheProjectIn(notTomlFolder);
  expect(notToml.kind).toBe("unreadable");
  expect(notToml.kind === "unreadable" && notToml.refusal).toMatch(/pyproject\.toml is not TOML: Invalid TOML document: illegal character in key\n\n1:  \[project/);

  const namelessFolder = await aFolder();
  await writeAProject(namelessFolder, `[project]\ndependencies = []\n`);
  expect(await readTheProjectIn(namelessFolder)).toEqual({
    kind: "unreadable",
    folder: namelessFolder,
    refusal: `${path.join(namelessFolder, "pyproject.toml")} names no [project] name.`,
  });
});

/** An open project over a scripted dialog, a Documents folder of its own, recent projects in memory, a wall clock the test sets, a runtime that creates projects on disk, watches the test fires by hand, and timers it runs by hand. */
async function anOpenProject(options: { dialogAnswers: string | null; recentFolders?: RecentProjectFolderOpened[]; creationRefusal?: string }) {
  const sentReadings: OpenProjectReading[] = [];
  const dialogsAsked: Array<{ purpose: ProjectFolderDialogPurpose; defaultFolder: string }> = [];
  const projectDirectoriesCreated: string[] = [];
  const documentsDirectory = path.join(await aFolder(), "Documents");
  const watchedFolders = new Map<string, () => void>();
  const pendingTimers: Array<() => void> = [];
  let recentFolders = options.recentFolders ?? [];
  let wallClockNowMs = 1_790_000_000_000;
  const openProject = new OpenProjectFolder({
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
        await writeAProject(projectDirectory ?? "", `[project]\nname = "fresh"\ndependencies = []\n`);
        return succeeded({ action: "action-1", stream: "fresh-main-0a1b2c", project_directory: projectDirectory ?? "" });
      },
    },
    watchFolderEntries: (folder, onChange) => {
      watchedFolders.set(folder, onChange);
      return () => watchedFolders.delete(folder);
    },
    runAfter: (delayMs, work) => {
      expect(delayMs).toBe(OPEN_PROJECT_REREAD_QUIET_MS);
      pendingTimers.push(work);
      return () => pendingTimers.splice(pendingTimers.indexOf(work), 1);
    },
    sendTheWindowTheOpenProject: (reading) => sentReadings.push(reading),
  });
  return {
    openProject,
    documentsDirectory,
    sentReadings,
    dialogsAsked,
    projectDirectoriesCreated,
    watchedFolders,
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
  await writeAProject(projectFolder, `[project]\nname = "studio"\ndependencies = []\n`);
  const { openProject, sentReadings, dialogsAsked, watchedFolders, pendingTimers, rememberedFolder } = await anOpenProject({ dialogAnswers: projectFolder });

  expect(await openProject.chooseProjectFolder("project_to_open")).toEqual(succeeded({ folder: projectFolder, project_creation: null }));
  expect(dialogsAsked.map((dialogAsked) => dialogAsked.purpose)).toEqual(["project_to_open"]);
  expect(rememberedFolder()).toBe(projectFolder);
  expect(sentReadings.map((reading) => reading.kind === "read" && reading.open_project.project.name)).toEqual(["studio"]);
  expect([...watchedFolders.keys()]).toEqual([projectFolder]);

  await writeAProject(projectFolder, `[project]\nname = "studio"\ndependencies = ["tatolab-camera"]\n`);
  watchedFolders.get(projectFolder)?.();
  watchedFolders.get(projectFolder)?.();
  expect(pendingTimers).toHaveLength(1);
  pendingTimers[0]?.();
  await expect.poll(() => sentReadings.length).toBe(2);
  expect(openProject.readOpenProject()).toMatchObject({ kind: "read", open_project: { imports: [{ name: "tatolab-camera" }] } });
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
  await writeAProject(studioFolder, `[project]\nname = "studio"\ndependencies = []\n`);
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
  expect(openProject.readOpenProject()).toEqual({ kind: "unreadable", folder: goneFolder, refusal: `${goneFolder} has no pyproject.toml.` });
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
