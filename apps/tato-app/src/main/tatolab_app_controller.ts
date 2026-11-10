// The app's one controller: it owns the runtime the app runs as its child, the `tatolab` command's
// link and the local API client, and composes the status the tray and the window show.

import type {
  ListedStream,
  ProjectCreationQueued,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  ProjectRunQueued,
  ProjectTransaction,
  ProjectTransactionAuthor,
  GraphEditMode,
  ProjectGraphTransactionTheRuntimeAnswered,
  StreamGraphAction,
  RuntimeDescription,
  StreamFailureNotificationsState,
  TatolabCommandLineToolVersion,
  StreamActionCancelAnswer,
  StreamActionFollowed,
  StreamGraphSummary,
  NodeCatalog,
  ProjectNodeTypeListing,
  ProjectTheRuntimeNames,
  ProjectDependency,
  WorkspaceDependencyUpdate,
  TatolabAppBuild,
  TatolabAppUpdateState,
  TatolabPlatform,
  TatolabStatus,
} from "../shared/tatolab_backend_contract.js";
import { CarriedRuntimeRunAsTheAppsChild } from "./carried_runtime_run_as_the_apps_child.js";
import { ConditionOnsetLatch } from "./condition_onset_latch.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";
import { LocalApiClient, type LocalApiRequestFailure } from "./local_api_client.js";
import type { StartTheCarriedRuntimeAsAChildProcess } from "./platform/carried_runtime.js";
import type { TatolabCommandLineToolLink } from "./platform/command_line_tool_link_in_the_home_folder.js";
import type { TatolabPlatformForThisBuild } from "./platform/tatolab_platform_for_this_build.js";
import type { TatolabAppOpenedAtLogin } from "./platform/tatolab_app_opened_at_login.js";
import { failedWith, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** How long one local API request may go without a byte before the runtime reads as not answering. */
const LOCAL_API_REQUEST_TIMEOUT_MS = 3_000;

/** How many log records one page the window reads holds. */
const PROJECT_LOG_RECORDS_PER_PAGE = 500;

/** The machine's name, asked of the runtime once each time it comes up. */
export class MachineNameAskedOncePerRuntimeUpEpisode {
  /** `undefined` until asked since the runtime came up; then what it answered, `null` when it did not say. */
  private answerThisEpisode: string | null | undefined = undefined;

  /** This episode's answer, calling `askTheRuntime` only the first time. */
  async machineName(askTheRuntime: () => Promise<string | null>): Promise<string | null> {
    if (this.answerThisEpisode === undefined) this.answerThisEpisode = await askTheRuntime();
    return this.answerThisEpisode;
  }

  /** The runtime is down, so the next time it is up it is asked again. */
  runtimeIsDown(): void {
    this.answerThisEpisode = undefined;
  }
}

/** What the controller is built from: this build's platform, how the runtime is started, where updates stand, and the app's clock, version and log. */
export interface TatolabAppControllerSources {
  platform: TatolabPlatform;
  platformForThisBuild: TatolabPlatformForThisBuild;
  /** How the carried runtime is started as the app's child. */
  startTheCarriedRuntime: StartTheCarriedRuntimeAsAChildProcess;
  appVersion: string;
  /** Which build of the app this is, which each status carries. */
  appBuild: TatolabAppBuild | null;
  /** The monotonic clock every `nowMs` is read from: `performance.now()` in the app. */
  readMonotonicClockMs: () => number;
  /** Where checking for a newer Tatolab stands, which each status carries. */
  readTheAppUpdateState: () => TatolabAppUpdateState;
  /** Whether a stream failing shows a notification, which each status carries. */
  readStreamFailureNotifications: () => StreamFailureNotificationsState;
  /** Whether Developer mode is on, which each status carries. */
  readDeveloperMode: () => boolean;
  /** The `tatolab` CLI's version as read so far this launch, which each status carries. */
  readTheCommandLineToolVersion: () => TatolabCommandLineToolVersion;
  /** Called each time the app's runtime exits, so the status is read again at once. */
  whenTheRuntimeExits: () => void;
  tatolabAppLog: TatolabAppLog;
}

/** The app's runtime, the command's link, and what the controller remembers between status rounds. */
export class TatolabAppController {
  private readonly runtimeNotRunningOnset = new ConditionOnsetLatch();
  private readonly streamListingFailureOnset = new ConditionOnsetLatch();
  private readonly machineNameOfTheRunningRuntime = new MachineNameAskedOncePerRuntimeUpEpisode();

  private constructor(
    private readonly appVersion: string,
    private readonly appBuild: TatolabAppBuild | null,
    private readonly platform: TatolabPlatform,
    private readonly carriedRuntimeRunAsTheAppsChild: CarriedRuntimeRunAsTheAppsChild,
    private readonly commandLineToolLink: TatolabCommandLineToolLink,
    private readonly localApiSocket: string,
    private readonly localApiClient: LocalApiClient,
    private readonly readTheAppUpdateState: () => TatolabAppUpdateState,
    private readonly readStreamFailureNotifications: () => StreamFailureNotificationsState,
    private readonly readDeveloperMode: () => boolean,
    private readonly readTheCommandLineToolVersion: () => TatolabCommandLineToolVersion,
    private readonly tatolabAppOpenedAtLogin: TatolabAppOpenedAtLogin,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The controller for this build of the app. */
  static create(sources: TatolabAppControllerSources): TatolabAppController {
    return new TatolabAppController(
      sources.appVersion,
      sources.appBuild,
      sources.platform,
      new CarriedRuntimeRunAsTheAppsChild(
        sources.platformForThisBuild.carriedRuntime,
        sources.startTheCarriedRuntime,
        sources.readMonotonicClockMs,
        sources.whenTheRuntimeExits,
        sources.tatolabAppLog,
      ),
      sources.platformForThisBuild.commandLineToolLink,
      sources.platformForThisBuild.localApiSocket,
      new LocalApiClient(sources.platformForThisBuild.localApiSocket, LOCAL_API_REQUEST_TIMEOUT_MS, sources.appVersion),
      sources.readTheAppUpdateState,
      sources.readStreamFailureNotifications,
      sources.readDeveloperMode,
      sources.readTheCommandLineToolVersion,
      sources.platformForThisBuild.tatolabAppOpenedAtLogin,
      sources.tatolabAppLog,
    );
  }

  /** Link `~/.local/bin/tatolab` to the CLI the app carries; refused in words when something else holds the name or the build offers none. */
  async linkTheCommandLineTool(): Promise<Result<void, string>> {
    const linked = await this.commandLineToolLink.linkTheCommandLineTool();
    if (linked.ok) this.tatolabAppLog.info("the tatolab command is linked in the home folder");
    else this.tatolabAppLog.warn("the tatolab command was not linked in the home folder", { failure: linked.failure });
    return linked;
  }

  /** As the app opens: link `tatolab` when nothing else holds the name, quietly, as the window offers it again when it is not linked. */
  async linkTheCommandLineToolUnlessSomethingElseHoldsTheName(): Promise<void> {
    const commandLineToolLink = await this.commandLineToolLink.observeTheLink();
    if (commandLineToolLink.kind === "not_linked") await this.linkTheCommandLineTool();
  }

  /** "Restart runtime": stop the app's runtime and start it again; refused for a runtime the app did not start. */
  async restartTheRuntimeOnRequest(): Promise<Result<void, string>> {
    const healthCheck = await this.localApiClient.checkHealth();
    const restarted = this.carriedRuntimeRunAsTheAppsChild.restartOnRequest(healthCheck.ok);
    if (!restarted.ok) this.tatolabAppLog.warn("the runtime could not be restarted on request", { failure: restarted.failure });
    return restarted;
  }

  /** The app is quitting: stop its runtime with it, answering once that runtime has exited. */
  stopTheRuntimeAsTheAppQuits(): Promise<void> {
    return this.carriedRuntimeRunAsTheAppsChild.stopAsTheAppQuits();
  }

  /** Whether a runtime the app started is running now, which a quit waits for. */
  aRuntimeTheAppStartedIsRunning(): boolean {
    return this.carriedRuntimeRunAsTheAppsChild.aRuntimeTheAppStartedIsRunning();
  }

  /** "Open Tato Studio at login": have the desktop open the app at login, or stop; refused in the desktop's words. */
  async setOpenTatolabAtLogin(openAtLogin: boolean): Promise<Result<void, string>> {
    const set = await this.tatolabAppOpenedAtLogin.setOpenAtLogin(openAtLogin);
    if (set.ok) this.tatolabAppLog.info("Open Tatolab at login set", { open_at_login: openAtLogin });
    else this.tatolabAppLog.warn("Open Tatolab at login could not be set", { open_at_login: openAtLogin, failure: set.failure });
    return set;
  }

  /** Observe everything once at `nowMs`, start the app's runtime when none answers, and compose the status. */
  async composeStatus(nowMs: number): Promise<TatolabStatus> {
    const healthCheck = await this.localApiClient.checkHealth();
    let streams: ListedStream[] | null = null;
    let streamsNotListedBecause: string | null = null;
    let machineName: string | null = null;
    if (healthCheck.ok) {
      const listing = await this.listedStreams();
      streams = listing.ok ? listing.value : null;
      streamsNotListedBecause = listing.ok ? null : listing.failure;
      machineName = await this.machineNameOfTheRunningRuntime.machineName(() => this.askTheRuntimeItsMachineName());
    } else {
      this.machineNameOfTheRunningRuntime.runtimeIsDown();
    }
    this.carriedRuntimeRunAsTheAppsChild.keepTheRuntimeRunning(healthCheck.ok, nowMs);
    const { runtimeState, runtimeNotRunningBecause } = this.carriedRuntimeRunAsTheAppsChild.runtimeStateNow(healthCheck.ok, nowMs);
    if (this.runtimeNotRunningOnset.conditionJustStartedHolding(runtimeState === "not_running") && !healthCheck.ok) {
      this.tatolabAppLog.warn("the runtime is not answering its health check", {
        runtime_not_running_because: runtimeNotRunningBecause,
        failure: healthCheck.failure.failureDescription,
      });
    }

    return {
      app_version: this.appVersion,
      app_build: this.appBuild,
      platform: this.platform,
      runtime_state: runtimeState,
      runtime_not_running_because: runtimeNotRunningBecause,
      machine_name: machineName,
      streams,
      streams_not_listed_because: streamsNotListedBecause,
      command_line_tool_link: await this.commandLineToolLink.observeTheLink(),
      app_update: this.readTheAppUpdateState(),
      local_api_socket: this.localApiSocket,
      stream_failure_notifications: this.readStreamFailureNotifications(),
      developer_mode: this.readDeveloperMode(),
      open_at_login: await this.tatolabAppOpenedAtLogin.readOpenAtLogin(),
      command_line_tool_version: this.readTheCommandLineToolVersion(),
    };
  }

  /** How the running runtime describes itself: its version and build, how long it has been up, and the folder of its own log. */
  describeRuntime(): Promise<Result<RuntimeDescription, LocalApiRequestFailure>> {
    return this.localApiClient.describeRuntime();
  }

  /** The window's next page of the log of the project in `projectDirectory`, narrowed as `narrowing` asks: the records after the cursor `after`, or the oldest held for `null`. */
  readProjectLogRecords(projectDirectory: string, narrowing: ProjectLogNarrowing, after: string | null): Promise<Result<ProjectLogRecordsPage, LocalApiRequestFailure>> {
    return this.localApiClient.readProjectLogRecords(projectDirectory, narrowing, after, PROJECT_LOG_RECORDS_PER_PAGE);
  }

  /** Queue the stop of every stream of the project in `projectDirectory` through the runtime's `stop_project`, answering the id of the action the runtime queued. */
  stopProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.localApiClient.stopProject(projectDirectory);
  }

  /** Queue the removal of every stream the runtime holds from the project in `projectDirectory`, answering the id of the action the runtime queued. */
  removeProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.localApiClient.removeProject(projectDirectory);
  }

  /** Show the stream `stream` under `displayName`, through the runtime's `rename_stream`. */
  renameStream(stream: string, displayName: string): Promise<Result<void, LocalApiRequestFailure>> {
    return this.localApiClient.renameStream(stream, displayName);
  }

  /** Queue a new project's creation and run through the runtime's `create_project`, in `projectDirectory` or, with `null`, a folder the runtime draws. */
  createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> {
    return this.localApiClient.createProject(projectDirectory);
  }

  /** Queue a run of the project in `projectDirectory` through the runtime's `run_project`. */
  runProject(projectDirectory: string): Promise<Result<ProjectRunQueued, LocalApiRequestFailure>> {
    return this.localApiClient.runProject(projectDirectory);
  }

  /** Undo `author`'s latest transaction in the project in `projectDirectory` not undone yet, answering the undo the runtime applied. */
  undoInTheProject(projectDirectory: string, author: ProjectTransactionAuthor): Promise<Result<ProjectTransaction, LocalApiRequestFailure>> {
    return this.localApiClient.undoInTheProject(projectDirectory, author);
  }

  /** Apply `operations` on the graphs of the streams they name as one transaction through the runtime's `transact`, by `author`. */
  transactOnTheStreamGraphs(
    operations: readonly StreamGraphAction[],
    mode: GraphEditMode,
    idempotencyKey: string | null,
    author: ProjectTransactionAuthor,
  ): Promise<Result<ProjectGraphTransactionTheRuntimeAnswered, LocalApiRequestFailure>> {
    return this.localApiClient.transactOnTheStreamGraphs(operations, mode, idempotencyKey, author);
  }

  /** Redo what `author`'s latest undo in the project in `projectDirectory` reversed, answering the redo the runtime applied. */
  redoInTheProject(projectDirectory: string, author: ProjectTransactionAuthor): Promise<Result<ProjectTransaction, LocalApiRequestFailure>> {
    return this.localApiClient.redoInTheProject(projectDirectory, author);
  }

  /** The stream action `action` as the runtime's `describe_stream_action` describes it. */
  describeStreamAction(action: string): Promise<Result<StreamActionFollowed, LocalApiRequestFailure>> {
    return this.localApiClient.describeStreamAction(action);
  }

  /** End the stream action `action` early through the runtime's `cancel_stream_action`. */
  cancelStreamAction(action: string): Promise<Result<StreamActionCancelAnswer, LocalApiRequestFailure>> {
    return this.localApiClient.cancelStreamAction(action);
  }

  /** Every stream the runtime lists now. */
  listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>> {
    return this.localApiClient.listStreams();
  }

  /** The graph of the loaded stream `stream`. */
  describeStreamGraph(stream: string): Promise<Result<StreamGraphSummary, LocalApiRequestFailure>> {
    return this.localApiClient.describeStreamGraph(stream);
  }

  /** Every node type the loaded stream `stream` can add. */
  describeNodeCatalog(stream: string): Promise<Result<NodeCatalog, LocalApiRequestFailure>> {
    return this.localApiClient.describeNodeCatalog(stream);
  }

  /** What the project in `projectDirectory` and each source it draws node code from declares, read from source without running it. */
  listProjectNodeTypes(projectDirectory: string): Promise<Result<ProjectNodeTypeListing, LocalApiRequestFailure>> {
    return this.localApiClient.listProjectNodeTypes(projectDirectory);
  }

  /** The project in `projectDirectory` as the runtime names it. */
  nameTheProject(projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    return this.localApiClient.nameTheProject(projectDirectory);
  }

  /** Copy the project in `source` into `imports/` of the project in `projectDirectory`. */
  addDependency(projectDirectory: string, source: string): Promise<Result<ProjectDependency, LocalApiRequestFailure>> {
    return this.localApiClient.addDependency(projectDirectory, source);
  }

  /** Copy the import `project` of the project in `projectDirectory` again from its source, overwriting files edited since its copy only with `overwriteEditedFiles`. */
  updateDependency(projectDirectory: string, project: string, overwriteEditedFiles: boolean): Promise<Result<WorkspaceDependencyUpdate, LocalApiRequestFailure>> {
    return this.localApiClient.updateDependency(projectDirectory, project, overwriteEditedFiles);
  }

  /** Each import of the project in `projectDirectory`, each source read for a newer version with `checkForNewer`. */
  listDependencies(projectDirectory: string, checkForNewer: boolean): Promise<Result<ListedProjectDependency[], LocalApiRequestFailure>> {
    return this.localApiClient.listDependencies(projectDirectory, checkForNewer);
  }

  /** The runtime's streams, or why listing them failed, which is logged on the round it starts failing. */
  private async listedStreams(): Promise<Result<ListedStream[], string>> {
    const streams = await this.localApiClient.listStreams();
    if (this.streamListingFailureOnset.conditionJustStartedHolding(!streams.ok) && !streams.ok) {
      this.tatolabAppLog.warn("the runtime's streams could not be listed", { failure: streams.failure.failureDescription });
    }
    return streams.ok ? streams : failedWith(streams.failure.failureDescription);
  }

  private async askTheRuntimeItsMachineName(): Promise<string | null> {
    const machineName = await this.localApiClient.machineName();
    if (machineName.ok) return machineName.value;
    this.tatolabAppLog.warn("the runtime's machine name could not be read; it is asked again once the runtime restarts", {
      failure: machineName.failure.failureDescription,
    });
    return null;
  }
}
