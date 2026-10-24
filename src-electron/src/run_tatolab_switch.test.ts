// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus } from "../../src/backend/tatolab_backend_contract.js";
import type { RuntimeAgentRegistration, RuntimeAgentStartFailure } from "./platform/runtime_agent_registration.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { RunTatolabPreferenceFile } from "./run_tatolab_preference.js";
import {
  RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL,
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
}

const quietTatolabAppLog = createTatolabAppLog("error", () => {});
const temporaryConfigDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryConfigDirectories.splice(0).map((configDirectory) => rm(configDirectory, { recursive: true, force: true })));
});

async function switchWith(agentStatus: RuntimeAgentRegistrationStatus, rememberedRunTatolab: boolean | null, appLaunchedAtMs = 0) {
  const configDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  temporaryConfigDirectories.push(configDirectory);
  const preferenceFile = RunTatolabPreferenceFile.inAppConfigDirectory(configDirectory, quietTatolabAppLog);
  if (rememberedRunTatolab !== null) await preferenceFile.saveRunTatolab(rememberedRunTatolab);
  const serviceManagement = new FakeServiceManagement(agentStatus);
  const runTatolabSwitch = await RunTatolabSwitch.load(serviceManagement, preferenceFile, appLaunchedAtMs, quietTatolabAppLog);
  return { runTatolabSwitch, serviceManagement, preferenceFile };
}

test("opening_the_app_with_the_switch_on_registers_an_unregistered_agent", async () => {
  for (const agentStatus of ["not_registered", "not_found"] as const) {
    const underTest = await switchWith(agentStatus, null);
    expect(underTest.runTatolabSwitch.runTatolab(), "the switch defaults on").toBe(true);

    const reconciliation = await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0);

    expect(reconciliation).toEqual({ kind: "registered" });
    expect(underTest.serviceManagement.calls).toEqual(["register", "start_if_not_running"]);
  }
});

test("opening_the_app_registers_nothing_until_the_machine_is_set_up", async () => {
  const underTest = await switchWith("not_registered", null);

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(false, 0)).toEqual({ kind: "waiting_for_machine_setup" });
  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("opening_the_app_starts_an_enabled_agent_without_registering_it_again", async () => {
  const underTest = await switchWith("enabled", null);

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0)).toEqual({ kind: "already_enabled" });
  expect(underTest.serviceManagement.calls).toEqual(["start_if_not_running"]);
});

test("an_enabled_agent_the_service_manager_holds_no_job_for_is_registered_again_and_started", async () => {
  const underTest = await switchWith("enabled", null);
  underTest.serviceManagement.answerStartsWith([failedWith({ kind: "no_job_for_the_registered_agent" })]);

  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0);

  expect(underTest.serviceManagement.calls).toEqual(["start_if_not_running", "unregister", "register", "start_if_not_running"]);
});

test("a_refused_start_is_not_answered_by_registering_again", async () => {
  const underTest = await switchWith("enabled", null);
  underTest.serviceManagement.answerStartsWith([failedWith({ kind: "refused", refusal: "launchctl kickstart failed" })]);

  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0);

  expect(underTest.serviceManagement.calls).toEqual(["start_if_not_running"]);
});

test("a_switch_remembered_off_stays_off_after_reopening_the_app", async () => {
  const underTest = await switchWith("not_registered", false);

  expect(underTest.runTatolabSwitch.runTatolab()).toBe(false);
  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0)).toEqual({ kind: "switch_is_off" });
  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("turning_the_switch_off_unregisters_the_agent_and_is_remembered", async () => {
  const underTest = await switchWith("enabled", null);

  expect(await underTest.runTatolabSwitch.setRunTatolab(false, true, 0)).toEqual({ kind: "unregistered" });
  expect(underTest.serviceManagement.calls).toEqual(["unregister"]);
  expect(underTest.serviceManagement.status).toBe("not_registered");
  expect(await underTest.preferenceFile.loadRunTatolab()).toBe(false);
});

