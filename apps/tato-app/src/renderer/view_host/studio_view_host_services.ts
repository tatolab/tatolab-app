import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { ProjectLogReadings } from "./project_log_readings";
import type { ProjectListingReadingsWhileWatched } from "./project_listing_readings_while_watched";
import type { AssetPreviewPicture, AssetPreviewReading, PackageCatalogReading, ProjectAssetListing } from "../../shared/tatolab_backend_contract";
import type { ProjectTransactionsReadings } from "./project_transactions_readings";
import type { PythonLanguageServerConnections } from "./python_language_server_connections";
import type { PortViewerConnections } from "./port_viewer_connections";
import type { MarketplaceModuleAdding, MarketplaceReading, ProjectStreamsRecovery } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { AreasForAViewTypeInTheWindow, ListedStreamsReading, OpenProjectReading, StopWatching, ProjectChanging, ProjectStreamsRecovering, ProjectAssetsImporting, StreamTabAddress, StudioSelection, StudioViewHostServices, StudioViewsReading, ViewOpenedOnAsked, ViewOpening, ViewOpeningTarget } from "./studio_view_contract";
import type { StreamGraphReadings } from "./stream_graph_readings";
import type { ProjectNodeTypesDescribedReadings } from "./project_node_types_described_readings";
import type { WatchedStudioValue } from "./watched_studio_value";
import type { ProjectAssetPick, ProjectAssetPickEnding } from "@tatolab/tato-app-view-sdk";
import type { ProjectAssetPickAnswering } from "./project_asset_pick_held_in_the_window";
import type { NodeUiElementsReading } from "@tatolab/tato-app-view-sdk/node_ui_host";

/** What the studio publishes to its views, and what it does when a view opens a stream's tab. */
export interface StudioWindowValuesServedToViews {
  openProject: WatchedStudioValue<OpenProjectReading>;
  listedStreams: WatchedStudioValue<ListedStreamsReading>;
  selection: WatchedStudioValue<StudioSelection>;
  select(selection: StudioSelection): void;
  activeStreamTab: WatchedStudioValue<StreamTabAddress | null>;
  openStreamTab(streamTab: StreamTabAddress): void;
  viewsOpenedOn: WatchedStudioValue<Readonly<Record<string, ViewOpenedOnAsked>>>;
  openView(viewTypeId: string, on: ViewOpeningTarget): ViewOpening;
  watchAreasForTheViewType(viewTypeId: string, listener: (reading: AreasForAViewTypeInTheWindow) => void): StopWatching;
  showViewTypeInArea(viewTypeId: string, areaId: string): ViewOpening;
  pickAProjectAsset(pick: ProjectAssetPick): Promise<ProjectAssetPickEnding>;
  answerTheProjectAssetPick(asset: string): ProjectAssetPickAnswering;
  endTheProjectAssetPick(because: string): void;
}

/** What the host reads and writes of the open project and its imports for its views: their files through the backend, their logs, node types, assets and history, their language servers, and the port viewers of their running nodes. */
export interface StudioViewHostProjectServices {
  backend: Pick<TatolabBackend, "readProjectFile" | "saveProjectFile" | "createNodeFile" | "listProjectFiles" | "importAssetsIntoTheOpenProject" | "relocateAssetInTheOpenProject" | "readAssetPreviewOfTheOpenProject" | "deleteAssetFromTheOpenProject" | "setNodeTypeGroupInTheOpenProject" | "openModuleManagerWindow" | "readPackageCatalog" | "importFromTheMarketplace" | "stopOpenProject" | "runOpenProject" | "reloadProject">;
  projectLogReadings: ProjectLogReadings;
  projectNodeTypesDescribedReadings: ProjectNodeTypesDescribedReadings;
  projectAssetReadings: ProjectListingReadingsWhileWatched<ProjectAssetListing>;
  projectTransactionsReadings: ProjectTransactionsReadings;
  pythonLanguageServerConnections: PythonLanguageServerConnections;
  portViewerConnections: PortViewerConnections;
  /** The views an area can show, at once and again each time the open project's are listed. */
  watchStudioViews(listener: (reading: StudioViewsReading) => void): StopWatching;
  /** The node UI elements every view's control table picks from, once listed and again on each change. */
  watchNodeUiElements(listener: (reading: NodeUiElementsReading) => void): StopWatching;
}

/** The catalog as a view reads the Marketplace: each entry's kind, name, title, summary, nodes and whether it runs on this machine, or why the catalog was not read. */
function marketplaceReadingOfTheCatalog(catalog: PackageCatalogReading): MarketplaceReading {
  if (catalog.kind === "not_read") return catalog;
  return {
    kind: "read",
    entries: catalog.entries.map((entry) => ({
      kind: entry.kind,
      name: entry.name,
      title: entry.title,
      summary: entry.summary,
      nodes: entry.nodes.map((node) => ({ name: node.name, summary: node.summary })),
      runs_on_this_machine: entry.runs_on_this_machine,
    })),
  };
}

