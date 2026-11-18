// The app's one controller: it owns the runtime the app runs as its child, the `tatolab` command's
// link and the local API client, and composes the status the tray and the window show.

import type {
  ListedStream,
  ProjectCreationQueued,
  ProjectStreamActionQueued,
  StreamFailureNotificationsState,
  TatolabCommandLineToolVersion,
  StudioWarning,
  ProjectTheRuntimeNames,
  TatolabAppBuild,
  TatolabAppUpdateAnnouncement,
  TatolabAppUpdateState,
  TatolabPlatform,
  TatolabStatus,
} from "../shared/tatolab_backend_contract.js";
import { Effect, Layer } from "effect";
import { CarriedRuntimeRunAsTheAppsChild } from "./carried_runtime_run_as_the_apps_child.js";
import type { StreamActionChangesFollowedForTheStatus } from "./stream_action_changes_followed_for_the_status.js";
import { ConditionOnsetLatch } from "./condition_onset_latch.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";
import { LocalApiClient } from "./local_api_client.js";
import { type LocalApiRequestFailure } from "./local_api_request_failure.js";
import type { StartTheCarriedRuntimeAsAChildProcess } from "./platform/carried_runtime.js";
import type { TatolabCommandLineToolLink } from "./platform/command_line_tool_link_in_the_home_folder.js";
import type { TatolabPlatformForThisBuild } from "./platform/tatolab_platform_for_this_build.js";
import type { TatolabAppOpenedAtLogin } from "./platform/tatolab_app_opened_at_login.js";
import { failedWith, type Result } from "./result.js";
import { readTheAnsweringRuntimesIdentity, readTheRuntimesContractAge, type RuntimeContractAgeReading } from "./runtime_contract_age.js";
import { tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { LOCAL_API_REQUEST_TIMEOUT_MS, RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** Something asked once of each runtime that comes up, as its machine's name and its contract's age are. */
export class AskedOncePerRuntimeUpEpisode<Answer extends {} | null> {
  /** `undefined` until asked of the runtime answering now; then what it answered. */
  private answerThisEpisode: Answer | undefined = undefined;

  /** This episode's answer, calling `askTheRuntime` only the first time. */
  async answer(askTheRuntime: () => Promise<Answer>): Promise<Answer> {
    if (this.answerThisEpisode === undefined) this.answerThisEpisode = await askTheRuntime();
    return this.answerThisEpisode;
  }

  /** The runtime it was asked of is gone, down or replaced, so the runtime answering next is asked again. */
  runtimeIsGone(): void {
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
  /** The update dialog the studio windows show, which each status carries. */
  readTheAppUpdateAnnouncement: () => TatolabAppUpdateAnnouncement | null;
  /** Whether a stream failing shows a notification, which each status carries. */
  readStreamFailureNotifications: () => StreamFailureNotificationsState;
  /** Whether Developer mode is on, which each status carries. */
  readDeveloperMode: () => boolean;
  /** The `tatolab` CLI's version as read so far this launch, which each status carries. */
  readTheCommandLineToolVersion: () => TatolabCommandLineToolVersion;
  /** Each warning that holds now, which each status carries. */
  readTheStudioWarnings: () => StudioWarning[];
  /** Called each time the app's runtime exits, so the status is read again at once. */
  whenTheRuntimeExits: () => void;
  /** Each project's `.venv` sync, followed on the runtime's stream actions while it answers. */
  projectVenvSyncsOfTheFollowedStreamActions: Pick<StreamActionChangesFollowedForTheStatus, "takeTheProjectVenvSyncs">;
  /** Each project whose latest stream action failed, followed on the runtime's stream actions while it answers. */
  projectStreamActionFailuresOfTheFollowedStreamActions: Pick<StreamActionChangesFollowedForTheStatus, "projectStreamActionFailuresNow">;
  tatolabAppLog: TatolabAppLog;
}

/** The app's runtime, the command's link, and what the controller remembers between status rounds. */
export class TatolabAppController {
  private readonly runtimeNotRunningOnset = new ConditionOnsetLatch();
  private readonly streamListingFailureOnset = new ConditionOnsetLatch();
  /** The machine's name, `null` when the runtime did not say. */
  private readonly machineNameOfTheRunningRuntime = new AskedOncePerRuntimeUpEpisode<string | null>();
  /** The runtime's contract age, read once of each runtime, unread included. */
  private readonly contractAgeOfTheRunningRuntime = new AskedOncePerRuntimeUpEpisode<RuntimeContractAgeReading>();
  /** Which runtime answered the last round that read it, so a runtime replaced between two healthy rounds is asked everything again. */
  private identityOfTheAnsweringRuntime: string | null = null;

  private constructor(
    private readonly appVersion: string,
    private readonly appBuild: TatolabAppBuild | null,
    private readonly platform: TatolabPlatform,
    private readonly carriedRuntimeRunAsTheAppsChild: CarriedRuntimeRunAsTheAppsChild,
    private readonly commandLineToolLink: TatolabCommandLineToolLink,
    private readonly localApiSocket: string,
    private readonly localApiClient: LocalApiClient,
    /** The runtime's control API, and Effect's logs written to the app's log. */
    private readonly studioEffectLayer: Layer.Layer<RuntimeControl>,
    private readonly readTheAppUpdateState: () => TatolabAppUpdateState,
    private readonly readTheAppUpdateAnnouncement: () => TatolabAppUpdateAnnouncement | null,
    private readonly readStreamFailureNotifications: () => StreamFailureNotificationsState,
    private readonly readDeveloperMode: () => boolean,
    private readonly readTheCommandLineToolVersion: () => TatolabCommandLineToolVersion,
    private readonly readTheStudioWarnings: () => StudioWarning[],
    private readonly tatolabAppOpenedAtLogin: TatolabAppOpenedAtLogin,
    private readonly projectVenvSyncsOfTheFollowedStreamActions: TatolabAppControllerSources["projectVenvSyncsOfTheFollowedStreamActions"],
    private readonly projectStreamActionFailuresOfTheFollowedStreamActions: TatolabAppControllerSources["projectStreamActionFailuresOfTheFollowedStreamActions"],
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
      new LocalApiClient(sources.platformForThisBuild.localApiSocket, LOCAL_API_REQUEST_TIMEOUT_MS),
      Layer.merge(runtimeControlLayer(sources.platformForThisBuild.localApiSocket, LOCAL_API_REQUEST_TIMEOUT_MS), tatolabAppLogAsEffectsLogger(sources.tatolabAppLog)),
      sources.readTheAppUpdateState,
      sources.readTheAppUpdateAnnouncement,
      sources.readStreamFailureNotifications,
      sources.readDeveloperMode,
      sources.readTheCommandLineToolVersion,
      sources.readTheStudioWarnings,
      sources.platformForThisBuild.tatolabAppOpenedAtLogin,
      sources.projectVenvSyncsOfTheFollowedStreamActions,
      sources.projectStreamActionFailuresOfTheFollowedStreamActions,
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
    let contractAgeReading: RuntimeContractAgeReading | null = null;
    if (healthCheck.ok) {
      const listing = await this.listedStreams();
      streams = listing.ok ? listing.value : null;
      streamsNotListedBecause = listing.ok ? null : listing.failure;
      machineName = await this.machineNameOfTheRunningRuntime.answer(() => this.askTheRuntimeItsMachineName());
      contractAgeReading = await this.contractAgeOfTheRunningRuntime.answer(() => this.askTheRuntimeItsContractAge());
      if (await this.anotherRuntimeAnswersThanTheOneAsked()) {
        machineName = await this.machineNameOfTheRunningRuntime.answer(() => this.askTheRuntimeItsMachineName());
        contractAgeReading = await this.contractAgeOfTheRunningRuntime.answer(() => this.askTheRuntimeItsContractAge());
      }
    } else {
      this.forgetWhatWasAskedOfTheRuntime();
      this.identityOfTheAnsweringRuntime = null;
    }
    this.carriedRuntimeRunAsTheAppsChild.keepTheRuntimeRunning(healthCheck.ok, nowMs);
    const { runtimeState, runtimeNotRunningBecause } = this.carriedRuntimeRunAsTheAppsChild.runtimeStateNow(healthCheck.ok, nowMs);
    if (this.runtimeNotRunningOnset.conditionJustStartedHolding(runtimeState === "not_running") && !healthCheck.ok) {
      this.tatolabAppLog.warn("the runtime is not answering its health check", {
        runtime_not_running_because: runtimeNotRunningBecause,
        failure: healthCheck.failure.failureDescription,
      });
    }

    const { underWay, justEnded } = this.projectVenvSyncsOfTheFollowedStreamActions.takeTheProjectVenvSyncs();
    return {
      app_version: this.appVersion,
      app_build: this.appBuild,
      platform: this.platform,
      runtime_state: runtimeState,
      runtime_not_running_because: runtimeNotRunningBecause,
      runtime_of_another_age: contractAgeReading?.kind === "of_another_age" ? contractAgeReading.runtimeOfAnotherAge : null,
      machine_name: machineName,
      streams,
      project_venv_syncs_under_way: underWay,
      project_venv_syncs_just_ended: justEnded,
      project_stream_action_failures: this.projectStreamActionFailuresOfTheFollowedStreamActions.projectStreamActionFailuresNow(),
      streams_not_listed_because: streamsNotListedBecause,
      command_line_tool_link: await this.commandLineToolLink.observeTheLink(),
      app_update: this.readTheAppUpdateState(),
      app_update_announcement: this.readTheAppUpdateAnnouncement(),
      local_api_socket: this.localApiSocket,
      stream_failure_notifications: this.readStreamFailureNotifications(),
      developer_mode: this.readDeveloperMode(),
      open_at_login: await this.tatolabAppOpenedAtLogin.readOpenAtLogin(),
      command_line_tool_version: this.readTheCommandLineToolVersion(),
      studio_warnings: this.readTheStudioWarnings(),
    };
  }

  /** Queue the close of the open project in `projectDirectory` through the runtime's `close_project`, answering the id of the action the runtime queued. */
  closeProject(projectDirectory: string): Promise<Result<string, LocalApiRequestFailure>> {
    return this.localApiClient.closeProject(projectDirectory);
  }

  /** Queue a new project's creation and open through the runtime's `create_project`, in `projectDirectory` or, with `null`, a folder the runtime draws. */
  createProject(projectDirectory: string | null): Promise<Result<ProjectCreationQueued, LocalApiRequestFailure>> {
    return this.localApiClient.createProject(projectDirectory);
  }

  /** Queue the open of the closed project in `projectDirectory`, its playback stopped, through the runtime's `open_project`. */
  openProject(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.localApiClient.openProject(projectDirectory);
  }

  /** Queue the reload from disk of the open project in `projectDirectory`, keeping its playback, through the runtime's `reload_project`. */
  reloadProject(projectDirectory: string): Promise<Result<ProjectStreamActionQueued, LocalApiRequestFailure>> {
    return this.localApiClient.reloadProject(projectDirectory);
  }

  /** The project in `projectDirectory` as the runtime names it. */
  nameTheProject(projectDirectory: string): Promise<Result<ProjectTheRuntimeNames, LocalApiRequestFailure>> {
    return this.localApiClient.nameTheProject(projectDirectory);
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

  /**
   * Read which runtime answers, and whether it is another than the one last read, forgetting what was asked of that one; a
   * runtime that names itself not at all is taken as the same.
   */
  private async anotherRuntimeAnswersThanTheOneAsked(): Promise<boolean> {
    const identity = await this.runEffect(readTheAnsweringRuntimesIdentity());
    if (identity === null) return false;
    const isAnotherRuntime = this.identityOfTheAnsweringRuntime !== null && identity !== this.identityOfTheAnsweringRuntime;
    this.identityOfTheAnsweringRuntime = identity;
    if (!isAnotherRuntime) return false;
    this.tatolabAppLog.info("another runtime answers than the one last read, so it is asked again", { runtime: identity });
    this.forgetWhatWasAskedOfTheRuntime();
    return true;
  }

  private forgetWhatWasAskedOfTheRuntime(): void {
    this.machineNameOfTheRunningRuntime.runtimeIsGone();
    this.contractAgeOfTheRunningRuntime.runtimeIsGone();
  }

  /** Read the contract age of the runtime answering, once for it: logged when it is of another age, and, with why, when it could not be read. */
  private async askTheRuntimeItsContractAge(): Promise<RuntimeContractAgeReading> {
    const reading = await this.runEffect(readTheRuntimesContractAge(this.carriedRuntimeRunAsTheAppsChild.howTheAnsweringRuntimeRuns()));
    switch (reading.kind) {
      case "of_another_age":
        this.tatolabAppLog.warn("the runtime refused this Studio's control contract", {
          older_side: reading.runtimeOfAnotherAge.older_side,
          runtime_version: reading.runtimeOfAnotherAge.runtime_version,
          runtime_words: reading.runtimeWords,
        });
        break;
      case "unread":
        this.tatolabAppLog.warn("the runtime's control contract could not be read; it is read again once another runtime answers", { failure: reading.why });
        break;
      case "agrees":
        break;
    }
    return reading;
  }

  /** Run `effect` on the runtime's control API, its logs written to the app's log. */
  private runEffect<Value>(effect: Effect.Effect<Value, never, RuntimeControl>): Promise<Value> {
    return Effect.runPromise(effect.pipe(Effect.provide(this.studioEffectLayer)));
  }
}
