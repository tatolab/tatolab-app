// The "Run Tatolab" switch: one registration is both "the runtime runs now" and "the runtime
// starts at login". Opening the app with the switch on registers the agent; turning it off
// unregisters it, which stops the runtime, and is remembered. While the app runs, the switch on
// also starts an enabled agent whose runtime the poller finds down, and recovers one the service
// manager gave up on, that never answered, or that is not registered by registering it afresh by
// itself, less often each time, until the runtime answers.

import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus, RuntimeState } from "../shared/tatolab_backend_contract.js";
import type { BundledRuntimeRestart, RuntimeAgentGiveUp, RuntimeAgentRegistration, RuntimeAgentStartFailure } from "./platform/runtime_agent_registration.js";
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
 * The longest the app holds its fresh registration for a give-up that waits for the service manager's next spawn, from
 * the app's launch or the runtime's last registration, restart or registration again: launchd's 10 s between spawns
 * with a margin, inside the starting grace period.
 */
export const RUNTIME_AGENT_TAKEOVER_WAIT_MS = 15_000;

/** How long a runtime that never answered may go, since it was last started, before the app registers its agent afresh, each time: well past the starting grace, so a slow start is not cut short. */
export const RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS = 60_000;

/** The wait after the app's first fresh registration of the agent before its second, doubling after each one the runtime does not answer. */
export const RUNTIME_AGENT_RECOVERY_FIRST_INTERVAL_MS = 30_000;

/** The longest wait between the app's own fresh registrations: macOS can notify the person of each registration, so a lasting refusal is retried rarely. */
export const RUNTIME_AGENT_RECOVERY_LONGEST_INTERVAL_MS = 30 * 60_000;

/** The wait after the app's `freshRegistrationsSoFar`-th fresh registration since the runtime last answered, from one, before the next. */
export function runtimeAgentRecoveryIntervalMs(freshRegistrationsSoFar: number): number {
  return Math.min(RUNTIME_AGENT_RECOVERY_FIRST_INTERVAL_MS * 2 ** (freshRegistrationsSoFar - 1), RUNTIME_AGENT_RECOVERY_LONGEST_INTERVAL_MS);
}

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

/** The app's own fresh registrations of the agent since the runtime last answered: how many, and when the last one was. */
interface FreshRegistrationsSinceTheRuntimeLastAnswered {
  readonly freshRegistrationsSoFar: number;
  readonly lastFreshRegistrationAtMs: number;
}

/** The switch's remembered value, the agent it drives, and what this launch has already done. */
export class RunTatolabSwitch {
  private loginItemsSettingsOpenedThisLaunch = false;
  private runtimeAgentLastStartAttemptAtMs: number | null = null;
  private runtimeAnsweredSinceLastStarted = false;
  /** `null` while the app has not registered the agent afresh by itself since the runtime last answered. */
  private freshRegistrationsSinceTheRuntimeLastAnswered: FreshRegistrationsSinceTheRuntimeLastAnswered | null = null;
  private serviceManagerGiveUpHeldUntilTheRuntimeAnswersOrIsStartedAfresh: RuntimeAgentGiveUp | null = null;
  /** The restart on request under way; `null` with none. */
  private restartOnRequest: RuntimeRestartOnRequestUnderWay | null = null;
  private runtimeExpectedUpSinceMs: number;
  /** When the app launched or last registered, restarted or registered the runtime again. */
  private runtimeLastStartedAfreshAtMs: number;

