import path from "node:path";
import type { ChosenProjectFolder, DependencySourceKind, PackageCatalogEntry, ProjectDependency, WorkspaceDependency, WorkspaceDependencyUpdate } from "../shared/tatolab_backend_contract.js";
import { isAModuleManagerSectionAsked, MODULES_SHOWN } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { readThePackageCatalog } from "./package_catalog.js";
import { whyTheModuleBringsNothingOnThisMachine } from "../shared/package_catalog_machine_words.js";
import { workspaceDependenciesOf } from "./workspace_dependencies.js";
import { downloadTheCatalogEntrysZip } from "./marketplace_module_download.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import type { StudioWindowOfAProject } from "./tatolab_app_windows.js";
import { answerTheWindow, type TatolabCommandFromWindow, oneTextArgumentFrom, type TatolabWindowCommandHandlers, commandAnswerFrom } from "./tatolab_command_answers.js";

/** The studio window whose Module manager window sent `commandFromWindow`, or the refusal any other window is given. */
function studioWindowOfTheModuleManagerWindowTheCommandCameFrom(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Result<StudioWindowOfAProject, string> {
  const studioWindow = sharedState.appWindows.studioWindowOfTheModuleManagerWindowWithContents(commandFromWindow.windowContentsId);
  return studioWindow === null ? failedWith("Only a Module manager window imports into a project.") : succeeded(studioWindow);
}

/** The folder of the project the Module manager window that sent `commandFromWindow` imports into, or the refusal any other window is given. */
function workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Result<string, string> {
  const studioWindow = studioWindowOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
  return studioWindow.ok ? succeeded(studioWindow.value.openProject.projectFolder) : studioWindow;
}

/** `list_workspace_dependencies`: the asking Module manager window's workspace's imports, each source read for a newer version with `checkForNewer`; refused in the runtime's own words. */
function listWorkspaceDependencies(sharedState: TatolabAppSharedState, checkForNewer: boolean, commandFromWindow: TatolabCommandFromWindow): Promise<Result<WorkspaceDependency[], string>> {
  return answerTheWindow("list_workspace_dependencies", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const [listed, workspaceViews] = await Promise.all([
      sharedState.controller.listDependencies(workspaceFolder.value, checkForNewer),
      sharedState.controller.listProjectViews(workspaceFolder.value),
    ]);
    if (!listed.ok) return failedWith(listed.failure.failureDescription);
    return succeeded(
      await workspaceDependenciesOf(
        workspaceFolder.value,
        listed.value,
        workspaceViews.ok ? workspaceViews : failedWith(workspaceViews.failure.failureDescription),
        (projectFolder) => sharedState.controller.nameTheProject(projectFolder),
      ),
    );
  });
}

/** `choose_dependency_source`: the desktop's open dialog for a project's folder or `.zip`, opened beside the workspace; `null` when the person cancels. */
function chooseDependencySource(sharedState: TatolabAppSharedState, sourceKind: DependencySourceKind, commandFromWindow: TatolabCommandFromWindow): Promise<Result<string | null, string>> {
  return answerTheWindow("choose_dependency_source", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    return sharedState.dependencySourceDialog(sourceKind, path.dirname(workspaceFolder.value));
  });
}

/** `add_dependency_to_the_workspace`: the runtime's `add_dependency` copies `source` into the asking Module manager window's workspace; refused in the runtime's own words. */
function addDependencyToTheWorkspace(sharedState: TatolabAppSharedState, source: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<ProjectDependency, string>> {
  return answerTheWindow("add_dependency_to_the_workspace", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    if (!path.isAbsolute(source)) return failedWith(`${source} is not a full path to a project's folder or .zip.`);
    const added = await sharedState.controller.addDependency(workspaceFolder.value, source);
    if (!added.ok) return failedWith(added.failure.failureDescription);
    sharedState.tatolabAppLog.info("imported a project into the workspace", { source, folder: added.value.folder, project_folder: workspaceFolder.value });
    return added;
  });
}

/** `update_workspace_dependency`: the runtime's `update_dependency` copies the import `project` again, overwriting files edited since its copy only with `overwriteEditedFiles`; refused in the runtime's own words. */
function updateWorkspaceDependency(
  sharedState: TatolabAppSharedState,
  project: string,
  overwriteEditedFiles: boolean,
  commandFromWindow: TatolabCommandFromWindow,
): Promise<Result<WorkspaceDependencyUpdate, string>> {
  return answerTheWindow("update_workspace_dependency", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const update = await sharedState.controller.updateDependency(workspaceFolder.value, project, overwriteEditedFiles);
    if (!update.ok) return failedWith(update.failure.failureDescription);
    if (update.value.kind === "updated") sharedState.tatolabAppLog.info("updated an import of the workspace", { project, project_folder: workspaceFolder.value });
    return update;
  });
}

