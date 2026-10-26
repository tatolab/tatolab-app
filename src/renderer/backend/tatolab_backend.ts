import type {
  RuntimeDescription,
  StreamGraphSummary,
  StreamLogRecordsPage,
  StreamProjectFolderChosenFor,
  StreamProjectFolderReport,
  StreamProjectRunOutcome,
  TatolabStatus,
  TatolabStreamActionName,
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
  readStreamLogRecords(streamName: string, afterSequence: number): Promise<StreamLogRecordsPage>;
  describeStreamGraph(streamName: string): Promise<StreamGraphSummary>;
  /** Check for a newer Tatolab and take it if there is one; how that goes arrives as the status's `app_update`. */
  checkForTatolabAppUpdates(): Promise<void>;
  /** Stop, start (or retry) or remove `streamName`, resolving with the runtime's notice beside an action it carried out (a stop it could not record) or `null`, and rejecting with its refusal; the new listing arrives as the next status. */
  runStreamAction(streamAction: TatolabStreamActionName, streamName: string): Promise<string | null>;
  /** Show the project folder the runtime lists for `streamName` in the file manager, rejecting with why it could not. */
  openStreamProjectFolder(streamName: string): Promise<void>;
  /** Open a terminal in the project folder the runtime lists for `streamName`, rejecting with why it could not. */
  openTerminalAtStreamProject(streamName: string): Promise<void>;
  /** Show the log folder under the project folder the runtime lists for `streamName` in the file manager, rejecting with why it could not. */
  openStreamLogFolder(streamName: string): Promise<void>;
  /** Ask the person for a folder in the app's dialog and resolve with what it holds, or `null` when they cancel. A folder it answers is one the window may name. */
  chooseStreamProjectFolder(chosenFor: StreamProjectFolderChosenFor): Promise<StreamProjectFolderReport | null>;
  /** The first free `~/streams/hello[-N]` for a new project, which the window may name. */
  proposeNewStreamProjectFolder(): Promise<StreamProjectFolderReport>;
  /** What `folder` holds now, rejecting for a folder the app never handed the window. */
  checkStreamProjectFolder(folder: string): Promise<StreamProjectFolderReport>;
  /** Run `tatolab new` in `folder`, then resolve with what it holds; rejects in the CLI's own words. */
  createStreamProject(folder: string): Promise<StreamProjectFolderReport>;
  /** Compile `folder` and load it kept, resolving once the runtime answers; rejects with its refusal in its own words, except a refused name a listed stream holds, which resolves `name_taken`. */
  runStreamProject(folder: string, streamFunction: string | null, streamName: string | null): Promise<StreamProjectRunOutcome>;
  /** Open a terminal in `folder`, a folder the app handed the window, rejecting with why it could not. */
  openTerminalAtChosenProjectFolder(folder: string): Promise<void>;
  /** How the running runtime describes itself, rejecting in its own words when it does not answer. */
  describeRuntime(): Promise<RuntimeDescription>;
  /** Stop the runtime and start it again through the service manager, resolving once the service manager has answered and rejecting in its words; the state that follows arrives as the next statuses. */
  restartRuntime(): Promise<void>;
  /** Show the folder the runtime writes its own log to in the file manager, rejecting with why it could not. */
  openRuntimeLogFolder(): Promise<void>;
  /** Turn the notifications shown when a stream fails on or off, resolving once it is remembered and rejecting with why it was not; the switch arrives as the next status. */
  setStreamFailureNotifications(enabled: boolean): Promise<void>;
  /** Have the desktop open Tatolab at login, or stop, resolving once it has and rejecting in its words; what it reports arrives as the next status. */
  setOpenTatolabAtLogin(enabled: boolean): Promise<void>;
  onTatolabStatusChanged(listener: (status: TatolabStatus) => void): Promise<() => void>;
  /** Calls `listener` with the stream each request from the app to show a stream's page names; the returned function stops it. */
  onStreamPageRequested(listener: (streamName: string) => void): () => void;
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
