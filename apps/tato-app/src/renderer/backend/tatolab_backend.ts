import type {
  ChosenProjectFolder,
  JsonValue,
  ListedStudioView,
  PythonLanguageServerEvent,
  PortViewerEvent,
  PortViewerImageFrameFacts,
  PortViewerTarget,
  ProjectFileRead,
  ProjectFileSaved,
  ProjectFiles,
  NodeCatalog,
  ProjectNodeTypeListing,
  OpenProjectReading,
  ProjectTransaction,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  PoppedOutView,
  PackageCatalogReading,
  DependencySourceKind,
  ProjectDependency,
  WorkspaceDependency,
  WorkspaceDependencyUpdate,
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
  /** What the project in `projectDirectory` and each source it draws node code from declares, read from source without running it; rejects in the runtime's own words. */
  listProjectNodeTypes(projectDirectory: string): Promise<ProjectNodeTypeListing>;
  /** Check for a newer Tato Studio, downloading one that installs in place; how that goes arrives as the status's `app_update`. */
  checkForTatolabAppUpdates(): Promise<void>;
  /** Restart into a downloaded Tato Studio, download one a check found, or open a `.deb`'s download; how that goes arrives as the status's `app_update`. */
  takeTheNewerTatolabAppVersion(): Promise<void>;
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
  /** Pop the view `target` names out of this studio window into a window of its own, or bring forward the one already popped out the same way; rejects in words from any other window. */
  popOutView(target: PoppedOutView): Promise<void>;
  /** The view this window shows when it is a popped-out view; `null` in the Projects and studio windows. */
  readPoppedOutView(): Promise<PoppedOutView | null>;
  /** Open this studio window's Module manager window, or bring it forward; rejects in words from any other window. */
  openModuleManagerWindow(): Promise<void>;
  /** This window's workspace when it is a Module manager window, as last read from disk; `null` in any other window. Later readings arrive through `onOpenProjectChanged`. */
  readModuleManagerWorkspace(): Promise<OpenProjectReading | null>;
  /** The catalog get.tatolab.com serves, or why it was not read. */
  readPackageCatalog(): Promise<PackageCatalogReading>;
  /** The workspace's imports as the runtime lists them, each source read for a newer version with `checkForNewer`; rejects in the runtime's own words. */
  listWorkspaceDependencies(checkForNewer: boolean): Promise<WorkspaceDependency[]>;
  /** A project's folder or `.zip`, as `sourceKind` says, chosen in the desktop's dialog; `null` when the person cancels. */
  chooseDependencySource(sourceKind: DependencySourceKind): Promise<string | null>;
  /** Copy the project in `source`, an absolute folder or `.zip`, into the workspace's `imports/`; rejects in the runtime's own words. */
  addDependencyToTheWorkspace(source: string): Promise<ProjectDependency>;
  /** Copy the import `project` again from its source, overwriting files edited since its copy only with `overwriteEditedFiles`; rejects in the runtime's own words. */
  updateWorkspaceDependency(project: string, overwriteEditedFiles: boolean): Promise<WorkspaceDependencyUpdate>;
  /** Download the catalog entry `name`'s `.zip`, check it, and import it into the workspace; rejects in words. */
  importFromTheMarketplace(name: string): Promise<ProjectDependency>;
  /** Open the workspace's `imports/<folder>/` in its own studio window; rejects in words for a folder it does not import. */
  openImportToEdit(folder: string): Promise<void>;
  /** The full path of a file dropped on the window, or `""` for one with none, as a dragged-in browser item. */
  pathOfADroppedFile(droppedFile: File): string;
  /** This window's project as the app last read it from disk; `none_open` in the Projects window. */
  readOpenProject(): Promise<OpenProjectReading>;
  /** The projects opened before, recent first, for the Projects window. */
  readRecentProjects(): Promise<RecentProject[]>;
  /** Open `folder`, one of the recent projects, in its own window, rejecting for any other folder or in the words of what refused. */
  openRecentProject(folder: string): Promise<void>;
  /** Calls `listener` with each reading of the open project: another folder opened, a change in one of its folders, or the runtime starting to answer; the returned function stops it. */
  onOpenProjectChanged(listener: (reading: OpenProjectReading) => void): () => void;
  /** This window's project's change feed as the app last read it from the runtime; refused in the Projects window. Later readings arrive through `onProjectTransactionsChanged`. */
  readOpenProjectTransactions(): Promise<ProjectTransactionsReading>;
  /** Calls `listener` with each reading of the open project's change feed: a transaction the runtime applied, or the feed lost or followed again; the returned function stops it. */
  onProjectTransactionsChanged(listener: (reading: ProjectTransactionsReading) => void): () => void;
  /** The runtime's `undo` by `author` on the open project, resolving with the undo it applied and rejecting in the runtime's own words. */
  undoInTheOpenProject(author: ProjectTransactionAuthor): Promise<ProjectTransaction>;
  /** The runtime's `redo` by `author` on the open project, resolving with the redo it applied and rejecting in the runtime's own words. */
  redoInTheOpenProject(author: ProjectTransactionAuthor): Promise<ProjectTransaction>;
  /** `file` of the open project and its imports, as read from disk, rejecting for a file outside them or in the filesystem's words. */
  readProjectFile(file: string): Promise<ProjectFileRead>;
  /** Write `text` to `file` whole when the file on disk is still at `basedOnVersion` (`null` for a new file), rejecting with nothing written when it changed, belongs to an import, or the filesystem refuses. */
  saveProjectFile(file: string, text: string, basedOnVersion: string | null): Promise<ProjectFileSaved>;
  /** The Python files and `pyproject.toml` of `projectFolder`, the folder of the open project or of one of its imports. */
  listProjectFiles(projectFolder: string): Promise<ProjectFiles>;
  /** Queue `run_project` on the open project's folder, resolving with the action queued and rejecting in the runtime's own words. */
  runOpenProject(): Promise<ProjectRunQueued>;
  /** Queue `stop_project` on the open project's folder, resolving once it is queued and rejecting in the runtime's own words; its streams' `stopping`, then `stopped`, arrive as the next statuses. */
  stopOpenProject(): Promise<void>;
  /** Start Pyright's language server in `projectFolder`, resolving with the session its messages arrive under. */
  startPythonLanguageServer(projectFolder: string): Promise<string>;
  /** Send one JSON-RPC `message` to the language server of `session`, rejecting once it has ended. */
  sendToPythonLanguageServer(session: string, message: JsonValue): Promise<void>;
  stopPythonLanguageServer(session: string): Promise<void>;
  /** Calls `listener` with each message a language server sends and each server's end; the returned function stops it. */
  onPythonLanguageServerEvent(listener: (event: PythonLanguageServerEvent) => void): () => void;
  /** The views the open project and its imports bring, each from a `tatolab.views` entry point, rejecting in words where none can be listed. */
  listStudioViewsOfTheOpenProject(): Promise<ListedStudioView[]>;
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
