import type {
  PythonForNewEnvironmentsChoice,
  RelaySettingsByName,
  RelaysDescription,
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
  /** Run `tatolab new` in `folder`, then resolve with what it holds; rejects in the CLI's own words. */
  createStreamProject(folder: string): Promise<StreamProjectFolderReport>;
  /**
   * Make `folder`'s `.venv` with the app's uv when it has none that runs, then compile it and load it kept, resolving once the
   * runtime answers; rejects with its refusal in its own words, except a refused name a listed stream holds, which resolves
   * `name_taken`, and uv failing to make the `.venv`, which resolves `python_environment_not_made` in uv's own words.
   */
  runStreamProject(folder: string, streamFunction: string | null, streamName: string | null): Promise<StreamProjectRunOutcome>;
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
  /** Make new environments from Tatolab's built-in Python, or from one the person picks in the app's file dialog, resolving once it is remembered or the dialog is cancelled and rejecting with why; the choice arrives as the next status. */
  choosePythonForNewEnvironments(python: PythonForNewEnvironmentsChoice): Promise<void>;
  /** Every relay the runtime holds and every adapter it can join one through, rejecting in the runtime's own words. */
  describeRelays(): Promise<RelaysDescription>;
  /** Add a relay of `adapter` with `settings`, its secrets among them, resolving with the id the runtime gave it and rejecting in the runtime's own words. */
  addRelay(adapter: string, settings: Readonly<RelaySettingsByName>): Promise<string>;
  /** Replace the settings named in `settings` on the relay `relayId`, `null` returning one to its default; rejects in the runtime's own words. */
  configureRelay(relayId: string, settings: Readonly<RelaySettingsByName>): Promise<void>;
  /** Leave and forget the relay `relayId`, rejecting in the runtime's own words, as it refuses a built-in relay. */
  removeRelay(relayId: string): Promise<void>;
  /** Ask the person for the file that holds a relay secret in the app's dialog, resolving with the secret and the file's name, or `null` when they cancel; rejects naming a file too large, not text or empty. */
  chooseRelaySecretFile(): Promise<{ text: string; fileName: string } | null>;
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
