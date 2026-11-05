import { expect, test } from "vitest";
import {
  CarriedRuntimeRunAsTheAppsChild,
  NO_CARRIED_RUNTIME_REASON,
  RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL,
  RUNTIME_START_AGAIN_FIRST_WAIT_MS,
  RUNTIME_START_AGAIN_LONGEST_WAIT_MS,
  RUNTIME_STARTING_GRACE_PERIOD_MS,
} from "./carried_runtime_run_as_the_apps_child.js";
import { FAKE_CARRIED_RUNTIME, FakeCarriedRuntimeStarts } from "./fake_tatolab_platform_for_this_build.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const EXITED_WITH_STATUS_ONE = { exitStatus: 1, endingSignal: null, lastStandardErrorLine: null };

function runtimeRunAsTheAppsChild(carriedRuntimeStarts: FakeCarriedRuntimeStarts, clock: { nowMs: number }, exits: string[] = []) {
  return new CarriedRuntimeRunAsTheAppsChild(
    FAKE_CARRIED_RUNTIME,
    carriedRuntimeStarts.startTheCarriedRuntime,
    () => clock.nowMs,
    () => exits.push("exited"),
    createTatolabAppLog("error", () => {}),
  );
}

test("the_runtime_is_started_when_none_answers_and_reads_as_starting_until_it_answers", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const clock = { nowMs: 0 };
  const runtime = runtimeRunAsTheAppsChild(carriedRuntimeStarts, clock);
  expect(runtime.runtimeStateNow(false, 0)).toEqual({ runtimeState: "starting", runtimeNotRunningBecause: null });
  runtime.keepTheRuntimeRunning(false, 0);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
  runtime.keepTheRuntimeRunning(false, 2_000);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
  expect(runtime.runtimeStateNow(false, 2_000).runtimeState).toBe("starting");
  runtime.keepTheRuntimeRunning(true, 4_000);
  expect(runtime.runtimeStateNow(true, 4_000)).toEqual({ runtimeState: "running", runtimeNotRunningBecause: null });
});

test("a_runtime_that_already_answers_is_used_and_never_started_over", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const runtime = runtimeRunAsTheAppsChild(carriedRuntimeStarts, { nowMs: 0 });
  runtime.keepTheRuntimeRunning(true, 0);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(0);
  expect(runtime.restartOnRequest(true)).toEqual({ ok: false, failure: RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL });
});

test("a_runtime_that_never_answers_reads_as_not_answering_past_the_grace_period", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const runtime = runtimeRunAsTheAppsChild(carriedRuntimeStarts, { nowMs: 0 });
  runtime.keepTheRuntimeRunning(false, 0);
  expect(runtime.runtimeStateNow(false, RUNTIME_STARTING_GRACE_PERIOD_MS)).toEqual({
    runtimeState: "not_running",
    runtimeNotRunningBecause: "The runtime is running but not answering.",
  });
});

test("an_exit_is_shown_in_the_runtimes_words_and_started_again_after_a_wait_that_doubles_until_it_answers", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const clock = { nowMs: 0 };
  const exits: string[] = [];
  const runtime = runtimeRunAsTheAppsChild(carriedRuntimeStarts, clock, exits);
  runtime.keepTheRuntimeRunning(false, 0);
  carriedRuntimeStarts.lastRuntimeStarted()?.exit({ exitStatus: 1, endingSignal: null, lastStandardErrorLine: "error: the machine runtime lock is held" });
  expect(exits).toEqual(["exited"]);
  expect(runtime.runtimeStateNow(false, 0)).toEqual({
    runtimeState: "not_running",
    runtimeNotRunningBecause: "The runtime stopped: error: the machine runtime lock is held. Tato Studio starts it again shortly.",
  });
  runtime.keepTheRuntimeRunning(false, RUNTIME_START_AGAIN_FIRST_WAIT_MS - 1);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
  runtime.keepTheRuntimeRunning(false, RUNTIME_START_AGAIN_FIRST_WAIT_MS);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(2);

  clock.nowMs = RUNTIME_START_AGAIN_FIRST_WAIT_MS;
  carriedRuntimeStarts.lastRuntimeStarted()?.exit(EXITED_WITH_STATUS_ONE);
  runtime.keepTheRuntimeRunning(false, clock.nowMs + 2 * RUNTIME_START_AGAIN_FIRST_WAIT_MS - 1);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(2);
  runtime.keepTheRuntimeRunning(false, clock.nowMs + 2 * RUNTIME_START_AGAIN_FIRST_WAIT_MS);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(3);

  runtime.keepTheRuntimeRunning(true, clock.nowMs + 3 * RUNTIME_START_AGAIN_FIRST_WAIT_MS);
  clock.nowMs = 100_000;
  carriedRuntimeStarts.lastRuntimeStarted()?.exit(EXITED_WITH_STATUS_ONE);
  runtime.keepTheRuntimeRunning(false, clock.nowMs + RUNTIME_START_AGAIN_FIRST_WAIT_MS);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(4);
});

