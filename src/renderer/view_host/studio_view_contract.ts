// The one contract every view of the studio is built on. Every value crossing a host connection is
// JSON, so a view running sandboxed reaches the same interface over a MessagePort that a first-party
// view reaches in the window.

import type { ReactNode } from "react";
import type {
  AgentOnThisMachine,
  AgentStarted,
  JsonValue,
  ListedStream,
  NodeCatalog,
  OpenWorkspaceReading,
  ProjectLogRecord,
  StreamGraphSummary,
  WorkspaceFileRead,
  WorkspaceProjectFiles,
} from "../../shared/tatolab_backend_contract";
import type { StudioIconName } from "../design_system/studio_icons";

export type {
  AgentInstallOnThisMachine,
  AgentOnThisMachine,
  AgentStarted,
  AgentStdioMcpServer,
  ImportedProject,
  JsonValue,
  ListedStream,
  NodeCatalog,
  NodeCatalogEntry,
  NodeCatalogPort,
  OpenWorkspace,
  OpenWorkspaceReading,
  ProjectLogRecord,
  ProjectOnDisk,
  StreamGraphDeclaredPort,
  StreamGraphLink,
  StreamGraphNode,
  StreamGraphSummary,
  WorkspaceFileRead,
  WorkspaceProjectFiles,
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

/** A file of the open workspace's projects as read from disk, or why it was not, in the words of what refused. */
export type WorkspaceFileReading = { kind: "read"; file_read: WorkspaceFileRead } | { kind: "not_read"; because: string };

/** A file saved, with the version it now has on disk, or why nothing was written. */
export type WorkspaceFileSaving = { kind: "saved"; version: string } | { kind: "not_saved"; because: string };

/** A project's files, or why they were not listed. */
export type WorkspaceProjectFilesListing = { kind: "listed"; project_files: WorkspaceProjectFiles } | { kind: "not_listed"; because: string };

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

/** The agents the studio runs, each installed on this machine or not, or why they could not be described. */
export type AgentsOnThisMachineReading = { kind: "described"; agents: AgentOnThisMachine[] } | { kind: "not_described"; because: string };

/** What an agent connection delivers: the agent started, with where it runs and the runtime's MCP servers for it; one JSON-RPC message it sent; or its end with why. */
export type AgentConnectionEvent = { kind: "started"; started: AgentStarted } | { kind: "message"; message: JsonValue } | { kind: "ended"; because: string };

/** One Agent Client Protocol agent, started in the workspace project's folder, its JSON-RPC messages carried both ways. */
export interface AgentConnection {
  /** Send one JSON-RPC message; messages sent before the agent has started are held and sent in order. */
  send(message: JsonValue): void;
  /** Stop the agent; nothing arrives after. */
  close(): void;
}

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
  /** The file the studio last asked a code view to show; `null` until one is asked for. */
  watchCodeFileAsked(listener: (codeFileAsked: CodeFileAsked | null) => void): StopWatching;
  /** Ask the studio's code view to show `file`, an absolute path in the open workspace. */
  openCodeFile(file: string): void;
  readWorkspaceFile(file: string): Promise<WorkspaceFileReading>;
  /** Write `text` to `file` whole when it is still at `basedOnVersion` on disk (`null` for a new file); never over a file changed since, or an import's. */
  saveWorkspaceFile(file: string, text: string, basedOnVersion: string | null): Promise<WorkspaceFileSaving>;
  listWorkspaceProjectFiles(projectFolder: string): Promise<WorkspaceProjectFilesListing>;
  /** `projectFolder`'s log, read while any view watches it and the window is shown; the first reading arrives once read. */
  watchProjectLog(projectFolder: string, listener: (reading: ProjectLogReading) => void): StopWatching;
  /** Start Pyright's language server for `projectFolder`, each message and its end arriving on `onEvent`. */
  connectToPythonLanguageServer(projectFolder: string, onEvent: (event: PythonLanguageServerConnectionEvent) => void): PythonLanguageServerConnection;
  describeAgentsOnThisMachine(): Promise<AgentsOnThisMachineReading>;
  /** Start the agent `agentId` names in the open workspace project's folder, each event arriving on `onEvent`. */
  connectToAgent(agentId: string, onEvent: (event: AgentConnectionEvent) => void): AgentConnection;
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
