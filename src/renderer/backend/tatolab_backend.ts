import type {
  AgentEvent,
  AgentsOnThisMachine,
  AgentStarted,
  ChosenWorkspaceFolder,
  JsonValue,
  PythonLanguageServerEvent,
  WorkspaceFileRead,
  WorkspaceFileSaved,
  WorkspaceProjectFiles,
  NodeCatalog,
  OpenWorkspaceReading,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  RelaySettingsByName,
  RelaysDescription,
  RuntimeDescription,
  StreamGraphSummary,
  ProjectCreationQueued,
  ProjectRunQueued,
  StreamActionCancelAnswer,
  StreamActionFollowed,
  StreamProjectFolderChosenFor,
  TatolabStatus,
  TatolabStreamActionName,
  WorkspaceFolderChosenFor,
} from "../../shared/tatolab_backend_contract";
import { TATOLAB_WINDOW_PAGE_SCHEME, type TatolabElectronBridge } from "../../shared/tatolab_electron_bridge_contract";

declare global {
  interface Window {
    /** Set by the app's preload; absent in a browser. */
    tatolabElectronBridge?: TatolabElectronBridge;
  }
}

/** The app backend's commands and status event, real inside Tatolab.app or mocked in a browser. */
export interface TatolabBackend {
  getTatolabStatus(): Promise<TatolabStatus>;
  setRunTatolab(enabled: boolean): Promise<void>;
  openLoginItemsSettings(): Promise<void>;
  /** "Get Started": end first run, resolving once it is remembered and rejecting with why it was not; the window shows the Streams list either way. */
  rememberFirstRunFinished(): Promise<void>;
  /** Link `tatolab` in `/usr/local/bin` behind macOS's administrator prompt, resolving once it is linked and rejecting in words when the prompt is cancelled or the link is not offered. */
  linkCommandLineToolInUsrLocalBin(): Promise<void>;
  quitTatolabApp(): Promise<void>;
  /** On macOS uninstalls Tatolab and quits at the end, rejecting with the reason when it can't; on Linux rejects with how to. */
  uninstallTatolab(): Promise<void>;
  /** The page of `projectDirectory`'s log after the cursor `after`, from its first record when `null`, narrowed as `narrowing` asks; rejects in the runtime's own words. */
  readProjectLogRecords(projectDirectory: string, narrowing: ProjectLogNarrowing, after: string | null): Promise<ProjectLogRecordsPage>;
  describeStreamGraph(streamId: string): Promise<StreamGraphSummary>;
  /** Every node type the loaded stream `streamId` can add, rejecting in the runtime's own words. */
  describeNodeCatalog(streamId: string): Promise<NodeCatalog>;
  /** Check for a newer Tatolab and take it if there is one; how that goes arrives as the status's `app_update`. */
  checkForTatolabAppUpdates(): Promise<void>;
  /** Queue a stop or a start (or retry) of `streamId`, resolving once the runtime has queued it and rejecting with its refusal; the stream's `stopping` or `preparing` arrives as the next status. */
  runStreamAction(streamAction: TatolabStreamActionName, streamId: string): Promise<void>;
  /** Queue the removal of every stream the runtime holds from `projectDirectory`, resolving once it is queued and rejecting with its refusal; the streams stopping, then gone, arrive as the next statuses. */
  removeProject(projectDirectory: string): Promise<void>;
  /** Show the stream `streamId` under `displayName`, resolving once the runtime has recorded it and rejecting with its refusal; the new name arrives as the next status. */
  renameStream(streamId: string, displayName: string): Promise<void>;
  /** Show the project folder the runtime lists for `streamId` in the file manager, rejecting with why it could not. */
  openStreamProjectFolder(streamId: string): Promise<void>;
  /** Open a terminal in the project folder the runtime lists for `streamId`, rejecting with why it could not. */
  openTerminalAtStreamProject(streamId: string): Promise<void>;
  /** Show the log folder under the project folder the runtime lists for `streamId` in the file manager, rejecting with why it could not. */
  openStreamLogFolder(streamId: string): Promise<void>;
  /** Ask the person for a folder in the app's dialog and resolve with it, its links resolved, or `null` when they cancel. A folder it answers is one the window may name. */
  chooseStreamProjectFolder(chosenFor: StreamProjectFolderChosenFor): Promise<string | null>;
  /** Queue `create_project` in `folder`, or with `null` in a folder the runtime draws under `~/streams`, resolving with the action queued and rejecting in the runtime's own words. */
  createStreamProject(folder: string | null): Promise<ProjectCreationQueued>;
  /** Queue `run_project` in `folder`, which loads every `@stream` in it, resolving with the action queued and rejecting in the runtime's own words. */
  runStreamProject(folder: string): Promise<ProjectRunQueued>;
  /** Queue `run_project` on `projectDirectory`, a project the runtime lists, which loads every `@stream` in it again, resolving with the action queued and rejecting in the runtime's own words. */
  reloadProject(projectDirectory: string): Promise<ProjectRunQueued>;
  /** Where the stream action `action` has got to, or the runtime's words that it no longer holds it; rejects when the runtime does not answer. */
  describeStreamAction(action: string): Promise<StreamActionFollowed>;
  /** End the stream action `action` early, resolving once the runtime has dropped it or begun stopping it and rejecting in its own words, as for a stop past cancelling; the streams it leaves arrive as the next statuses. */
  cancelStreamAction(action: string): Promise<StreamActionCancelAnswer>;
  /** How the running runtime describes itself, rejecting in its own words when it does not answer. */
  describeRuntime(): Promise<RuntimeDescription>;
  /** Stop the runtime and start it again through the service manager, resolving once the service manager has answered and rejecting in its words; the state that follows arrives as the next statuses. */
  restartRuntime(): Promise<void>;
  /** Run the installer on the runtime the app carries again after it refused, resolving once it ends and rejecting in its words; where it stands arrives as the next statuses. */
  installTheCarriedRuntimeAgain(): Promise<void>;
  /** Show the folder the runtime writes its own log to in the file manager, rejecting with why it could not. */
  openRuntimeLogFolder(): Promise<void>;
  /** Turn the notifications shown when a stream fails on or off, resolving once it is remembered and rejecting with why it was not; the switch arrives as the next status. */
  setStreamFailureNotifications(enabled: boolean): Promise<void>;
  /** Have the desktop open Tatolab at login, or stop, resolving once it has and rejecting in its words; what it reports arrives as the next status. */
  setOpenTatolabAtLogin(enabled: boolean): Promise<void>;
  /** Every relay the runtime holds and every adapter it can join one through, rejecting in the runtime's own words. */
  describeRelays(): Promise<RelaysDescription>;
  /** Add a relay of `adapter` with `settings`, its secrets among them, resolving with the id the runtime gave it and rejecting in the runtime's own words. */
  addRelay(adapter: string, settings: Readonly<RelaySettingsByName>): Promise<string>;
  /** Replace the settings named in `settings` on the relay `relayId`, `null` returning one to its default; rejects in the runtime's own words. */
  configureRelay(relayId: string, settings: Readonly<RelaySettingsByName>): Promise<void>;
  /** Leave and forget the relay `relayId`, rejecting in the runtime's own words, as it refuses a built-in relay. */
  removeRelay(relayId: string): Promise<void>;
  onTatolabStatusChanged(listener: (status: TatolabStatus) => void): Promise<() => void>;
  /** Calls `listener` with the stream each request from the app to show a stream's page names; the returned function stops it. */
  onStreamPageRequested(listener: (streamId: string) => void): () => void;
  /** Ask the person for a workspace folder in the app's dialog and open it, a new one's project queued with the runtime first; `null` when they cancel, rejecting in the dialog's or the runtime's own words. The workspace read arrives as the next open-workspace change. */
  chooseWorkspaceFolder(chosenFor: WorkspaceFolderChosenFor): Promise<ChosenWorkspaceFolder | null>;
  /** The open workspace as the app last read it from disk. */
  readOpenWorkspace(): Promise<OpenWorkspaceReading>;
  /** Calls `listener` with each reading of the open workspace: another folder opened, or a `pyproject.toml` it reads changed; the returned function stops it. */
  onOpenWorkspaceChanged(listener: (reading: OpenWorkspaceReading) => void): () => void;
  /** `file` of the open workspace's projects, as read from disk, rejecting for a file outside them or in the filesystem's words. */
  readWorkspaceFile(file: string): Promise<WorkspaceFileRead>;
  /** Write `text` to `file` whole when the file on disk is still at `basedOnVersion` (`null` for a new file), rejecting with nothing written when it changed, belongs to an import, or the filesystem refuses. */
  saveWorkspaceFile(file: string, text: string, basedOnVersion: string | null): Promise<WorkspaceFileSaved>;
  /** The Python files and `pyproject.toml` of `projectFolder`, a project folder of the open workspace. */
  listWorkspaceProjectFiles(projectFolder: string): Promise<WorkspaceProjectFiles>;
  /** Queue `run_project` on the open workspace's folder, resolving with the action queued and rejecting in the runtime's own words. */
  runWorkspaceProject(): Promise<ProjectRunQueued>;
  /** Start Pyright's language server in `projectFolder`, resolving with the session its messages arrive under. */
  startPythonLanguageServer(projectFolder: string): Promise<string>;
  /** Send one JSON-RPC `message` to the language server of `session`, rejecting once it has ended. */
  sendToPythonLanguageServer(session: string, message: JsonValue): Promise<void>;
  stopPythonLanguageServer(session: string): Promise<void>;
  /** Calls `listener` with each message a language server sends and each server's end; the returned function stops it. */
  onPythonLanguageServerEvent(listener: (event: PythonLanguageServerEvent) => void): () => void;
  /** Every agent the studio runs, each installed on this machine or not. */
  describeAgents(): Promise<AgentsOnThisMachine>;
  /** Start the agent `agentId` in the open workspace project's folder, resolving with its session; rejecting while no workspace is open or for an agent not installed, naming its install command. */
  startAgent(agentId: string): Promise<AgentStarted>;
  /** Send one JSON-RPC `message` to the agent of `session`, rejecting once it has ended. */
  sendToAgent(session: string, message: JsonValue): Promise<void>;
  stopAgent(session: string): Promise<void>;
  /** Calls `listener` with each message an agent sends and each agent's end; the returned function stops it. */
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
}

/** Where the page runs: Tatolab.app's window with the preload's bridge, the app's own page without it, or a browser showing the mock. */
export type TatolabWindowHost =
  | { kind: "electron"; tatolabElectronBridge: TatolabElectronBridge }
  | { kind: "electron_without_its_bridge" }
  | { kind: "browser" };

/** The host this page runs in, told by what each one puts on `window` and the scheme it is served under. */
export function tatolabWindowHost(): TatolabWindowHost {
  if (window.tatolabElectronBridge !== undefined) return { kind: "electron", tatolabElectronBridge: window.tatolabElectronBridge };
  if (window.location.protocol === `${TATOLAB_WINDOW_PAGE_SCHEME}:`) return { kind: "electron_without_its_bridge" };
  return { kind: "browser" };
}

/** The text of a rejected command: the Electron backend rejects with the app's refusal string. */
export function describeBackendRejection(rejection: unknown): string {
  if (typeof rejection === "string") return rejection;
  if (rejection instanceof Error) return rejection.message;
  return JSON.stringify(rejection);
}
