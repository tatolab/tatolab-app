import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../shared/tatolab_backend_contract.js";
import type { RuntimeAgentRegistration, RuntimeAgentStartFailure } from "./platform/runtime_agent_registration.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import {
  REGISTER_AGAIN_WITH_RUN_TATOLAB_OFF_REFUSAL,
  RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL,
  RESTART_WITH_THE_AGENT_NOT_ENABLED_REFUSAL,
  RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS,
  RunTatolabSwitch,
  theRuntimeAgentShouldBeStartedNow,
} from "./run_tatolab_switch.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

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

  async whyTheServiceManagerGaveUpOnTheRuntime(): Promise<string | null> {
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
    await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "failing", false, openedAtMs + secondsAfterOpening * 1_000);
    expect(startCalls(), `${secondsAfterOpening} s after opening`).toBe(expectedStartCalls);
  }
});

test("a_runtime_found_down_with_the_switch_off_or_healthy_is_left_alone", async () => {
  const laterMs = 60_000;
  const switchedOff = await switchWith("enabled", false);
  await switchedOff.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "failing", false, laterMs);
  expect(switchedOff.serviceManagement.calls).toEqual([]);

  const healthy = await switchWith("enabled", null);
  await healthy.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "healthy", false, laterMs);
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

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "failing", false, 30_000);
  expect(underTest.runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted(), "the app starting a runtime that went down is not a fresh start").toBe(true);

  await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(clockAt(40_000).readMonotonicClockMs);
  expect(underTest.runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted()).toBe(false);
  underTest.runTatolabSwitch.noteRuntimeHealthy(41_000);

  await underTest.runTatolabSwitch.registerTheRuntimeAgainOnRequest(50_000);
  expect(underTest.runTatolabSwitch.runtimeAnsweredSinceItWasLastStarted()).toBe(false);
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(55_000)).toBe(5_000);
});

test("try_again_registers_the_agent_again_and_starts_it", async () => {
  const underTest = await switchWith("enabled", true);

  expect(await underTest.runTatolabSwitch.registerTheRuntimeAgainOnRequest(5_000)).toEqual(succeeded(undefined));
  expect(underTest.serviceManagement.calls).toEqual(["unregister", "register", "start_if_not_running"]);
});

test("try_again_with_the_switch_off_is_refused_and_registers_nothing", async () => {
  const underTest = await switchWith("not_registered", false);

  expect(await underTest.runTatolabSwitch.registerTheRuntimeAgainOnRequest(5_000)).toEqual(failedWith(REGISTER_AGAIN_WITH_RUN_TATOLAB_OFF_REFUSAL));
  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("the_first_give_up_registers_the_agent_afresh_once_and_an_answer_lets_a_later_give_up_do_it_again", async () => {
  const underTest = await switchWith("enabled", true);

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "failing", true, 1_000);
  expect(underTest.serviceManagement.calls).toEqual(["unregister", "register", "start_if_not_running"]);
  expect(underTest.runTatolabSwitch.hasRegisteredAfreshAfterAGiveUp()).toBe(true);

  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "failing", true, 60_000);
  expect(underTest.serviceManagement.calls, "a second give-up is the person's to retry").toHaveLength(3);

  underTest.runTatolabSwitch.noteRuntimeHealthy(70_000);
  expect(underTest.runTatolabSwitch.hasRegisteredAfreshAfterAGiveUp()).toBe(false);
});

test("a_give_up_with_the_switch_off_registers_nothing", async () => {
  const underTest = await switchWith("enabled", false);
  await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "failing", true, 1_000);
  expect(underTest.serviceManagement.calls).toEqual([]);
});
