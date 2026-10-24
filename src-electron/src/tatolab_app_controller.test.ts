// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RUNTIME_LOOPBACK_HTTP_ORIGIN } from "./runtime_loopback_watch_page.js";
import { afterEach, expect, test, vi } from "vitest";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import { FakeRuntimeAgentRegistration, FakeTatolabMachineSetup, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded } from "./result.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { RuntimeRestartedForAppVersionFile } from "./runtime_restarted_for_app_version.js";
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
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  return { controller, runtimeAgent, machineSetup, localApiServer };
}

test("a healthy runtime's status names its streams and machine, read as the window reads them", async () => {
  const { controller, localApiServer } = await controllerOverFakes(
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
      '"machine_setup_state":"needs_administrator","command_line_tool_linked_at":null,"app_update":{"kind":"not_checked"},' +
      `"local_api_socket":${JSON.stringify(localApiServer.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"}}',
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
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
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

/** A controller over a fake platform with no runtime to ask, at `appVersion`, in a fresh config directory; `carriesTheRuntime: false` is a platform whose app carries no runtime. */
async function controllerAtAppVersion(appVersion: string, appConfigDirectory: string, runtimeAgent: FakeRuntimeAgentRegistration, carriesTheRuntime = true) {
  return TatolabAppController.create({
    platform: carriesTheRuntime ? "macos" : "linux",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(
      runtimeAgent,
      new FakeTatolabMachineSetup("complete", null),
      "/tmp/tl-app-no-runtime.sock",
      undefined,
      undefined,
      carriesTheRuntime ? runtimeAgent : null,
    ),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion,
    readMonotonicClockMs: () => 0,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
}

async function aFreshAppConfigDirectory(): Promise<string> {
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => rm(appConfigDirectory, { recursive: true, force: true }));
  return appConfigDirectory;
}

test("a new app version restarts the bundled runtime once, and the same version again restarts nothing", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(appConfigDirectory).saveAppVersion("0.46.3");
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  await (await controllerAtAppVersion("0.47.0", appConfigDirectory, runtimeAgent)).restartTheBundledRuntimeIfTheAppChanged();
  expect(runtimeAgent.calls).toEqual(["restart_the_bundled_runtime"]);
  expect(await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(appConfigDirectory).loadAppVersion()).toBe("0.47.0");
  await (await controllerAtAppVersion("0.47.0", appConfigDirectory, runtimeAgent)).restartTheBundledRuntimeIfTheAppChanged();
  expect(runtimeAgent.calls).toEqual(["restart_the_bundled_runtime"]);
});

test("an app that never restarted the runtime restarts it once", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  await (await controllerAtAppVersion("0.47.0", appConfigDirectory, runtimeAgent)).restartTheBundledRuntimeIfTheAppChanged();
  expect(runtimeAgent.calls).toEqual(["restart_the_bundled_runtime"]);
});

test("the restarted runtime gets the starting grace again", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  let nowMs = 0;
  const controller = await TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(runtimeAgent, new FakeTatolabMachineSetup("complete", null), "/tmp/tl-app-no-runtime.sock"),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.47.0",
    readMonotonicClockMs: () => nowMs,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  nowMs = 60_000;
  expect((await controller.composeStatus(nowMs)).runtime_state).toBe("unreachable");
  await controller.restartTheBundledRuntimeIfTheAppChanged();
  expect((await controller.composeStatus(nowMs + 1_000)).runtime_state).toBe("starting");
});

test("with Run Tatolab off nothing restarts, and the version is remembered", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  await RememberedSwitchFile.runTatolabInAppConfigDirectory(appConfigDirectory, createTatolabAppLog("error", () => {})).saveRememberedSwitch(false);
  const runtimeAgent = new FakeRuntimeAgentRegistration("not_registered");
  await (await controllerAtAppVersion("0.47.0", appConfigDirectory, runtimeAgent)).restartTheBundledRuntimeIfTheAppChanged();
  expect(runtimeAgent.calls).toEqual([]);
  expect(await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(appConfigDirectory).loadAppVersion()).toBe("0.47.0");
});

test("a refused restart is tried again at the next launch", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  runtimeAgent.restartingTheBundledRuntime = failedWith("launchd holds no job for com.tatolab.tatolabd after registering it again");
  await (await controllerAtAppVersion("0.47.0", appConfigDirectory, runtimeAgent)).restartTheBundledRuntimeIfTheAppChanged();
  expect(await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(appConfigDirectory).loadAppVersion()).toBeNull();
  runtimeAgent.restartingTheBundledRuntime = succeeded(undefined);
  await (await controllerAtAppVersion("0.47.0", appConfigDirectory, runtimeAgent)).restartTheBundledRuntimeIfTheAppChanged();
  expect(runtimeAgent.calls).toEqual(["restart_the_bundled_runtime", "restart_the_bundled_runtime"]);
  expect(await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(appConfigDirectory).loadAppVersion()).toBe("0.47.0");
});

test("before the machine is set up nothing restarts, and the restart waits for a launch after setup", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(appConfigDirectory).saveAppVersion("0.46.3");
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  const controllerBeforeSetup = await TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(runtimeAgent, new FakeTatolabMachineSetup("needs_administrator", null), "/tmp/tl-app-no-runtime.sock"),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.47.0",
    readMonotonicClockMs: () => 0,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  await controllerBeforeSetup.restartTheBundledRuntimeIfTheAppChanged();
  expect(runtimeAgent.calls).toEqual([]);
  expect(await RuntimeRestartedForAppVersionFile.inAppConfigDirectory(appConfigDirectory).loadAppVersion()).toBe("0.46.3");

  await (await controllerAtAppVersion("0.47.0", appConfigDirectory, runtimeAgent)).restartTheBundledRuntimeIfTheAppChanged();
  expect(runtimeAgent.calls).toEqual(["restart_the_bundled_runtime"]);
});

test("an app that carries no runtime restarts none", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  await (await controllerAtAppVersion("0.47.0", appConfigDirectory, runtimeAgent, false)).restartTheBundledRuntimeIfTheAppChanged();
  expect(runtimeAgent.calls).toEqual([]);
});

test("each status carries where updates stand", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  const controller = await TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(new FakeRuntimeAgentRegistration("enabled"), new FakeTatolabMachineSetup("complete", null), "/tmp/tl-app-no-runtime.sock"),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.46.3",
    readMonotonicClockMs: () => 0,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  expect((await controller.composeStatus(0)).app_update).toEqual({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" });
});
