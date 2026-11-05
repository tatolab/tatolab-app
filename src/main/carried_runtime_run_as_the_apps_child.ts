// The runtime as the app's own child, like a language server: started when no runtime answers,
// started again with a growing wait when it exits, stopped with SIGTERM as the app quits. A runtime
// that already answers, one the CLI started, is used as it is and never started over.

import type { RuntimeState } from "../shared/tatolab_backend_contract.js";
import type { CarriedRuntime, RuntimeChildProcess, RuntimeChildProcessExit, StartTheCarriedRuntimeAsAChildProcess } from "./platform/carried_runtime.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** How long a runtime the app started may go without answering before it reads as not answering rather than starting. */
export const RUNTIME_STARTING_GRACE_PERIOD_MS = 20_000;

/** The wait before the first start again after the runtime exits, doubled for each exit in a row before it answered. */
export const RUNTIME_START_AGAIN_FIRST_WAIT_MS = 1_000;

/** The longest wait before starting the runtime again. */
export const RUNTIME_START_AGAIN_LONGEST_WAIT_MS = 30_000;

/** Why an unpackaged app, which carries no runtime, finds none. */
export const NO_CARRIED_RUNTIME_REASON = "No runtime is running, and this build of Tato Studio carries none to start.";

/** Why "Restart runtime" leaves a runtime the app did not start alone. */
export const RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL = "The runtime running now was not started by Tato Studio, so Tato Studio leaves it alone.";

/** The runtime's state and, while it is not running, why, as one status round reads it. */
export interface RuntimeStateWithWhy {
  runtimeState: RuntimeState;
  runtimeNotRunningBecause: string | null;
}

/** How a runtime that exited ended, in its own words when it gave any. */
export function describeHowTheRuntimeEnded(runtimeChildProcessExit: RuntimeChildProcessExit): string {
  if (runtimeChildProcessExit.lastStandardErrorLine !== null) return runtimeChildProcessExit.lastStandardErrorLine;
  if (runtimeChildProcessExit.exitStatus !== null) return `it exited with status ${runtimeChildProcessExit.exitStatus}`;
  return `it was ended by ${runtimeChildProcessExit.endingSignal ?? "an unknown signal"}`;
}

/** The runtime the app carries, run as its child. */
export class CarriedRuntimeRunAsTheAppsChild {
  private runningRuntime: { runtimeChildProcess: RuntimeChildProcess; startedAtMs: number; answeredSinceItStarted: boolean } | null = null;
  private exitsInARowBeforeItAnswered = 0;
  private nextStartNotBeforeMs = 0;
  private howTheLastRuntimeEnded: string | null = null;
  private startAgainAsSoonAsItExits = false;
  private appIsQuitting = false;

