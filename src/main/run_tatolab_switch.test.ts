import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../shared/tatolab_backend_contract.js";
import type { RuntimeAgentGiveUp, RuntimeAgentRegistration, RuntimeAgentStartFailure } from "./platform/runtime_agent_registration.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import {
  RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL,
  RESTART_WITH_THE_AGENT_NOT_ENABLED_REFUSAL,
  RUNTIME_AGENT_RECOVERY_FIRST_INTERVAL_MS,
  RUNTIME_AGENT_RECOVERY_LONGEST_INTERVAL_MS,
  RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS,
  RUNTIME_AGENT_TAKEOVER_WAIT_MS,
  RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS,
  RunTatolabSwitch,
  runtimeAgentRecoveryIntervalMs,
  theRuntimeAgentShouldBeStartedNow,
} from "./run_tatolab_switch.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { RUNTIME_STARTING_GRACE_PERIOD_MS } from "./tatolab_status.js";

type FakeServiceManagementCall = "register" | "start_if_not_running" | "restart" | "unregister" | "open_login_items_settings";

/** A service manager whose agent status the test sets, recording every call it receives. */
class FakeServiceManagement implements RuntimeAgentRegistration {
  readonly calls: FakeServiceManagementCall[] = [];
  private statusAfterRegister: Result<RuntimeAgentRegistrationStatus, string> = succeeded("enabled");
  private startAnswers: Result<void, RuntimeAgentStartFailure>[] = [];
  private restartAnswer: Result<void, RuntimeAgentStartFailure> = succeeded(undefined);

  constructor(public status: RuntimeAgentRegistrationStatus) {}

  /** Answer the next starts with `answers`, in order; every later start succeeds. */
  answerStartsWith(answers: Result<void, RuntimeAgentStartFailure>[]): void {
    this.startAnswers = answers;
  }

  answerRestartWith(answer: Result<void, RuntimeAgentStartFailure>): void {
    this.restartAnswer = answer;
  }

  answerRegisterWith(answer: Result<RuntimeAgentRegistrationStatus, string>): void {
    this.statusAfterRegister = answer;
  }

  async registrationStatus(): Promise<RuntimeAgentRegistrationStatus> {
    return this.status;
  }

  async registerRuntimeAgent(): Promise<Result<void, string>> {
    this.calls.push("register");
    if (!this.statusAfterRegister.ok) return failedWith(this.statusAfterRegister.failure);
    this.status = this.statusAfterRegister.value;
    return this.status === "requires_approval" ? failedWith("Operation not permitted") : succeeded(undefined);
  }

  async startRuntimeAgentIfNotRunning(): Promise<Result<void, RuntimeAgentStartFailure>> {
    this.calls.push("start_if_not_running");
    return this.startAnswers.shift() ?? succeeded(undefined);
  }

  async restartRuntimeAgent(): Promise<Result<void, RuntimeAgentStartFailure>> {
    this.calls.push("restart");
    return this.restartAnswer;
  }

  async unregisterRuntimeAgent(): Promise<Result<void, string>> {
    this.calls.push("unregister");
    this.status = "not_registered";
    return succeeded(undefined);
  }

  async openLoginItemsSettings(): Promise<Result<void, string>> {
    this.calls.push("open_login_items_settings");
    return succeeded(undefined);
  }

  async whyTheServiceManagerGaveUpOnTheRuntime(): Promise<RuntimeAgentGiveUp | null> {
    return null;
  }
}

const quietTatolabAppLog = createTatolabAppLog("error", () => {});
const temporaryConfigDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryConfigDirectories.splice(0).map((configDirectory) => rm(configDirectory, { recursive: true, force: true })));
});

