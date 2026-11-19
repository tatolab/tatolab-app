import { mockPackageCatalogEntryNamed, mockPackageCatalogReading } from "./mock_package_catalog";
import { whyTheModuleBringsNothingOnThisMachine } from "../src/shared/package_catalog_machine_words";
import { marketplaceDownloadFileNameOf, MODULE_DOWNLOADS_FOLDER_NAME } from "@tatolab/tato-app-view-sdk/marketplace_modules";
import { mockFirstNameNothingHolds, mockNewProjectsFolder } from "./mock_open_project";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import type { MarketplaceImportProgressed, MarketplaceImportStage, PackageCatalogEntry, ProjectDependency } from "../src/shared/tatolab_backend_contract";
import { MODULE_MANAGER_ENTRY_QUERY_PARAMETER, MODULE_MANAGER_QUERY_PARAMETER, MODULE_MANAGER_SECTION_QUERY_PARAMETER, type MockTatolabOptions } from "./mock_tatolab_options";
import { MOCK_COMMAND_LATENCY_MILLISECONDS } from "./mock_tatolab_simulation_constants";
import { mockPageUrlWith, sleep, type MockTatolabSimulation } from "./mock_tatolab_simulation";

/** How many bytes each mock Marketplace download is, as its server's Content-Length says. */
const MOCK_MARKETPLACE_DOWNLOAD_BYTES = 41_943_040;
/** The runs of bytes a mock Marketplace download is read in, a command's latency apart, so a test sees it end soon. */
const MOCK_MARKETPLACE_DOWNLOAD_RUNS = 6;
/** The runs of bytes, and the milliseconds between them, a download that never ends is read in, at a pace a person can watch; it stops reading at 31%. */
const MOCK_NEVER_ENDING_DOWNLOAD_RUNS = 100;
const MOCK_NEVER_ENDING_DOWNLOAD_RUNS_READ = 31;
const MOCK_NEVER_ENDING_DOWNLOAD_RUN_MILLISECONDS = 120;

/** One Marketplace download the mock has under way: the stage it last told, and its Cancel. */
interface MockMarketplaceDownload {
  stage: MarketplaceImportStage;
  stopper: AbortController;
}

/**
 * What downloading `entry`'s `.zip` comes to under `scenario`, each stage told to `stageReached`: downloaded, stopped once `stopped` aborts while
 * it reads, refused in the main process's words once checked, or reading forever until stopped.
 */
async function mockMarketplaceDownloadOf(
  entry: PackageCatalogEntry,
  scenario: MockTatolabOptions["marketplaceAddScenario"],
  stageReached: (stage: MarketplaceImportStage) => void,
  stopped: AbortSignal,
): Promise<"downloaded" | "stopped"> {
  const isNeverEnding = scenario === "never_ends";
  const runs = isNeverEnding ? MOCK_NEVER_ENDING_DOWNLOAD_RUNS : MOCK_MARKETPLACE_DOWNLOAD_RUNS;
  for (let run = 0; run <= (isNeverEnding ? MOCK_NEVER_ENDING_DOWNLOAD_RUNS_READ : runs); run++) {
    if (stopped.aborted) return "stopped";
    stageReached({ kind: "downloading", bytes_read: Math.round((MOCK_MARKETPLACE_DOWNLOAD_BYTES * run) / runs), bytes_total: MOCK_MARKETPLACE_DOWNLOAD_BYTES });
    await sleep(isNeverEnding ? MOCK_NEVER_ENDING_DOWNLOAD_RUN_MILLISECONDS : MOCK_COMMAND_LATENCY_MILLISECONDS);
  }
  if (isNeverEnding) {
    if (stopped.aborted) return "stopped";
    await new Promise((stoppedNow) => stopped.addEventListener("abort", stoppedNow, { once: true }));
    return "stopped";
  }
  if (stopped.aborted) return "stopped";
  if (entry.download !== null) stageReached({ kind: "verifying", sha256: entry.download.sha256 });
  await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
  if (scenario === "refused" && entry.download !== null) {
    throw `${entry.download.url} downloaded with the SHA-256 28f81bad7f6b5604175f7a68654b8bd984e7cae54433ccc891d2128094f1c97d, not the catalog's ${entry.download.sha256}; nothing was imported.`;
  }
  return "downloaded";
}