/** `import_from_the_marketplace`: the catalog entry `name`, read afresh, downloaded as its `.zip` into the app's downloads folder and checked, then copied into the asking Module manager window's workspace by the runtime's `add_dependency`; refused in words. */
function importFromTheMarketplace(sharedState: TatolabAppSharedState, name: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<ProjectDependency, string>> {
  return answerTheWindow("import_from_the_marketplace", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const entry = await catalogEntryNamed(sharedState, name);
    if (!entry.ok) return entry;
    if (entry.value.kind === "sample") return failedWith(`${entry.value.title} is a sample project; clone it into a project of its own instead.`);
    if (!entry.value.runs_on_this_machine && entry.value.platforms !== null) return failedWith(whyTheModuleBringsNothingOnThisMachine(entry.value.title, entry.value.platforms));
    const zipPath = await downloadTheCatalogEntrysZip(entry.value, sharedState.fetchBytesOverHttps, sharedState.moduleDownloadsFolder);
    if (!zipPath.ok) return zipPath;
    const added = await sharedState.controller.addDependency(workspaceFolder.value, zipPath.value);
    if (!added.ok) return failedWith(added.failure.failureDescription);
    sharedState.tatolabAppLog.info("imported a Marketplace module into the workspace", { name, version: entry.value.version, folder: added.value.folder, project_folder: workspaceFolder.value });
    return added;
  });
}

/** `remove_workspace_dependency`: the runtime's `remove_dependency` takes the import `project` out of the asking Module manager window's workspace; refused in the runtime's own words. */
function removeWorkspaceDependency(sharedState: TatolabAppSharedState, project: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<ProjectDependency, string>> {
  return answerTheWindow("remove_workspace_dependency", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const removed = await sharedState.controller.removeDependency(workspaceFolder.value, project);
    if (!removed.ok) return failedWith(removed.failure.failureDescription);
    sharedState.tatolabAppLog.info("removed an import from the workspace", { project, folder: removed.value.folder, project_folder: workspaceFolder.value });
    return removed;
  });
}

/** `clone_marketplace_sample`: the catalog's sample `name`, read afresh, downloaded and checked as an import's `.zip` is, then made into a project of its own by the runtime's `import_project` and opened in its studio window; the asking Module manager window's workspace is not changed. Refused in words. */
function cloneMarketplaceSample(sharedState: TatolabAppSharedState, name: string, commandFromWindow: TatolabCommandFromWindow): Promise<Result<ChosenProjectFolder, string>> {
  return answerTheWindow("clone_marketplace_sample", async () => {
    const workspaceFolder = workspaceFolderOfTheModuleManagerWindowTheCommandCameFrom(sharedState, commandFromWindow);
    if (!workspaceFolder.ok) return workspaceFolder;
    const entry = await catalogEntryNamed(sharedState, name);
    if (!entry.ok) return entry;
    if (entry.value.kind !== "sample") return failedWith(`${entry.value.title} is not a sample project; add it to a project instead.`);
    const zipPath = await downloadTheCatalogEntrysZip(entry.value, sharedState.fetchBytesOverHttps, sharedState.moduleDownloadsFolder);
    if (!zipPath.ok) return zipPath;
    const cloned = await sharedState.projectOpening.makeAProjectOfItsOwnFromTheArchive(zipPath.value, entry.value.title);
    if (!cloned.ok) return cloned;
    sharedState.statusPublisher.requestRefresh();
    sharedState.tatolabAppLog.info("cloned a Marketplace sample into a project of its own", { name, version: entry.value.version, project_folder: cloned.value.folder });
    return cloned;
  });
}

async function catalogEntryNamed(sharedState: TatolabAppSharedState, name: string): Promise<Result<PackageCatalogEntry, string>> {
  const catalog = await readThePackageCatalog(sharedState.fetchTextOverHttps, sharedState.machineModulesInstallOn);
  if (catalog.kind === "not_read") return failedWith(catalog.because);
  const entry = catalog.entries.find((listed) => listed.name === name);
  return entry === undefined ? failedWith(`The catalog lists nothing named ${name}.`) : succeeded(entry);
}

type ModuleManagerCommandName =
  | "open_module_manager_window"
  | "read_module_manager_workspace"
  | "read_module_manager_section_last_asked"
  | "read_package_catalog"
  | "list_workspace_dependencies"
  | "choose_dependency_source"
  | "add_dependency_to_the_workspace"
  | "update_workspace_dependency"
  | "import_from_the_marketplace"
  | "remove_workspace_dependency"
  | "clone_marketplace_sample";

