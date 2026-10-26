import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RUNTIME_LOOPBACK_HTTP_ORIGIN } from "./runtime_loopback_watch_page.js";
import { afterEach, expect, test, vi } from "vitest";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import { FakeRuntimeAgentRegistration, FakeTatolabCommandLineToolLinks, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded } from "./result.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { RuntimeRestartedForAppVersionFile } from "./runtime_restarted_for_app_version.js";
import { MachineNameAskedOncePerRuntimeUpEpisode, TatolabAppController } from "./tatolab_app_controller.js";
import { RUNTIME_AGENT_TAKEOVER_WAIT_MS } from "./run_tatolab_switch.js";
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
  readMonotonicClockMs: () => number = () => 0,
) {
  const localApiServer = await FakeLocalApiServer.answering(scriptedLocalApiResponses);
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => localApiServer.close(), () => rm(appConfigDirectory, { recursive: true, force: true }));
  const runtimeAgent = new FakeRuntimeAgentRegistration(runtimeAgentStatus);
  const commandLineToolLinks = new FakeTatolabCommandLineToolLinks("/Users/someone/.local/bin/tatolab");
  const controller = await TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(runtimeAgent, commandLineToolLinks, localApiServer.localApiSocketPath),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.45.0",
    readMonotonicClockMs,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  return { controller, runtimeAgent, commandLineToolLinks, localApiServer, appConfigDirectory };
}

