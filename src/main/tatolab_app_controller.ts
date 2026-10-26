// The app's one controller: it owns the "Run Tatolab" switch, the `tatolab` command's links,
// whether first run has finished, and the local API client, and composes the status the tray and the window show. Every step that reads or
// changes the switch runs in turn on one queue, so a tray toggle and a window request never
// interleave between the service manager's answers.

import type {
  PythonForNewEnvironments,
  RuntimeAgentRegistration as RuntimeAgentRegistrationStatus,
} from "../shared/tatolab_backend_contract.js";
import type {
  ListedStream,
  RuntimeDescription,
  StreamFailureNotificationsState,
  TatolabCommandLineToolVersion,
  StreamGraphSummary,
  StreamLogRecordsPage,
  StreamRunAnswer,
  TatolabAppBuild,
  TatolabAppUpdateState,
  TatolabPlatform,
  TatolabStatus,
  TatolabStreamActionName,
} from "../shared/tatolab_backend_contract.js";
import { ConditionOnsetLatch } from "./condition_onset_latch.js";
import { LocalApiClient, type LocalApiRequestFailure, type StreamRunRequest } from "./local_api_client.js";
import type { TatolabPlatformForThisBuild } from "./platform/tatolab_platform_for_this_build.js";
import type { BundledRuntimeRestart } from "./platform/runtime_agent_registration.js";
import type { TatolabAppOpenedAtLogin } from "./platform/tatolab_app_opened_at_login.js";
import type { CommandLineToolLinkRefusal, TatolabCommandLineToolLinks } from "./platform/tatolab_command_line_tool_links.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { RunTatolabSwitch, type RunTatolabReconciliation } from "./run_tatolab_switch.js";
import { RuntimeRestartedForAppVersionFile } from "./runtime_restarted_for_app_version.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import { deriveRuntimeState, isARuntimeNotAnswering, theServiceManagerMayHaveGivenUp, type RuntimeHealthObservation } from "./tatolab_status.js";

/** How long one local API request may go without a byte before the runtime reads as not answering. */
const LOCAL_API_REQUEST_TIMEOUT_MS = 3_000;

/** How many log records one page the window reads holds. */
const STREAM_LOG_RECORDS_PER_PAGE = 500;

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

/** What the controller is built from: this build's platform, where the switch is remembered, where updates stand, and the app's clock, version and log. */
export interface TatolabAppControllerSources {
  platform: TatolabPlatform;
  platformForThisBuild: TatolabPlatformForThisBuild;
  appConfigDirectory: string;
  appLaunchedAtMs: number;
  appVersion: string;
  /** Which build of the app this is, which each status carries. */
  appBuild: TatolabAppBuild | null;
  /** Where the runtime this build reads serves its loopback HTTP, under which each readable output has its preview page. */
  runtimeLoopbackHttpOrigin: string;
  /** The monotonic clock every `nowMs` is read from: `performance.now()` in the app. */
  readMonotonicClockMs: () => number;
  /** Where checking for a newer Tatolab stands, which each status carries. */
  readTheAppUpdateState: () => TatolabAppUpdateState;
  /** Whether a stream failing shows a notification, which each status carries. */
  readStreamFailureNotifications: () => StreamFailureNotificationsState;
  /** The `tatolab` CLI's version as read so far this launch, which each status carries. */
  readTheCommandLineToolVersion: () => TatolabCommandLineToolVersion;
  /** The Python the app makes a project's `.venv` from, which each status carries. */
  readPythonForNewEnvironments: () => PythonForNewEnvironments;
  tatolabAppLog: TatolabAppLog;
}

