// The one contract every view of the studio is built on. Every value crossing a host connection is
// JSON, so a view running sandboxed reaches the same interface over a MessagePort that a first-party
// view reaches in the window.

import type { ReactNode } from "react";
import type {
  JsonValue,
  ListedStream,
  NodeCatalog,
  OpenProjectReading,
  PoppedOutViewerTarget,
  PortViewerMessageReading,
  PortViewerTarget,
  ProjectLogRecord,
  StreamGraphSummary,
  ProjectFileRead,
  ProjectFiles,
} from "../../shared/tatolab_backend_contract";
import type { StudioIconName } from "../design_system/studio_icons";

export type {
  ImportedProject,
  JsonValue,
  ListedStream,
  NodeCatalog,
  NodeCatalogEntry,
  NodeCatalogPort,
  OpenProject,
  OpenProjectReading,
  PoppedOutViewerTarget,
  PortViewerArrayAttributeReading,
  PortViewerChannelWaveform,
  PortViewerMessageReading,
  PortViewerTarget,
  ProjectLogRecord,
  ProjectOnDisk,
  StreamGraphDeclaredPort,
  StreamGraphLink,
  StreamGraphNode,
  StreamGraphSummary,
  ProjectFileRead,
  ProjectFiles,
} from "../../shared/tatolab_backend_contract";
export type { StudioIconName } from "../design_system/studio_icons";

/** Stops a watch; calling it again does nothing. */
export type StopWatching = () => void;

/** What the studio has selected, which every view shows and any view may change. */
export type StudioSelection =
  | { kind: "nothing" }
  | { kind: "project"; project_name: string; project_folder: string | null }
  | { kind: "stream"; stream: string; project_folder: string }
  | { kind: "node"; stream: string; node: string };

/** A stream a tab is open on: its id, and the project and words its tab is labelled with. */
export interface StreamTabAddress {
  stream: string;
  project_name: string;
  display_name: string;
}

/** The streams the runtime lists, or why it lists none now, in its own words. */
export type ListedStreamsReading = { kind: "listed"; streams: ListedStream[] } | { kind: "not_listed"; because: string };

/** A stream's graph as the runtime renders it now, or why it renders none, in its own words. */
export type StreamGraphReading = { kind: "read"; graph: StreamGraphSummary } | { kind: "not_read"; because: string };

/** The node types a stream can add, or why the runtime lists none, in its own words. */
export type NodeCatalogReading = { kind: "listed"; catalog: NodeCatalog } | { kind: "not_listed"; because: string };

/** A file of the open project and its imports as read from disk, or why it was not, in the words of what refused. */
export type ProjectFileReading = { kind: "read"; file_read: ProjectFileRead } | { kind: "not_read"; because: string };

/** A Viewer popped out into a window of its own, or why it was not, in the words of what refused. */
export type ViewerPopOut = { kind: "popped_out" } | { kind: "not_popped_out"; because: string };

/** A file saved, with the version it now has on disk, or why nothing was written. */
export type ProjectFileSaving = { kind: "saved"; version: string } | { kind: "not_saved"; because: string };

/** A project's files, or why they were not listed. */
export type ProjectFilesListing = { kind: "listed"; project_files: ProjectFiles } | { kind: "not_listed"; because: string };

/** A project's log as read so far, its latest records last, or why the runtime gives none now, in its own words. */
export type ProjectLogReading =
  | { kind: "read"; records: ProjectLogRecord[]; records_no_longer_held: boolean }
  | { kind: "not_read"; because: string };

/** The file the studio asked a code view to show, as Stream › Open stream.py does; `ask` counts up so asking for the same file again is a new ask. */
export interface CodeFileAsked {
  file: string;
  ask: number;
}

/** What a Python language server connection delivers: one JSON-RPC message the server sent, or the server's end with why. */
export type PythonLanguageServerConnectionEvent = { kind: "message"; message: JsonValue } | { kind: "ended"; because: string };

/** One Python language server, started for a project folder, its JSON-RPC messages carried both ways. */
export interface PythonLanguageServerConnection {
  /** Send one JSON-RPC message; messages sent before the server has started are held and sent in order. */
  send(message: JsonValue): void;
  /** Stop the server; nothing arrives after. */
  close(): void;
}

/** What a port viewer delivers: an Image frame to draw, as a `VideoFrame` the view closes once drawn or as its pixels; another family's message, read by its family; or the viewer reopening or ending, with why. */
export type PortViewerConnectionEvent =
  | { kind: "image_frame"; video_frame: VideoFrame; format_wire_name: string; skipped_since_last_read: number }
  | { kind: "image_pixels"; width: number; height: number; format_wire_name: string; bytes_per_row: number; pixels: Uint8Array; skipped_since_last_read: number }
  | { kind: "message"; reading: PortViewerMessageReading; skipped_since_last_read: number }
  | { kind: "reopening"; because: string }
  | { kind: "ended"; because: string };

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
  readProjectFile(file: string): Promise<ProjectFileReading>;
  /** Write `text` to `file` whole when it is still at `basedOnVersion` on disk (`null` for a new file); never over a file changed since, or an import's. */
  saveProjectFile(file: string, text: string, basedOnVersion: string | null): Promise<ProjectFileSaving>;
  listProjectFiles(projectFolder: string): Promise<ProjectFilesListing>;
  /** `projectFolder`'s log, read while any view watches it and the window is shown; the first reading arrives once read. */
  watchProjectLog(projectFolder: string, listener: (reading: ProjectLogReading) => void): StopWatching;
  /** Pop a Viewer pinned to `target` out into a window of its own, or bring forward the one already pinned there. */
  popOutViewer(target: PoppedOutViewerTarget): Promise<ViewerPopOut>;
  /** Start Pyright's language server for `projectFolder`, each message and its end arriving on `onEvent`. */
  connectToPythonLanguageServer(projectFolder: string, onEvent: (event: PythonLanguageServerConnectionEvent) => void): PythonLanguageServerConnection;
  /** Read `target`'s output port, each frame or message and the viewer's end arriving on `onEvent`. */
  watchPortViewer(target: PortViewerTarget, onEvent: (event: PortViewerConnectionEvent) => void): PortViewerConnection;
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