test("turning_the_switch_off_with_nothing_registered_calls_nothing", async () => {
  const underTest = await switchWith("not_registered", null);

  expect(await underTest.runTatolabSwitch.setRunTatolab(false, true, 0)).toEqual({ kind: "unregistered" });
  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("turning_the_switch_back_on_registers_and_is_remembered", async () => {
  const underTest = await switchWith("not_registered", false);

  expect(await underTest.runTatolabSwitch.setRunTatolab(true, true, 0)).toEqual({ kind: "registered" });
  expect(await underTest.preferenceFile.loadRunTatolab()).toBe(true);
});

test("toggling_flips_the_switch_and_reconciles_the_agent_each_time", async () => {
  const underTest = await switchWith("enabled", null);

  expect(await underTest.runTatolabSwitch.toggle(true, 0)).toEqual({ kind: "unregistered" });
  expect(underTest.runTatolabSwitch.runTatolab()).toBe(false);
  expect(await underTest.preferenceFile.loadRunTatolab()).toBe(false);

  expect(await underTest.runTatolabSwitch.toggle(true, 0)).toEqual({ kind: "registered" });
  expect(underTest.runTatolabSwitch.runTatolab()).toBe(true);
  expect(await underTest.preferenceFile.loadRunTatolab()).toBe(true);
  expect(underTest.serviceManagement.calls).toEqual(["unregister", "register", "start_if_not_running"]);
});

test("toggling_on_before_machine_setup_remembers_on_and_registers_nothing", async () => {
  const underTest = await switchWith("not_registered", false);

  expect(await underTest.runTatolabSwitch.toggle(false, 0)).toEqual({ kind: "waiting_for_machine_setup" });
  expect(underTest.runTatolabSwitch.runTatolab()).toBe(true);
  expect(await underTest.preferenceFile.loadRunTatolab()).toBe(true);
  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("an_agent_needing_approval_opens_login_items_once_per_launch", async () => {
  const underTest = await switchWith("requires_approval", null);

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0)).toEqual({
    kind: "needs_approval_in_login_items",
    openedLoginItemsSettings: true,
  });
  await underTest.runTatolabSwitch.noticeRuntimeAgentRegistrationStatus("requires_approval");
  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0)).toEqual({
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

  expect(await underTest.runTatolabSwitch.setRunTatolab(true, true, 0)).toEqual({ kind: "already_enabled" });
  expect(await underTest.preferenceFile.loadRunTatolab()).toBe(true);
  expect(underTest.serviceManagement.calls).toEqual(["start_if_not_running"]);
});

test("a_registration_refused_for_approval_reports_approval_rather_than_failure", async () => {
  const underTest = await switchWith("not_registered", null);
  underTest.serviceManagement.answerRegisterWith(succeeded("requires_approval"));

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0)).toEqual({
    kind: "needs_approval_in_login_items",
    openedLoginItemsSettings: true,
  });
  expect(underTest.serviceManagement.calls).toEqual(["register", "open_login_items_settings"]);
});

test("a_failed_registration_is_reported_and_the_next_attempt_registers_again", async () => {
  const underTest = await switchWith("not_found", null);
  underTest.serviceManagement.answerRegisterWith(failedWith("Invalid argument"));

  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0)).toEqual({
    kind: "registration_failed",
    failureDescription: "Invalid argument",
  });

  underTest.serviceManagement.answerRegisterWith(succeeded("enabled"));
  expect(await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, 0)).toEqual({ kind: "registered" });
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
  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, laterMs);
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(laterMs)).toBe(0);
  const healthyAtMs = laterMs + 30_000;
  underTest.runTatolabSwitch.noteRuntimeHealthy(healthyAtMs);
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(healthyAtMs + 5_000)).toBe(5_000);
});