/** The switch, the command's links, first run, and what the controller remembers between status rounds. */
export class TatolabAppController {
  private readonly runtimeNotAnsweringOnset = new ConditionOnsetLatch();
  private readonly streamListingFailureOnset = new ConditionOnsetLatch();
  private readonly serviceManagerGiveUpOnset = new ConditionOnsetLatch();
  private readonly machineNameOfTheRunningRuntime = new MachineNameAskedOncePerRuntimeUpEpisode();
  private runTatolabSwitchQueue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly appVersion: string,
    private readonly appBuild: TatolabAppBuild | null,
    private readonly platform: TatolabPlatform,
    private readonly runTatolabSwitch: RunTatolabSwitch,
    private readonly commandLineToolLinks: TatolabCommandLineToolLinks,
    private readonly firstRunFinishedFile: RememberedSwitchFile,
    private firstRunFinished: boolean,
    private readonly localApiSocket: string,
    private readonly localApiClient: LocalApiClient,
    private readonly runtimeLoopbackHttpOrigin: string,
    private readonly bundledRuntimeRestart: BundledRuntimeRestart | null,
    private readonly runtimeRestartedForAppVersionFile: RuntimeRestartedForAppVersionFile,
    private readonly readMonotonicClockMs: () => number,
    private readonly readTheAppUpdateState: () => TatolabAppUpdateState,
    private readonly readStreamFailureNotifications: () => StreamFailureNotificationsState,
    private readonly readTheCommandLineToolVersion: () => TatolabCommandLineToolVersion,
    private readonly readPythonForNewEnvironments: () => PythonForNewEnvironments,
    private readonly tatolabAppOpenedAtLogin: TatolabAppOpenedAtLogin,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The controller for this build of the app, remembering the switch in its config directory, as the app launches. */
  static async create(sources: TatolabAppControllerSources): Promise<TatolabAppController> {
    const runTatolabSwitch = await RunTatolabSwitch.load(
      sources.platformForThisBuild.runtimeAgent,
      RememberedSwitchFile.runTatolabInAppConfigDirectory(sources.appConfigDirectory, sources.tatolabAppLog),
      sources.appLaunchedAtMs,
      sources.tatolabAppLog,
    );
    const firstRunFinishedFile = RememberedSwitchFile.firstRunFinishedInAppConfigDirectory(sources.appConfigDirectory, sources.tatolabAppLog);
    return new TatolabAppController(
      sources.appVersion,
      sources.appBuild,
      sources.platform,
      runTatolabSwitch,
      sources.platformForThisBuild.commandLineToolLinks,
      firstRunFinishedFile,
      await firstRunFinishedFile.loadRememberedSwitch(),
      sources.platformForThisBuild.localApiSocket,
      new LocalApiClient(sources.platformForThisBuild.localApiSocket, LOCAL_API_REQUEST_TIMEOUT_MS, sources.appVersion),
      sources.runtimeLoopbackHttpOrigin,
      sources.platformForThisBuild.bundledRuntimeRestart,
      RuntimeRestartedForAppVersionFile.inAppConfigDirectory(sources.appConfigDirectory),
      sources.readMonotonicClockMs,
      sources.readTheAppUpdateState,
      sources.readStreamFailureNotifications,
      sources.readTheCommandLineToolVersion,
      sources.readPythonForNewEnvironments,
      sources.platformForThisBuild.tatolabAppOpenedAtLogin,
      sources.tatolabAppLog,
    );
  }

  /** Run `work` on the switch once every step queued before it has finished. */
  private withTheRunTatolabSwitch<T>(work: (runTatolabSwitch: RunTatolabSwitch) => Promise<T>): Promise<T> {
    const queuedWork = this.runTatolabSwitchQueue.then(() => work(this.runTatolabSwitch));
    this.runTatolabSwitchQueue = queuedWork.then(
      () => undefined,
      () => undefined,
    );
    return queuedWork;
  }

  /** Bring the agent in line with the switch, as opening or reopening the app does: the switch on registers the agent. */
  async reconcileTheAgentWithTheRunTatolabSwitch(): Promise<void> {
    const reconciliation = await this.withTheRunTatolabSwitch((runTatolabSwitch) =>
      runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(this.readMonotonicClockMs()),
    );
    this.tatolabAppLog.info("reconciled the agent with the Run Tatolab switch", { reconciliation: describeReconciliation(reconciliation) });
  }

  /** What opening the app does beside reconciling the switch: link `tatolab` in the home folder, with no prompt; a link not made is logged and tried again next launch. */
  async linkTheCommandLineToolInTheHomeFolderAsTheAppOpens(): Promise<void> {
    const linked = await this.commandLineToolLinks.linkTheCommandLineToolInTheHomeFolder();
    if (linked.ok) return;
    if (linked.failure.kind === "not_offered") {
      this.tatolabAppLog.info("the tatolab command is not linked in the home folder by this build", { reason: linked.failure.reason });
    } else {
      this.tatolabAppLog.warn("the tatolab command could not be linked in the home folder", { failure: linked.failure.refusal });
    }
  }

  /** "Link in /usr/local/bin…": link `tatolab` there behind the administrator prompt, settling once it closes; refused in words. */
  async linkTheCommandLineToolInUsrLocalBin(): Promise<Result<void, string>> {
    const linked = await this.commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin();
    if (linked.ok) {
      this.tatolabAppLog.info("the tatolab command is linked in /usr/local/bin");
      return linked;
    }
    const refusal = describeCommandLineToolLinkRefusal(linked.failure);
    this.tatolabAppLog.warn("the tatolab command was not linked in /usr/local/bin", { failure: refusal });
    return failedWith(refusal);
  }