async function switchWith(agentStatus: RuntimeAgentRegistrationStatus, rememberedRunTatolab: boolean | null, appLaunchedAtMs = 0) {
  const configDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  temporaryConfigDirectories.push(configDirectory);
  const preferenceFile = RememberedSwitchFile.runTatolabInAppConfigDirectory(configDirectory, quietTatolabAppLog);
  if (rememberedRunTatolab !== null) await preferenceFile.saveRememberedSwitch(rememberedRunTatolab);
  const serviceManagement = new FakeServiceManagement(agentStatus);
  const runTatolabSwitch = await RunTatolabSwitch.load(serviceManagement, preferenceFile, appLaunchedAtMs, quietTatolabAppLog);
  return { runTatolabSwitch, serviceManagement, preferenceFile };
}

test("opening_the_app_with_the_switch_on_registers_an_unregistered_agent", async () => {
  for (const agentStatus of ["not_registered", "not_found"] as const) {
    const underTest = await switchWith(agentStatus, null);
    expect(underTest.runTatolabSwitch.runTatolab(), "the switch defaults on").toBe(true);

    const reconciliation = await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0);

    expect(reconciliation).toEqual({ kind: "registered" });
    expect(underTest.serviceManagement.calls).toEqual(["register", "start_if_not_running"]);
  }
});

test("opening_the_app_starts_an_enabled_agent_without_registering_it_again", async () => {
  const underTest = await switchWith("enabled", null);

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0)).toEqual({ kind: "already_enabled" });
  expect(underTest.serviceManagement.calls).toEqual(["start_if_not_running"]);
});

test("an_enabled_agent_the_service_manager_holds_no_job_for_is_registered_again_and_started", async () => {
  const underTest = await switchWith("enabled", null);
  underTest.serviceManagement.answerStartsWith([failedWith({ kind: "no_job_for_the_registered_agent" })]);

  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0);

  expect(underTest.serviceManagement.calls).toEqual(["start_if_not_running", "unregister", "register", "start_if_not_running"]);
});

test("a_refused_start_is_not_answered_by_registering_again", async () => {
  const underTest = await switchWith("enabled", null);
  underTest.serviceManagement.answerStartsWith([failedWith({ kind: "refused", refusal: "launchctl kickstart failed" })]);

  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0);

  expect(underTest.serviceManagement.calls).toEqual(["start_if_not_running"]);
});

test("a_switch_remembered_off_stays_off_after_reopening_the_app", async () => {
  const underTest = await switchWith("not_registered", false);

  expect(underTest.runTatolabSwitch.runTatolab()).toBe(false);
  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0)).toEqual({ kind: "switch_is_off" });
  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("turning_the_switch_off_unregisters_the_agent_and_is_remembered", async () => {
  const underTest = await switchWith("enabled", null);

  expect(await underTest.runTatolabSwitch.setRunTatolab(false, 0)).toEqual({ kind: "unregistered" });
  expect(underTest.serviceManagement.calls).toEqual(["unregister"]);
  expect(underTest.serviceManagement.status).toBe("not_registered");
  expect(await underTest.preferenceFile.loadRememberedSwitch()).toBe(false);
});

test("turning_the_switch_off_with_nothing_registered_calls_nothing", async () => {
  const underTest = await switchWith("not_registered", null);

  expect(await underTest.runTatolabSwitch.setRunTatolab(false, 0)).toEqual({ kind: "unregistered" });
  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("turning_the_switch_back_on_registers_and_is_remembered", async () => {
  const underTest = await switchWith("not_registered", false);

  expect(await underTest.runTatolabSwitch.setRunTatolab(true, 0)).toEqual({ kind: "registered" });
  expect(await underTest.preferenceFile.loadRememberedSwitch()).toBe(true);
});

test("toggling_flips_the_switch_and_reconciles_the_agent_each_time", async () => {
  const underTest = await switchWith("enabled", null);

  expect(await underTest.runTatolabSwitch.toggle(0)).toEqual({ kind: "unregistered" });
  expect(underTest.runTatolabSwitch.runTatolab()).toBe(false);
  expect(await underTest.preferenceFile.loadRememberedSwitch()).toBe(false);

  expect(await underTest.runTatolabSwitch.toggle(0)).toEqual({ kind: "registered" });
  expect(underTest.runTatolabSwitch.runTatolab()).toBe(true);
  expect(await underTest.preferenceFile.loadRememberedSwitch()).toBe(true);
  expect(underTest.serviceManagement.calls).toEqual(["unregister", "register", "start_if_not_running"]);
});

test("an_agent_needing_approval_opens_login_items_once_per_launch", async () => {
  const underTest = await switchWith("requires_approval", null);

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0)).toEqual({
    kind: "needs_approval_in_login_items",
    openedLoginItemsSettings: true,
  });
  await underTest.runTatolabSwitch.noticeRuntimeAgentRegistrationStatus("requires_approval");
  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0)).toEqual({
    kind: "needs_approval_in_login_items",
    openedLoginItemsSettings: false,
  });
  expect(underTest.serviceManagement.calls).toEqual(["open_login_items_settings"]);
});

