// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The "Run Tatolab" switch: one registration is both "the runtime runs now" and "the runtime
// starts at login". Opening the app with the switch on registers the agent; turning it off
// unregisters it, which stops the runtime, and is remembered. While the app runs, the switch on
// also starts an enabled agent whose runtime the poller finds down, unless the service manager
// has given up on it, which only the person's Try Again registers again.

import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../src/backend/tatolab_backend_contract.js";
import type { BundledRuntimeRestart, RuntimeAgentRegistration, RuntimeAgentStartFailure } from "./platform/runtime_agent_registration.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { RememberedSwitchFile } from "./remembered_switch_file.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { RuntimeHealthObservation } from "./tatolab_status.js";

/**
 * The least time between two starts of the runtime's agent: launchd's own minimum runtime, the 10 s it
 * lets pass before it spawns a job again, and systemd's default start-limit interval.
 */
export const RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS = 10_000;

/**
 * Whether to start the runtime's agent now. launchd may leave even an enabled agent's job pended as a
 * speculative or nondemand spawn, and systemd gives up on a unit that crashed past its start limit, so
 * while the app runs it starts a runtime failing its health check itself — only with the switch on and
 * the agent enabled, never once the service manager has given up on it, and no sooner than
 * `RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS` after the last start attempt.
 */
export function theRuntimeAgentShouldBeStartedNow({
  runTatolab,
  runtimeAgent,
  runtimeHealth,
  serviceManagerGaveUpOnTheRuntime,
  timeSinceTheLastStartAttemptMs,
}: {
  runTatolab: boolean;
  runtimeAgent: RuntimeAgentRegistrationStatus;
  runtimeHealth: RuntimeHealthObservation;
  serviceManagerGaveUpOnTheRuntime: boolean;
  /** `null` when this launch has made no start attempt. */
  timeSinceTheLastStartAttemptMs: number | null;
}): boolean {
  return (
    runTatolab &&
    runtimeAgent === "enabled" &&
    runtimeHealth === "failing" &&
    !serviceManagerGaveUpOnTheRuntime &&
    (timeSinceTheLastStartAttemptMs === null || timeSinceTheLastStartAttemptMs >= RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS)
  );
}

/** Why "Restart runtime" is refused while the switch is off: no agent is registered to restart. */
export const RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL = "Run Tatolab is off, so there is no runtime to restart. Turn Run Tatolab on to start it.";

/** Why Try Again is refused while the switch is off: registering the agent is Run Tatolab's to turn on. */
export const REGISTER_AGAIN_WITH_RUN_TATOLAB_OFF_REFUSAL = "Run Tatolab is off, so the runtime isn't started. Turn Run Tatolab on to start it.";

/** Why "Restart runtime" is refused while the agent is not enabled: registering it is Run Tatolab's, never a restart's. */
export const RESTART_WITH_THE_AGENT_NOT_ENABLED_REFUSAL = "The runtime's login item isn't enabled, so there is no runtime to restart.";

/**
 * What reconciling the switch with the agent's registration did: `switch_is_off` leaves the agent as it
 * is; `needs_approval_in_login_items` is an agent registered but awaiting the user's approval in Login Items;
 * `unregistered` is the switch turned off with the agent unregistered or never registered.
 */
export type RunTatolabReconciliation =
  | { kind: "switch_is_off" }
  | { kind: "already_enabled" }
  | { kind: "registered" }
  | { kind: "needs_approval_in_login_items"; openedLoginItemsSettings: boolean }
  | { kind: "registration_failed"; failureDescription: string }
  | { kind: "unregistered" }
  | { kind: "unregistration_failed"; failureDescription: string };

/** A restart on request under way: when the service manager answered it, `null` until it does. */
interface RuntimeRestartOnRequestUnderWay {
  serviceManagerAnsweredAtMs: number | null;
}

/** The switch's remembered value, the agent it drives, and what this launch has already done. */
export class RunTatolabSwitch {
  private loginItemsSettingsOpenedThisLaunch = false;
  private runtimeAgentLastStartAttemptAtMs: number | null = null;
  private runtimeAnsweredSinceLastStarted = false;
  /** The restart on request under way; `null` with none. */
  private restartOnRequest: RuntimeRestartOnRequestUnderWay | null = null;