  /** "Get Started": first run is over, for this launch whatever happens and in every later one once it is remembered; refused when it could not be remembered. */
  async rememberFirstRunFinished(): Promise<Result<void, string>> {
    this.firstRunFinished = true;
    const remembered = await this.firstRunFinishedFile.saveRememberedSwitch(true);
    if (remembered.ok) {
      this.tatolabAppLog.info("first run finished");
      return succeeded(undefined);
    }
    this.tatolabAppLog.warn("first run finishing could not be remembered; Welcome shows again next launch", { failure: remembered.failure });
    return failedWith(remembered.failure);
  }

  /** "Run Tatolab" chosen from the tray: flip the switch, remember it, and reconcile the agent, as one queued step. */
  async toggleRunTatolab(): Promise<void> {
    const [runTatolab, reconciliation] = await this.withTheRunTatolabSwitch(async (runTatolabSwitch) => {
      const toggled = await runTatolabSwitch.toggle(this.readMonotonicClockMs());
      return [runTatolabSwitch.runTatolab(), toggled] as const;
    });
    this.tatolabAppLog.info("Run Tatolab switched", { run_tatolab: runTatolab, reconciliation: describeReconciliation(reconciliation) });
  }

  /** "Run Tatolab" set from the window, or turned off by uninstalling: set the switch, remember it, and reconcile the agent, as one queued step; what reconciling did. */
  async setRunTatolab(runTatolab: boolean): Promise<RunTatolabReconciliation> {
    const reconciliation = await this.withTheRunTatolabSwitch((runTatolabSwitch) => runTatolabSwitch.setRunTatolab(runTatolab, this.readMonotonicClockMs()));
    this.tatolabAppLog.info("Run Tatolab set", { run_tatolab: runTatolab, reconciliation: describeReconciliation(reconciliation) });
    return reconciliation;
  }

  /**
   * Restart the runtime the app's bundle carries when this app's version is not the one it was last
   * restarted under: an update, or a bundle replaced by hand, leaves a running runtime on the bundle as it
   * was. Nothing where the app carries no runtime. A restart not made is tried again next launch.
   */
  async restartTheBundledRuntimeIfTheAppChanged(): Promise<void> {
    if (this.bundledRuntimeRestart === null) return;
    const bundledRuntimeRestart = this.bundledRuntimeRestart;
    const restartedForAppVersion = await this.runtimeRestartedForAppVersionFile.loadAppVersion();
    if (restartedForAppVersion === this.appVersion) return;
    const restarted = await this.withTheRunTatolabSwitch((runTatolabSwitch) =>
      runTatolabSwitch.restartTheBundledRuntime(bundledRuntimeRestart, this.readMonotonicClockMs()),
    );
    if (!restarted.ok) {
      this.tatolabAppLog.warn("the runtime could not be restarted under this app's version; it is tried again next launch", {
        app_version: this.appVersion,
        failure: restarted.failure,
      });
      return;
    }
    this.tatolabAppLog.info("the runtime runs under this app's version", {
      app_version: this.appVersion,
      restarted_for_app_version: restartedForAppVersion,
      outcome: restarted.value,
    });
    const saved = await this.runtimeRestartedForAppVersionFile.saveAppVersion(this.appVersion);
    if (!saved.ok) this.tatolabAppLog.warn("the app version the runtime was restarted under could not be remembered", { failure: saved.failure });
  }

  /** "Restart runtime": stop the agent's runtime and start it again, as one queued step; refused while Run Tatolab is off, and in the service manager's words. */
  async restartTheRuntimeOnRequest(): Promise<Result<void, string>> {
    const restarted = await this.withTheRunTatolabSwitch((runTatolabSwitch) => runTatolabSwitch.restartTheRuntimeOnRequest(() => this.readMonotonicClockMs()));
    if (restarted.ok) this.tatolabAppLog.info("the runtime was restarted on request");
    else this.tatolabAppLog.warn("the runtime could not be restarted on request", { failure: restarted.failure });
    return restarted;
  }

  /** "Open Tatolab at login": have the desktop open the app at login, or stop; refused in the desktop's words. */
  async setOpenTatolabAtLogin(openAtLogin: boolean): Promise<Result<void, string>> {
    const set = await this.tatolabAppOpenedAtLogin.setOpenAtLogin(openAtLogin);
    if (set.ok) this.tatolabAppLog.info("Open Tatolab at login set", { open_at_login: openAtLogin });
    else this.tatolabAppLog.warn("Open Tatolab at login could not be set", { open_at_login: openAtLogin, failure: set.failure });
    return set;
  }