test("login_items_opened_on_request_is_not_opened_again_by_the_poller", async () => {
  const underTest = await switchWith("requires_approval", null);

  expect(await underTest.runTatolabSwitch.openLoginItemsSettingsOnRequest()).toEqual({ ok: true, value: undefined });
  await underTest.runTatolabSwitch.noticeRuntimeAgentRegistrationStatus("requires_approval");

  expect(underTest.serviceManagement.calls).toEqual(["open_login_items_settings"]);
});

test("login_items_opens_on_request_even_after_this_launch_opened_it", async () => {
  const underTest = await switchWith("requires_approval", null);
  await underTest.runTatolabSwitch.noticeRuntimeAgentRegistrationStatus("requires_approval");

  await underTest.runTatolabSwitch.openLoginItemsSettingsOnRequest();

  expect(underTest.serviceManagement.calls).toEqual(["open_login_items_settings", "open_login_items_settings"]);
});

test("setting_the_switch_on_while_it_is_on_starts_an_enabled_agent_again", async () => {
  const underTest = await switchWith("enabled", null);

  expect(await underTest.runTatolabSwitch.setRunTatolab(true, 0)).toEqual({ kind: "already_enabled" });
  expect(await underTest.preferenceFile.loadRememberedSwitch()).toBe(true);
  expect(underTest.serviceManagement.calls).toEqual(["start_if_not_running"]);
});

test("a_registration_refused_for_approval_reports_approval_rather_than_failure", async () => {
  const underTest = await switchWith("not_registered", null);
  underTest.serviceManagement.answerRegisterWith(succeeded("requires_approval"));

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0)).toEqual({
    kind: "needs_approval_in_login_items",
    openedLoginItemsSettings: true,
  });
  expect(underTest.serviceManagement.calls).toEqual(["register", "open_login_items_settings"]);
});

test("a_failed_registration_is_reported_and_the_next_attempt_registers_again", async () => {
  const underTest = await switchWith("not_found", null);
  underTest.serviceManagement.answerRegisterWith(failedWith("Invalid argument"));

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0)).toEqual({
    kind: "registration_failed",
    failureDescription: "Invalid argument",
  });

  underTest.serviceManagement.answerRegisterWith(succeeded("enabled"));
  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(0)).toEqual({ kind: "registered" });
});

test("the_poller_seeing_approval_needed_with_the_switch_off_opens_nothing", async () => {
  const underTest = await switchWith("requires_approval", false);

  await underTest.runTatolabSwitch.noticeRuntimeAgentRegistrationStatus("requires_approval");

  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("registering_or_a_healthy_answer_restarts_the_starting_grace_period", async () => {
  const launchedAtMs = 1_000;
  const underTest = await switchWith("not_registered", null, launchedAtMs);

  const laterMs = launchedAtMs + 60_000;
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(laterMs)).toBe(60_000);
  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(laterMs);
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(laterMs)).toBe(0);
  const healthyAtMs = laterMs + 30_000;
  underTest.runTatolabSwitch.noteRuntimeHealthy(healthyAtMs);
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(healthyAtMs + 5_000)).toBe(5_000);
});