/** The handlers of the module manager window's commands on the package catalog, the workspace's dependencies and the Marketplace, over `sharedState`. */
export function moduleManagerCommandHandlersOf(sharedState: TatolabAppSharedState): Pick<TatolabWindowCommandHandlers, ModuleManagerCommandName> {
  return {
    open_module_manager_window: async (commandArguments, commandFromWindow) => {
      if (!isAModuleManagerSectionAsked(commandArguments)) return { ok: false, refusal: `open_module_manager_window needs \`shows\`, one of ${MODULES_SHOWN.join(", ")}.` };
      const studioWindow = sharedState.appWindows.studioWindowWithContents(commandFromWindow.windowContentsId);
      if (studioWindow === null) return { ok: false, refusal: "Only a project's studio window opens Module manager." };
      sharedState.appWindows.openTheModuleManagerWindowOf(studioWindow, commandArguments.shows);
      return { ok: true, value: null };
    },
    read_module_manager_workspace: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.studioWindowOfTheModuleManagerWindowWithContents(commandFromWindow.windowContentsId)?.openProject.readOpenProject() ?? null,
    }),
    read_module_manager_section_last_asked: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.moduleManagerSectionLastAskedOfTheWindowWithContents(commandFromWindow.windowContentsId),
    }),
    read_package_catalog: async () => ({ ok: true, value: await readThePackageCatalog(sharedState.fetchTextOverHttps, sharedState.machineModulesInstallOn) }),
    list_workspace_dependencies: async (commandArguments, commandFromWindow) => {
      const checkForNewer = isAJsonObject(commandArguments) ? commandArguments["check_for_newer"] : undefined;
      if (typeof checkForNewer !== "boolean") return { ok: false, refusal: "list_workspace_dependencies needs `check_for_newer`, true to read each import's source for a newer version" };
      return commandAnswerFrom(await listWorkspaceDependencies(sharedState, checkForNewer, commandFromWindow));
    },
    choose_dependency_source: async (commandArguments, commandFromWindow) => {
      const sourceKind = isAJsonObject(commandArguments) ? commandArguments["source_kind"] : undefined;
      if (sourceKind !== "folder" && sourceKind !== "zip") return { ok: false, refusal: "choose_dependency_source needs `source_kind`, `folder` or `zip`" };
      return commandAnswerFrom(await chooseDependencySource(sharedState, sourceKind, commandFromWindow));
    },
    add_dependency_to_the_workspace: async (commandArguments, commandFromWindow) => {
      const source = oneTextArgumentFrom("add_dependency_to_the_workspace", commandArguments, "source", "a project's folder or .zip, as a full path");
      if (!source.ok) return { ok: false, refusal: source.failure };
      return commandAnswerFrom(await addDependencyToTheWorkspace(sharedState, source.value, commandFromWindow));
    },
    update_workspace_dependency: async (commandArguments, commandFromWindow) => {
      const project = oneTextArgumentFrom("update_workspace_dependency", commandArguments, "project", "the UUID of one of the workspace's imports");
      if (!project.ok) return { ok: false, refusal: project.failure };
      const overwriteEditedFiles = isAJsonObject(commandArguments) ? commandArguments["overwrite_edited_files"] : undefined;
      if (typeof overwriteEditedFiles !== "boolean") return { ok: false, refusal: "update_workspace_dependency needs `overwrite_edited_files`, true to overwrite the files edited since the import's copy" };
      return commandAnswerFrom(await updateWorkspaceDependency(sharedState, project.value, overwriteEditedFiles, commandFromWindow));
    },
    import_from_the_marketplace: async (commandArguments, commandFromWindow) => {
      const name = oneTextArgumentFrom("import_from_the_marketplace", commandArguments, "name", "the name of an entry the catalog lists");
      if (!name.ok) return { ok: false, refusal: name.failure };
      return commandAnswerFrom(await importFromTheMarketplace(sharedState, name.value, commandFromWindow));
    },
    remove_workspace_dependency: async (commandArguments, commandFromWindow) => {
      const project = oneTextArgumentFrom("remove_workspace_dependency", commandArguments, "project", "the UUID of one of the workspace's imports");
      if (!project.ok) return { ok: false, refusal: project.failure };
      return commandAnswerFrom(await removeWorkspaceDependency(sharedState, project.value, commandFromWindow));
    },
    clone_marketplace_sample: async (commandArguments, commandFromWindow) => {
      const name = oneTextArgumentFrom("clone_marketplace_sample", commandArguments, "name", "the name of a sample the catalog lists");
      if (!name.ok) return { ok: false, refusal: name.failure };
      return commandAnswerFrom(await cloneMarketplaceSample(sharedState, name.value, commandFromWindow));
    },
  };
}