/** The mock backend's modules methods over `simulation`. */
export function mockModulesBackendOf(simulation: MockTatolabSimulation): Pick<TatolabBackend, "openModuleManagerWindow" | "readModuleManagerWorkspace" | "readModuleManagerSectionLastAsked" | "onModuleManagerSectionAsked" | "readPackageCatalog" | "listWorkspaceDependencies" | "chooseDependencySource" | "addDependencyToTheWorkspace" | "updateWorkspaceDependency" | "importFromTheMarketplace" | "cancelMarketplaceImport" | "onMarketplaceImportProgressed" | "removeWorkspaceDependency" | "cloneMarketplaceSample"> {
  const { fixtures, workspaceDependencies, mockFoldersOnDisk, rememberTheProjectAsOpenedLast, projectFolders, mockTatolabOptions, nodeTypesTheProjectGains, openProjectListeners } = simulation;
  /** The open project listing `added` among its imports, as the runtime's `list_dependencies` lists a module once its copy is in `imports/`, each window watching it told. */
  const theOpenProjectTakesTheModule = (added: ProjectDependency, name: string) => {
    const reading = simulation.openProjectReading;
    if (reading.kind !== "read") return;
    const folder = `${reading.open_project.project.folder}/imports/${added.folder}`;
    const importedProject = { project: added.project, name, folder: added.folder, copied_from: added.source, source: { kind: "folder" as const, project: { folder, project: added.project, name } } };
    simulation.openProjectReading = { ...reading, open_project: { ...reading.open_project, imports: [...reading.open_project.imports, importedProject] } };
    for (const openProjectListener of openProjectListeners) openProjectListener(structuredClone(simulation.openProjectReading));
  };
  const marketplaceDownloadsByName = new Map<string, MockMarketplaceDownload>();
  const marketplaceImportProgressedListeners = new Set<(progressed: MarketplaceImportProgressed) => void>();
  return {
    openModuleManagerWindow: async ({ shows, page }) => {
      const moduleManagerUrl = mockPageUrlWith(mockPageUrlWith(window.location.href, MODULE_MANAGER_QUERY_PARAMETER, "open"), MODULE_MANAGER_SECTION_QUERY_PARAMETER, shows);
      window.open(page === null ? moduleManagerUrl : mockPageUrlWith(moduleManagerUrl, MODULE_MANAGER_ENTRY_QUERY_PARAMETER, page), "_blank");
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
      if (marketplaceDownloadsByName.has(name)) throw `${name} is being added from this window already.`;
      const download: MockMarketplaceDownload = { stage: { kind: "downloading", bytes_read: 0, bytes_total: null }, stopper: new AbortController() };
      marketplaceDownloadsByName.set(name, download);
      const stageReached = (stage: MarketplaceImportStage) => {
        download.stage = stage;
        for (const listener of marketplaceImportProgressedListeners) listener({ name, stage });
      };
      try {
        if ((await mockMarketplaceDownloadOf(entry, mockTatolabOptions.marketplaceAddScenario, stageReached, download.stopper.signal)) === "stopped") return { kind: "cancelled" };
        stageReached({ kind: "adding" });
        await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      } finally {
        marketplaceDownloadsByName.delete(name);
      }
      const downloadsFolder = `${fixtures.machine.homeDirectory}/Library/Application Support/Tato Studio/${MODULE_DOWNLOADS_FOLDER_NAME}`;
      const added = workspaceDependencies.add(`${downloadsFolder}/${marketplaceDownloadFileNameOf(entry.name, entry.version)}`, entry.title);
      theOpenProjectTakesTheModule(added, entry.title);
      nodeTypesTheProjectGains.takeTheModule(entry.name, entry.version, entry.nodes);
      return { kind: "imported", dependency: added };
    },
    cancelMarketplaceImport: async (name) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const download = marketplaceDownloadsByName.get(name);
      if (download === undefined) throw `No add of ${name} is under way in this window.`;
      if (download.stage.kind !== "downloading") throw `${name} is downloaded already and being added; it can no longer be cancelled.`;
      download.stopper.abort();
    },
    onMarketplaceImportProgressed: (listener) => {
      marketplaceImportProgressedListeners.add(listener);
      return () => {
        marketplaceImportProgressedListeners.delete(listener);
      };
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
      await mockMarketplaceDownloadOf(entry, mockTatolabOptions.marketplaceAddScenario, () => undefined, new AbortController().signal);
      const location = mockNewProjectsFolder(fixtures.machine.homeDirectory);
      const folder = `${location}/${mockFirstNameNothingHolds(location, entry.title, mockFoldersOnDisk())}`;
      projectFolders.set(folder, { streamNames: ["main"], hasAPythonEnvironment: false });
      rememberTheProjectAsOpenedLast(folder, entry.title);
      return { folder, project_creation: null };
    },
  };
}