test("the_runtime_agent_is_started_only_while_on_enabled_and_failing_health", () => {
  const neverAttempted = null;
  expect(theRuntimeAgentShouldBeStartedNow({ runTatolab: true, runtimeAgent: "enabled", runtimeHealth: "failing", serviceManagerGaveUpOnTheRuntime: false, timeSinceTheLastStartAttemptMs: neverAttempted })).toBe(true);
  expect(theRuntimeAgentShouldBeStartedNow({ runTatolab: false, runtimeAgent: "enabled", runtimeHealth: "failing", serviceManagerGaveUpOnTheRuntime: false, timeSinceTheLastStartAttemptMs: neverAttempted })).toBe(false);
  expect(theRuntimeAgentShouldBeStartedNow({ runTatolab: true, runtimeAgent: "enabled", runtimeHealth: "healthy", serviceManagerGaveUpOnTheRuntime: false, timeSinceTheLastStartAttemptMs: neverAttempted })).toBe(false);
  for (const runtimeAgent of ["requires_approval", "not_registered", "not_found"] as const) {
    expect(theRuntimeAgentShouldBeStartedNow({ runTatolab: true, runtimeAgent, runtimeHealth: "failing", serviceManagerGaveUpOnTheRuntime: false, timeSinceTheLastStartAttemptMs: neverAttempted }), runtimeAgent).toBe(false);
  }
});

test("the_runtime_agent_is_never_started_by_the_app_once_the_service_manager_gave_up_on_it", () => {
  expect(theRuntimeAgentShouldBeStartedNow({ runTatolab: true, runtimeAgent: "enabled", runtimeHealth: "failing", serviceManagerGaveUpOnTheRuntime: true, timeSinceTheLastStartAttemptMs: null })).toBe(false);
  expect(theRuntimeAgentShouldBeStartedNow({ runTatolab: true, runtimeAgent: "enabled", runtimeHealth: "failing", serviceManagerGaveUpOnTheRuntime: true, timeSinceTheLastStartAttemptMs: 60_000 })).toBe(false);
});

test("the_runtime_agent_is_started_at_most_once_per_minimum_interval", () => {
  const cases: [number, boolean][] = [
    [0, false],
    [9_000, false],
    [RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS, true],
    [60_000, true],
  ];
  for (const [timeSinceTheLastStartAttemptMs, expected] of cases) {
    expect(theRuntimeAgentShouldBeStartedNow({ runTatolab: true, runtimeAgent: "enabled", runtimeHealth: "failing", serviceManagerGaveUpOnTheRuntime: false, timeSinceTheLastStartAttemptMs: timeSinceTheLastStartAttemptMs }), `${timeSinceTheLastStartAttemptMs} ms`).toBe(
      expected,
    );
  }
});

test("a_runtime_found_down_is_started_ten_seconds_after_the_last_start_attempt", async () => {
  const openedAtMs = 1_000;
  const underTest = await switchWith("enabled", null);
  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(openedAtMs);
  const startCalls = () => underTest.serviceManagement.calls.filter((call) => call === "start_if_not_running").length;
  expect(startCalls()).toBe(1);

  const cases: [number, number][] = [
    [2, 1],
    [9, 1],
    [10, 2],
    [12, 2],
    [20, 3],
  ];
  for (const [secondsAfterOpening, expectedStartCalls] of cases) {
    await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", openedAtMs + secondsAfterOpening * 1_000);
    expect(startCalls(), `${secondsAfterOpening} s after opening`).toBe(expectedStartCalls);
  }
});

test("a_runtime_found_down_with_the_switch_off_or_healthy_is_left_alone", async () => {
  const laterMs = 60_000;
  const switchedOff = await switchWith("enabled", false);
  await switchedOff.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "unreachable", laterMs);
  expect(switchedOff.serviceManagement.calls).toEqual([]);

  const healthy = await switchWith("enabled", null);
  await healthy.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "running", laterMs);
  expect(healthy.serviceManagement.calls).toEqual([]);
});