test("the_runtime_agent_is_started_only_while_on_enabled_and_failing_health", () => {
  const neverAttempted = null;
  expect(theRuntimeAgentShouldBeStartedNow(true, "enabled", "failing", neverAttempted)).toBe(true);
  expect(theRuntimeAgentShouldBeStartedNow(false, "enabled", "failing", neverAttempted)).toBe(false);
  expect(theRuntimeAgentShouldBeStartedNow(true, "enabled", "healthy", neverAttempted)).toBe(false);
  for (const runtimeAgent of ["requires_approval", "not_registered", "not_found"] as const) {
    expect(theRuntimeAgentShouldBeStartedNow(true, runtimeAgent, "failing", neverAttempted), runtimeAgent).toBe(false);
  }
});

test("the_runtime_agent_is_started_at_most_once_per_minimum_interval", () => {
  const cases: [number, boolean][] = [
    [0, false],
    [9_000, false],
    [RUNTIME_AGENT_START_MINIMUM_INTERVAL_MS, true],
    [60_000, true],
  ];
  for (const [timeSinceTheLastStartAttemptMs, expected] of cases) {
    expect(theRuntimeAgentShouldBeStartedNow(true, "enabled", "failing", timeSinceTheLastStartAttemptMs), `${timeSinceTheLastStartAttemptMs} ms`).toBe(
      expected,
    );
  }
});

test("a_runtime_found_down_is_started_ten_seconds_after_the_last_start_attempt", async () => {
  const openedAtMs = 1_000;
  const underTest = await switchWith("enabled", null);
  await underTest.runTatolabSwitch.reconcileTheAgentWithTheRunTatolabSwitch(true, openedAtMs);
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
    await underTest.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "failing", openedAtMs + secondsAfterOpening * 1_000);
    expect(startCalls(), `${secondsAfterOpening} s after opening`).toBe(expectedStartCalls);
  }
});

test("a_runtime_found_down_with_the_switch_off_or_healthy_is_left_alone", async () => {
  const laterMs = 60_000;
  const switchedOff = await switchWith("enabled", false);
  await switchedOff.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "failing", laterMs);
  expect(switchedOff.serviceManagement.calls).toEqual([]);

  const healthy = await switchWith("enabled", null);
  await healthy.runTatolabSwitch.startTheRuntimeIfThePollerFoundItDown("enabled", "healthy", laterMs);
  expect(healthy.serviceManagement.calls).toEqual([]);
});

test("restarting_the_runtime_on_request_restarts_the_agents_runtime_and_gives_it_the_starting_grace_again", async () => {
  const launchedAtMs = 1_000;
  const underTest = await switchWith("enabled", true, launchedAtMs);
  const restartedAtMs = launchedAtMs + 90_000;

  expect(await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(restartedAtMs)).toEqual(succeeded(undefined));

  expect(underTest.serviceManagement.calls).toEqual(["restart"]);
  expect(underTest.runTatolabSwitch.timeSinceTheRuntimeWasExpectedUpMs(restartedAtMs + 2_000)).toBe(2_000);
});

test("restarting_the_runtime_with_the_switch_off_is_refused_and_touches_no_agent", async () => {
  const underTest = await switchWith("not_registered", false);

  expect(await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(5_000)).toEqual(failedWith(RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL));
  expect(underTest.serviceManagement.calls).toEqual([]);
});

test("a_restart_the_service_manager_refuses_is_refused_in_its_words", async () => {
  const underTest = await switchWith("enabled", true);
  underTest.serviceManagement.answerRestartWith(failedWith({ kind: "refused", refusal: "launchctl kickstart -k gui/501/com.tatolab.tatolabd failed (exit status: 5): Input/output error" }));

  expect(await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(5_000)).toEqual(
    failedWith("launchctl kickstart -k gui/501/com.tatolab.tatolabd failed (exit status: 5): Input/output error"),
  );
});

test("a_restart_finding_no_job_for_the_agent_registers_it_again_and_starts_it", async () => {
  const underTest = await switchWith("enabled", true);
  underTest.serviceManagement.answerRestartWith(failedWith({ kind: "no_job_for_the_registered_agent" }));

  expect(await underTest.runTatolabSwitch.restartTheRuntimeOnRequest(5_000)).toEqual(succeeded(undefined));
  expect(underTest.serviceManagement.calls).toEqual(["restart", "unregister", "register", "start_if_not_running"]);
});