test("a healthy runtime's status names its streams and machine, read as the window reads them", async () => {
  const { controller, localApiServer } = await controllerOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      toolResultResponse({ streams: [{ name: "main", state: "kept", project_directory: "/p", node_count: 4, failed_because: null }] }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
    ],
    "enabled",
  );

  expect(JSON.stringify(await controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","platform":"macos","run_tatolab":true,"runtime_agent":"enabled","runtime_state":"running",' +
      '"machine_name":"jonathanf-macbook","streams":[{"name":"main","state":"kept","project_directory":"/p","node_count":4,"failed_because":null}],' +
      '"first_run_finished":false,"command_line_tool_linked_at":null,"command_line_tool_usr_local_bin_link":{"kind":"not_linked"},' +
      '"app_update":{"kind":"not_checked"},' +
      `"local_api_socket":${JSON.stringify(localApiServer.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"}}',
  );
});

test("opening the app registers the agent with no prompt and links the command in the home folder", async () => {
  const { controller, runtimeAgent, commandLineToolLinks } = await controllerOverFakes([], "not_registered");

  await controller.reconcileTheAgentWithTheRunTatolabSwitch();
  await controller.linkTheCommandLineToolInTheHomeFolderAsTheAppOpens();

  expect(runtimeAgent.calls).toEqual(["register", "start_if_not_running"]);
  expect(commandLineToolLinks.linksAsked).toEqual(["home_folder"]);
  expect((await controller.composeStatus(0)).command_line_tool_linked_at).toBe("/Users/someone/.local/bin/tatolab");
});

test("first run stays unfinished until get started remembers it, across launches", async () => {
  const { controller, appConfigDirectory } = await controllerOverFakes([], "enabled");
  expect((await controller.composeStatus(0)).first_run_finished).toBe(false);

  expect(await controller.rememberFirstRunFinished()).toEqual(succeeded(undefined));
  expect((await controller.composeStatus(0)).first_run_finished).toBe(true);
  expect(await RememberedSwitchFile.firstRunFinishedInAppConfigDirectory(appConfigDirectory, createTatolabAppLog("error", () => {})).loadRememberedSwitch()).toBe(
    true,
  );
});

test("the usr local bin link is refused in its own words", async () => {
  const { controller, commandLineToolLinks } = await controllerOverFakes([], "enabled");
  commandLineToolLinks.linkingInUsrLocalBin = failedWith({ kind: "refused", refusal: "The password prompt was cancelled, so nothing changed." });
  expect(await controller.linkTheCommandLineToolInUsrLocalBin()).toEqual(failedWith("The password prompt was cancelled, so nothing changed."));

  commandLineToolLinks.linkingInUsrLocalBin = succeeded(undefined);
  expect(await controller.linkTheCommandLineToolInUsrLocalBin()).toEqual(succeeded(undefined));
  expect((await controller.composeStatus(0)).command_line_tool_usr_local_bin_link).toEqual({ kind: "linked", path: "/usr/local/bin/tatolab" });
});

test("a runtime that never answers reads starting, then never answered, and not responding only once it has answered", async () => {
  const healthyAnswer = () => httpResponse("200 OK", "text/plain", "ok");
  const { controller } = await controllerOverFakes(
    [healthyAnswer(), toolResultResponse({ streams: [] }), httpResponse("200 OK", "application/json", JSON.stringify({ machine: "m", streams: [] }))],
    "enabled",
  );

  expect((await controller.composeStatus(0)).runtime_state).toBe("running");
  expect((await controller.composeStatus(5_000)).runtime_state, "the scripted answers are spent, so the runtime stops answering").toBe("starting");
  expect((await controller.composeStatus(30_000)).runtime_state).toBe("unreachable");

  const neverAnswered = await controllerOverFakes([], "enabled");
  expect((await neverAnswered.controller.composeStatus(5_000)).runtime_state).toBe("starting");
  expect((await neverAnswered.controller.composeStatus(30_000)).runtime_state).toBe("never_answered");
});

test("the first give-up by the service manager reads starting and registers the agent afresh, which clears launchd's stale job", async () => {
  const { controller, runtimeAgent } = await controllerOverFakes([], "enabled");
  runtimeAgent.whyTheServiceManagerGaveUp = { serviceManagerWords: "launchd: last exit code = 78: EX_CONFIG", registeringAgainWaitsForTheNextSpawn: false };

  const firstRound = await controller.composeStatus(0);
  expect(firstRound.runtime_state).toBe("starting");
  await controller.startTheRuntimeIfThePollerFoundItDown(firstRound, 0);
  expect(runtimeAgent.calls).toEqual(["unregister", "register", "start_if_not_running"]);

  expect((await controller.composeStatus(2_000)).runtime_state).toBe("starting");
});

test("a takeover from a copy of the app signed differently reads starting until launchd spawns the job again, then registers the agent afresh once", async () => {
  const { controller, runtimeAgent } = await controllerOverFakes([], "enabled");
  expect(await controller.registerTheRuntimeAgainOnRequest()).toEqual(succeeded(undefined));
  runtimeAgent.calls.length = 0;
  runtimeAgent.whyTheServiceManagerGaveUp = { serviceManagerWords: "launchd: last exit reason = OS_REASON_CODESIGNING", registeringAgainWaitsForTheNextSpawn: true };

  for (const nowMs of [2_000, 4_000, 8_000]) {
    const roundBeforeTheNextSpawn = await controller.composeStatus(nowMs);
    expect(roundBeforeTheNextSpawn.runtime_state, `${nowMs} ms`).toBe("starting");
    await controller.startTheRuntimeIfThePollerFoundItDown(roundBeforeTheNextSpawn, nowMs);
  }
  expect(runtimeAgent.calls).toEqual([]);

  runtimeAgent.whyTheServiceManagerGaveUp = { serviceManagerWords: "launchd: last exit code = 78: EX_CONFIG", registeringAgainWaitsForTheNextSpawn: false };
  const roundAfterTheNextSpawn = await controller.composeStatus(12_000);
  expect(roundAfterTheNextSpawn.runtime_state).toBe("starting");
  await controller.startTheRuntimeIfThePollerFoundItDown(roundAfterTheNextSpawn, 12_000);
  expect(runtimeAgent.calls).toEqual(["unregister", "register", "start_if_not_running"]);
  expect((await controller.composeStatus(14_000)).runtime_state).toBe("starting");
});

test("a give-up that outlasts the fresh registration reads blocked, the app leaves it alone, and try again registers it again", async () => {
  const { controller, runtimeAgent } = await controllerOverFakes([], "enabled");
  runtimeAgent.whyTheServiceManagerGaveUp = {
    serviceManagerWords: "launchd: last exit reason = OS_REASON_CODESIGNING | Launch Constraint Violation",
    registeringAgainWaitsForTheNextSpawn: true,
  };
  runtimeAgent.givesUpWhateverTheRegistration = true;
  await controller.startTheRuntimeIfThePollerFoundItDown(await controller.composeStatus(RUNTIME_AGENT_TAKEOVER_WAIT_MS), RUNTIME_AGENT_TAKEOVER_WAIT_MS);
  expect(runtimeAgent.calls, "a code-signing give-up still there past the takeover wait is registered afresh").toEqual(["unregister", "register", "start_if_not_running"]);
  runtimeAgent.calls.length = 0;

  const blocked = await controller.composeStatus(RUNTIME_AGENT_TAKEOVER_WAIT_MS + 2_000);
  expect(blocked.runtime_state).toBe("blocked_by_the_service_manager");
  await controller.startTheRuntimeIfThePollerFoundItDown(blocked, 60_000);
  expect(runtimeAgent.calls).toEqual([]);

  expect(await controller.registerTheRuntimeAgainOnRequest()).toEqual(succeeded(undefined));
  expect(runtimeAgent.calls).toEqual(["unregister", "register", "start_if_not_running"]);
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
    platformForThisBuild: fakeTatolabPlatformForThisBuild(runtimeAgent, new FakeTatolabCommandLineToolLinks(null), "/tmp/tl-app-no-runtime.sock"),
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
      new FakeTatolabCommandLineToolLinks(null),
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
    platformForThisBuild: fakeTatolabPlatformForThisBuild(runtimeAgent, new FakeTatolabCommandLineToolLinks(null), "/tmp/tl-app-no-runtime.sock"),
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
  expect((await controller.composeStatus(nowMs)).runtime_state).toBe("never_answered");
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
    platformForThisBuild: fakeTatolabPlatformForThisBuild(new FakeRuntimeAgentRegistration("enabled"), new FakeTatolabCommandLineToolLinks(null), "/tmp/tl-app-no-runtime.sock"),
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

test("a status composed while the runtime restarts reads Starting until a round begun after the service manager answered finds it healthy", async () => {
  const healthyAnswer = () => httpResponse("200 OK", "text/plain", "ok");
  const noStreams = () => toolResultResponse({ streams: [] });
  const theMachine = () => httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] }));
  const clockReadAtTheRequestThenAtTheAnswer = [100, 200];
  const { controller, runtimeAgent } = await controllerOverFakes(
    [healthyAnswer(), noStreams(), theMachine(), healthyAnswer(), noStreams()],
    "enabled",
    () => clockReadAtTheRequestThenAtTheAnswer.shift() ?? 200,
  );

  expect(await controller.restartTheRuntimeOnRequest()).toEqual({ ok: true, value: undefined });
  expect(runtimeAgent.calls).toEqual(["restart_the_agents_runtime"]);

  expect((await controller.composeStatus(150)).runtime_state).toBe("starting");
  expect((await controller.composeStatus(250)).runtime_state).toBe("running");
});