/** A monotonic clock standing at `nowMs`. */
function clockAt(nowMs: number) {
  return { readMonotonicClockMs: () => nowMs };
}

test("restarting_the_runtime_on_request_restarts_the_agents_runtime_and_gives_it_the_starting_grace_again", async () => {
  const launchedAtMs = 1_000;
  const underTest = await switchWith("enabled", true, launchedAtMs);
  const clock = clockAt(launchedAtMs + 90_000);

  expect(await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(clock.readMonotonicClockMs)).toEqual(succeeded(undefined));

  expect(underTest.serviceManagement.calls).toEqual(["restart"]);
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(launchedAtMs + 92_000)).toBe(2_000);
});

test("a_restarted_runtime_reads_restarting_until_a_health_check_begun_after_the_service_manager_answered_finds_it_healthy", async () => {
  const underTest = await switchWith("enabled", true);
  const clockReadAtTheRequestThenAtTheAnswer = [10_000, 10_400];
  const readMonotonicClockMs = () => clockReadAtTheRequestThenAtTheAnswer.shift() ?? 10_400;

  await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(readMonotonicClockMs);

  expect(underTest.runTatolabSwitch.isRestartingTheRuntime(9_500, "healthy")).toBe(true);
  expect(underTest.runTatolabSwitch.isRestartingTheRuntime(10_399, "healthy")).toBe(true);
  underTest.runTatolabSwitch.noteRestartSettledIfThisRoundShowsIt(10_450, "failing");
  expect(underTest.runTatolabSwitch.isRestartingTheRuntime(10_450, "failing")).toBe(false);
  expect(underTest.runTatolabSwitch.isRestartingTheRuntime(9_000, "healthy")).toBe(true);
  expect(underTest.runTatolabSwitch.isRestartingTheRuntime(10_450, "healthy")).toBe(false);
  underTest.runTatolabSwitch.noteRestartSettledIfThisRoundShowsIt(10_450, "healthy");
  expect(underTest.runTatolabSwitch.isRestartingTheRuntime(9_000, "healthy")).toBe(false);
});

test("restarting_the_runtime_with_the_switch_off_or_with_the_agent_not_enabled_is_refused_and_registers_nothing", async () => {
  const clock = clockAt(5_000);
  const switchedOff = await switchWith("not_registered", false);
  expect(await switchedOff.runTatolabSwitch.restartTheRuntimeOnRequest(clock.readMonotonicClockMs)).toEqual(failedWith(RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL));
  expect(switchedOff.serviceManagement.calls).toEqual([]);

  for (const agentStatus of ["not_registered", "requires_approval", "not_found"] as const) {
    const agentNotEnabled = await switchWith(agentStatus, true);
    expect(await agentNotEnabled.runTatolabSwitch.restartTheRuntimeOnRequest(clock.readMonotonicClockMs)).toEqual(
      failedWith(RESTART_WITH_THE_AGENT_NOT_ENABLED_REFUSAL),
    );
    expect(agentNotEnabled.serviceManagement.calls).toEqual([]);
    expect(agentNotEnabled.runTatolabSwitch.isRestartingTheRuntime(5_000, "healthy")).toBe(false);
  }
});

test("a_restart_the_service_manager_refuses_is_refused_in_its_words_and_leaves_nothing_restarting", async () => {
  const underTest = await switchWith("enabled", true);
  const refusal = "launchctl kickstart -k gui/501/com.tatolab.tatolabd failed (exit status: 5): Input/output error";
  underTest.serviceManagement.answerRestartWith(failedWith({ kind: "refused", refusal }));

  expect(await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(clockAt(5_000).readMonotonicClockMs)).toEqual(failedWith(refusal));
  expect(underTest.runTatolabSwitch.isRestartingTheRuntime(4_000, "healthy")).toBe(false);
});

