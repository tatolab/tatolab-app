// Every value crossing this contract is JSON, carried over the MessagePort each view's frame is handed.

import type { JsonValue, OpenProjectReading, PortViewerTarget } from "../../shared/tatolab_backend_contract";
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
  JsonValue,
  OpenProjectReading,
  PortViewerTarget,
  StreamGraphNode,
  StreamGraphSummary,
  ProjectFileRead,
} from "../../shared/tatolab_backend_contract";
export type {
  ListedStreamsReading,
  NodeCatalogReading,
  ProjectFileReading,
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
export type {
  PortViewerEvent as PortViewerConnectionEvent,
  ViewOpeningTarget,
} from "@tatolab/tato-app-view-sdk";

/** Stops a watch; calling it again does nothing. */
export type StopWatching = () => void;


/** What views of one type were last opened on, in which layout; each opening has an id of its own, so opening on the same file or port again is a new opening. */
export interface ViewOpenedOnAsked {
  on: ViewOpeningTarget;
  opening_id: string;
  /** The layout chosen as the opening was asked for, whose areas alone are opened on it. */
  layout: string | null;
}

/** A view opened on a file or port in an area of the chosen layout, or why no area could show it. */
export type ViewOpening = { kind: "opened" } | { kind: "not_opened"; because: string };

/** One Python language server, started for a project folder, its JSON-RPC messages carried both ways. */
export interface PythonLanguageServerConnection {
  /** Send one JSON-RPC message; messages sent before the server has started are held and sent in order. */
  send(message: JsonValue): void;
  /** Stop the server; nothing arrives after. */
  close(): void;
}

/** A view node in a running stream: the stream and the node's UUID, as `graph` lists it under `id`. */
export interface StudioViewNodeAddress {
  stream: string;
  node_id: string;
}

/** Whether the runtime published a value a view wrote on one of its node's outputs, or why not, in its own words. */
export type StudioViewOutputWriting = { kind: "written" } | { kind: "not_written"; because: string };

/** One port viewer, reading a running node's output port until closed. */
export interface PortViewerConnection {
  /** Close the viewer; nothing arrives after. */
  close(): void;
}

/** Everything a view may read or ask for, besides its own area's settings. */
export interface StudioViewHostServices {
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
  /** Open a view of `viewTypeId` on `on`, in an area of the chosen layout showing that type, or of the first layout with one. */
  openView(viewTypeId: string, on: ViewOpeningTarget): ViewOpening;
  /** What views of `viewTypeId` in the chosen layout were last opened on, at once and again on each `openView` of that type; `null` until one is, or when it was opened in another layout. */
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
  /** Publish `value` on the output `port` of the view node `viewNode`, answering once the runtime took it or why it did not. */
  writeStudioViewOutput(viewNode: StudioViewNodeAddress, port: string, value: JsonValue): Promise<StudioViewOutputWriting>;
  /** Read `target`'s output port, each frame or message and the viewer's end arriving on `onEvent`. */
  watchPortViewer(target: PortViewerTarget, onEvent: (event: PortViewerEvent) => void): PortViewerConnection;
}

/** Who brought a view type: the studio itself, or the open project or one of its imports. */
export type StudioViewTypeSource = { kind: "tato_studio" } | { kind: "project"; project_name: string };