test("the_wait_before_starting_again_stops_growing_at_its_longest", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const clock = { nowMs: 0 };
  const runtime = runtimeRunAsTheAppsChild(carriedRuntimeStarts, clock);
  for (let exitIndex = 0; exitIndex < 10; exitIndex += 1) {
    runtime.keepTheRuntimeRunning(false, clock.nowMs + RUNTIME_START_AGAIN_LONGEST_WAIT_MS);
    clock.nowMs += RUNTIME_START_AGAIN_LONGEST_WAIT_MS;
    carriedRuntimeStarts.lastRuntimeStarted()?.exit(EXITED_WITH_STATUS_ONE);
  }
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(10);
});

test("restart_stops_the_apps_runtime_and_starts_it_again_as_soon_as_it_exits", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const clock = { nowMs: 0 };
  const runtime = runtimeRunAsTheAppsChild(carriedRuntimeStarts, clock);
  runtime.keepTheRuntimeRunning(false, 0);
  runtime.keepTheRuntimeRunning(true, 1_000);
  expect(runtime.restartOnRequest(true)).toEqual({ ok: true, value: undefined });
  expect(carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);
  clock.nowMs = 1_500;
  carriedRuntimeStarts.lastRuntimeStarted()?.exit({ exitStatus: null, endingSignal: "SIGTERM", lastStandardErrorLine: null });
  expect(runtime.runtimeStateNow(false, 1_500).runtimeState).toBe("starting");
  runtime.keepTheRuntimeRunning(false, 1_500);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(2);
});

test("quitting_stops_the_apps_runtime_and_starts_no_other", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const runtime = runtimeRunAsTheAppsChild(carriedRuntimeStarts, { nowMs: 0 });
  runtime.keepTheRuntimeRunning(false, 0);
  runtime.stopAsTheAppQuits();
  expect(carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);
  carriedRuntimeStarts.lastRuntimeStarted()?.exit({ exitStatus: 0, endingSignal: null, lastStandardErrorLine: null });
  runtime.keepTheRuntimeRunning(false, 60_000);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
});

test("a_start_refused_is_shown_in_its_words_and_tried_again_after_the_wait", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  carriedRuntimeStarts.startRefusal = "spawn /bin/sh EACCES";
  const runtime = runtimeRunAsTheAppsChild(carriedRuntimeStarts, { nowMs: 0 });
  runtime.keepTheRuntimeRunning(false, 0);
  expect(runtime.runtimeStateNow(false, 0).runtimeNotRunningBecause).toBe("The runtime stopped: spawn /bin/sh EACCES. Tato Studio starts it again shortly.");
  carriedRuntimeStarts.startRefusal = null;
  runtime.keepTheRuntimeRunning(false, RUNTIME_START_AGAIN_FIRST_WAIT_MS);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
});

test("an_app_that_carries_no_runtime_starts_none_and_says_so", () => {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const runtime = new CarriedRuntimeRunAsTheAppsChild(null, carriedRuntimeStarts.startTheCarriedRuntime, () => 0, () => {}, createTatolabAppLog("error", () => {}));
  runtime.keepTheRuntimeRunning(false, 0);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(0);
  expect(runtime.runtimeStateNow(false, 0)).toEqual({ runtimeState: "not_running", runtimeNotRunningBecause: NO_CARRIED_RUNTIME_REASON });
  expect(runtime.restartOnRequest(false)).toEqual({ ok: false, failure: NO_CARRIED_RUNTIME_REASON });
});