/** Why a view naming a folder other than the window's open project imports nothing into it. */
export function onlyTheOpenProjectImportsAssetsRefusal(projectFolder: string): string {
  return `Tato Studio imports assets into this window's project only, not ${projectFolder}.`;
}

/** What a view's Import asset… reaches: the window's open project, the backend that asks the person and imports, and the project's asset listing to read again. */
export interface AssetImportForAViewSources {
  readTheOpenProject: () => OpenProjectReading;
  backend: Pick<TatolabBackend, "importAssetsIntoTheOpenProject">;
  listTheProjectAgainNow: (projectFolder: string) => void;
}

/** The files the person chooses, the dialog offering those of `media`, imported into `projectFolder` when it is the window's open project, its asset listing read again at once; refused for any other folder. */
export async function importAssetsIntoTheOpenProjectForAView(projectFolder: string, media: readonly string[] | null, assetImportSources: AssetImportForAViewSources): Promise<ProjectAssetsImporting> {
  const openProject = assetImportSources.readTheOpenProject();
  if (openProject.kind !== "read" || openProject.open_project.project.folder !== projectFolder) return { kind: "not_imported", because: onlyTheOpenProjectImportsAssetsRefusal(projectFolder) };
  return assetImportSources.backend.importAssetsIntoTheOpenProject(media).then(
    (assetsImported): ProjectAssetsImporting => {
      assetImportSources.listTheProjectAgainNow(projectFolder);
      return assetsImported === null ? { kind: "nothing_chosen" } : { kind: "imported", assets_imported: assetsImported };
    },
    (rejection: unknown): ProjectAssetsImporting => ({ kind: "not_imported", because: describeBackendRejection(rejection) }),
  );
}

/** What a view's change to the window's project reaches: the open project, what of it changes in Studio's words, as "assets", and the listing of that to read again. */
export interface ProjectChangeForAViewSources {
  readTheOpenProject: () => OpenProjectReading;
  readonly whatChanges: "assets" | "node type groups";
  listTheProjectAgainNow: (projectFolder: string) => void;
}

/** `change`, a change through the backend such as an asset's move or a node type's group, made when `projectFolder` is the window's open project, what it changed listed again at once; refused for any other folder. */
export function changeTheOpenProjectForAView(projectFolder: string, changeSources: ProjectChangeForAViewSources, change: () => Promise<void>): Promise<ProjectChanging> {
  const openProject = changeSources.readTheOpenProject();
  if (openProject.kind !== "read" || openProject.open_project.project.folder !== projectFolder) {
    return Promise.resolve({ kind: "not_changed", because: `Tato Studio changes the ${changeSources.whatChanges} of this window's project only, not ${projectFolder}.` });
  }
  return change().then(
    (): ProjectChanging => {
      changeSources.listTheProjectAgainNow(projectFolder);
      return { kind: "changed" };
    },
    (rejection: unknown): ProjectChanging => ({ kind: "not_changed", because: describeBackendRejection(rejection) }),
  );
}

/** What a view's recovery of a project's streams reaches: the window's open project, and the backend that stops, starts and reloads it. */
export interface ProjectStreamsRecoveryForAViewSources {
  readTheOpenProject: () => OpenProjectReading;
  readTheListedStreams: () => ListedStreamsReading;
  backend: Pick<TatolabBackend, "stopOpenProject" | "runOpenProject" | "reloadProject">;
}

/** Start the open project's playback again, stopping it first while a stream of it plays. */
function restartTheOpenProjectsPlayback(projectFolder: string, sources: ProjectStreamsRecoveryForAViewSources): Promise<void> {
  const stopped = doesAStreamOfTheProjectPlay(sources.readTheListedStreams(), projectFolder) ? sources.backend.stopOpenProject() : Promise.resolve();
  return stopped.then(() => sources.backend.runOpenProject());
}

/** Whether a stream of `projectFolder` plays, so a restart stops it first: by its condition's playback, or, from a runtime that lists no condition, while it runs. */
function doesAStreamOfTheProjectPlay(listedStreams: ListedStreamsReading, projectFolder: string): boolean {
  if (listedStreams.kind !== "listed") return false;
  return listedStreams.streams.some(
    (listed) => listed.location?.project_directory === projectFolder && (listed.condition === null ? listed.state === "running" : listed.condition.playback !== "stopped"),
  );
}

/**
 * Recover the streams of `projectFolder` with `recovery` when it is the window's open project: its playback started again,
 * stopped first while a stream of it plays, since the runtime refuses to stop a project none of whose streams plays; or the
 * project reloaded. Refused for any other folder, or in the runtime's own words.
 */
