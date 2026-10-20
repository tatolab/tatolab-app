// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import { FakeRuntimeAgentRegistration, FakeTatolabMachineSetup, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import { succeeded } from "./result.js";
import { MachineNameAskedOncePerRuntimeUpEpisode, TatolabAppController } from "./tatolab_app_controller.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

test("the_machine_name_is_asked_once_while_the_runtime_stays_up", async () => {
  const machineName = new MachineNameAskedOncePerRuntimeUpEpisode();
  let timesAsked = 0;

  for (let round = 0; round < 3; round += 1) {
    const answer = await machineName.machineName(async () => {
      timesAsked += 1;
      return "jonathanf-macbook";
    });
    expect(answer).toBe("jonathanf-macbook");
  }
  expect(timesAsked).toBe(1);
});

test("a_machine_name_the_runtime_did_not_give_is_asked_again_only_after_a_restart", async () => {
  const machineName = new MachineNameAskedOncePerRuntimeUpEpisode();

  expect(await machineName.machineName(async () => null)).toBe(null);
  expect(await machineName.machineName(async () => "asked-twice")).toBe(null);

  machineName.runtimeIsDown();
  expect(await machineName.machineName(async () => "jonathanf-macbook")).toBe("jonathanf-macbook");
});

async function controllerOverFakes(
  scriptedLocalApiResponses: readonly Buffer[],
  runtimeAgentStatus: "enabled" | "not_registered",
  machineSetupState: "complete" | "needs_administrator",
) {
  const localApiServer = await FakeLocalApiServer.answering(scriptedLocalApiResponses);
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => localApiServer.close(), () => rm(appConfigDirectory, { recursive: true, force: true }));
  const runtimeAgent = new FakeRuntimeAgentRegistration(runtimeAgentStatus);
  const machineSetup = new FakeTatolabMachineSetup(machineSetupState, null);
  const controller = await TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(runtimeAgent, machineSetup, localApiServer.localApiSocketPath),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.45.0",
    readMonotonicClockMs: () => 0,
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  return { controller, runtimeAgent, machineSetup, localApiServer };
}

test("a healthy runtime's status names its streams and machine, read as the window reads them", async () => {
  const { controller } = await controllerOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      toolResultResponse({ streams: [{ name: "main", state: "kept", project_directory: "/p", node_count: 4, failed_because: null }] }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
    ],
    "enabled",
    "needs_administrator",
  );

  expect(JSON.stringify(await controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","platform":"macos","run_tatolab":true,"runtime_agent":"enabled","runtime_state":"running",' +
      '"machine_name":"jonathanf-macbook","streams":[{"name":"main","state":"kept","project_directory":"/p","node_count":4,"failed_because":null}],' +
      '"machine_setup_state":"needs_administrator","command_line_tool_linked_at":null}',
  );
});

test("opening the app registers nothing until the administrator prompt sets the machine up, then registers", async () => {
  const { controller, runtimeAgent, machineSetup } = await controllerOverFakes([], "not_registered", "needs_administrator");

  await controller.reconcileTheAgentWithTheRunTatolabSwitch();
  expect(runtimeAgent.calls).toEqual([]);

  await controller.setUpTheMachineOnAppOpened();
  expect(machineSetup.setUpTriggers).toEqual(["reconciling_the_switch", "app_opened", "reconciling_the_switch"]);
  expect(runtimeAgent.calls).toEqual(["register", "start_if_not_running"]);
});

/** A service manager whose unregistering waits until the test opens its gate. */
class RuntimeAgentRegistrationUnregisteringBehindAGate extends FakeRuntimeAgentRegistration {
  private openTheGate: () => void = () => {};
  private readonly gate = new Promise<void>((open) => {
    this.openTheGate = open;
  });

  letUnregisteringFinish(): void {
    this.openTheGate();
  }

  override async unregisterRuntimeAgent() {
    this.calls.push("unregister");
    await this.gate;
    this.status = "not_registered";
    return succeeded(undefined);
  }
}

test("a tray toggle and a window request run in turn, never interleaved", async () => {
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => rm(appConfigDirectory, { recursive: true, force: true }));
  const runtimeAgent = new RuntimeAgentRegistrationUnregisteringBehindAGate("enabled");
  const controller = await TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(runtimeAgent, new FakeTatolabMachineSetup("complete", null), "/tmp/tl-app-no-runtime.sock"),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.45.0",
    readMonotonicClockMs: () => 0,
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });

  const trayToggle = controller.toggleRunTatolab();
  const windowRequest = controller.setRunTatolab(true);
  await vi.waitFor(() => expect(runtimeAgent.calls).toEqual(["unregister"]));
  await new Promise((settle) => setTimeout(settle, 50));
  expect(runtimeAgent.calls, "the window's request waits while the toggle is unregistering").toEqual(["unregister"]);

  runtimeAgent.letUnregisteringFinish();
  await Promise.all([trayToggle, windowRequest]);

  expect(runtimeAgent.calls).toEqual(["unregister", "register", "start_if_not_running"]);
  expect(controller.runTatolab()).toBe(true);
});
