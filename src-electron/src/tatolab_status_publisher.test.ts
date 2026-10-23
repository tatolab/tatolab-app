// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RUNTIME_LOOPBACK_HTTP_ORIGIN } from "./runtime_loopback_watch_page.js";
import { afterEach, expect, test, vi } from "vitest";
import type { TatolabStatus } from "../../src/backend/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import { FakeRuntimeAgentRegistration, FakeTatolabMachineSetup, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
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
  toolResultResponse({ streams: [{ name: "main", state: "kept", project_directory: "/p", node_count: 4, failed_because: null }] });
const machineWideGraph = () => httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] }));

test("the published status walks starting, running, starting, unreachable and stopped as the runtime comes and goes", async () => {
  const localApiServer = await FakeLocalApiServer.answering([
    runtimeNotAnsweringHealth(),
    runtimeHealthy(),
    oneStreamListed(),
    machineWideGraph(),
    runtimeHealthy(),
    oneStreamListed(),
    runtimeNotAnsweringHealth(),
    runtimeNotAnsweringHealth(),
    runtimeNotAnsweringHealth(),
  ]);
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => localApiServer.close(), () => rm(appConfigDirectory, { recursive: true, force: true }));
  let nowMs = 0;
  const readMonotonicClockMs = () => nowMs;
  const quietTatolabAppLog = createTatolabAppLog("error", () => {});
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  const controller = await TatolabAppController.create({
    platform: "linux",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(runtimeAgent, new FakeTatolabMachineSetup("complete", null), localApiServer.localApiSocketPath),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.45.0",
    readMonotonicClockMs,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    tatolabAppLog: quietTatolabAppLog,
  });
  const statusesSentToTheWindow: TatolabStatus[] = [];
  const statusesShownInTheTray: TatolabStatus[] = [];
  const statusPublisher = new TatolabStatusPublisher(controller, (status) => statusesSentToTheWindow.push(status), readMonotonicClockMs, quietTatolabAppLog);
  statusPublisher.attachTrayMenu({ showStatus: (status) => statusesShownInTheTray.push(status) });

  for (const roundAtMs of [0, 1_000, 2_000, 3_000, 30_000]) {
    nowMs = roundAtMs;
    await statusPublisher.refreshAndPublish();
  }
  await controller.setRunTatolab(false);
  nowMs = 31_000;
  await statusPublisher.refreshAndPublish();

  expect(statusesSentToTheWindow.map((status) => [status.runtime_state, status.streams?.length ?? null, status.machine_name])).toEqual([
    ["starting", null, null],
    ["running", 1, "jonathanf-macbook"],
    ["starting", null, null],
    ["unreachable", null, null],
    ["stopped", null, null],
  ]);
  expect(statusesShownInTheTray).toEqual(statusesSentToTheWindow);
  expect(statusesSentToTheWindow.at(-1)?.run_tatolab).toBe(false);
  expect(await statusPublisher.lastPublishedStatusWaitingUpTo(0)).toEqual(statusesSentToTheWindow.at(-1));
  expect(runtimeAgent.calls).toEqual(["start_if_not_running", "start_if_not_running", "unregister"]);
});

test("the window asking before the first round waits for it, and hears nothing when it never comes", async () => {
  const quietTatolabAppLog = createTatolabAppLog("error", () => {});
  const localApiServer = await FakeLocalApiServer.answering([runtimeNotAnsweringHealth()]);
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => localApiServer.close(), () => rm(appConfigDirectory, { recursive: true, force: true }));
  const controller = await TatolabAppController.create({
    platform: "linux",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(
      new FakeRuntimeAgentRegistration("enabled"),
      new FakeTatolabMachineSetup("complete", null),
      localApiServer.localApiSocketPath,
    ),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.45.0",
    readMonotonicClockMs: () => 0,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    tatolabAppLog: quietTatolabAppLog,
  });
  const statusPublisher = new TatolabStatusPublisher(controller, () => {}, () => 0, quietTatolabAppLog);

  expect(await statusPublisher.lastPublishedStatusWaitingUpTo(10)).toBe(null);
  const firstStatus = statusPublisher.lastPublishedStatusWaitingUpTo(5_000);
  await statusPublisher.refreshAndPublish();
  expect((await firstStatus)?.runtime_state).toBe("starting");
});