test("a_restart_finding_no_job_for_the_agent_registers_it_again_and_starts_it", async () => {
  const underTest = await switchWith("enabled", true);
  underTest.serviceManagement.answerRestartWith(failedWith({ kind: "no_job_for_the_registered_agent" }));

  expect(await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(clockAt(5_000).readMonotonicClockMs)).toEqual(succeeded(undefined));
  expect(underTest.serviceManagement.calls).toEqual(["restart", "unregister", "register", "start_if_not_running"]);
});

test("the_runtime_has_not_answered_until_a_healthy_round_and_registering_or_restarting_it_forgets_that_it_had", async () => {
  const underTest = await switchWith("not_registered", null);
  expect(underTest.runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted(), "nothing has answered since the app launched").toBe(false);

  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(1_000);
  underTest.runTatolabSwitch.noteRuntimeHealthy(2_000);
  expect(underTest.runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted()).toBe(true);

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "unreachable", 30_000);
  expect(underTest.runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted(), "the app starting a runtime that went down is not a fresh start").toBe(true);

  await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(clockAt(40_000).readMonotonicClockMs);
  expect(underTest.runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted()).toBe(false);
  underTest.runTatolabSwitch.noteRuntimeHealthy(41_000);

  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_REFUSED_TO_SPAWN_THE_JOB);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", 50_000);
  expect(underTest.runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted(), "the app registering the agent afresh is a fresh start").toBe(false);
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(55_000)).toBe(5_000);
});

/** launchd refusing to spawn the job, which registering the agent again clears. */
const LAUNCHD_REFUSED_TO_SPAWN_THE_JOB: RuntimeAgentGiveUp = {
  serviceManagerWords: "launchd: last exit code = 78: EX_CONFIG",
  registeringAgainWaitsForTheNextSpawn: false,
};

/** launchd killing the job for its code signature, as its first spawn after another copy of the app registered the agent is. */
const LAUNCHD_KILLED_THE_JOB_FOR_ITS_CODE_SIGNATURE: RuntimeAgentGiveUp = {
  serviceManagerWords: "launchd: last exit reason = OS_REASON_CODESIGNING",
  registeringAgainWaitsForTheNextSpawn: true,
};

/** The switch on with its agent enabled, registered at `registeredAtMs` by opening the app over an unregistered agent, with the calls that made forgotten. */
async function switchRegisteredAt(registeredAtMs: number) {
  const underTest = await switchWith("not_registered", true, 0);
  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(registeredAtMs);
  underTest.serviceManagement.calls.length = 0;
  return underTest;
}

const ONE_FRESH_REGISTRATION = ["unregister", "register", "start_if_not_running"];

test("the_app_registers_the_agent_afresh_by_itself_less_often_each_time_until_the_runtime_answers", async () => {
  const underTest = await switchRegisteredAt(0);
  const freshRegistrations = () => underTest.serviceManagement.calls.filter((call) => call === "unregister").length;
  const pollFindingAGiveUp = async (nowMs: number) => {
    underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_REFUSED_TO_SPAWN_THE_JOB);
    await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "blocked_by_the_service_manager", nowMs);
  };

  await pollFindingAGiveUp(1_000);
  expect(underTest.serviceManagement.calls, "a give-up is answered at once").toEqual(ONE_FRESH_REGISTRATION);
  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_REFUSED_TO_SPAWN_THE_JOB);
  expect(underTest.runTatolabSwitch.serviceManagerStillGivesUpAfterTheAppsOwnFreshRegistration(), "a give-up after the app's own registration reads blocked").toBe(true);

  const cases: [number, number][] = [
    [30_999, 1],
    [31_000, 2],
    [90_999, 2],
    [91_000, 3],
    [210_999, 3],
    [211_000, 4],
  ];
  for (const [nowMs, expectedFreshRegistrations] of cases) {
    await pollFindingAGiveUp(nowMs);
    expect(freshRegistrations(), `${nowMs} ms`).toBe(expectedFreshRegistrations);
  }

  underTest.runTatolabSwitch.noteRuntimeHealthy(300_000);
  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_REFUSED_TO_SPAWN_THE_JOB);
  expect(underTest.runTatolabSwitch.serviceManagerStillGivesUpAfterTheAppsOwnFreshRegistration(), "an answer forgets the app's registrations").toBe(false);
  await pollFindingAGiveUp(300_500);
  expect(freshRegistrations(), "an answer starts the backoff over").toBe(5);
});

