import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RUNTIME_LOOPBACK_HTTP_ORIGIN } from "./runtime_loopback_watch_page.js";
import { afterEach, expect, test, vi } from "vitest";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import { FakeCarriedRuntimeInstall, FakeRuntimeAgentRegistration, FakeTatolabCommandLineToolLinks, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded } from "./result.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { MachineNameAskedOncePerRuntimeUpEpisode, TatolabAppController } from "./tatolab_app_controller.js";
import { RUNTIME_AGENT_RECOVERY_FIRST_INTERVAL_MS, RUNTIME_AGENT_TAKEOVER_WAIT_MS } from "./run_tatolab_switch.js";
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
  tatolabAppLog = createTatolabAppLog("error", () => {}),
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
    appBuild: null,
    readMonotonicClockMs,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    whenTheRuntimeInstallProgresses: () => {},
    tatolabAppLog,
  });
  return { controller, runtimeAgent, commandLineToolLinks, localApiServer, appConfigDirectory };
}

test("a healthy runtime's status names its streams and machine, read as the window reads them", async () => {
  const { controller, localApiServer } = await controllerOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      toolResultResponse({ streams: [{ stream: "p-main-0a1b2c", display_name: "main", location: { project_directory: "/p", stream_function: "stream:main" }, state: "running", node_count: 4, failed_because: null }] }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
    ],
    "enabled",
  );

  expect(JSON.stringify(await controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","app_build":null,"platform":"macos","run_tatolab":true,"runtime_agent":"enabled","runtime_state":"running",' +
      '"machine_name":"jonathanf-macbook","streams":[{"stream":"p-main-0a1b2c","display_name":"main","location":{"project_directory":"/p","stream_function":"stream:main"},' +
      '"state":"running","node_count":4,"failed_because":null,"capture_devices_whose_access_was_never_asked_for":[],"action":null,"step":null}],' +
      '"first_run_finished":false,"command_line_tool_linked_at":"/Users/someone/.local/bin/tatolab","command_line_tool_usr_local_bin_link":{"kind":"not_linked"},' +
      '"app_update":{"kind":"not_checked"},' +
      `"local_api_socket":${JSON.stringify(localApiServer.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"},' +
      '"runtime_install":{"kind":"none"},"installed_runtime":null}',
  );
});

test("opening the app registers the agent with no prompt and reads the installer's link of the command", async () => {
  const { controller, runtimeAgent, commandLineToolLinks } = await controllerOverFakes([], "not_registered");

  await controller.reconcileTheAgentWithTheRunTatolabSwitch();

  expect(runtimeAgent.calls).toEqual(["register", "start_if_not_running"]);
  expect(commandLineToolLinks.linksAsked).toEqual([]);
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
  const { controller, runtimeAgent } = await controllerOverFakes([], "not_registered");
  await controller.reconcileTheAgentWithTheRunTatolabSwitch();
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

test("a give-up that outlasts the fresh registration reads blocked, and the app registers the agent afresh again by itself once the backoff allows", async () => {
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
  await controller.startTheRuntimeIfThePollerFoundItDown(blocked, RUNTIME_AGENT_TAKEOVER_WAIT_MS + 2_000);
  expect(runtimeAgent.calls, "nothing is started while the service manager refuses it").toEqual([]);

  const nextFreshRegistrationAtMs = RUNTIME_AGENT_TAKEOVER_WAIT_MS + RUNTIME_AGENT_RECOVERY_FIRST_INTERVAL_MS;
  const stillBlocked = await controller.composeStatus(nextFreshRegistrationAtMs);
  expect(stillBlocked.runtime_state).toBe("blocked_by_the_service_manager");
  await controller.startTheRuntimeIfThePollerFoundItDown(stillBlocked, nextFreshRegistrationAtMs);
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
    appBuild: null,
    readMonotonicClockMs: () => 0,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    whenTheRuntimeInstallProgresses: () => {},
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

const CARRIED_RUNTIME_BUILD = `0.68.0-${"1".repeat(40)}`;
const OLDER_RUNTIME_BUILD = `0.67.0-${"2".repeat(40)}`;

/** A controller over a fake platform with no runtime to ask, in a fresh config directory with Run Tatolab as `runTatolab`, whose app carries the runtime `carriedRuntimeInstall` installs, or none. */
async function controllerCarrying(
  carriedRuntimeInstall: FakeCarriedRuntimeInstall | null,
  runtimeAgent: FakeRuntimeAgentRegistration,
  { runTatolab = true, whenTheRuntimeInstallProgresses = () => {} }: { runTatolab?: boolean; whenTheRuntimeInstallProgresses?: () => void } = {},
) {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  await RememberedSwitchFile.runTatolabInAppConfigDirectory(appConfigDirectory, createTatolabAppLog("error", () => {})).saveRememberedSwitch(runTatolab);
  return TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(
      runtimeAgent,
      new FakeTatolabCommandLineToolLinks(null),
      "/tmp/tl-app-no-runtime.sock",
      undefined,
      undefined,
      carriedRuntimeInstall,
    ),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.68.0",
    appBuild: null,
    readMonotonicClockMs: () => 60_000,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    whenTheRuntimeInstallProgresses,
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
}

async function aFreshAppConfigDirectory(): Promise<string> {
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => rm(appConfigDirectory, { recursive: true, force: true }));
  return appConfigDirectory;
}

test("opening an app whose runtime build differs from the installed one, older or newer, installs it and asks nothing", async () => {
  for (const installedRuntimeBuild of [OLDER_RUNTIME_BUILD, `0.69.0-${"3".repeat(40)}`, null]) {
    const runtimeAgent = new FakeRuntimeAgentRegistration(installedRuntimeBuild === null ? "not_found" : "enabled");
    const carriedRuntimeInstall = new FakeCarriedRuntimeInstall(CARRIED_RUNTIME_BUILD, installedRuntimeBuild, runtimeAgent);
    const controller = await controllerCarrying(carriedRuntimeInstall, runtimeAgent);

    await controller.installTheCarriedRuntimeIfItDiffers();

    expect(carriedRuntimeInstall.installedBuilds, String(installedRuntimeBuild)).toEqual([CARRIED_RUNTIME_BUILD]);
    expect(runtimeAgent.calls, "the installer started it; the switch, on, only makes sure").toEqual(["start_if_not_running"]);
    const status = await controller.composeStatus(61_000);
    expect(status.runtime_install).toEqual({ kind: "none" });
    expect(status.installed_runtime).toEqual({
      build: CARRIED_RUNTIME_BUILD,
      folder: `/Users/someone/Library/Application Support/com.tatolab.runtime/${CARRIED_RUNTIME_BUILD}`,
    });
    expect(status.runtime_state, "the installed runtime gets the starting grace again").toBe("starting");
  }
});

test("opening an app whose runtime is the installed build installs nothing", async () => {
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  const carriedRuntimeInstall = new FakeCarriedRuntimeInstall(CARRIED_RUNTIME_BUILD, CARRIED_RUNTIME_BUILD, runtimeAgent);
  const controller = await controllerCarrying(carriedRuntimeInstall, runtimeAgent);

  await controller.installTheCarriedRuntimeIfItDiffers();

  expect(carriedRuntimeInstall.installedBuilds).toEqual([]);
  expect(runtimeAgent.calls).toEqual([]);
  expect((await controller.composeStatus(0)).installed_runtime?.build).toBe(CARRIED_RUNTIME_BUILD);
});

test("an app that carries no runtime installs none", async () => {
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  const controller = await controllerCarrying(null, runtimeAgent);

  await controller.installTheCarriedRuntimeIfItDiffers();

  expect(runtimeAgent.calls).toEqual([]);
  expect((await controller.composeStatus(0)).runtime_install).toEqual({ kind: "none" });
  expect(await controller.installTheCarriedRuntimeAgain()).toEqual(failedWith("This build of Spudnik Studio carries no runtime to install."));
});

test("with Run Tatolab off the installed runtime the installer started is stopped again", async () => {
  const runtimeAgent = new FakeRuntimeAgentRegistration("not_registered");
  const carriedRuntimeInstall = new FakeCarriedRuntimeInstall(CARRIED_RUNTIME_BUILD, OLDER_RUNTIME_BUILD, runtimeAgent);
  const controller = await controllerCarrying(carriedRuntimeInstall, runtimeAgent, { runTatolab: false });

  await controller.installTheCarriedRuntimeIfItDiffers();

  expect(carriedRuntimeInstall.installedBuilds).toEqual([CARRIED_RUNTIME_BUILD]);
  expect(runtimeAgent.calls).toEqual(["unregister"]);
  expect(controller.runTatolab()).toBe(false);
});

test("a refused install keeps the installer's words and lines until try again installs it", async () => {
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  const carriedRuntimeInstall = new FakeCarriedRuntimeInstall(CARRIED_RUNTIME_BUILD, OLDER_RUNTIME_BUILD, runtimeAgent);
  carriedRuntimeInstall.installerLines = ["Stopping the runtime", "Starting Tatolab", "Waiting for Tatolab to answer"];
  carriedRuntimeInstall.installAnswer = failedWith("tatolab install: Tatolab 0.68.0 did not start; Tatolab 0.67.0 is running again");
  const controller = await controllerCarrying(carriedRuntimeInstall, runtimeAgent);

  await controller.installTheCarriedRuntimeIfItDiffers();

  const refused = await controller.composeStatus(61_000);
  expect(refused.runtime_install).toEqual({
    kind: "failed",
    carried_runtime_build: CARRIED_RUNTIME_BUILD,
    installer_lines: ["Stopping the runtime", "Starting Tatolab", "Waiting for Tatolab to answer"],
    refusal: "tatolab install: Tatolab 0.68.0 did not start; Tatolab 0.67.0 is running again",
  });
  expect(refused.installed_runtime?.build).toBe(OLDER_RUNTIME_BUILD);

  carriedRuntimeInstall.installAnswer = succeeded(undefined);
  expect(await controller.installTheCarriedRuntimeAgain()).toEqual(succeeded(undefined));
  expect(carriedRuntimeInstall.installedBuilds).toEqual([CARRIED_RUNTIME_BUILD]);
  expect((await controller.composeStatus(61_000)).runtime_install).toEqual({ kind: "none" });
});

test("a carried runtime that cannot name its build is refused in words and installs nothing", async () => {
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  const carriedRuntimeInstall = new FakeCarriedRuntimeInstall(CARRIED_RUNTIME_BUILD, OLDER_RUNTIME_BUILD, runtimeAgent);
  carriedRuntimeInstall.carriedBuildAnswer = failedWith("the runtime the app carries named no version: something else");
  const controller = await controllerCarrying(carriedRuntimeInstall, runtimeAgent);

  await controller.installTheCarriedRuntimeIfItDiffers();

  expect(carriedRuntimeInstall.installedBuilds).toEqual([]);
  expect(runtimeAgent.calls).toEqual([]);
  expect((await controller.composeStatus(0)).runtime_install).toEqual({
    kind: "failed",
    carried_runtime_build: null,
    installer_lines: [],
    refusal: "The runtime this app carries could not be read: the runtime the app carries named no version: something else",
  });
  expect(await controller.installTheCarriedRuntimeAgain()).toEqual(
    failedWith("The runtime this app carries could not be read: the runtime the app carries named no version: something else"),
  );
});

test("while the installer runs, each line reaches the status at once, the runtime reads as starting, and a toggle waits for it", async () => {
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  const carriedRuntimeInstall = new FakeCarriedRuntimeInstall(CARRIED_RUNTIME_BUILD, OLDER_RUNTIME_BUILD, runtimeAgent);
  let releaseTheInstaller = () => {};
  carriedRuntimeInstall.installerHeldUntil = new Promise((release) => (releaseTheInstaller = release));
  let progressCalls = 0;
  const controller = await controllerCarrying(carriedRuntimeInstall, runtimeAgent, { whenTheRuntimeInstallProgresses: () => (progressCalls += 1) });

  const installing = controller.installTheCarriedRuntimeIfItDiffers();
  await vi.waitFor(() => expect(progressCalls).toBe(3));
  const whileInstalling = await controller.composeStatus(61_000);
  expect(whileInstalling.runtime_install).toEqual({
    kind: "installing",
    carried_runtime_build: CARRIED_RUNTIME_BUILD,
    installer_lines: ["Stopping the runtime", "Starting Tatolab"],
  });
  expect(whileInstalling.runtime_state).toBe("starting");
  const toggle = controller.toggleRunTatolab();
  await new Promise((settle) => setTimeout(settle, 20));
  expect(runtimeAgent.calls, "the toggle waits for the installer").toEqual([]);

  releaseTheInstaller();
  await Promise.all([installing, toggle]);
  expect(runtimeAgent.calls).toEqual(["start_if_not_running", "unregister"]);
  expect(progressCalls).toBe(4);
});

test("each status carries where updates stand", async () => {
  const appConfigDirectory = await aFreshAppConfigDirectory();
  const controller = await TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild(new FakeRuntimeAgentRegistration("enabled"), new FakeTatolabCommandLineToolLinks(null), "/tmp/tl-app-no-runtime.sock"),
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.46.3",
    appBuild: null,
    readMonotonicClockMs: () => 0,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    whenTheRuntimeInstallProgresses: () => {},
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

test("a_relay_change_is_logged_by_its_setting_names_and_never_a_settings_value", async () => {
  const logLines: string[] = [];
  const typedSecret = "typed-in-the-test-and-nowhere-else";
  const { controller } = await controllerOverFakes(
    [
      toolResultResponse({ relay_id: "test-secret-holder-1" }),
      httpResponse(
        "200 OK",
        "application/json",
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "the relay `test-secret-holder-1` was not recorded, so nothing changed: disk full" }], isError: true } }),
      ),
      toolResultResponse({ relay_id: "test-secret-holder-1" }),
    ],
    "enabled",
    () => 0,
    createTatolabAppLog("debug", (logLine) => logLines.push(logLine)),
  );

  expect(await controller.addRelay("test-secret-holder", { token: typedSecret, label: "desk" })).toEqual(succeeded("test-secret-holder-1"));
  expect((await controller.configureRelay("test-secret-holder-1", { token: typedSecret })).ok).toBe(false);
  expect(await controller.removeRelay("test-secret-holder-1")).toEqual(succeeded(undefined));

  expect(logLines).toEqual([
    " INFO a relay was added adapter=test-secret-holder relay_id=test-secret-holder-1 setting_names=token,label",
    ' WARN a relay was not configured relay_id=test-secret-holder-1 setting_names=token failure="the relay `test-secret-holder-1` was not recorded, so nothing changed: disk full"',
    " INFO a relay was removed relay_id=test-secret-holder-1",
  ]);
  expect(logLines.join("\n")).not.toContain(typedSecret);
});
