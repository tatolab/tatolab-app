// The one contract every view of the studio is built on. Every value crossing a host connection is
// JSON, so a project's view reaches the same interface over a MessagePort from its own frame that a
// first-party view reaches in the window.

import type { ReactNode } from "react";
import type { JsonValue, OpenProjectReading, PortViewerTarget } from "../../shared/tatolab_backend_contract";
import type { StudioIconName } from "@tatolab/tato-app-view-sdk/design_system/support/studio_icons";
import type {
  ListedStreamsReading,
  NodeCatalogReading,
  ProjectFileReading,
  ProjectFileSaving,
  ProjectFilesListing,
  ProjectLogReading,
  ProjectNodeTypesReading,
  ProjectTransactionApplying,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  PythonLanguageServerConnectionEvent,
  StreamGraphReading,
  StreamTabAddress,
  StudioSelection,
  ViewOpenedOn,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import type { PortViewerEvent, ViewOpeningTarget } from "@tatolab/tato-app-view-sdk";

export type {
  ImportedProject,
  JsonValue,
  ListedStream,
  NodeCatalog,
  NodeCatalogEntry,
  NodeCatalogPort,
  OpenProject,
  OpenProjectReading,
  PortViewerArrayAttributeReading,
  PortViewerChannelWaveform,
  PortViewerMessageReading,
  PortViewerTarget,
  PortStreamFacts,
  ProjectLogRecord,
  ProjectTheRuntimeNames,
  StreamGraphDeclaredPort,
  StreamGraphLink,
  StreamGraphNode,
  StreamGraphSummary,
  ProjectFileRead,
  ProjectFiles,
  ProjectGraphGenerator,
  ProjectNodeModuleNotReadable,
  ProjectNodeType,
  ProjectNodeTypeListing,
  ProjectNodeTypePort,
  ProjectNodeTypeSource,
  ProjectNodeTypeSourceOrigin,
} from "../../shared/tatolab_backend_contract";
export type { StudioIconName } from "@tatolab/tato-app-view-sdk/design_system/support/studio_icons";
export type {
  ListedStreamsReading,
  NodeCatalogReading,
  ProjectFileReading,
  ProjectFileSaving,
  ProjectFilesListing,
  ProjectLogReading,
  ProjectNodeTypesReading,
  ProjectTransaction,
  ProjectTransactionApplying,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  PythonLanguageServerConnectionEvent,
  StreamGraphReading,
  StreamTabAddress,
  StudioSelection,
  ViewHeaderRow,
  ViewOpenedOn,
} from "@tatolab/tato-app-view-sdk/studio_readings";
export type { PortViewerEvent as PortViewerConnectionEvent, ViewOpeningTarget } from "@tatolab/tato-app-view-sdk";

/** Stops a watch; calling it again does nothing. */
export type StopWatching = () => void;


/** What views of one type were last opened on; `ask` counts up, so opening on the same file or port again is a new opening. */
export interface ViewOpenedOnAsked {
  on: ViewOpeningTarget;
  ask: number;
}

/** A view opened on a file or port in an area of the chosen layout, or why no area could show it. */
export type ViewOpening = { kind: "opened" } | { kind: "not_opened"; because: string };

/** The file the studio asked a code view to show, as opening a node's own file does; `ask` counts up so asking for the same file again is a new ask. */
export interface CodeFileAsked {
  file: string;
  ask: number;
}

/** One Python language server, started for a project folder, its JSON-RPC messages carried both ways. */
export interface PythonLanguageServerConnection {
  /** Send one JSON-RPC message; messages sent before the server has started are held and sent in order. */
  send(message: JsonValue): void;
  /** Stop the server; nothing arrives after. */
  close(): void;
}

/** One port viewer, reading a running node's output port until closed. */
export interface PortViewerConnection {
  /** Close the viewer; nothing arrives after. */
  close(): void;
}

/** Everything a view may read or ask for. */
export interface StudioViewHostConnection<ViewSettings extends JsonValue> {
  /** The settings the view's area holds: restored from the layout, or the view type's defaults. */
  readonly settings: ViewSettings;
  /** Keep `nextSettings` with the area, saved with the layout. */
  rememberSettings(nextSettings: ViewSettings): void;
  watchOpenProject(listener: (reading: OpenProjectReading) => void): StopWatching;
  watchListedStreams(listener: (reading: ListedStreamsReading) => void): StopWatching;
  watchSelection(listener: (selection: StudioSelection) => void): StopWatching;
  select(selection: StudioSelection): void;
  watchActiveStreamTab(listener: (activeStreamTab: StreamTabAddress | null) => void): StopWatching;
  openStreamTab(streamTab: StreamTabAddress): void;
  /** The graph of `stream`, read while any view watches it and the window is shown; the first reading arrives once read. */
  watchStreamGraph(stream: string, listener: (reading: StreamGraphReading) => void): StopWatching;
  /** The node types `stream` can add, read when first watched and again once its graph names a type the catalog lacks. */
  watchNodeCatalog(stream: string, listener: (reading: NodeCatalogReading) => void): StopWatching;
  /** The file the studio last asked a code view to show; `null` until one is asked for. */
  watchCodeFileAsked(listener: (codeFileAsked: CodeFileAsked | null) => void): StopWatching;
  /** Ask the studio's code view to show `file`, an absolute path in the open project. */
  openCodeFile(file: string): void;
  /** Open a view of `viewTypeId` on `on`, in an area of the chosen layout showing that type, or of the first layout with one. */
  openView(viewTypeId: string, on: ViewOpeningTarget): ViewOpening;
  /** What views of `viewTypeId` were last opened on, at once and again on each `openView` of that type; `null` until one is. */
  watchViewOpenedOn(viewTypeId: string, listener: (openedOn: ViewOpenedOn) => void): StopWatching;
  readProjectFile(file: string): Promise<ProjectFileReading>;
  /** Write `text` to `file` whole when it is still at `basedOnVersion` on disk (`null` for a new file); never over a file changed since, or an import's. */
  saveProjectFile(file: string, text: string, basedOnVersion: string | null): Promise<ProjectFileSaving>;
  listProjectFiles(projectFolder: string): Promise<ProjectFilesListing>;
  /** `projectFolder`'s log, read while any view watches it and the window is shown; the first reading arrives once read. */
  watchProjectLog(projectFolder: string, listener: (reading: ProjectLogReading) => void): StopWatching;
  /** What `projectFolder` and each source it draws node code from declares, listed while any view watches it and the window is shown; the first reading arrives once listed. */
  watchProjectNodeTypes(projectFolder: string, listener: (reading: ProjectNodeTypesReading) => void): StopWatching;
  /** The open project's change feed, when `projectFolder` is its folder: read once, then again each time the runtime applies a transaction. */
  watchProjectTransactions(projectFolder: string, listener: (reading: ProjectTransactionsReading) => void): StopWatching;
  /** The runtime's `undo` by `author` on the open project, answering the undo it applied or its refusal. */
  undoInTheProject(projectFolder: string, author: ProjectTransactionAuthor): Promise<ProjectTransactionApplying>;
  /** The runtime's `redo` by `author` on the open project, answering the redo it applied or its refusal. */
  redoInTheProject(projectFolder: string, author: ProjectTransactionAuthor): Promise<ProjectTransactionApplying>;
  /** Start Pyright's language server for `projectFolder`, each message and its end arriving on `onEvent`. */
  connectToPythonLanguageServer(projectFolder: string, onEvent: (event: PythonLanguageServerConnectionEvent) => void): PythonLanguageServerConnection;
  /** Read `target`'s output port, each frame or message and the viewer's end arriving on `onEvent`. */
  watchPortViewer(target: PortViewerTarget, onEvent: (event: PortViewerEvent) => void): PortViewerConnection;
}

/** Who brought a view type: the studio itself, or the open project or one of its imports. */
export type StudioViewTypeSource = { kind: "built_in" } | { kind: "project"; project_name: string };

/** What a view draws: tools in its area's header, after the view-type menu, and its body. */
export interface StudioViewRendering {
  header_tools: ReactNode;
  body: ReactNode;
}

/** One kind of view an area can show. */
export interface StudioViewType<ViewSettings extends JsonValue> {
  view_type_id: string;
  title: string;
  icon: StudioIconName;
  brought_by: StudioViewTypeSource;
  default_settings: ViewSettings;
  /** Settings restored from a saved layout, or `null` when they no longer fit, and the area opens on the defaults. */
  settingsFromSavedLayout(savedSettings: JsonValue): ViewSettings | null;
  /** The view drawn into its area, reading and asking only through `connection`. */
  renderStudioView(connection: StudioViewHostConnection<ViewSettings>): StudioViewRendering;
}
