// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The app's one controller: it owns the "Run Tatolab" switch, the machine setup, and the local
// API client, and composes the status the tray and the window show. Every step that reads or
// changes the switch runs in turn on one queue, so a tray toggle and a window request never
// interleave between the service manager's answers.

import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../src/backend/tatolab_backend_contract.js";
import type {
  ListedStream,
  RuntimeState,
  StreamGraphSummary,
  StreamLogRecordsPage,
  TatolabAppUpdateState,
  TatolabPlatform,
  TatolabStatus,
  TatolabStreamActionName,
} from "../../src/backend/tatolab_backend_contract.js";
import { ConditionOnsetLatch } from "./condition_onset_latch.js";
import { LocalApiClient, type LocalApiRequestFailure } from "./local_api_client.js";
import type { TatolabPlatformForThisBuild } from "./platform/mod.js";
import type { BundledRuntimeRestart } from "./platform/runtime_agent_registration.js";
import type { TatolabMachineSetup } from "./platform/tatolab_machine_setup.js";
import type { Result } from "./result.js";
import { RunTatolabPreferenceFile } from "./run_tatolab_preference.js";
import { RunTatolabSwitch, type RunTatolabReconciliation } from "./run_tatolab_switch.js";
import { RuntimeRestartedForAppVersionFile } from "./runtime_restarted_for_app_version.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import { deriveRuntimeState, theRuntimeJustBecameUnreachable, type RuntimeHealthObservation } from "./tatolab_status.js";

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
  /** Where the runtime this build reads serves its loopback HTTP, under which each readable output has its preview page. */
  runtimeLoopbackHttpOrigin: string;
  /** The monotonic clock every `nowMs` is read from: `performance.now()` in the app. */
  readMonotonicClockMs: () => number;
  /** Where checking for a newer Tatolab stands, which each status carries. */
  readTheAppUpdateState: () => TatolabAppUpdateState;
  tatolabAppLog: TatolabAppLog;
}

