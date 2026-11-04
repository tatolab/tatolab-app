import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { OpenWorkspaceReading, ProjectCreationQueued, WorkspaceFolderChosenFor } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_client.js";
import { OPEN_WORKSPACE_REREAD_QUIET_MS, OpenWorkspaceFolder, readTheWorkspaceIn } from "./open_workspace.js";
import { failedWith, succeeded, type Result } from "./result.js";

const foldersMade: string[] = [];

afterEach(async () => {
  for (const folder of foldersMade.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function aFolder(): Promise<string> {
  const folder = await realpath(await mkdtemp(path.join(os.tmpdir(), "tatolab-open-workspace-")));
  foldersMade.push(folder);
  return folder;
}

async function writeAProject(folder: string, pyprojectText: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "pyproject.toml"), pyprojectText);
}

const WORKSPACE_PYPROJECT = `[project]
name = "studio"
dependencies = ["tatolab-stream>=0.55", "Hall_Of.Light", "stage-lights", "tatolab-camera"]

[tool.uv.sources]
hall-of-light = { path = "imports/hall-of-light" }
stage_lights = { path = "imports/stage-lights" }
`;

test("a workspace reads its project and each import, by folder where a uv path source names one", async () => {
  const workspaceFolder = await aFolder();
  await writeAProject(workspaceFolder, WORKSPACE_PYPROJECT);
  await writeAProject(path.join(workspaceFolder, "imports/hall-of-light"), `[project]\nname = "hall-of-light"\ndependencies = ["tatolab-stream"]\n`);

  const reading = await readTheWorkspaceIn(workspaceFolder);

  expect(reading).toEqual({
    kind: "read",
    workspace: {
      workspace_project: { folder: workspaceFolder, name: "studio", requirements: ["tatolab-stream>=0.55", "Hall_Of.Light", "stage-lights", "tatolab-camera"] },
      imports: [
        { name: "tatolab-stream", requirement: "tatolab-stream>=0.55", source: { kind: "package_index" } },
        {
          name: "hall-of-light",
          requirement: "Hall_Of.Light",
          source: { kind: "folder", project: { folder: path.join(workspaceFolder, "imports/hall-of-light"), name: "hall-of-light", requirements: ["tatolab-stream"] } },
        },
        {
          name: "stage-lights",
          requirement: "stage-lights",
          source: {
            kind: "folder_unreadable",
            folder: path.join(workspaceFolder, "imports/stage-lights"),
            refusal: `${path.join(workspaceFolder, "imports/stage-lights")} has no pyproject.toml.`,
          },
        },
        { name: "tatolab-camera", requirement: "tatolab-camera", source: { kind: "package_index" } },
      ],
    },
  } satisfies OpenWorkspaceReading);
});

test("a workspace whose pyproject.toml is missing, is not TOML, or names no project is unreadable, with why", async () => {
  const missingFolder = await aFolder();
  expect(await readTheWorkspaceIn(missingFolder)).toEqual({ kind: "unreadable", folder: missingFolder, refusal: `${missingFolder} has no pyproject.toml.` });

  const notTomlFolder = await aFolder();
  await writeAProject(notTomlFolder, `[project\nname = "studio"\n`);
  const notToml = await readTheWorkspaceIn(notTomlFolder);
  expect(notToml.kind).toBe("unreadable");
  expect(notToml.kind === "unreadable" && notToml.refusal).toMatch(/pyproject\.toml is not TOML: Invalid TOML document: illegal character in key\n\n1:  \[project/);

  const namelessFolder = await aFolder();
  await writeAProject(namelessFolder, `[project]\ndependencies = []\n`);
  expect(await readTheWorkspaceIn(namelessFolder)).toEqual({
    kind: "unreadable",
    folder: namelessFolder,
    refusal: `${path.join(namelessFolder, "pyproject.toml")} names no [project] name.`,
  });
});

/** An open workspace over a scripted dialog, a remembered folder in memory, a runtime that creates projects on disk, watches the test fires by hand, and timers it runs by hand. */
async function anOpenWorkspace(options: { dialogAnswers: string | null; rememberedFolder?: string | null; creationRefusal?: string }) {
  const sentReadings: OpenWorkspaceReading[] = [];
  const dialogsAsked: WorkspaceFolderChosenFor[] = [];
  const watchedFolders = new Map<string, () => void>();
  const pendingTimers: Array<() => void> = [];
  let rememberedFolder = options.rememberedFolder ?? null;
  const openWorkspace = new OpenWorkspaceFolder({
    homeDirectory: await aFolder(),
    workspaceFolderDialog: async (chosenFor) => {
      dialogsAsked.push(chosenFor);
      return succeeded(options.dialogAnswers);
    },
    rememberedOpenWorkspaceFolder: {
      readRememberedFolder: async () => rememberedFolder,
      rememberFolder: async (folder) => {
        rememberedFolder = folder;
        return succeeded(undefined);
      },
    },
    workspaceProjectCreation: {
      createProject: async (projectDirectory): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> => {
        if (options.creationRefusal !== undefined) return failedWith({ failureDescription: options.creationRefusal, isTheRuntimesRefusal: true });
        await writeAProject(projectDirectory ?? "", `[project]\nname = "fresh"\ndependencies = []\n`);
        return succeeded({ action: "action-1", stream: "fresh-main-0a1b2c", project_directory: projectDirectory ?? "" });
      },
    },
    watchFolderEntries: (folder, onChange) => {
      watchedFolders.set(folder, onChange);
      return () => watchedFolders.delete(folder);
    },
    runAfter: (delayMs, work) => {
      expect(delayMs).toBe(OPEN_WORKSPACE_REREAD_QUIET_MS);
      pendingTimers.push(work);
      return () => pendingTimers.splice(pendingTimers.indexOf(work), 1);
    },
    sendTheWindowTheOpenWorkspace: (reading) => sentReadings.push(reading),
  });
  return { openWorkspace, sentReadings, dialogsAsked, watchedFolders, pendingTimers, rememberedFolder: () => rememberedFolder };
}

test("no workspace is open until one is chosen, and a cancelled dialog opens none", async () => {
  const { openWorkspace, sentReadings } = await anOpenWorkspace({ dialogAnswers: null });
  await openWorkspace.openTheRememberedWorkspace();
  expect(openWorkspace.readOpenWorkspace()).toEqual({ kind: "none_open" });
  expect(await openWorkspace.chooseWorkspaceFolder("workspace_to_open")).toEqual(succeeded(null));
  expect(sentReadings).toEqual([]);
});

test("a chosen workspace opens, is sent to the window, is remembered, and is read again once its folder goes quiet after a change", async () => {
  const workspaceFolder = await aFolder();
  await writeAProject(workspaceFolder, `[project]\nname = "studio"\ndependencies = []\n`);
  const { openWorkspace, sentReadings, dialogsAsked, watchedFolders, pendingTimers, rememberedFolder } = await anOpenWorkspace({ dialogAnswers: workspaceFolder });

  expect(await openWorkspace.chooseWorkspaceFolder("workspace_to_open")).toEqual(succeeded({ folder: workspaceFolder, project_creation: null }));
  expect(dialogsAsked).toEqual(["workspace_to_open"]);
  expect(rememberedFolder()).toBe(workspaceFolder);
  expect(sentReadings.map((reading) => reading.kind === "read" && reading.workspace.workspace_project.name)).toEqual(["studio"]);
  expect([...watchedFolders.keys()]).toEqual([workspaceFolder]);

  await writeAProject(workspaceFolder, `[project]\nname = "studio"\ndependencies = ["tatolab-camera"]\n`);
  watchedFolders.get(workspaceFolder)?.();
  watchedFolders.get(workspaceFolder)?.();
  expect(pendingTimers).toHaveLength(1);
  pendingTimers[0]?.();
  await expect.poll(() => sentReadings.length).toBe(2);
  expect(openWorkspace.readOpenWorkspace()).toMatchObject({ kind: "read", workspace: { imports: [{ name: "tatolab-camera" }] } });
});

test("a new workspace has the runtime create its project first, and a refusal opens nothing", async () => {
  const parentFolder = await aFolder();
  const newWorkspaceFolder = path.join(parentFolder, "night-show");
  const created = await anOpenWorkspace({ dialogAnswers: newWorkspaceFolder });
  expect(await created.openWorkspace.chooseWorkspaceFolder("new_workspace")).toEqual(
    succeeded({ folder: newWorkspaceFolder, project_creation: { action: "action-1", stream: "fresh-main-0a1b2c", project_directory: newWorkspaceFolder } }),
  );
  expect(created.openWorkspace.readOpenWorkspace()).toMatchObject({ kind: "read", workspace: { workspace_project: { name: "fresh" } } });

  const refused = await anOpenWorkspace({ dialogAnswers: path.join(parentFolder, "taken"), creationRefusal: "the folder already holds a project" });
  expect(await refused.openWorkspace.chooseWorkspaceFolder("new_workspace")).toEqual(failedWith("the folder already holds a project"));
  expect(refused.openWorkspace.readOpenWorkspace()).toEqual({ kind: "none_open" });
  expect(refused.rememberedFolder()).toBeNull();
});

test("the remembered workspace opens at launch, and one that is gone reads as unreadable, watched from its parent", async () => {
  const parentFolder = await aFolder();
  const goneFolder = path.join(parentFolder, "gone");
  const { openWorkspace, watchedFolders } = await anOpenWorkspace({ dialogAnswers: null, rememberedFolder: goneFolder });
  await openWorkspace.openTheRememberedWorkspace();
  expect(openWorkspace.readOpenWorkspace()).toEqual({ kind: "unreadable", folder: goneFolder, refusal: `${goneFolder} has no pyproject.toml.` });
  expect([...watchedFolders.keys()]).toEqual([goneFolder, parentFolder]);
});
