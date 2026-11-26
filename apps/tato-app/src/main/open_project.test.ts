import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, expect, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { OpenProjectOfAStudioWindow, openTheProjectFromDiskOnTheRuntime, readTheProjectIn } from "./open_project.js";
import {
  aFakeRuntime,
  aFolder,
  anOpenProject,
  closeAfterTheTest,
  closeAndRemoveWhatTheTestMade,
  refusalOfAFolderHoldingNoProject,
  THE_FAKE_RUNTIMES_REFUSAL_OF_A_ZIP_HOLDING_NO_PROJECT,
  writeAProject,
} from "./fake_runtime_changing_projects.js";
import type { OpenProjectReading } from "../shared/tatolab_backend_contract.js";
import { failedWith, succeeded } from "./result.js";
import { RECORDED_LOBBY_PROJECT, RECORDED_PATTERN_PROJECT, RECORDED_UNLISTED_PROJECT_THE_RUNTIME_HOLDS_OPEN, recordedResponseBody } from "./tatolab_commands_test_support.js";
import { controlOperationCallsReceivedBy } from "./runtime_operations_test_support.js";
import { StatusRounds } from "./studio_runtime.js";

afterEach(closeAndRemoveWhatTheTestMade);


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
          copied_from: "/shows/hall-of-light",
          source: { kind: "folder", project: { folder: path.join(projectFolder, "imports/hall-of-light"), project: "uuid-of-Hall of Light", name: "Hall of Light" } },
        },
        {
          project: "uuid-of-stage-lights",
          name: "stage-lights",
          folder: "stage-lights",
          copied_from: "/shows/stage-lights",
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

test("opening a project in a new window starts it, from the recent projects, the folder dialog or an imported archive, and a new one the runtime starts itself is not started again", async () => {
  const studioFolder = await aFolder();
  const chosenFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  await writeAProject(chosenFolder, "chosen");
  const { openProject, documentsDirectory, projectsStarted } = await anOpenProject({ dialogAnswers: chosenFolder, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 1 }] });

  expect(await openProject.openRecentProject(studioFolder)).toEqual(succeeded(undefined));
  expect(await openProject.chooseProjectFolder("project_to_open")).toMatchObject({ ok: true });
  expect(await openProject.createNewProject("Night Show", path.join(documentsDirectory, "Tato Studio"))).toMatchObject({ ok: true });
  expect(projectsStarted).toEqual([studioFolder, await realpath(chosenFolder)]);
});

test("bringing a project's open window forward leaves the project as the person left it, stopped or running", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject, projectsStarted } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 1 }] });

  expect(await openProject.openRecentProject(studioFolder)).toEqual(succeeded(undefined));
  expect(await openProject.openRecentProject(studioFolder)).toEqual(succeeded(undefined));
  expect(projectsStarted).toEqual([studioFolder]);
});

test("opening a project in a new window that the runtime holds open with a failed stream reloads it from disk, and one open with none failed is left as it plays", async () => {
  const failedFolder = await aFolder();
  const playingFolder = await aFolder();
  await writeAProject(failedFolder, "gulf stream");
  await writeAProject(playingFolder, "playing");
  const { openProject, projectsStarted, projectsReloaded } = await anOpenProject({
    dialogAnswers: null,
    recentFolders: [
      { folder: failedFolder, opened_at_wall_clock_ms: 2 },
      { folder: playingFolder, opened_at_wall_clock_ms: 1 },
    ],
    listedStreams: [
      { projectDirectory: failedFolder, state: "stopped" },
      { projectDirectory: failedFolder, state: "failed" },
      { projectDirectory: playingFolder, state: "running" },
    ],
  });

  expect(await openProject.openRecentProject(failedFolder)).toEqual(succeeded(undefined));
  expect(await openProject.openRecentProject(failedFolder)).toEqual(succeeded(undefined));
  expect(await openProject.openRecentProject(playingFolder)).toEqual(succeeded(undefined));
  expect(projectsReloaded).toEqual([failedFolder]);
  expect(projectsStarted).toEqual([]);
});