  private constructor(
    private readonly runtimeAgent: RuntimeAgentRegistration,
    private readonly preferenceFile: RememberedSwitchFile,
    private runTatolabSwitchedOn: boolean,
    appLaunchedAtMs: number,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {
    this.runtimeExpectedUpSinceMs = appLaunchedAtMs;
    this.runtimeLastStartedAfreshAtMs = appLaunchedAtMs;
  }

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

  /** The service manager having given up starting the agent's runtime, or `null`; reads only. */
  whyTheServiceManagerGaveUpOnTheRuntime(): Promise<RuntimeAgentGiveUp | null> {
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
    this.freshRegistrationsSinceTheRuntimeLastAnswered = null;
    this.serviceManagerGiveUpHeldUntilTheRuntimeAnswersOrIsStartedAfresh = null;
  }

  /**
   * Note the give-up a status round read, `null` when it read none. A give-up holds until the runtime answers or is
   * started afresh: a round can catch launchd's job running for a moment between two refused spawns, and that is not
   * the service manager letting it run.
   */
  noteTheServiceManagersGiveUp(serviceManagerGiveUp: RuntimeAgentGiveUp | null): void {
    if (serviceManagerGiveUp !== null) this.serviceManagerGiveUpHeldUntilTheRuntimeAnswersOrIsStartedAfresh = serviceManagerGiveUp;
  }

  /** The service manager's latest give-up since the runtime last answered or was started afresh; `null` with none. */
  serviceManagerGiveUpSinceTheRuntimeLastAnsweredOrWasStartedAfresh(): RuntimeAgentGiveUp | null {
    return this.serviceManagerGiveUpHeldUntilTheRuntimeAnswersOrIsStartedAfresh;
  }

  /** Whether the app has registered the agent afresh by itself since the runtime last answered. */
  hasRegisteredAfreshSinceTheRuntimeLastAnswered(): boolean {
    return this.freshRegistrationsSinceTheRuntimeLastAnswered !== null;
  }

  /** Whether the service manager still gives up on the runtime after the app registered its agent afresh by itself, which reads as blocked. */
  serviceManagerStillGivesUpAfterTheAppsOwnFreshRegistration(): boolean {
    return this.serviceManagerGiveUpHeldUntilTheRuntimeAnswersOrIsStartedAfresh !== null && this.hasRegisteredAfreshSinceTheRuntimeLastAnswered();
  }

  /** Whether the runtime has answered since the app launched or last registered, restarted or registered it again. */
  runtimeAnsweredSinceItWasLastStarted(): boolean {
    return this.runtimeAnsweredSinceLastStarted;
  }

  /** The runtime is being started afresh at `nowMs`: it gets the starting grace from then, and has not answered since. */
  private noteTheRuntimeStartedAfresh(nowMs: number): void {
    this.runtimeAgentLastStartAttemptAtMs = nowMs;
    this.runtimeLastStartedAfreshAtMs = nowMs;
    this.runtimeExpectedUpSinceMs = nowMs;
    this.runtimeAnsweredSinceLastStarted = false;
    this.serviceManagerGiveUpHeldUntilTheRuntimeAnswersOrIsStartedAfresh = null;
  }

  /** How long the runtime has had to come up since the app launched, the agent was registered, or the runtime last answered. */
  timeSinceTheRuntimeWasExpectedUpMs(nowMs: number): number {
    return Math.max(0, nowMs - this.runtimeExpectedUpSinceMs);
  }

  /** How long since this launch last registered or started the agent; `null` when it has not. */
  private timeSinceTheLastStartAttemptMs(nowMs: number): number | null {
    return this.runtimeAgentLastStartAttemptAtMs === null ? null : Math.max(0, nowMs - this.runtimeAgentLastStartAttemptAtMs);
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

  /**
   * React to the poller finding the runtime `runtimeState` at `nowMs`, with the switch on. The app registers the agent
   * afresh by itself when the service manager gave up on it since it last answered or was started afresh, when its
   * runtime never answered, or when it is not registered: at once for a give-up or a missing registration, after
   * `RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS` for a runtime that never answered, then less often each time by
   * `runtimeAgentRecoveryIntervalMs` until the runtime answers. A give-up that waits for the service manager's next spawn
   * is held until that spawn, for at most `RUNTIME_AGENT_TAKEOVER_WAIT_MS`. Otherwise a runtime down with its agent
   * enabled is started as `theRuntimeAgentShouldBeStartedNow` says.
   */
  async startTheRuntimeIfThePollerFoundItDown(
    runtimeAgent: RuntimeAgentRegistrationStatus,
    runtimeState: RuntimeState,
    nowMs: number,
  ): Promise<void> {
    if (!this.runTatolabSwitchedOn) return;
    const serviceManagerGiveUp = this.serviceManagerGiveUpHeldUntilTheRuntimeAnswersOrIsStartedAfresh;
    switch (runtimeAgent) {
      case "not_registered":
        if (this.aFreshRegistrationIsDue(serviceManagerGiveUp, false, nowMs)) await this.registerTheAgentAfreshByItself(runtimeAgent, runtimeState, serviceManagerGiveUp, nowMs);
        return;
      case "enabled":
        if (serviceManagerGiveUp !== null || runtimeState === "never_answered") {
          if (this.aFreshRegistrationIsDue(serviceManagerGiveUp, serviceManagerGiveUp === null, nowMs)) {
            await this.registerTheAgentAfreshByItself(runtimeAgent, runtimeState, serviceManagerGiveUp, nowMs);
          }
          return;
        }
        break;
      case "requires_approval":
      case "not_found":
        // Registering afresh cannot help: approval is the person's to give, and a missing agent is the install's.
        return;
    }
    const timeSinceTheLastStartAttemptMs = this.timeSinceTheLastStartAttemptMs(nowMs);
    if (
      !theRuntimeAgentShouldBeStartedNow({
        runTatolab: this.runTatolabSwitchedOn,
        runtimeAgent,
        runtimeHealth: runtimeState === "running" ? "healthy" : "failing",
        serviceManagerGaveUpOnTheRuntime: serviceManagerGiveUp !== null,
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

  /** Whether the app's next fresh registration is due at `nowMs`, by the backoff since the runtime last answered and, for the first, by what held the runtime back. */
  private aFreshRegistrationIsDue(serviceManagerGiveUp: RuntimeAgentGiveUp | null, runtimeMayStillBeStartingSlowly: boolean, nowMs: number): boolean {
    const timeSinceTheRuntimeWasLastStartedAfreshMs = Math.max(0, nowMs - this.runtimeLastStartedAfreshAtMs);
    if (serviceManagerGiveUp?.registeringAgainWaitsForTheNextSpawn === true && timeSinceTheRuntimeWasLastStartedAfreshMs < RUNTIME_AGENT_TAKEOVER_WAIT_MS) return false;
    const freshRegistrations = this.freshRegistrationsSinceTheRuntimeLastAnswered;
    if (freshRegistrations === null) {
      return !runtimeMayStillBeStartingSlowly || this.timeSinceTheRuntimeWasExpectedUpMs(nowMs) >= RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS;
    }
    const recoveryIntervalMs = runtimeAgentRecoveryIntervalMs(freshRegistrations.freshRegistrationsSoFar);
    const waitBeforeTheNextMs = runtimeMayStillBeStartingSlowly ? Math.max(recoveryIntervalMs, RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS) : recoveryIntervalMs;
    return nowMs - freshRegistrations.lastFreshRegistrationAtMs >= waitBeforeTheNextMs;
  }

  private async registerTheAgentAfreshByItself(
    runtimeAgent: RuntimeAgentRegistrationStatus,
    runtimeState: RuntimeState,
    serviceManagerGiveUp: RuntimeAgentGiveUp | null,
    nowMs: number,
  ): Promise<void> {
    const freshRegistrationsSoFar = (this.freshRegistrationsSinceTheRuntimeLastAnswered?.freshRegistrationsSoFar ?? 0) + 1;
    this.freshRegistrationsSinceTheRuntimeLastAnswered = { freshRegistrationsSoFar, lastFreshRegistrationAtMs: nowMs };
    this.tatolabAppLog.warn("registering the runtime's agent afresh to recover the runtime", {
      runtime_agent: runtimeAgent,
      runtime_state: runtimeState,
      service_manager_words: serviceManagerGiveUp?.serviceManagerWords ?? null,
      fresh_registration: freshRegistrationsSoFar,
    });
    if (runtimeAgent === "not_registered") {
      await this.register(nowMs);
      return;
    }
    this.noteTheRuntimeStartedAfresh(nowMs);
    await this.registerTheAgentAgainAndStartIt();
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