  /** `carriedRuntime` started through `startTheRuntime`, calling `whenTheRuntimeExits` each time it ends so the status is read again; `null` runs nothing. */
  constructor(
    private readonly carriedRuntime: CarriedRuntime | null,
    private readonly startTheRuntime: StartTheCarriedRuntimeAsAChildProcess,
    private readonly readMonotonicClockMs: () => number,
    private readonly whenTheRuntimeExits: () => void,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Each status round, given whether a runtime answered at `nowMs`: start the carried one when none answers, none of the app's runs, and the wait after its last exit has passed. */
  keepTheRuntimeRunning(aRuntimeAnswers: boolean, nowMs: number): void {
    if (this.carriedRuntime === null || this.appIsQuitting) return;
    if (aRuntimeAnswers) {
      if (this.runningRuntime !== null && !this.runningRuntime.answeredSinceItStarted) {
        this.runningRuntime.answeredSinceItStarted = true;
        this.exitsInARowBeforeItAnswered = 0;
      }
      return;
    }
    if (this.runningRuntime !== null || nowMs < this.nextStartNotBeforeMs) return;
    this.startTheCarriedRuntime(this.carriedRuntime, nowMs);
  }

  /** The runtime's state at `nowMs`, given whether a runtime answered. */
  runtimeStateNow(aRuntimeAnswers: boolean, nowMs: number): RuntimeStateWithWhy {
    if (aRuntimeAnswers) return { runtimeState: "running", runtimeNotRunningBecause: null };
    if (this.carriedRuntime === null) return { runtimeState: "not_running", runtimeNotRunningBecause: NO_CARRIED_RUNTIME_REASON };
    if (this.runningRuntime !== null) {
      if (nowMs - this.runningRuntime.startedAtMs < RUNTIME_STARTING_GRACE_PERIOD_MS) return { runtimeState: "starting", runtimeNotRunningBecause: null };
      return { runtimeState: "not_running", runtimeNotRunningBecause: "The runtime is running but not answering." };
    }
    if (this.howTheLastRuntimeEnded === null) return { runtimeState: "starting", runtimeNotRunningBecause: null };
    return { runtimeState: "not_running", runtimeNotRunningBecause: `The runtime stopped: ${this.howTheLastRuntimeEnded}. Tato Studio starts it again shortly.` };
  }

  /** "Restart runtime": stop the app's runtime and start it again as soon as it exits, or start one now when the last one exited; refused for a runtime the app did not start. */
  restartOnRequest(aRuntimeAnswers: boolean): Result<void, string> {
    if (this.carriedRuntime === null) return failedWith(NO_CARRIED_RUNTIME_REASON);
    if (this.runningRuntime === null) {
      if (aRuntimeAnswers) return failedWith(RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL);
      this.nextStartNotBeforeMs = 0;
      this.exitsInARowBeforeItAnswered = 0;
      return succeeded(undefined);
    }
    this.tatolabAppLog.info("stopping the runtime to start it again on request");
    this.startAgainAsSoonAsItExits = true;
    this.runningRuntime.runtimeChildProcess.askItToStop();
    return succeeded(undefined);
  }

  /** The app is quitting: ask its runtime to stop, and start no other. */
  stopAsTheAppQuits(): void {
    this.appIsQuitting = true;
    if (this.runningRuntime === null) return;
    this.tatolabAppLog.info("stopping the runtime as the app quits");
    this.runningRuntime.runtimeChildProcess.askItToStop();
  }

  private startTheCarriedRuntime(carriedRuntime: CarriedRuntime, nowMs: number): void {
    const started = this.startTheRuntime(carriedRuntime, (runtimeChildProcessExit) => this.noticeTheRuntimeExited(runtimeChildProcessExit));
    if (!started.ok) {
      this.tatolabAppLog.warn("the runtime could not be started", { runtime_executable: carriedRuntime.runtimeExecutable, failure: started.failure });
      this.howTheLastRuntimeEnded = started.failure;
      this.waitLongerBeforeTheNextStart(nowMs);
      return;
    }
    this.tatolabAppLog.info("started the runtime", { runtime_executable: carriedRuntime.runtimeExecutable });
    this.runningRuntime = { runtimeChildProcess: started.value, startedAtMs: nowMs, answeredSinceItStarted: false };
  }

  private noticeTheRuntimeExited(runtimeChildProcessExit: RuntimeChildProcessExit): void {
    const nowMs = this.readMonotonicClockMs();
    const answeredSinceItStarted = this.runningRuntime?.answeredSinceItStarted ?? false;
    this.runningRuntime = null;
    const howItEnded = describeHowTheRuntimeEnded(runtimeChildProcessExit);
    if (this.appIsQuitting) {
      this.tatolabAppLog.info("the runtime stopped as the app quits", { how_it_ended: howItEnded });
      return;
    }
    if (this.startAgainAsSoonAsItExits) {
      this.startAgainAsSoonAsItExits = false;
      this.howTheLastRuntimeEnded = null;
      this.nextStartNotBeforeMs = 0;
      this.exitsInARowBeforeItAnswered = 0;
    } else {
      this.tatolabAppLog.warn("the runtime exited; it is started again shortly", { how_it_ended: howItEnded, answered_since_it_started: answeredSinceItStarted });
      this.howTheLastRuntimeEnded = howItEnded;
      if (answeredSinceItStarted) this.exitsInARowBeforeItAnswered = 0;
      this.waitLongerBeforeTheNextStart(nowMs);
    }
    this.whenTheRuntimeExits();
  }

  private waitLongerBeforeTheNextStart(nowMs: number): void {
    const waitMs = Math.min(RUNTIME_START_AGAIN_FIRST_WAIT_MS * 2 ** this.exitsInARowBeforeItAnswered, RUNTIME_START_AGAIN_LONGEST_WAIT_MS);
    this.exitsInARowBeforeItAnswered += 1;
    this.nextStartNotBeforeMs = nowMs + waitMs;
  }
}