  private constructor(
    private readonly runtimeAgent: RuntimeAgentRegistration,
    private readonly preferenceFile: RememberedSwitchFile,
    private runTatolabSwitchedOn: boolean,
    private runtimeExpectedUpSinceMs: number,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The switch as remembered in `preferenceFile`, driving `runtimeAgent`, as the app launches at `appLaunchedAtMs`. */
  static async load(
    runtimeAgent: RuntimeAgentRegistration,
    preferenceFile: RememberedSwitchFile,
    appLaunchedAtMs: number,
    tatolabAppLog: TatolabAppLog,
  ): Promise<RunTatolabSwitch> {
    const runTatolab = await preferenceFile.loadRememberedSwitch();
    return new RunTatolabSwitch(runtimeAgent, preferenceFile, runTatolab, appLaunchedAtMs, tatolabAppLog);
  }

  /** Whether the switch is on. */
  runTatolab(): boolean {
    return this.runTatolabSwitchedOn;
  }

  /** The agent's registration status now. */
  runtimeAgentRegistrationStatus(): Promise<RuntimeAgentRegistrationStatus> {
    return this.runtimeAgent.registrationStatus();
  }

  /** The service manager's words for having given up starting the agent's runtime, or `null`; reads only. */
  whyTheServiceManagerGaveUpOnTheRuntime(): Promise<string | null> {
    return this.runtimeAgent.whyTheServiceManagerGaveUpOnTheRuntime();
  }

  /**
   * Note that the runtime answered its health check at `nowMs`, so a later failure gets the starting grace
   * period again, as when the service manager restarts a runtime that crashed, and reads as not responding
   * rather than never answering.
   */
  noteRuntimeHealthy(nowMs: number): void {
    this.runtimeExpectedUpSinceMs = nowMs;
    this.runtimeAnsweredSinceLastStarted = true;
  }

  /** Whether the runtime has answered since the app launched or last registered, restarted or registered it again. */
  runtimeAnsweredSinceItWasLastStarted(): boolean {
    return this.runtimeAnsweredSinceLastStarted;
  }

  /** The runtime is being started afresh at `nowMs`: it gets the starting grace from then, and has not answered since. */
  private noteTheRuntimeStartedAfresh(nowMs: number): void {
    this.runtimeAgentLastStartAttemptAtMs = nowMs;
    this.runtimeExpectedUpSinceMs = nowMs;
    this.runtimeAnsweredSinceLastStarted = false;
  }

  /** How long the runtime has had to come up since the app launched, the agent was registered, or the runtime last answered. */
  timeSinceTheRuntimeWasExpectedUpMs(nowMs: number): number {
    return Math.max(0, nowMs - this.runtimeExpectedUpSinceMs);
  }

  /**
   * With the switch on, restart the runtime the app's bundle carries through `bundledRuntimeRestart`, giving
   * it the starting grace again from `nowMs`; with it off nothing runs, and the runtime starts from the
   * bundle as it is whenever the switch next turns on.
   */
  async restartTheBundledRuntime(bundledRuntimeRestart: BundledRuntimeRestart, nowMs: number): Promise<Result<"restarted" | "switch_off", string>> {
    if (!this.runTatolabSwitchedOn) return succeeded("switch_off");
    this.noteTheRuntimeStartedAfresh(nowMs);
    const restarted = await bundledRuntimeRestart.restartTheBundledRuntime();
    return restarted.ok ? succeeded("restarted") : restarted;
  }

  /**
   * "Restart runtime": with the switch on and the agent enabled, stop the agent's
   * runtime and start it again, giving it the starting grace again; until a health check that began
   * after the service manager answered finds it healthy, it reads as restarting. launchd holding no job
   * for the agent registers it again. Refused otherwise, and in the service manager's own words.
   */
  async restartTheRuntimeOnRequest(readMonotonicClockMs: () => number): Promise<Result<void, string>> {
    if (!this.runTatolabSwitchedOn) return failedWith(RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL);
    if ((await this.runtimeAgent.registrationStatus()) !== "enabled") return failedWith(RESTART_WITH_THE_AGENT_NOT_ENABLED_REFUSAL);
    const restartRequestedAtMs = readMonotonicClockMs();
    this.noteTheRuntimeStartedAfresh(restartRequestedAtMs);
    const restartOnRequest: RuntimeRestartOnRequestUnderWay = { serviceManagerAnsweredAtMs: null };
    this.restartOnRequest = restartOnRequest;
    const restarted = await this.restartTheAgentsRuntime();
    if (restarted.ok) restartOnRequest.serviceManagerAnsweredAtMs = readMonotonicClockMs();
    else this.restartOnRequest = null;
    return restarted;
  }

  private async restartTheAgentsRuntime(): Promise<Result<void, string>> {
    const restarted = await this.runtimeAgent.restartRuntimeAgent();
    if (restarted.ok) return restarted;
    switch (restarted.failure.kind) {
      case "no_job_for_the_registered_agent":
        this.tatolabAppLog.warn("the service manager holds no job for the registered agent; registering it again to restart it");
        return this.registerTheAgentAgainAndStartIt();
      case "refused":
        return failedWith(restarted.failure.refusal);
    }
  }

  /**
   * Whether the runtime still reads as restarting in a round whose health check began at `roundStartedAtMs`
   * and found it `runtimeHealth`: a healthy answer counts only from a check that began after the service
   * manager answered the restart, since an earlier one may have reached the runtime being replaced. A
   * failing answer reads as the usual derivation says, the restart's starting grace included.
   */
  isRestartingTheRuntime(roundStartedAtMs: number, runtimeHealth: RuntimeHealthObservation): boolean {
    return this.restartOnRequest !== null && runtimeHealth === "healthy" && !this.restartWasAnsweredBefore(roundStartedAtMs);
  }

  /** The restart is over once a round begun after the service manager answered finds the runtime healthy. */
  noteRestartSettledIfThisRoundShowsIt(roundStartedAtMs: number, runtimeHealth: RuntimeHealthObservation): void {
    if (runtimeHealth === "healthy" && this.restartWasAnsweredBefore(roundStartedAtMs)) this.restartOnRequest = null;
  }

  private restartWasAnsweredBefore(roundStartedAtMs: number): boolean {
    const serviceManagerAnsweredAtMs = this.restartOnRequest?.serviceManagerAnsweredAtMs ?? null;
    return serviceManagerAnsweredAtMs !== null && roundStartedAtMs >= serviceManagerAnsweredAtMs;
  }

  /**
   * Try Again: with the switch on, register the agent again and start it — what brings back a runtime the
   * service manager gave up on, or one that never answered — giving it the starting grace afresh from `nowMs`;
   * refused with the switch off, and in the service manager's own words.
   */
  async registerTheRuntimeAgainOnRequest(nowMs: number): Promise<Result<void, string>> {
    if (!this.runTatolabSwitchedOn) return failedWith(REGISTER_AGAIN_WITH_RUN_TATOLAB_OFF_REFUSAL);
    this.noteTheRuntimeStartedAfresh(nowMs);
    return this.registerTheAgentAgainAndStartIt();
  }

  /**
   * Bring the agent in line with the switch: with the switch on, an unregistered agent is registered and an
   * enabled one is started if it is not running.
   */
  async reconcileTheAgentWithTheRunTatolabSwitch(nowMs: number): Promise<RunTatolabReconciliation> {
    if (!this.runTatolabSwitchedOn) return { kind: "switch_is_off" };
    switch (await this.runtimeAgent.registrationStatus()) {
      case "enabled":
        await this.startTheRuntimeIfNotRunning(nowMs);
        return { kind: "already_enabled" };
      case "requires_approval":
        return this.needsApprovalInLoginItems();
      case "not_registered":
      case "not_found":
        return this.register(nowMs);
    }
  }

  /** Turn the switch on or off and remember it. On registers the agent; off unregisters it, which stops the runtime. */
  async setRunTatolab(runTatolab: boolean, nowMs: number): Promise<RunTatolabReconciliation> {
    this.runTatolabSwitchedOn = runTatolab;
    const remembered = await this.preferenceFile.saveRememberedSwitch(runTatolab);
    if (!remembered.ok) {
      this.tatolabAppLog.warn("the Run Tatolab switch could not be remembered", { failure: remembered.failure, run_tatolab: runTatolab });
    }
    if (runTatolab) return this.reconcileTheAgentWithTheRunTatolabSwitch(nowMs);
    switch (await this.runtimeAgent.registrationStatus()) {
      case "not_registered":
      case "not_found":
        return { kind: "unregistered" };
      case "enabled":
      case "requires_approval": {
        const unregistered = await this.runtimeAgent.unregisterRuntimeAgent();
        if (unregistered.ok) return { kind: "unregistered" };
        this.tatolabAppLog.warn("the runtime's agent could not be unregistered", { failure_description: unregistered.failure });
        return { kind: "unregistration_failed", failureDescription: unregistered.failure };
      }
    }
  }

  /** Flip the switch and reconcile the agent with its new value. */
  toggle(nowMs: number): Promise<RunTatolabReconciliation> {
    return this.setRunTatolab(!this.runTatolabSwitchedOn, nowMs);
  }

  /** React to the agent's status as the poller saw it: the first time this launch the switch is on and the agent needs approval, Login Items opens by itself. */
  async noticeRuntimeAgentRegistrationStatus(runtimeAgent: RuntimeAgentRegistrationStatus): Promise<void> {
    if (this.runTatolabSwitchedOn && runtimeAgent === "requires_approval") {
      await this.needsApprovalInLoginItems();
    }
  }

  /**
   * Open System Settings at Login Items because the user asked; refused where the platform has no Login
   * Items. It counts as this launch's opening, so the poller seeing the agent need approval does not open
   * it again.
   */
  async openLoginItemsSettingsOnRequest(): Promise<Result<void, string>> {
    const opened = await this.runtimeAgent.openLoginItemsSettings();
    if (opened.ok) this.loginItemsSettingsOpenedThisLaunch = true;
    return opened;
  }

  private async register(nowMs: number): Promise<RunTatolabReconciliation> {
    const registered = await this.runtimeAgent.registerRuntimeAgent();
    this.noteTheRuntimeStartedAfresh(nowMs);
    // Service Management refuses the registration of an agent the user has not approved yet, while
    // recording it as awaiting approval.
    if ((await this.runtimeAgent.registrationStatus()) === "requires_approval") return this.needsApprovalInLoginItems();
    if (registered.ok) {
      await this.startTheRuntimeIfNotRunning(nowMs);
      return { kind: "registered" };
    }
    this.tatolabAppLog.warn("the runtime's agent could not be registered", { failure_description: registered.failure });
    return { kind: "registration_failed", failureDescription: registered.failure };
  }

  /** Start the runtime when the poller found it failing its health check at `nowMs` and `theRuntimeAgentShouldBeStartedNow` says to. */
  async startTheRuntimeIfThePollerFoundItDown(
    runtimeAgent: RuntimeAgentRegistrationStatus,
    runtimeHealth: RuntimeHealthObservation,
    serviceManagerGaveUpOnTheRuntime: boolean,
    nowMs: number,
  ): Promise<void> {
    const timeSinceTheLastStartAttemptMs =
      this.runtimeAgentLastStartAttemptAtMs === null ? null : Math.max(0, nowMs - this.runtimeAgentLastStartAttemptAtMs);
    if (
      !theRuntimeAgentShouldBeStartedNow({
        runTatolab: this.runTatolabSwitchedOn,
        runtimeAgent,
        runtimeHealth,
        serviceManagerGaveUpOnTheRuntime,
        timeSinceTheLastStartAttemptMs,
      })
    ) {
      return;
    }
    this.tatolabAppLog.info("the runtime's agent is enabled but the runtime is not answering; starting it", {
      time_since_the_last_start_attempt_ms: timeSinceTheLastStartAttemptMs,
    });
    await this.startTheRuntimeIfNotRunning(nowMs);
  }

  private async startTheRuntimeIfNotRunning(nowMs: number): Promise<void> {
    this.runtimeAgentLastStartAttemptAtMs = nowMs;
    const started = await this.runtimeAgent.startRuntimeAgentIfNotRunning();
    if (started.ok) return;
    switch (started.failure.kind) {
      case "no_job_for_the_registered_agent":
        this.tatolabAppLog.warn("the service manager holds no job for the registered agent; registering it again");
        await this.registerTheAgentAgainAndStartIt();
        return;
      case "refused":
        this.tatolabAppLog.warn("the runtime's agent could not be started", { failure_description: started.failure.refusal });
        return;
    }
  }

  /** Unregister the agent's stale registration and register it again, then start it; refused naming the step that failed. */
  private async registerTheAgentAgainAndStartIt(): Promise<Result<void, string>> {
    const unregistered = await this.runtimeAgent.unregisterRuntimeAgent();
    if (!unregistered.ok) {
      this.tatolabAppLog.warn("the agent's stale registration could not be removed", { failure_description: unregistered.failure });
    }
    const registered = await this.runtimeAgent.registerRuntimeAgent();
    if (!registered.ok) {
      this.tatolabAppLog.warn("the runtime's agent could not be registered again", { failure_description: registered.failure });
      return failedWith(`The runtime's agent could not be registered again: ${registered.failure}`);
    }
    const started = await this.runtimeAgent.startRuntimeAgentIfNotRunning();
    if (started.ok) return started;
    const startFailure = describeRuntimeAgentStartFailure(started.failure);
    this.tatolabAppLog.warn("the runtime's agent could not be started after registering it again", { start_failure: startFailure });
    return failedWith(`The runtime's agent was registered again but could not be started: ${startFailure}`);
  }

  private async needsApprovalInLoginItems(): Promise<RunTatolabReconciliation> {
    const openedLoginItemsSettings = !this.loginItemsSettingsOpenedThisLaunch;
    if (openedLoginItemsSettings) {
      const opened = await this.runtimeAgent.openLoginItemsSettings();
      if (!opened.ok) this.tatolabAppLog.warn("Login Items could not be opened for the agent's approval", { failure: opened.failure });
      this.loginItemsSettingsOpenedThisLaunch = true;
    }
    return { kind: "needs_approval_in_login_items", openedLoginItemsSettings };
  }
}

/** A start the service manager did not carry out, in words. */
function describeRuntimeAgentStartFailure(startFailure: RuntimeAgentStartFailure): string {
  switch (startFailure.kind) {
    case "no_job_for_the_registered_agent":
      return "the service manager holds no job for it";
    case "refused":
      return startFailure.refusal;
  }
}
