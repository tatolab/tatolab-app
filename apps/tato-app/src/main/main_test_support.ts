// What the tests of the app as `startTatolabApp` starts it share: fake shells quit after each test,
// and a fake runtime that reads each project's `tatolab-project.json`.

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { FakeLocalApiServer, controlOperationFailedResponse, controlOperationResultResponse } from "./fake_local_api_server.js";
import { FakeTatolabElectronAppShell } from "./fake_tatolab_electron_app_shell.js";
import { tatolabPlatformItemsFor } from "./platform/tatolab_platform_items.js";

export const MACOS_PLATFORM_ITEMS = tatolabPlatformItemsFor("darwin", "arm64");
export const LINUX_PLATFORM_ITEMS = tatolabPlatformItemsFor("linux", "x64");

const startedFakeShells: FakeTatolabElectronAppShell[] = [];
const fakeRuntimesStarted: FakeLocalApiServer[] = [];

/** Close every fake runtime the last test started, and quit each fake shell's app and remove its config directory. */
export async function cleanUpTheFakeShellsAndRuntimesTheLastTestStarted(): Promise<void> {
  for (const fakeRuntime of fakeRuntimesStarted.splice(0)) await fakeRuntime.close();
  for (const startedFakeShell of startedFakeShells.splice(0)) {
    startedFakeShell.beginQuitting();
    startedFakeShell.carriedRuntimeStarts.exitEveryRuntimeAskedToStop();
    await startedFakeShell.quitHeldUntil;
    await startedFakeShell.removeTheAppConfigDirectory();
  }
}

/** A fake shell for a test, which quits its app and removes its config directory after the test. */
export function fakeShellQuitAfterTheTest(): FakeTatolabElectronAppShell {
  const fakeShell = new FakeTatolabElectronAppShell();
  startedFakeShells.push(fakeShell);
  return fakeShell;
}

/** A project's `tatolab-project.json` as the fake runtime reads it: its UUID, its name and each project it imports. */
export interface FakeProjectFile {
  project: string;
  name: string;
  dependencies: Array<{ project: string; folder: string; source: string; version: string }>;
}

export const FAKE_IMPORT_VERSION = "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82";

async function readAFakeProjectFile(projectDirectory: string): Promise<FakeProjectFile | null> {
  try {
    const projectFile: FakeProjectFile = JSON.parse(await readFile(path.join(projectDirectory, "tatolab-project.json"), "utf8"));
    return projectFile;
  } catch {
    return null;
  }
}

function refusalOfAFolderHoldingNoProject(toolName: string, projectDirectory: string): Buffer {
  return controlOperationFailedResponse(`${toolName} failed: ${projectDirectory} holds no project: it has no tatolab-project.json`);
}

/** The `tatolab_view.json` of the one view, `views/meter`, the fake runtime lists in each import. */
export const FAKE_METER_VIEW_MANIFEST = { contract: "1.0", title: "Meter", entry: "index.html", placement: "node", inputs: [{ name: "level", family: "array" }] };