test("the_wait_between_fresh_registrations_doubles_from_thirty_seconds_up_to_thirty_minutes", () => {
  expect(runtimeAgentRecoveryIntervalMs(1)).toBe(RUNTIME_AGENT_RECOVERY_FIRST_INTERVAL_MS);
  expect(runtimeAgentRecoveryIntervalMs(2)).toBe(60_000);
  expect(runtimeAgentRecoveryIntervalMs(3)).toBe(120_000);
  expect(runtimeAgentRecoveryIntervalMs(6)).toBe(960_000);
  expect(runtimeAgentRecoveryIntervalMs(7)).toBe(RUNTIME_AGENT_RECOVERY_LONGEST_INTERVAL_MS);
  expect(runtimeAgentRecoveryIntervalMs(40)).toBe(RUNTIME_AGENT_RECOVERY_LONGEST_INTERVAL_MS);
});

test("a_give_up_that_waits_for_the_next_spawn_holds_the_fresh_registration_until_launchd_spawns_the_job_again", async () => {
  const underTest = await switchRegisteredAt(0);

  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_KILLED_THE_JOB_FOR_ITS_CODE_SIGNATURE);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", 2_000);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", 8_000);
  expect(underTest.serviceManagement.calls, "registering before launchd's next spawn is refused the same way").toEqual([]);
  expect(underTest.runTatolabSwitch.serviceManagerStillGivesUpAfterTheAppsOwnFreshRegistration(), "a held give-up reads as starting").toBe(false);

  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_REFUSED_TO_SPAWN_THE_JOB);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", 12_000);
  expect(underTest.serviceManagement.calls).toEqual(ONE_FRESH_REGISTRATION);
});

test("a_round_that_catches_the_job_running_between_refused_spawns_neither_starts_it_nor_puts_off_the_fresh_registration", async () => {
  const underTest = await switchRegisteredAt(0);
  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_KILLED_THE_JOB_FOR_ITS_CODE_SIGNATURE);

  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(null);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", 11_000);
  expect(underTest.serviceManagement.calls, "the give-up holds, so the poller starts nothing").toEqual([]);

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", RUNTIME_AGENT_TAKEOVER_WAIT_MS);
  expect(underTest.serviceManagement.calls, "the wait counts from the registration").toEqual(ONE_FRESH_REGISTRATION);

  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(null);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", RUNTIME_AGENT_TAKEOVER_WAIT_MS + RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS);
  expect(underTest.serviceManagement.calls, "a fresh start forgets the give-up, so the poller starts the runtime again").toEqual([...ONE_FRESH_REGISTRATION, "start_if_not_running"]);
});

test("a_give_up_holds_until_the_runtime_answers_or_is_started_afresh", async () => {
  const kickstartsOnAnUnreachableRound = async (underTest: Awaited<ReturnType<typeof switchWith>>, nowMs: number) => {
    underTest.serviceManagement.calls.length = 0;
    underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(null);
    await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "unreachable", nowMs);
    return underTest.serviceManagement.calls.includes("start_if_not_running");
  };

  const answered = await switchWith("enabled", true);
  answered.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_KILLED_THE_JOB_FOR_ITS_CODE_SIGNATURE);
  expect(await kickstartsOnAnUnreachableRound(answered, 1_000), "a held give-up starts nothing").toBe(false);
  answered.runTatolabSwitch.noteRuntimeHealthy(2_000);
  expect(await kickstartsOnAnUnreachableRound(answered, 3_000), "an answer forgets it").toBe(true);

  const restarted = await switchWith("enabled", true);
  restarted.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_KILLED_THE_JOB_FOR_ITS_CODE_SIGNATURE);
  await restarted.runTatolabSwitch.restartTheRuntimeOnRequest(clockAt(1_000).readMonotonicClockMs);
  expect(await kickstartsOnAnUnreachableRound(restarted, 1_000 + RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS), "a restart forgets it").toBe(true);
});