export function recoverTheOpenProjectsStreamsForAView(projectFolder: string, recovery: ProjectStreamsRecovery, sources: ProjectStreamsRecoveryForAViewSources): Promise<ProjectStreamsRecovering> {
  const openProject = sources.readTheOpenProject();
  if (openProject.kind !== "read" || openProject.open_project.project.folder !== projectFolder) {
    return Promise.resolve({ kind: "not_asked", because: `Tato Studio recovers the streams of this window's project only, not ${projectFolder}.` });
  }
  const recovered = recovery === "restart_the_playback" ? restartTheOpenProjectsPlayback(projectFolder, sources) : sources.backend.reloadProject(projectFolder);
  return recovered.then(
    (): ProjectStreamsRecovering => ({ kind: "asked" }),
    (rejection: unknown): ProjectStreamsRecovering => ({ kind: "not_asked", because: describeBackendRejection(rejection) }),
  );
}

/** The preview picture of `asset` of the window's project for a view, when `projectFolder` names it, read with `readThePicture`; refused for any other folder, or in the runtime's own words. */
export function readAnAssetPreviewOfTheOpenProjectForAView(projectFolder: string, readTheOpenProject: () => OpenProjectReading, readThePicture: () => Promise<AssetPreviewPicture>): Promise<AssetPreviewReading> {
  const openProject = readTheOpenProject();
  if (openProject.kind !== "read" || openProject.open_project.project.folder !== projectFolder) {
    return Promise.resolve({ kind: "not_read", because: `Tato Studio reads the assets of this window's project only, not ${projectFolder}.` });
  }
  return readThePicture().then(
    (picture): AssetPreviewReading => ({ kind: "read", picture }),
    (rejection: unknown): AssetPreviewReading => ({ kind: "not_read", because: describeBackendRejection(rejection) }),
  );
}

