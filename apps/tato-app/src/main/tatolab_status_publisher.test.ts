import { afterEach, expect, test, vi } from "vitest";
import type { TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import { FakeCarriedRuntimeStarts, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import { TatolabAppController } from "./tatolab_app_controller.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { STATUS_POLL_INTERVAL_MS, TatolabStatusPublisher, TatolabStatusRefreshRequests } from "./tatolab_status_publisher.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

test("a_burst_of_refresh_requests_collapses_into_one_round", async () => {
  vi.useFakeTimers();
  const refreshRequests = new TatolabStatusRefreshRequests();
  for (let request = 0; request < 3; request += 1) refreshRequests.requestRefresh();

  expect(await refreshRequests.waitForTheNextStatusRound(STATUS_POLL_INTERVAL_MS)).toBe(true);

  let theNextRoundIsDue = false;
  void refreshRequests.waitForTheNextStatusRound(STATUS_POLL_INTERVAL_MS).then(() => {
    theNextRoundIsDue = true;
  });
  await vi.advanceTimersByTimeAsync(STATUS_POLL_INTERVAL_MS - 1);
  expect(theNextRoundIsDue, "no request is left over from the burst").toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(theNextRoundIsDue).toBe(true);
});

test("no_more_rounds_once_every_requester_is_gone", async () => {
  const refreshRequests = new TatolabStatusRefreshRequests();
  refreshRequests.stopRequestingRounds();

  expect(await refreshRequests.waitForTheNextStatusRound(STATUS_POLL_INTERVAL_MS)).toBe(false);
});

const runtimeHealthy = () => httpResponse("200 OK", "text/plain; charset=utf-8", "ok");
const runtimeNotAnsweringHealth = () => httpResponse("503 Service Unavailable", "text/plain", "not ready");
const oneStreamListed = () =>
  toolResultResponse({ streams: [{ stream: "p-main-0a1b2c", display_name: "main", location: { project_directory: "/p", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" }, state: "running", node_count: 4, failed_because: null }] });
const machineWideGraph = () => httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] }));

function controllerReadingTheLocalApiAt(localApiSocket: string, carriedRuntimeStarts: FakeCarriedRuntimeStarts, readMonotonicClockMs: () => number) {
  return TatolabAppController.create({
    platform: "linux",
    platformForThisBuild: fakeTatolabPlatformForThisBuild({ localApiSocket }),
    startTheCarriedRuntime: carriedRuntimeStarts.startTheCarriedRuntime,
    appVersion: "0.45.0",
    appBuild: null,
    readMonotonicClockMs,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    whenTheRuntimeExits: () => {},
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
}

test("the published status walks starting, running, starting and not running as the app's runtime comes and goes", async () => {
  const localApiServer = await FakeLocalApiServer.answering([
    runtimeNotAnsweringHealth(),
    runtimeHealthy(),
    oneStreamListed(),
    machineWideGraph(),
    runtimeHealthy(),
    oneStreamListed(),
    runtimeNotAnsweringHealth(),
    runtimeNotAnsweringHealth(),
  ]);
  cleanUps.push(() => localApiServer.close());
  let nowMs = 0;
  const readMonotonicClockMs = () => nowMs;
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const controller = controllerReadingTheLocalApiAt(localApiServer.localApiSocketPath, carriedRuntimeStarts, readMonotonicClockMs);
  const statusesSentToTheWindow: TatolabStatus[] = [];
  const statusesShownInTheTray: TatolabStatus[] = [];
  const statusPublisher = new TatolabStatusPublisher(controller, (status) => statusesSentToTheWindow.push(status), readMonotonicClockMs, createTatolabAppLog("error", () => {}));
  statusPublisher.attachTrayMenu({ showStatus: (status) => statusesShownInTheTray.push(status) });

  for (const roundAtMs of [0, 1_000, 2_000, 3_000]) {
    nowMs = roundAtMs;
    await statusPublisher.refreshAndPublish();
  }
  carriedRuntimeStarts.lastRuntimeStarted()?.exit({ exitStatus: 1, endingSignal: null, lastStandardErrorLine: null });
  nowMs = 3_100;
  await statusPublisher.refreshAndPublish();

  expect(statusesSentToTheWindow.map((status) => [status.runtime_state, status.streams?.length ?? null, status.machine_name])).toEqual([
    ["starting", null, null],
    ["running", 1, "jonathanf-macbook"],
    ["starting", null, null],
    ["not_running", null, null],
  ]);
  expect(statusesShownInTheTray).toEqual(statusesSentToTheWindow);
  expect(await statusPublisher.lastPublishedStatusWaitingUpTo(0)).toEqual(statusesSentToTheWindow.at(-1));
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
});

test("the window asking before the first round waits for it, and hears nothing when it never comes", async () => {
  const localApiServer = await FakeLocalApiServer.answering([runtimeNotAnsweringHealth()]);
  cleanUps.push(() => localApiServer.close());
  const controller = controllerReadingTheLocalApiAt(localApiServer.localApiSocketPath, new FakeCarriedRuntimeStarts(), () => 0);
  const statusPublisher = new TatolabStatusPublisher(controller, () => {}, () => 0, createTatolabAppLog("error", () => {}));

  expect(await statusPublisher.lastPublishedStatusWaitingUpTo(10)).toBe(null);
  const firstStatus = statusPublisher.lastPublishedStatusWaitingUpTo(5_000);
  await statusPublisher.refreshAndPublish();
  expect((await firstStatus)?.runtime_state).toBe("starting");
});