  /** Whether the switch is on. */
  runTatolab(): boolean {
    return this.runTatolabSwitch.runTatolab();
  }

  /** Open System Settings at Login Items, where a user approves the runtime's login item; refused where the platform has no Login Items. */
  openLoginItemsSettings(): Promise<Result<void, string>> {
    return this.withTheRunTatolabSwitch((runTatolabSwitch) => runTatolabSwitch.openLoginItemsSettingsOnRequest());
  }

  /** With the switch on, open System Settings at Login Items the first time this launch the poller sees `runtimeAgent` needing approval. */
  openLoginItemsIfTheRuntimeAgentNeedsApproval(runtimeAgent: RuntimeAgentRegistrationStatus): Promise<void> {
    return this.withTheRunTatolabSwitch((runTatolabSwitch) => runTatolabSwitch.noticeRuntimeAgentRegistrationStatus(runtimeAgent));
  }

  /** Start the runtime when the poller's `status`, observed at `nowMs`, found it down with the switch on and the agent enabled, or register the agent afresh to recover a runtime the service manager gave up on, that never answered, or whose agent is not registered. */
  startTheRuntimeIfThePollerFoundItDown(status: TatolabStatus, nowMs: number): Promise<void> {
    return this.withTheRunTatolabSwitch((runTatolabSwitch) =>
      runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown(status.runtime_agent, status.runtime_state, nowMs),
    );
  }

  /**
   * Observe everything once and compose the status, as of `nowMs`; opens nothing. The local API is asked
   * outside the switch's queue, so a slow runtime never holds up the tray's switch; the agent's
   * registration is read in the queue, which on Linux runs `systemctl --user is-enabled` there, and so is
   * whether the service manager gave up on a runtime not answering with its agent enabled.
   */
  async composeStatus(nowMs: number): Promise<TatolabStatus> {
    const commandLineToolLinks = await this.commandLineToolLinks.observeCommandLineToolLinks();

    const healthCheck = await this.localApiClient.checkHealth();
    const runtimeHealth: RuntimeHealthObservation = healthCheck.ok ? "healthy" : "failing";
    let streams: ListedStream[] | null = null;
    let machineName: string | null = null;
    if (runtimeHealth === "healthy") {
      streams = await this.listedStreams();
      machineName = await this.machineNameOfTheRunningRuntime.machineName(() => this.askTheRuntimeItsMachineName());
    } else {
      this.machineNameOfTheRunningRuntime.runtimeIsDown();
    }

    const { runTatolab, runtimeAgent, runtimeState, serviceManagerGiveUp } = await this.withTheRunTatolabSwitch(async (runTatolabSwitch) => {
      const runtimeAgentNow = await runTatolabSwitch.runtimeAgentRegistrationStatus();
      const isRestartingTheRuntime = runTatolabSwitch.isRestartingTheRuntime(nowMs, runtimeHealth);
      runTatolabSwitch.noteRestartSettledIfThisRoundShowsIt(nowMs, runtimeHealth);
      if (runtimeHealth === "healthy" && !isRestartingTheRuntime) runTatolabSwitch.noteRuntimeHealthy(nowMs);
      const runTatolabNow = runTatolabSwitch.runTatolab();
      const serviceManagerGiveUpNow = theServiceManagerMayHaveGivenUp({ runTatolab: runTatolabNow, runtimeAgent: runtimeAgentNow, runtimeHealth })
        ? await runTatolabSwitch.whyTheServiceManagerGaveUpOnTheRuntime()
        : null;
      runTatolabSwitch.noteTheServiceManagersGiveUp(serviceManagerGiveUpNow);
      return {
        runTatolab: runTatolabNow,
        runtimeAgent: runtimeAgentNow,
        serviceManagerGiveUp: serviceManagerGiveUpNow,
        runtimeState: isRestartingTheRuntime
          ? "starting"
          : deriveRuntimeState({
              runTatolab: runTatolabNow,
              runtimeAgent: runtimeAgentNow,
              runtimeHealth,
              serviceManagerGaveUpOnTheRuntime: runTatolabSwitch.serviceManagerStillGivesUpAfterTheAppsOwnFreshRegistration(),
              runtimeAnsweredSinceItWasLastStarted: runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted(),
              timeSinceTheRuntimeWasExpectedUpMs: runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(nowMs),
            }),
      };
    });
    if (this.runtimeNotAnsweringOnset.conditionJustStartedHolding(isARuntimeNotAnswering(runtimeState)) && !healthCheck.ok) {
      this.tatolabAppLog.warn("the runtime is not responding to its health check", {
        runtime_state: runtimeState,
        failure: healthCheck.failure.failureDescription,
      });
    }
    if (this.serviceManagerGiveUpOnset.conditionJustStartedHolding(serviceManagerGiveUp !== null) && serviceManagerGiveUp !== null) {
      this.tatolabAppLog.warn("the service manager gave up starting the runtime", { service_manager_words: serviceManagerGiveUp.serviceManagerWords });
    }

    return {
      app_version: this.appVersion,
      app_build: this.appBuild,
      platform: this.platform,
      run_tatolab: runTatolab,
      runtime_agent: runtimeAgent,
      runtime_state: runtimeState,
      machine_name: machineName,
      streams,
      first_run_finished: this.firstRunFinished,
      command_line_tool_linked_at: commandLineToolLinks.homeFolderLinkedAt,
      command_line_tool_usr_local_bin_link: commandLineToolLinks.usrLocalBinLink,
      app_update: this.readTheAppUpdateState(),
      local_api_socket: this.localApiSocket,
      stream_failure_notifications: this.readStreamFailureNotifications(),
      open_at_login: await this.tatolabAppOpenedAtLogin.readOpenAtLogin(),
      command_line_tool_version: this.readTheCommandLineToolVersion(),
      python_for_new_environments: this.readPythonForNewEnvironments(),
    };
  }