/** The switch, the machine setup, and what the controller remembers between status rounds. */
export class TatolabAppController {
  private runtimeStateLastObserved: RuntimeState | null = null;
  private readonly streamListingFailureOnset = new ConditionOnsetLatch();
  private readonly machineNameOfTheRunningRuntime = new MachineNameAskedOncePerRuntimeUpEpisode();
  private runTatolabSwitchQueue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly appVersion: string,
    private readonly platform: TatolabPlatform,
    private readonly runTatolabSwitch: RunTatolabSwitch,
    private readonly machineSetup: TatolabMachineSetup,
    private readonly localApiClient: LocalApiClient,
    private readonly runtimeLoopbackHttpOrigin: string,
    private readonly bundledRuntimeRestart: BundledRuntimeRestart | null,
    private readonly runtimeRestartedForAppVersionFile: RuntimeRestartedForAppVersionFile,
    private readonly readMonotonicClockMs: () => number,
    private readonly readTheAppUpdateState: () => TatolabAppUpdateState,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The controller for this build of the app, remembering the switch in its config directory, as the app launches. */
  static async create(sources: TatolabAppControllerSources): Promise<TatolabAppController> {
    const runTatolabSwitch = await RunTatolabSwitch.load(
      sources.platformForThisBuild.runtimeAgent,
      RunTatolabPreferenceFile.inAppConfigDirectory(sources.appConfigDirectory, sources.tatolabAppLog),
      sources.appLaunchedAtMs,
      sources.tatolabAppLog,
    );
    return new TatolabAppController(
      sources.appVersion,
      sources.platform,
      runTatolabSwitch,
      sources.platformForThisBuild.machineSetup,
      new LocalApiClient(sources.platformForThisBuild.localApiSocket, LOCAL_API_REQUEST_TIMEOUT_MS, sources.appVersion),
      sources.runtimeLoopbackHttpOrigin,
      sources.platformForThisBuild.bundledRuntimeRestart,
      RuntimeRestartedForAppVersionFile.inAppConfigDirectory(sources.appConfigDirectory),
      sources.readMonotonicClockMs,
      sources.readTheAppUpdateState,
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

  private async machineSetupIsComplete(): Promise<boolean> {
    return (await this.machineSetup.observeMachineSetup()).machineSetupState === "complete";
  }

  /**
   * Bring the agent in line with the switch, as opening or reopening the app does: whatever machine setup
   * needs no prompt is set up, then the switch registers the agent when it is on and the machine is set up.
   */
  async reconcileTheAgentWithTheRunTatolabSwitch(): Promise<void> {
    await this.machineSetup.setUpTheMachine("reconciling_the_switch");
    const machineSetupComplete = await this.machineSetupIsComplete();
    const reconciliation = await this.withTheRunTatolabSwitch((runTatolabSwitch) =>
      runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(machineSetupComplete, this.readMonotonicClockMs()),
    );
    this.tatolabAppLog.info("reconciled the agent with the Run Tatolab switch", { reconciliation: describeReconciliation(reconciliation) });
  }

  /** What opening the app does once the switch is reconciled: the administrator prompt for whatever setup is missing, at most once per launch, then the switch is reconciled again. */
  async setUpTheMachineOnAppOpened(): Promise<void> {
    if ((await this.machineSetup.setUpTheMachine("app_opened")) === "administrator_prompt_shown") {
      await this.reconcileTheAgentWithTheRunTatolabSwitch();
    }
  }

  /** "Set Up Tatolab…": create whatever machine setup is missing — behind the administrator prompt in a real build, silently in a local-proof build — then reconcile the switch. */
  async setUpTheMachineOnRequest(): Promise<void> {
    await this.machineSetup.setUpTheMachine("user_asked");
    await this.reconcileTheAgentWithTheRunTatolabSwitch();
  }

  /** Why "Set Up Tatolab…" is refused on this platform; `null` where it runs. */
  setUpTatolabRefusal(): string | null {
    return this.machineSetup.setUpTatolabRefusal();
  }

  /** "Run Tatolab" chosen from the tray: flip the switch, remember it, and reconcile the agent, as one queued step. */
  async toggleRunTatolab(): Promise<void> {
    const machineSetupComplete = await this.machineSetupIsComplete();
    const [runTatolab, reconciliation] = await this.withTheRunTatolabSwitch(async (runTatolabSwitch) => {
      const toggled = await runTatolabSwitch.toggle(machineSetupComplete, this.readMonotonicClockMs());
      return [runTatolabSwitch.runTatolab(), toggled] as const;
    });
    this.tatolabAppLog.info("Run Tatolab switched", { run_tatolab: runTatolab, reconciliation: describeReconciliation(reconciliation) });
  }

  /** "Run Tatolab" set from the window, or turned off by uninstalling: set the switch, remember it, and reconcile the agent, as one queued step; what reconciling did. */
  async setRunTatolab(runTatolab: boolean): Promise<RunTatolabReconciliation> {
    const machineSetupComplete = await this.machineSetupIsComplete();
    const reconciliation = await this.withTheRunTatolabSwitch((runTatolabSwitch) =>
      runTatolabSwitch.setRunTatolab(runTatolab, machineSetupComplete, this.readMonotonicClockMs()),
    );
    this.tatolabAppLog.info("Run Tatolab set", { run_tatolab: runTatolab, reconciliation: describeReconciliation(reconciliation) });
    return reconciliation;
  }

  /**
   * Restart the runtime the app's bundle carries when this app's version is not the one it was last
   * restarted under: an update, or a bundle replaced by hand, leaves a running runtime on the bundle as it
   * was. Nothing where the app carries no runtime, and nothing until the machine is set up, since the
   * runtime cannot start without its machine lock. A restart not made is tried again next launch.
   */
  async restartTheBundledRuntimeIfTheAppChanged(): Promise<void> {
    if (this.bundledRuntimeRestart === null) return;
    const bundledRuntimeRestart = this.bundledRuntimeRestart;
    const restartedForAppVersion = await this.runtimeRestartedForAppVersionFile.loadAppVersion();
    if (restartedForAppVersion === this.appVersion) return;
    if (!(await this.machineSetupIsComplete())) {
      this.tatolabAppLog.info("the runtime is restarted under this app's version once the machine is set up", { app_version: this.appVersion });
      return;
    }
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

  /** Start the runtime when the poller's `status`, observed at `nowMs`, found it down with the switch on and the agent enabled, no sooner after the last start than the service manager would start it again. */
  startTheRuntimeIfThePollerFoundItDown(status: TatolabStatus, nowMs: number): Promise<void> {
    const runtimeHealth: RuntimeHealthObservation = status.runtime_state === "running" ? "healthy" : "failing";
    return this.withTheRunTatolabSwitch((runTatolabSwitch) =>
      runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown(status.runtime_agent, runtimeHealth, nowMs),
    );
  }

  /**
   * Observe everything once and compose the status, as of `nowMs`; opens nothing. The local API is asked
   * outside the switch's queue, so a slow runtime never holds up the tray's switch; the agent's
   * registration is read in the queue, which on Linux runs `systemctl --user is-enabled` there.
   */
  async composeStatus(nowMs: number): Promise<TatolabStatus> {
    const machineSetup = await this.machineSetup.observeMachineSetup();

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

    const { runTatolab, runtimeAgent, runtimeState } = await this.withTheRunTatolabSwitch(async (runTatolabSwitch) => {
      const runtimeAgentNow = await runTatolabSwitch.runtimeAgentRegistrationStatus();
      if (runtimeHealth === "healthy") runTatolabSwitch.noteRuntimeHealthy(nowMs);
      return {
        runTatolab: runTatolabSwitch.runTatolab(),
        runtimeAgent: runtimeAgentNow,
        runtimeState: deriveRuntimeState(
          runTatolabSwitch.runTatolab(),
          runtimeAgentNow,
          runtimeHealth,
          runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(nowMs),
        ),
      };
    });
    const previousRuntimeState = this.runtimeStateLastObserved;
    this.runtimeStateLastObserved = runtimeState;
    if (theRuntimeJustBecameUnreachable(previousRuntimeState, runtimeState) && !healthCheck.ok) {
      this.tatolabAppLog.warn("the runtime is not responding to its health check", { failure: healthCheck.failure.failureDescription });
    }

    return {
      app_version: this.appVersion,
      platform: this.platform,
      run_tatolab: runTatolab,
      runtime_agent: runtimeAgent,
      runtime_state: runtimeState,
      machine_name: machineName,
      streams,
      machine_setup_state: machineSetup.machineSetupState,
      command_line_tool_linked_at: machineSetup.commandLineToolLinkedAt,
      app_update: this.readTheAppUpdateState(),
    };
  }

  /** The window's next page of `stream`'s log records: those numbered after `after`. */
  readStreamLogRecords(stream: string, after: number): Promise<Result<StreamLogRecordsPage, LocalApiRequestFailure>> {
    return this.localApiClient.readStreamLogRecords(stream, after, STREAM_LOG_RECORDS_PER_PAGE);
  }

  /** Run the stream action `streamAction` on `stream`, answering the runtime's notice beside it or `null`. */
  runStreamAction(streamAction: TatolabStreamActionName, stream: string): Promise<Result<string | null, LocalApiRequestFailure>> {
    return this.localApiClient.runStreamAction(streamAction, stream);
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