/** What every view's bridge answers its frame from, read from `sources`, for a stream's graph and input values from `streamReadings`, and for the open project and its imports from `projectServices`. */
export function studioViewHostServicesOf(
  sources: StudioWindowValuesServedToViews,
  streamReadings: StreamGraphReadings,
  projectServices: StudioViewHostProjectServices,
): StudioViewHostServices {
  const { backend } = projectServices;
  const assetChangeSources: ProjectChangeForAViewSources = {
    readTheOpenProject: sources.openProject.readLatest,
    whatChanges: "assets",
    listTheProjectAgainNow: (folder) => projectServices.projectAssetReadings.listTheProjectAgainNow(folder),
  };
  const nodeTypeGroupChangeSources: ProjectChangeForAViewSources = {
    readTheOpenProject: sources.openProject.readLatest,
    whatChanges: "node type groups",
    listTheProjectAgainNow: (folder) => projectServices.projectNodeTypesDescribedReadings.listTheProjectAgainNow(folder),
  };
  return {
    watchOpenProject: sources.openProject.watch,
    watchListedStreams: sources.listedStreams.watch,
    watchSelection: sources.selection.watch,
    select: (selection) => sources.select(selection),
    pickAProjectAsset: (pick) => sources.pickAProjectAsset(pick),
    watchProjectAssetPickShownHere: (listener) => {
      listener(null);
      return () => undefined;
    },
    answerTheProjectAssetPick: (asset) => sources.answerTheProjectAssetPick(asset),
    endTheProjectAssetPick: (because) => sources.endTheProjectAssetPick(because),
    watchActiveStreamTab: sources.activeStreamTab.watch,
    openStreamTab: (streamTab) => sources.openStreamTab(streamTab),
    watchStreamGraph: streamReadings.watchStreamGraph,
    watchStreamInputValues: streamReadings.watchStreamInputValues,
    openView: (viewTypeId, on) => sources.openView(viewTypeId, on),
    watchAreasForTheViewType: (viewTypeId, listener) => sources.watchAreasForTheViewType(viewTypeId, listener),
    showViewTypeInArea: (viewTypeId, areaId) => sources.showViewTypeInArea(viewTypeId, areaId),
    watchViewOpenedOn: (viewTypeId, listener) => {
      let openingLastTold: string | null | undefined = undefined;
      return sources.viewsOpenedOn.watch((viewsOpenedOn) => {
        const openedOnAsked = viewsOpenedOn[viewTypeId];
        const openingId = openedOnAsked?.opening_id ?? null;
        if (openingId === openingLastTold) return;
        openingLastTold = openingId;
        listener(openedOnAsked === undefined ? null : { ...openedOnAsked.on, opening_id: openedOnAsked.opening_id });
      });
    },
    readProjectFile: (file) =>
      backend.readProjectFile(file).then(
        (fileRead) => ({ kind: "read", file_read: fileRead }),
        (rejection: unknown) => ({ kind: "not_read", because: describeBackendRejection(rejection) }),
      ),
    saveProjectFile: (file, text, basedOnVersion) =>
      backend.saveProjectFile(file, text, basedOnVersion).then(
        (fileSaved) => ({ kind: "saved", version: fileSaved.version }),
        (rejection: unknown) => ({ kind: "not_saved", because: describeBackendRejection(rejection) }),
      ),
    createNodeFile: (file) =>
      backend.createNodeFile(file).then(
        (nodeFileCreated) => ({ kind: "created", file: nodeFileCreated.file, node_type: nodeFileCreated.node_type }),
        (rejection: unknown) => ({ kind: "not_created", because: describeBackendRejection(rejection) }),
      ),
    listProjectFiles: (projectFolder) =>
      backend.listProjectFiles(projectFolder).then(
        (projectFiles) => ({ kind: "listed", project_files: projectFiles }),
        (rejection: unknown) => ({ kind: "not_listed", because: describeBackendRejection(rejection) }),
      ),
    watchProjectLog: projectServices.projectLogReadings.watchProjectLog,
    watchNodeTypes: projectServices.projectNodeTypesDescribedReadings.watchTheProject,
    watchProjectAssets: projectServices.projectAssetReadings.watchTheProject,
    importAssetsIntoTheProject: (projectFolder, media) =>
      importAssetsIntoTheOpenProjectForAView(projectFolder, media, {
        readTheOpenProject: sources.openProject.readLatest,
        backend,
        listTheProjectAgainNow: (folder) => projectServices.projectAssetReadings.listTheProjectAgainNow(folder),
      }),
    watchStudioViews: projectServices.watchStudioViews,
    watchNodeUiElements: projectServices.watchNodeUiElements,
    relocateAssetInTheProject: (projectFolder, asset, toPath) =>
      changeTheOpenProjectForAView(projectFolder, assetChangeSources, () => backend.relocateAssetInTheOpenProject(asset, toPath)),
    readAssetPreviewInTheProject: (projectFolder, asset) => readAnAssetPreviewOfTheOpenProjectForAView(projectFolder, sources.openProject.readLatest, () => backend.readAssetPreviewOfTheOpenProject(asset)),
    deleteAssetFromTheProject: (projectFolder, asset) => changeTheOpenProjectForAView(projectFolder, assetChangeSources, () => backend.deleteAssetFromTheOpenProject(asset)),
    setNodeTypeGroupInTheProject: (projectFolder, nodeType, group) =>
      changeTheOpenProjectForAView(projectFolder, nodeTypeGroupChangeSources, () => backend.setNodeTypeGroupInTheOpenProject(nodeType, group)),
    recoverTheProjectsStreams: (projectFolder, recovery) => recoverTheOpenProjectsStreamsForAView(projectFolder, recovery, { readTheOpenProject: sources.openProject.readLatest, readTheListedStreams: sources.listedStreams.readLatest, backend }),
    openModulesAndMarketplace: (shows, page) =>
      backend.openModuleManagerWindow({ shows, page }).then(
        (): ViewOpening => ({ kind: "opened" }),
        (rejection: unknown): ViewOpening => ({ kind: "not_opened", because: describeBackendRejection(rejection) }),
      ),
    readTheMarketplace: () => backend.readPackageCatalog().then(marketplaceReadingOfTheCatalog),
    addFromTheMarketplace: (name) =>
      backend.importFromTheMarketplace(name).then(
        // Only the Module manager offers Cancel, so a view's own add is never cancelled; the words say so if one were.
        (imported): MarketplaceModuleAdding => (imported.kind === "imported" ? { kind: "added", folder: imported.dependency.folder } : { kind: "not_added", because: "Its download was cancelled; nothing was added." }),
        (rejection: unknown): MarketplaceModuleAdding => ({ kind: "not_added", because: describeBackendRejection(rejection) }),
      ),
    watchProjectTransactions: projectServices.projectTransactionsReadings.watchProjectTransactions,
    undoInTheProject: projectServices.projectTransactionsReadings.undoInTheProject,
    redoInTheProject: projectServices.projectTransactionsReadings.redoInTheProject,
    transactInTheProject: projectServices.projectTransactionsReadings.transactInTheProject,
    checkLinkCandidates: projectServices.projectTransactionsReadings.checkLinkCandidates,
    readThePersonEditing: projectServices.projectTransactionsReadings.readThePersonEditing,
    connectToPythonLanguageServer: projectServices.pythonLanguageServerConnections.connectToPythonLanguageServer,
    watchPortViewer: projectServices.portViewerConnections.watchPortViewer,
  };
}
