import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { ProjectLogReadings } from "./project_log_readings";
import type { ProjectListingReadingsPolledWhileWatched } from "./project_listing_readings_polled_while_watched";
import type { ProjectAssetListing, ProjectNodeTypeListing } from "../../shared/tatolab_backend_contract";
import type { ProjectTransactionsReadings } from "./project_transactions_readings";
import type { PythonLanguageServerConnections } from "./python_language_server_connections";
import type { PortViewerConnections } from "./port_viewer_connections";
import type { ListedStreamsReading, OpenProjectReading, StreamTabAddress, StudioSelection, StudioViewHostServices, ViewOpenedOnAsked, ViewOpening, ViewOpeningTarget } from "./studio_view_contract";
import type { StreamGraphAndCatalogReadings } from "./stream_graph_and_catalog_readings";
import type { WatchedStudioValue } from "./watched_studio_value";

/** What the studio publishes to its views, and what it does when a view opens a stream's tab. */
export interface StudioWindowValuesServedToViews {
  openProject: WatchedStudioValue<OpenProjectReading>;
  listedStreams: WatchedStudioValue<ListedStreamsReading>;
  selection: WatchedStudioValue<StudioSelection>;
  activeStreamTab: WatchedStudioValue<StreamTabAddress | null>;
  openStreamTab(streamTab: StreamTabAddress): void;
  viewsOpenedOn: WatchedStudioValue<Readonly<Record<string, ViewOpenedOnAsked>>>;
  chosenLayout(): string | null;
  openView(viewTypeId: string, on: ViewOpeningTarget): ViewOpening;
}

/** What the host reads and writes of the open project and its imports for its views: their files through the backend, their logs, node types, assets and history, their language servers, and the port viewers of their running nodes. */
export interface StudioViewHostProjectServices {
  backend: Pick<TatolabBackend, "readProjectFile" | "saveProjectFile" | "listProjectFiles" | "writeStudioViewOutput">;
  projectLogReadings: ProjectLogReadings;
  projectNodeTypeReadings: ProjectListingReadingsPolledWhileWatched<ProjectNodeTypeListing>;
  projectAssetReadings: ProjectListingReadingsPolledWhileWatched<ProjectAssetListing>;
  projectTransactionsReadings: ProjectTransactionsReadings;
  pythonLanguageServerConnections: PythonLanguageServerConnections;
  portViewerConnections: PortViewerConnections;
}

/** What every view's bridge answers its frame from, read from `sources`, for a stream's graph and catalog from `streamReadings`, and for the open project and its imports from `projectServices`. */
export function studioViewHostServicesOf(
  sources: StudioWindowValuesServedToViews,
  streamReadings: StreamGraphAndCatalogReadings,
  projectServices: StudioViewHostProjectServices,
): StudioViewHostServices {
  const { backend } = projectServices;
  return {
    watchOpenProject: sources.openProject.watch,
    watchListedStreams: sources.listedStreams.watch,
    watchSelection: sources.selection.watch,
    select: (selection) => sources.selection.publish(selection),
    watchActiveStreamTab: sources.activeStreamTab.watch,
    openStreamTab: (streamTab) => sources.openStreamTab(streamTab),
    watchStreamGraph: streamReadings.watchStreamGraph,
    watchNodeCatalog: streamReadings.watchNodeCatalog,
    openView: (viewTypeId, on) => sources.openView(viewTypeId, on),
    watchViewOpenedOn: (viewTypeId, listener) => {
      let openingLastTold: string | null | undefined = undefined;
      return sources.viewsOpenedOn.watch((viewsOpenedOn) => {
        const openedOnAsked = viewsOpenedOn[viewTypeId];
        const openingForThisLayout = openedOnAsked !== undefined && openedOnAsked.layout === sources.chosenLayout() ? openedOnAsked : null;
        const openingId = openingForThisLayout?.opening_id ?? null;
        if (openingId === openingLastTold) return;
        openingLastTold = openingId;
        listener(openingForThisLayout === null ? null : { ...openingForThisLayout.on, opening_id: openingForThisLayout.opening_id });
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
    listProjectFiles: (projectFolder) =>
      backend.listProjectFiles(projectFolder).then(
        (projectFiles) => ({ kind: "listed", project_files: projectFiles }),
        (rejection: unknown) => ({ kind: "not_listed", because: describeBackendRejection(rejection) }),
      ),
    watchProjectLog: projectServices.projectLogReadings.watchProjectLog,
    watchProjectNodeTypes: projectServices.projectNodeTypeReadings.watchTheProject,
    watchProjectAssets: projectServices.projectAssetReadings.watchTheProject,
    watchProjectTransactions: projectServices.projectTransactionsReadings.watchProjectTransactions,
    undoInTheProject: projectServices.projectTransactionsReadings.undoInTheProject,
    redoInTheProject: projectServices.projectTransactionsReadings.redoInTheProject,
    transactInTheProject: projectServices.projectTransactionsReadings.transactInTheProject,
    readThePersonEditing: projectServices.projectTransactionsReadings.readThePersonEditing,
    connectToPythonLanguageServer: projectServices.pythonLanguageServerConnections.connectToPythonLanguageServer,
    writeStudioViewOutput: (viewNode, port, value) =>
      backend.writeStudioViewOutput(viewNode.stream, viewNode.node_id, port, value).then(
        () => ({ kind: "written" }),
        (rejection: unknown) => ({ kind: "not_written", because: describeBackendRejection(rejection) }),
      ),
    watchPortViewer: projectServices.portViewerConnections.watchPortViewer,
  };
}