test("a project the runtime refuses to open still opens in its window, and says so in the runtime's words", async () => {
  const studioFolder = await aFolder();
  await writeAProject(studioFolder, "studio");
  const { openProject } = await anOpenProject({ dialogAnswers: null, recentFolders: [{ folder: studioFolder, opened_at_wall_clock_ms: 1 }], startRefusal: "no runtime answers" });

  expect(await openProject.openRecentProject(studioFolder)).toEqual(failedWith(`${studioFolder} is open, but the runtime did not open it: no runtime answers`));
  expect(openProject.readOpenProject()).toMatchObject({ kind: "read", open_project: { project: { folder: studioFolder } } });
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

test("a project .zip is imported by the runtime into its location, which is made when missing, then opened, started, since import_project runs nothing, and remembered", async () => {
  const archive = path.join(await aFolder(), "pattern.zip");
  await writeFile(archive, JSON.stringify({ name: "Pattern" }));
  const { openProject, documentsDirectory, rememberedFolder, projectsStarted } = await anOpenProject({ dialogAnswers: null });
  const location = path.join(documentsDirectory, "Tato Studio");
  const projectFolder = path.join(location, "Pattern show");

  expect(await openProject.importProjectArchive(archive, " Pattern show ", location)).toEqual(succeeded({ folder: projectFolder, project_creation: null }));
  expect(rememberedFolder()).toBe(projectFolder);
  expect(projectsStarted).toEqual([projectFolder]);
  expect(openProject.readOpenProject()).toMatchObject({ kind: "read", open_project: { project: { folder: projectFolder, name: "Pattern" } } });
});

test("a project of its own is made from a .zip in <Documents>/Tato Studio under the first numbered name nothing there holds, and opened", async () => {
  const archive = path.join(await aFolder(), "camera-halftone-0.68.29.zip");
  await writeFile(archive, JSON.stringify({ name: "Camera halftone" }));
  const { openProject, documentsDirectory, rememberedFolder, projectsStarted } = await anOpenProject({ dialogAnswers: null });
  const location = path.join(documentsDirectory, "Tato Studio");

  expect(await openProject.makeAProjectOfItsOwnFromTheArchive(archive, "Camera halftone")).toEqual(succeeded({ folder: path.join(location, "Camera halftone"), project_creation: null }));
  expect(await openProject.makeAProjectOfItsOwnFromTheArchive(archive, "Camera halftone")).toEqual(succeeded({ folder: path.join(location, "Camera halftone 2"), project_creation: null }));
  expect(rememberedFolder()).toBe(path.join(location, "Camera halftone 2"));
  expect(projectsStarted).toEqual([path.join(location, "Camera halftone"), path.join(location, "Camera halftone 2")]);
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

test("a project is opened on the runtime only when the runtime, asked then, lists none of its streams or each closed, with a status round after; its refusal in its own words", async () => {
  const listedStreams = await recordedResponseBody("local-api-list-streams-tool-result-of-a-playing-a-stopped-and-a-closed-project.json");
  const localApi = await FakeLocalApiServer.answering([
    controlOperationResponseOfTheRecordedToolResponse(listedStreams),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-answer-for-the-closed-project-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(listedStreams),
    controlOperationResponseOfTheRecordedToolResponse(listedStreams),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-refusal-for-the-open-project-pattern.json")),
  ]);
  closeAfterTheTest(localApi);
  let statusRounds = 0;
  const statusRoundsCounted = Layer.mock(StatusRounds, { requestARound: Effect.sync(() => void (statusRounds += 1)) });
  const openOnTheRuntime = (folder: string) => localApi.run(openTheProjectFromDiskOnTheRuntime(folder).pipe(Effect.provide(statusRoundsCounted)));

  expect(await openOnTheRuntime(RECORDED_LOBBY_PROJECT)).toEqual(succeeded(undefined));
  expect(await openOnTheRuntime(RECORDED_PATTERN_PROJECT)).toEqual(succeeded(undefined));
  expect(await openOnTheRuntime(RECORDED_UNLISTED_PROJECT_THE_RUNTIME_HOLDS_OPEN)).toMatchObject({
    ok: false,
    failure: { words: expect.stringContaining("is already open, so there is none to open; `reload_project` re-reads what changed on disk") },
  });
  expect(statusRounds).toBe(2);
  expect(controlOperationCallsReceivedBy(localApi).filter(([method]) => method === "open_project")).toEqual([
    ["open_project", { project_directory: RECORDED_LOBBY_PROJECT }],
    ["open_project", { project_directory: RECORDED_UNLISTED_PROJECT_THE_RUNTIME_HOLDS_OPEN }],
  ]);
});