  /** How the running runtime describes itself: its version and build, how long it has been up, and the folder of its own log. */
  describeRuntime(): Promise<Result<RuntimeDescription, LocalApiRequestFailure>> {
    return this.localApiClient.describeRuntime();
  }

  /** The window's next page of `stream`'s log records: those numbered after `after`. */
  readStreamLogRecords(stream: string, after: number): Promise<Result<StreamLogRecordsPage, LocalApiRequestFailure>> {
    return this.localApiClient.readStreamLogRecords(stream, after, STREAM_LOG_RECORDS_PER_PAGE);
  }

  /** Run the stream action `streamAction` on `stream`, answering the runtime's notice beside it or `null`. */
  runStreamAction(streamAction: TatolabStreamActionName, stream: string): Promise<Result<string | null, LocalApiRequestFailure>> {
    return this.localApiClient.runStreamAction(streamAction, stream);
  }

  /** Compile the project `streamRunRequest` names and load it kept, answering `run_stream`'s reply. */
  runStream(streamRunRequest: StreamRunRequest): Promise<Result<StreamRunAnswer, LocalApiRequestFailure>> {
    return this.localApiClient.runStream(streamRunRequest);
  }

  /** Every stream the runtime lists now. */
  listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>> {
    return this.localApiClient.listStreams();
  }

  /** The graph of the loaded stream `stream`, its readable outputs' preview pages at the runtime's loopback HTTP. */
  describeStreamGraph(stream: string): Promise<Result<StreamGraphSummary, LocalApiRequestFailure>> {
    return this.localApiClient.describeStreamGraph(stream, this.runtimeLoopbackHttpOrigin);
  }

  /** The runtime's streams, or `null` when listing failed, which is logged on the round it starts failing. */
  private async listedStreams(): Promise<ListedStream[] | null> {
    const streams = await this.localApiClient.listStreams();
    if (this.streamListingFailureOnset.conditionJustStartedHolding(!streams.ok) && !streams.ok) {
      this.tatolabAppLog.warn("the runtime's streams could not be listed", { failure: streams.failure.failureDescription });
    }
    return streams.ok ? streams.value : null;
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

/** A link not made, in the words the window shows. */
function describeCommandLineToolLinkRefusal(refusal: CommandLineToolLinkRefusal): string {
  return refusal.kind === "not_offered" ? refusal.reason : refusal.refusal;
}

/** A reconciliation as one log field: its kind, then what it carries. */
function describeReconciliation(reconciliation: RunTatolabReconciliation): string {
  switch (reconciliation.kind) {
    case "needs_approval_in_login_items":
      return `${reconciliation.kind} opened_login_items_settings=${reconciliation.openedLoginItemsSettings}`;
    case "registration_failed":
    case "unregistration_failed":
      return `${reconciliation.kind}: ${reconciliation.failureDescription}`;
    default:
      return reconciliation.kind;
  }
}