test("a_runtime_that_never_answered_is_still_started_between_fresh_registrations", async () => {
  const underTest = await switchRegisteredAt(0);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "never_answered", 30_000);
  expect(underTest.serviceManagement.calls, "a spawn launchd left pended is caught before the fresh registration is due").toEqual(["start_if_not_running"]);
});

test("a_give_up_that_waits_for_the_next_spawn_holds_the_fresh_registration_no_longer_than_the_takeover_wait", async () => {
  const underTest = await switchWith("enabled", true, 0);
  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_KILLED_THE_JOB_FOR_ITS_CODE_SIGNATURE);

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", RUNTIME_AGENT_TAKEOVER_WAIT_MS - 1);
  expect(underTest.serviceManagement.calls, "measured from the launch when this launch has started nothing").toEqual([]);

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "starting", RUNTIME_AGENT_TAKEOVER_WAIT_MS);
  expect(underTest.serviceManagement.calls).toEqual(ONE_FRESH_REGISTRATION);
});

test("the_takeover_wait_reads_as_starting", () => {
  expect(RUNTIME_AGENT_TAKEOVER_WAIT_MS).toBeGreaterThan(RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS);
  expect(RUNTIME_AGENT_TAKEOVER_WAIT_MS).toBeLessThan(RUNTIME_STARTING_GRACE_PERIOD_MS);
});

test("a_runtime_that_never_answered_is_registered_afresh_no_sooner_than_a_minute_after_each_start", async () => {
  const underTest = await switchRegisteredAt(0);
  const freshRegistrations = () => underTest.serviceManagement.calls.filter((call) => call === "unregister").length;

  const cases: [number, number][] = [
    [RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS - 1, 0],
    [RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS, 1],
    [RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS + RUNTIME_AGENT_RECOVERY_FIRST_INTERVAL_MS, 1],
    [2 * RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS - 1, 1],
    [2 * RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS, 2],
    [3 * RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS, 3],
    [3 * RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS + 119_999, 3],
    [3 * RUNTIME_NEVER_ANSWERED_RECOVERY_AFTER_MS + 120_000, 4],
  ];
  for (const [nowMs, expectedFreshRegistrations] of cases) {
    await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "never_answered", nowMs);
    expect(freshRegistrations(), `${nowMs} ms, a slow start is never cut short sooner than a minute`).toBe(expectedFreshRegistrations);
  }
});

test("an_agent_not_registered_with_the_switch_on_is_registered_by_the_app_itself_then_less_often", async () => {
  const underTest = await switchWith("not_registered", true);
  underTest.serviceManagement.answerRegisterWith(failedWith("Operation not permitted"));

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("not_registered", "stopped", 1_000);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("not_registered", "stopped", 3_000);
  expect(underTest.serviceManagement.calls).toEqual(["register"]);

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("not_registered", "stopped", 1_000 + RUNTIME_AGENT_RECOVERY_FIRST_INTERVAL_MS);
  expect(underTest.serviceManagement.calls).toEqual(["register", "register"]);
});

test("the_app_recovers_nothing_with_the_switch_off", async () => {
  const underTest = await switchWith("enabled", false);
  underTest.runTatolabSwitch.noteTheServiceManagersGiveUp(LAUNCHD_REFUSED_TO_SPAWN_THE_JOB);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "blocked_by_the_service_manager", 1_000);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "never_answered", 120_000);

  const unregistered = await switchWith("not_registered", false);
  await unregistered.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("not_registered", "stopped", 1_000);
  expect([...underTest.serviceManagement.calls, ...unregistered.serviceManagement.calls]).toEqual([]);
});
