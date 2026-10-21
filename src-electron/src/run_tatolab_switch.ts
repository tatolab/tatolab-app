// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The "Run Tatolab" switch: one registration is both "the runtime runs now" and "the runtime
// starts at login". Opening the app with the switch on registers the agent once the machine is
// set up; turning it off unregisters it, which stops the runtime, and is remembered. While the
// app runs, the switch on also starts an enabled agent whose runtime the poller finds down.

import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../src/backend/tatolab_backend_contract.js";
import type { BundledRuntimeRestart, RuntimeAgentRegistration } from "./platform/runtime_agent_registration.js";
import { succeeded, type Result } from "./result.js";
import type { RunTatolabPreferenceFile } from "./run_tatolab_preference.js";
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
 * the agent enabled, and no sooner than `RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS` after the last start
 * attempt.
 */
export function theRuntimeAgentShouldBeStartedNow(
  runTatolab: boolean,
  runtimeAgent: RuntimeAgentRegistrationStatus,
  runtimeHealth: RuntimeHealthObservation,
  timeSinceTheLastStartAttemptMs: number | null,
): boolean {
  return (
    runTatolab &&
    runtimeAgent === "enabled" &&
    runtimeHealth === "failing" &&
    (timeSinceTheLastStartAttemptMs === null || timeSinceTheLastStartAttemptMs >= RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS)
  );
}

/**
 * What reconciling the switch with the agent's registration did: `switch_is_off` leaves the agent as it
 * is; `waiting_for_machine_setup` is the switch on before the machine lock and CLI link are set up;
 * `needs_approval_in_login_items` is an agent registered but awaiting the user's approval in Login Items;
 * `unregistered` is the switch turned off with the agent unregistered or never registered.
 */
export type RunTatolabReconciliation =
  | { kind: "switch_is_off" }
  | { kind: "waiting_for_machine_setup" }
  | { kind: "already_enabled" }
  | { kind: "registered" }
  | { kind: "needs_approval_in_login_items"; openedLoginItemsSettings: boolean }
  | { kind: "registration_failed"; failureDescription: string }
  | { kind: "unregistered" }
  | { kind: "unregistration_failed"; failureDescription: string };

/** The switch's remembered value, the agent it drives, and what this launch has already done. */
export class RunTatolabSwitch {
  private loginItemsSettingsOpenedThisLaunch = false;
  private runtimeAgentLastStartAttemptAtMs: number | null = null;

  private constructor(
    private readonly runtimeAgent: RuntimeAgentRegistration,
    private readonly preferenceFile: RunTatolabPreferenceFile,
    private runTatolabSwitchedOn: boolean,
    private runtimeExpectedUpSinceMs: number,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The switch as remembered in `preferenceFile`, driving `runtimeAgent`, as the app launches at `appLaunchedAtMs`. */
  static async load(
    runtimeAgent: RuntimeAgentRegistration,
    preferenceFile: RunTatolabPreferenceFile,
    appLaunchedAtMs: number,
    tatolabAppLog: TatolabAppLog,
  ): Promise<RunTatolabSwitch> {
    const runTatolab = await preferenceFile.loadRunTatolab();
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

  /**
   * Note that the runtime answered its health check at `nowMs`, so a later failure gets the starting grace
   * period again, as when the service manager restarts a runtime that crashed.
   */
  noteRuntimeHealthy(nowMs: number): void {
    this.runtimeExpectedUpSinceMs = nowMs;
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
    this.runtimeAgentLastStartAttemptAtMs = nowMs;
    this.runtimeExpectedUpSinceMs = nowMs;
    const restarted = await bundledRuntimeRestart.restartTheBundledRuntime();
    return restarted.ok ? succeeded("restarted") : restarted;
  }

  /**
   * Bring the agent in line with the switch: with the switch on and the machine set up, an unregistered
   * agent is registered and an enabled one is started if it is not running.
   */
  async reconcileTheAgentWithTheRunTatolabSwitch(machineSetupComplete: boolean, nowMs: number): Promise<RunTatolabReconciliation> {
    if (!this.runTatolabSwitchedOn) return { kind: "switch_is_off" };
    if (!machineSetupComplete) return { kind: "waiting_for_machine_setup" };
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

  /** Turn the switch on or off and remember it. On registers the agent once the machine is set up; off unregisters it, which stops the runtime. */
  async setRunTatolab(runTatolab: boolean, machineSetupComplete: boolean, nowMs: number): Promise<RunTatolabReconciliation> {
    this.runTatolabSwitchedOn = runTatolab;
    const remembered = await this.preferenceFile.saveRunTatolab(runTatolab);
    if (!remembered.ok) {
      this.tatolabAppLog.warn("the Run Tatolab switch could not be remembered", { failure: remembered.failure, run_tatolab: runTatolab });
    }
    if (runTatolab) return this.reconcileTheAgentWithTheRunTatolabSwitch(machineSetupComplete, nowMs);
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
  toggle(machineSetupComplete: boolean, nowMs: number): Promise<RunTatolabReconciliation> {
    return this.setRunTatolab(!this.runTatolabSwitchedOn, machineSetupComplete, nowMs);
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
    this.runtimeExpectedUpSinceMs = nowMs;
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
    nowMs: number,
  ): Promise<void> {
    const timeSinceTheLastStartAttemptMs =
      this.runtimeAgentLastStartAttemptAtMs === null ? null : Math.max(0, nowMs - this.runtimeAgentLastStartAttemptAtMs);
    if (!theRuntimeAgentShouldBeStartedNow(this.runTatolabSwitchedOn, runtimeAgent, runtimeHealth, timeSinceTheLastStartAttemptMs)) {
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

  private async registerTheAgentAgainAndStartIt(): Promise<void> {
    const unregistered = await this.runtimeAgent.unregisterRuntimeAgent();
    if (!unregistered.ok) {
      this.tatolabAppLog.warn("the agent's stale registration could not be removed", { failure_description: unregistered.failure });
    }
    const registered = await this.runtimeAgent.registerRuntimeAgent();
    if (!registered.ok) {
      this.tatolabAppLog.warn("the runtime's agent could not be registered again", { failure_description: registered.failure });
      return;
    }
    const started = await this.runtimeAgent.startRuntimeAgentIfNotRunning();
    if (!started.ok) {
      this.tatolabAppLog.warn("the runtime's agent could not be started after registering it again", {
        start_failure: started.failure.kind === "refused" ? started.failure.refusal : started.failure.kind,
      });
    }
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
