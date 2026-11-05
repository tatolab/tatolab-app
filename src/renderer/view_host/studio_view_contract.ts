// The one contract every view of the studio is built on. Every value crossing a host connection is
// JSON, so a view running sandboxed reaches the same interface over a MessagePort that a first-party
// view reaches in the window.

import type { ReactNode } from "react";
import type { JsonValue, ListedStream, NodeCatalog, OpenWorkspaceReading, StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import type { StudioIconName } from "../design_system/studio_icons";

export type {
  ImportedProject,
  JsonValue,
  ListedStream,
  NodeCatalog,
  NodeCatalogEntry,
  NodeCatalogPort,
  OpenWorkspace,
  OpenWorkspaceReading,
  ProjectOnDisk,
  StreamGraphDeclaredPort,
  StreamGraphLink,
  StreamGraphNode,
  StreamGraphSummary,
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

/** Everything a view may read or ask for. */
export interface StudioViewHostConnection<ViewSettings extends JsonValue> {
  /** The settings the view's area holds: restored from the layout, or the view type's defaults. */
  readonly settings: ViewSettings;
  /** Keep `nextSettings` with the area, saved with the layout. */
  rememberSettings(nextSettings: ViewSettings): void;
  watchOpenWorkspace(listener: (reading: OpenWorkspaceReading) => void): StopWatching;
  watchListedStreams(listener: (reading: ListedStreamsReading) => void): StopWatching;
  watchSelection(listener: (selection: StudioSelection) => void): StopWatching;
  select(selection: StudioSelection): void;
  watchActiveStreamTab(listener: (activeStreamTab: StreamTabAddress | null) => void): StopWatching;
  openStreamTab(streamTab: StreamTabAddress): void;
  /** The graph of `stream`, read while any view watches it and the window is shown; the first reading arrives once read. */
  watchStreamGraph(stream: string, listener: (reading: StreamGraphReading) => void): StopWatching;
  /** The node types `stream` can add, read when first watched and again once its graph names a type the catalog lacks. */
  watchNodeCatalog(stream: string, listener: (reading: NodeCatalogReading) => void): StopWatching;
}

/** Who brought a view type: the studio itself, or a project of the open workspace. */
export type StudioViewTypeSource = { kind: "built_in" } | { kind: "workspace_project"; project_name: string };

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