/** A runtime that answers `list_assets`, `list_dependencies`, `add_dependency`, `update_dependency`, `remove_dependency` and `list_project_views` from each project's `tatolab-project.json`, copying an import whole and taking one out whole, holding every import edited since its copy until an update overwrites it, listing a `meter` view in each import, making a project named for its folder on `import_project`, and no other request. */
async function aRuntimeReadingEachProjectsFile(): Promise<FakeLocalApiServer> {
  const fakeRuntime = await FakeLocalApiServer.answeringEachControlOperation(async (toolName, toolArguments) => {
    const projectDirectory = String(toolArguments["project_directory"]);
    const projectFile = await readAFakeProjectFile(projectDirectory);
    switch (toolName) {
      case "list_assets":
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        return controlOperationResultResponse({
          project_directory: projectDirectory,
          project: projectFile.project,
          project_name: projectFile.name,
          assets: [],
          transactions_resource_uri: `streamlib://project/${projectFile.project}/transactions`,
        });
      case "list_dependencies":
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        return controlOperationResultResponse({ dependencies: projectFile.dependencies.map((dependency) => ({ dependency })) });
      case "add_dependency": {
        const source = String(toolArguments["source"]);
        const sourceProjectFile = await readAFakeProjectFile(source);
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        if (sourceProjectFile === null) return controlOperationFailedResponse(`add_dependency failed: ${source} holds no tatolab-project.json`);
        const folder = path.basename(source);
        if (projectFile.dependencies.some((dependency) => dependency.project === sourceProjectFile.project)) {
          return controlOperationFailedResponse(`add_dependency failed: the project already imports ${sourceProjectFile.project} in imports/${folder}`);
        }
        const dependency = { project: sourceProjectFile.project, folder, source, version: FAKE_IMPORT_VERSION };
        await cp(source, path.join(projectDirectory, "imports", folder), { recursive: true });
        await writeFile(path.join(projectDirectory, "tatolab-project.json"), JSON.stringify({ ...projectFile, dependencies: [...projectFile.dependencies, dependency] }));
        return controlOperationResultResponse({ dependency, transaction: "400abda2-8e24-4e95-bef0-7139fd68d853", commit: "7402198987b8ef4b1d2f370b8f090ccde0865a56" });
      }
      case "update_dependency": {
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        const dependency = projectFile.dependencies.find((dependencyHeld) => dependencyHeld.project === toolArguments["project"]);
        if (dependency === undefined) return controlOperationFailedResponse(`update_dependency failed: the project imports no project ${String(toolArguments["project"])}`);
        if (toolArguments["overwrite_edited_files"] !== true) return controlOperationResultResponse({ dependency, edited_files: ["views/meter/index.html"], overwrite_confirmation_needed: true });
        return controlOperationResultResponse({ dependency, edited_files: ["views/meter/index.html"], overwrite_confirmation_needed: false, transaction: "5d1c0f2a-3b7e-4c5d-9a1f-2e3b4c5d6e7f", commit: "8e2f4a6c0b1d3e5f7a9c2b4d6e8f0a1c3e5b7d9f" });
      }
      case "remove_dependency": {
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        const dependency = projectFile.dependencies.find((dependencyHeld) => dependencyHeld.project === toolArguments["project"]);
        if (dependency === undefined) return controlOperationFailedResponse(`remove_dependency failed: the project imports no project ${String(toolArguments["project"])}`);
        await rm(path.join(projectDirectory, "imports", dependency.folder), { recursive: true });
        await writeFile(
          path.join(projectDirectory, "tatolab-project.json"),
          JSON.stringify({ ...projectFile, dependencies: projectFile.dependencies.filter((dependencyHeld) => dependencyHeld !== dependency) }),
        );
        return controlOperationResultResponse({ dependency, transaction: "b0a9f2de-51f8-4f5c-8a3e-7d7f3b1f8c11", commit: "1c9f0b6f0f1f6c4a4f0b7a3f0a5d2e8b9c7d6e5f" });
      }
      case "import_project": {
        const name = path.basename(projectDirectory);
        const projectMade = { project: `uuid-of-${name}`, name, dependencies: [] } satisfies FakeProjectFile;
        await mkdir(projectDirectory, { recursive: true });
        await writeFile(path.join(projectDirectory, "tatolab-project.json"), JSON.stringify(projectMade));
        return controlOperationResultResponse({ project_directory: projectDirectory, project: projectMade.project, name, commit: "6e9bf712f50159cf8b93aa40a7e366eab060e352" });
      }
      case "list_streams":
        return controlOperationResultResponse({ streams: [] });
      case "list_project_views":
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        return controlOperationResultResponse({
          project_directory: projectDirectory,
          project: projectFile.project,
          project_name: projectFile.name,
          views: projectFile.dependencies.map((dependency) => ({
            view_type: `${dependency.folder}:meter`,
            project: dependency.project,
            project_name: dependency.folder,
            import_folder: dependency.folder,
            view_folder_in_the_project: `imports/${dependency.folder}/views/meter`,
            opens: true,
            not_opened_because: null,
            manifest: FAKE_METER_VIEW_MANIFEST,
            inputs: [],
            outputs: [],
          })),
        });
      case "open_project":
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        return controlOperationResultResponse({ action: "5d0c9a51-6a8b-4f3e-9d7e-2b1c0f4e8a77", project_directory: projectDirectory });
      default:
        return null;
    }
  });
  fakeRuntimesStarted.push(fakeRuntime);
  return fakeRuntime;
}

/** A fake shell whose app reads each project through a runtime that reads its `tatolab-project.json`, quit after the test. */
export async function fakeShellOverARuntimeReadingEachProjectsFile(): Promise<FakeTatolabElectronAppShell> {
  const fakeShell = fakeShellQuitAfterTheTest();
  fakeShell.localApiSocketPath = (await aRuntimeReadingEachProjectsFile()).localApiSocketPath;
  return fakeShell;
}

/** A project folder on disk named `projectName`, which the fake dialog answers. */
export async function aProjectTheDialogAnswers(fakeShell: FakeTatolabElectronAppShell, projectName: string): Promise<string> {
  const projectFolder = path.join(fakeShell.appConfigDirectory, "projects", projectName);
  await mkdir(projectFolder, { recursive: true });
  await writeFile(path.join(projectFolder, "pyproject.toml"), `[project]\nname = "${projectName}"\ndependencies = []\n`);
  await writeFile(path.join(projectFolder, "tatolab-project.json"), JSON.stringify({ project: `uuid-of-${projectName}`, name: projectName, dependencies: [] } satisfies FakeProjectFile));
  fakeShell.projectFolderTheDialogAnswers = projectFolder;
  return projectFolder;
}
