import { mockPackageCatalogEntryNamed, mockPackageCatalogReading } from "./mock_package_catalog";
import { whyTheModuleBringsNothingOnThisMachine } from "../src/shared/package_catalog_machine_words";
import { marketplaceDownloadFileNameOf, MODULE_DOWNLOADS_FOLDER_NAME } from "../src/shared/marketplace_module_download_file";
import { mockFirstNameNothingHolds, mockNewProjectsFolder } from "./mock_open_project";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import type { PackageCatalogEntry } from "../src/shared/tatolab_backend_contract";
import { MODULE_MANAGER_QUERY_PARAMETER, MODULE_MANAGER_SECTION_QUERY_PARAMETER, type MockTatolabOptions } from "./mock_tatolab_options";
import { MOCK_COMMAND_LATENCY_MILLISECONDS } from "./mock_tatolab_simulation_constants";
import { mockPageUrlWith, sleep, type MockTatolabSimulation } from "./mock_tatolab_simulation";

/** What downloading `entry`'s `.zip` comes to under `scenario`: nothing, a refusal in the main process's words, or no answer. */
function mockMarketplaceDownloadOf(entry: PackageCatalogEntry, scenario: MockTatolabOptions["marketplaceAddScenario"]): Promise<void> {
  if (scenario === "never_ends") return new Promise(() => undefined);
  if (scenario === "refused" && entry.download !== null) {
    return Promise.reject(`${entry.download.url} downloaded with the SHA-256 28f81bad7f6b5604175f7a68654b8bd984e7cae54433ccc891d2128094f1c97d, not the catalog's ${entry.download.sha256}; nothing was imported.`);
  }
  return Promise.resolve();
}

/** The mock backend's modules methods over `simulation`. */
export function mockModulesBackendOf(simulation: MockTatolabSimulation): Pick<TatolabBackend, "openModuleManagerWindow" | "readModuleManagerWorkspace" | "readModuleManagerSectionLastAsked" | "onModuleManagerSectionAsked" | "readPackageCatalog" | "listWorkspaceDependencies" | "chooseDependencySource" | "addDependencyToTheWorkspace" | "updateWorkspaceDependency" | "importFromTheMarketplace" | "removeWorkspaceDependency" | "cloneMarketplaceSample"> {
  const { fixtures, workspaceDependencies, mockFoldersOnDisk, rememberTheProjectAsOpenedLast, projectFolders, mockTatolabOptions } = simulation;
  return {
    openModuleManagerWindow: async (shows) => {
      window.open(mockPageUrlWith(mockPageUrlWith(window.location.href, MODULE_MANAGER_QUERY_PARAMETER, "open"), MODULE_MANAGER_SECTION_QUERY_PARAMETER, shows), "_blank");
    },
    readModuleManagerWorkspace: async () => (mockTatolabOptions.moduleManagerWorkspaceDependencies !== null ? structuredClone(simulation.openProjectReading) : null),
    readModuleManagerSectionLastAsked: async () => (mockTatolabOptions.moduleManagerWorkspaceDependencies !== null ? mockTatolabOptions.moduleManagerSectionOpenedOn : null),
    onModuleManagerSectionAsked: () => () => undefined,
    readPackageCatalog: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockPackageCatalogReading(mockTatolabOptions.isTheCatalogUnserved, mockTatolabOptions.platform);
    },
    listWorkspaceDependencies: async (checkForNewer) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * (checkForNewer ? 4 : 1));
      return workspaceDependencies.list(checkForNewer);
    },
    chooseDependencySource: async (sourceKind) => workspaceDependencies.sourceTheDialogAnswers(sourceKind),
    addDependencyToTheWorkspace: async (source) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      return workspaceDependencies.add(source);
    },
    updateWorkspaceDependency: async (project, overwriteEditedFiles) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      return workspaceDependencies.update(project, overwriteEditedFiles);
    },
    importFromTheMarketplace: async (name) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 6);
      const entry = mockPackageCatalogEntryNamed(name, mockTatolabOptions.platform);
      if (entry === undefined) throw `The catalog lists nothing named ${name}.`;
      if (entry.kind === "sample") throw `${entry.title} is a sample project; clone it into a project of its own instead.`;
      if (!entry.runs_on_this_machine && entry.platforms !== null) throw whyTheModuleBringsNothingOnThisMachine(entry.title, entry.platforms);
      await mockMarketplaceDownloadOf(entry, mockTatolabOptions.marketplaceAddScenario);
      const downloadsFolder = `${fixtures.machine.homeDirectory}/Library/Application Support/Tato Studio/${MODULE_DOWNLOADS_FOLDER_NAME}`;
      return workspaceDependencies.add(`${downloadsFolder}/${marketplaceDownloadFileNameOf(entry.name, entry.version)}`, entry.title);
    },
    removeWorkspaceDependency: async (project) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      if (mockTatolabOptions.isRemovingAModuleRefused) throw `remove_dependency failed: the project still uses the import ${project}: ["wall_mapping"] reference it; remove them first`;
      return workspaceDependencies.remove(project);
    },
    cloneMarketplaceSample: async (name) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 6);
      const entry = mockPackageCatalogEntryNamed(name, mockTatolabOptions.platform);
      if (entry === undefined) throw `The catalog lists nothing named ${name}.`;
      if (entry.kind !== "sample") throw `${entry.title} is not a sample project; add it to a project instead.`;
      await mockMarketplaceDownloadOf(entry, mockTatolabOptions.marketplaceAddScenario);
      const location = mockNewProjectsFolder(fixtures.machine.homeDirectory);
      const folder = `${location}/${mockFirstNameNothingHolds(location, entry.title, mockFoldersOnDisk())}`;
      projectFolders.set(folder, { streamNames: ["main"], hasAPythonEnvironment: false });
      rememberTheProjectAsOpenedLast(folder, entry.title);
      return { folder, project_creation: null };
    },
  };
}
