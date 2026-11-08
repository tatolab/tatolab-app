import type {
  ChosenProjectFolder,
  JsonValue,
  PythonLanguageServerEvent,
  PortViewerEvent,
  PortViewerImageFrameFacts,
  PortViewerTarget,
  ProjectFileRead,
  ProjectFileSaved,
  ProjectFiles,
  NodeCatalog,
  OpenProjectReading,
  PoppedOutViewerTarget,
  PackageCatalogReading,
  ImportPreview,
  RecentProject,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  RuntimeDescription,
  StreamGraphSummary,
  ProjectCreationQueued,
  ProjectRunQueued,
  StreamActionCancelAnswer,
  StreamActionFollowed,
  StreamProjectFolderChosenFor,
  TatolabStatus,
  TatolabStreamActionName,
  ProjectFolderChosenFor,
  NewProjectDefaults,
  SystemMenuBarMenu,
} from "../../shared/tatolab_backend_contract";
import { TATOLAB_WINDOW_PAGE_SCHEME, type TatolabElectronBridge } from "../../shared/tatolab_electron_bridge_contract";

declare global {
  interface Window {
    /** Set by the app's preload; absent in a browser. */
    tatolabElectronBridge?: TatolabElectronBridge;
  }
}

/** The app backend's commands and status event, real inside the packaged app or mocked in a browser. */
export interface TatolabBackend {
  getTatolabStatus(): Promise<TatolabStatus>;
  /** Link `~/.local/bin/tatolab` to the CLI the app carries, resolving once it is linked and rejecting in words when something else holds the name or the build offers none. */
  linkCommandLineTool(): Promise<void>;
  /** Quit the app, stopping its runtime with it. */
  quitTatolabApp(): Promise<void>;
  /** The page of `projectDirectory`'s log after the cursor `after`, from its first record when `null`, narrowed as `narrowing` asks; rejects in the runtime's own words. */
  readProjectLogRecords(projectDirectory: string, narrowing: ProjectLogNarrowing, after: string | null): Promise<ProjectLogRecordsPage>;
  describeStreamGraph(streamId: string): Promise<StreamGraphSummary>;
  /** Every node type the loaded stream `streamId` can add, rejecting in the runtime's own words. */
  describeNodeCatalog(streamId: string): Promise<NodeCatalog>;
  /** Check for a newer Tato Studio, downloading one that installs in place; how that goes arrives as the status's `app_update`. */
  checkForTatolabAppUpdates(): Promise<void>;
  /** Restart into a downloaded Tato Studio, download one a check found, or open a `.deb`'s download; how that goes arrives as the status's `app_update`. */
  takeTheNewerTatolabAppVersion(): Promise<void>;
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
  /** Queue `run_project` in `folder`, which loads every stream asset in it, resolving with the action queued and rejecting in the runtime's own words. */
  runStreamProject(folder: string): Promise<ProjectRunQueued>;
  /** Queue `run_project` on `projectDirectory`, a project the runtime lists, which loads every stream asset in it again, resolving with the action queued and rejecting in the runtime's own words. */
  reloadProject(projectDirectory: string): Promise<ProjectRunQueued>;
  /** Where the stream action `action` has got to, or the runtime's words that it no longer holds it; rejects when the runtime does not answer. */
  describeStreamAction(action: string): Promise<StreamActionFollowed>;
  /** End the stream action `action` early, resolving once the runtime has dropped it or begun stopping it and rejecting in its own words, as for a stop past cancelling; the streams it leaves arrive as the next statuses. */
  cancelStreamAction(action: string): Promise<StreamActionCancelAnswer>;
  /** How the running runtime describes itself, rejecting in its own words when it does not answer. */
  describeRuntime(): Promise<RuntimeDescription>;
  /** Stop the app's runtime and start it again, resolving once it is asked to and rejecting in words for a runtime the app did not start; the state that follows arrives as the next statuses. */
  restartRuntime(): Promise<void>;
  /** Show the folder the runtime writes its own log to in the file manager, rejecting with why it could not. */
  openRuntimeLogFolder(): Promise<void>;
  /** Turn the notifications shown when a stream fails on or off, resolving once it is remembered and rejecting with why it was not; the switch arrives as the next status. */
  setStreamFailureNotifications(enabled: boolean): Promise<void>;
  /** Have the desktop open Tatolab at login, or stop, resolving once it has and rejecting in its words; what it reports arrives as the next status. */
  setOpenTatolabAtLogin(enabled: boolean): Promise<void>;
  onTatolabStatusChanged(listener: (status: TatolabStatus) => void): Promise<() => void>;
  /** Calls `listener` with the stream each request from the app to show a stream's page names; the returned function stops it. */
  onStreamPageRequested(listener: (streamId: string) => void): () => void;
  /** Show the Projects window and bring it forward. */
  showTheProjectsWindow(): Promise<void>;
  /** macOS: show `menus` in the system menu bar while this window is in focus, rejecting in words for menus out of the contract's shape. */
  showTheMenusInTheSystemMenuBar(menus: SystemMenuBarMenu[]): Promise<void>;
  /** Calls `listener` with the `entry_id` of each entry the person chooses in the system menu bar from this window's menus; the returned function stops it. */
  onSystemMenuBarEntryChosen(listener: (entryId: string) => void): () => void;
  /** Ask the person for a project folder in the app's dialog and open it in its own window, or bring forward the window it has; `null` when they cancel, rejecting in the dialog's own words. */
  chooseProjectFolder(chosenFor: ProjectFolderChosenFor): Promise<ChosenProjectFolder | null>;
  /** The location and name the New project sheet opens with: `<Documents>/Tato Studio` and the first untitled name free there. */
  readNewProjectDefaults(): Promise<NewProjectDefaults>;
  /** Ask the person for the folder a new project goes in, in the app's dialog opened at `startingAt`; `null` when they cancel. */
  chooseNewProjectLocation(startingAt: string): Promise<string | null>;
  /** Create the project `name` in `location` with the runtime and open it, rejecting with nothing made in the app's or the runtime's own words. The project read arrives as the next open-project change. */
  createNewProject(name: string, location: string): Promise<ChosenProjectFolder>;
  /** Pop a Viewer pinned to `target` out of this studio window into a window of its own, or bring forward the one already pinned there; rejects in words from any other window. */
  popOutViewer(target: PoppedOutViewerTarget): Promise<void>;
  /** What this window is pinned to when it is a popped-out Viewer; `null` in the Projects and studio windows. */
  readPoppedOutViewer(): Promise<PoppedOutViewerTarget | null>;
  /** Open this studio window's Get more window, or bring it forward; rejects in words from any other window. */
  openGetMoreWindow(): Promise<void>;
  /** This window's workspace when it is a Get more window, as last read from disk; `null` in any other window. Later readings arrive through `onOpenProjectChanged`. */
  readGetMoreWorkspace(): Promise<OpenProjectReading | null>;
  /** The catalog get.tatolab.com serves, or why it was not read. */
  readPackageCatalog(): Promise<PackageCatalogReading>;
  /** The workspace's `pyproject.toml` before and after `requirement` is added, nothing written; rejects in words where it cannot be added. */
  previewImport(requirement: string): Promise<ImportPreview>;
  /** Write what `previewImport` showed while `pyproject.toml` is still at `basedOnVersion`; rejects with nothing written otherwise. */
  importIntoWorkspace(requirement: string, basedOnVersion: string): Promise<void>;
  /** Open the workspace's import `name`, one from a folder, in its own studio window; rejects in words for any other. */
  openImportToEdit(name: string): Promise<void>;
  /** This window's project as the app last read it from disk; `none_open` in the Projects window. */
  readOpenProject(): Promise<OpenProjectReading>;
  /** The projects opened before, recent first, for the Projects window. */
  readRecentProjects(): Promise<RecentProject[]>;
  /** Open `folder`, one of the recent projects, in its own window, rejecting for any other folder or in the words of what refused. */
  openRecentProject(folder: string): Promise<void>;
  /** Calls `listener` with each reading of the open project: another folder opened, or a `pyproject.toml` it reads changed; the returned function stops it. */
  onOpenProjectChanged(listener: (reading: OpenProjectReading) => void): () => void;
  /** `file` of the open project and its imports, as read from disk, rejecting for a file outside them or in the filesystem's words. */
  readProjectFile(file: string): Promise<ProjectFileRead>;
  /** Write `text` to `file` whole when the file on disk is still at `basedOnVersion` (`null` for a new file), rejecting with nothing written when it changed, belongs to an import, or the filesystem refuses. */
  saveProjectFile(file: string, text: string, basedOnVersion: string | null): Promise<ProjectFileSaved>;
  /** The Python files and `pyproject.toml` of `projectFolder`, the folder of the open project or of one of its imports. */
  listProjectFiles(projectFolder: string): Promise<ProjectFiles>;
  /** Queue `run_project` on the open project's folder, resolving with the action queued and rejecting in the runtime's own words. */
  runOpenProject(): Promise<ProjectRunQueued>;
  /** Start Pyright's language server in `projectFolder`, resolving with the session its messages arrive under. */
  startPythonLanguageServer(projectFolder: string): Promise<string>;
  /** Send one JSON-RPC `message` to the language server of `session`, rejecting once it has ended. */
  sendToPythonLanguageServer(session: string, message: JsonValue): Promise<void>;
  stopPythonLanguageServer(session: string): Promise<void>;
  /** Calls `listener` with each message a language server sends and each server's end; the returned function stops it. */
  onPythonLanguageServerEvent(listener: (event: PythonLanguageServerEvent) => void): () => void;
  /** Read `target`'s output port while the port viewer is open, resolving with the id its events arrive under and rejecting in the runtime's own words. */
  openPortViewer(target: PortViewerTarget): Promise<string>;
  closePortViewer(portViewer: string): Promise<void>;
  /** Calls `listener` with each event of every port viewer the window opened; the returned function stops it. */
  onPortViewerEvent(listener: (event: PortViewerEvent) => void): () => void;
  /** Calls `listener` with each Image frame a port viewer hands over as a `VideoFrame`, which the listener closes once drawn; the returned function stops it. */
  onPortViewerImageFrame(listener: (videoFrame: VideoFrame, frameFacts: PortViewerImageFrameFacts) => void): () => void;
}

/** Where the page runs: the packaged app's window with the preload's bridge, the app's own page without it, or a browser showing the mock. */
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
