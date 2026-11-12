import { afterEach, expect, test } from "vitest";
import type { CarriedRuntime } from "./platform/carried_runtime.js";
import { RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL, RUNTIME_STARTING_GRACE_PERIOD_MS } from "./carried_runtime_run_as_the_apps_child.js";
import { FakeLocalApiServer, httpResponse, controlOperationResultResponse } from "./fake_local_api_server.js";
import { FakeCarriedRuntimeStarts, FakeTatolabCommandLineToolLink, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded } from "./result.js";
import { MachineNameAskedOncePerRuntimeUpEpisode, TatolabAppController, type TatolabAppControllerSources } from "./tatolab_app_controller.js";
import type { TatolabAppUpdateState } from "../shared/tatolab_backend_contract.js";
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

interface ControllerOverFakesOptions {
  projectVenvSyncsOfTheFollowedStreamActions?: TatolabAppControllerSources["projectVenvSyncsOfTheFollowedStreamActions"];
  readMonotonicClockMs?: () => number;
  tatolabAppLog?: ReturnType<typeof createTatolabAppLog>;
  carriedRuntime?: CarriedRuntime | null;
  readTheAppUpdateState?: () => TatolabAppUpdateState;
}

async function controllerOverFakes(scriptedLocalApiResponses: readonly Buffer[], options: ControllerOverFakesOptions = {}) {
  const localApiServer = await FakeLocalApiServer.answering(scriptedLocalApiResponses);
  cleanUps.push(() => localApiServer.close());
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const commandLineToolLink = new FakeTatolabCommandLineToolLink();
  const runtimeExits: string[] = [];
  const controller = TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild({
      localApiSocket: localApiServer.localApiSocketPath,
      carriedRuntime: options.carriedRuntime,
      commandLineToolLink,
    }),
    startTheCarriedRuntime: carriedRuntimeStarts.startTheCarriedRuntime,
    appVersion: "0.45.0",
    appBuild: null,
    readMonotonicClockMs: options.readMonotonicClockMs ?? (() => 0),
    readTheAppUpdateState: options.readTheAppUpdateState ?? (() => ({ kind: "not_checked" })),
    readTheAppUpdateAnnouncement: () => null,
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readDeveloperMode: () => false,
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    readTheStudioWarnings: () => [],
    whenTheRuntimeExits: () => runtimeExits.push("exited"),
    projectVenvSyncsOfTheFollowedStreamActions: options.projectVenvSyncsOfTheFollowedStreamActions ?? { takeTheProjectVenvSyncs: () => ({ underWay: [], justEnded: [] }) },
    tatolabAppLog: options.tatolabAppLog ?? createTatolabAppLog("error", () => {}),
  });
  return { controller, carriedRuntimeStarts, commandLineToolLink, localApiServer, runtimeExits };
}

const healthyAnswer = () => httpResponse("200 OK", "text/plain", "ok");
const noStreams = () => controlOperationResultResponse({ streams: [] });
const theMachine = () => httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] }));

test("a healthy runtime's status names its streams and machine, read as the window reads them, and starts no runtime of the app's", async () => {
  const { controller, localApiServer, carriedRuntimeStarts } = await controllerOverFakes([
    healthyAnswer(),
    controlOperationResultResponse({ streams: [{ stream: "p-main-0a1b2c", display_name: "main", location: { project_directory: "/p", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" }, state: "running", node_count: 4, failed_because: null, capture_devices_whose_access_was_never_asked_for: [] }] }),
    theMachine(),
  ]);

  expect(JSON.stringify(await controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","app_build":null,"platform":"macos","runtime_state":"running","runtime_not_running_because":null,' +
      '"machine_name":"jonathanf-macbook","streams":[{"stream":"p-main-0a1b2c","display_name":"main","location":{"project_directory":"/p","project":"0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55","stream_asset":"7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68"},' +
      '"state":"running","node_count":4,"failed_because":null,"capture_devices_whose_access_was_never_asked_for":[],"action":null,"step":null}],"project_venv_syncs_under_way":[],"project_venv_syncs_just_ended":[],"streams_not_listed_because":null,' +
      '"command_line_tool_link":{"kind":"not_linked","path":"/Users/someone/.local/bin/tatolab"},' +
      '"app_update":{"kind":"not_checked"},"app_update_announcement":null,' +
      `"local_api_socket":${JSON.stringify(localApiServer.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"developer_mode":false,' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"},"studio_warnings":[]}',
  );
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(0);
});


test("each status round carries the syncs the followed stream actions took", async () => {
  const syncJustEnded = {
    action: "Rvxjb0uiacgp6c3o13o9qvzj1-1",
    project_directory: "/private/tmp/tatolab-proof-projects/numpy-pillow",
    venv_sync: { phase: "installed", packages_resolved: 8, packages_prepared: 4, packages_installed: 8, downloads_started: 0, downloads_done: 0, packages: [] },
  };
  const { controller } = await controllerOverFakes([healthyAnswer(), noStreams(), theMachine()], {
    projectVenvSyncsOfTheFollowedStreamActions: {
      takeTheProjectVenvSyncs: () => ({ underWay: [], justEnded: [syncJustEnded] }),
    },
  });

  const status = await controller.composeStatus(0);

  expect(status.project_venv_syncs_under_way).toEqual([]);
  expect(status.project_venv_syncs_just_ended).toEqual([syncJustEnded]);
});


test("a healthy runtime whose streams cannot be read lists none, and says why in the failure's own words", async () => {
  const { controller } = await controllerOverFakes([
    healthyAnswer(),
    controlOperationResultResponse({ streams: [{ stream: "p-main-0a1b2c", display_name: "main", location: { project_directory: "/p", stream_function: "stream:main" }, state: "running", node_count: 4, failed_because: null, capture_devices_whose_access_was_never_asked_for: [] }] }),
    theMachine(),
  ]);

  const status = await controller.composeStatus(0);
  expect(status.streams).toBeNull();
  expect(status.streams_not_listed_because).toBe(
    "the runtime's answer to `list_streams` does not match the control contract: streams.0.location.project: Invalid input: expected string, received undefined; streams.0.location.stream_asset: Invalid input: expected string, received undefined",
  );
});

test("a round that finds no runtime answering starts the carried one, which reads starting, then running once it answers", async () => {
  const { controller, carriedRuntimeStarts, localApiServer } = await controllerOverFakes([]);

  expect((await controller.composeStatus(0)).runtime_state).toBe("starting");
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
  expect((await controller.composeStatus(2_000)).runtime_state).toBe("starting");
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
  expect((await controller.composeStatus(RUNTIME_STARTING_GRACE_PERIOD_MS)).runtime_not_running_because).toBe("The runtime is running but not answering.");

  localApiServer.answerNext([healthyAnswer(), noStreams(), theMachine()]);
  expect((await controller.composeStatus(RUNTIME_STARTING_GRACE_PERIOD_MS + 2_000)).runtime_state).toBe("running");
});

test("a runtime that exits reads not running in its own words and asks for a status round at once", async () => {
  const { controller, carriedRuntimeStarts, runtimeExits } = await controllerOverFakes([]);
  await controller.composeStatus(0);
  carriedRuntimeStarts.lastRuntimeStarted()?.exit({ exitStatus: 101, endingSignal: null, lastStandardErrorLine: "error: the local API socket is in use" });

  expect(runtimeExits).toEqual(["exited"]);
  const status = await controller.composeStatus(10);
  expect(status.runtime_state).toBe("not_running");
  expect(status.runtime_not_running_because).toBe("The runtime stopped: error: the local API socket is in use. Tato Studio starts it again shortly.");
});

test("quitting stops the app's runtime with it", async () => {
  const { controller, carriedRuntimeStarts } = await controllerOverFakes([]);
  await controller.composeStatus(0);
  controller.stopTheRuntimeAsTheAppQuits();
  expect(carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);
});

test("restart stops the app's runtime and refuses a runtime the app did not start", async () => {
  const started = await controllerOverFakes([]);
  await started.controller.composeStatus(0);
  expect(await started.controller.restartTheRuntimeOnRequest()).toEqual(succeeded(undefined));
  expect(started.carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);

  const attached = await controllerOverFakes([healthyAnswer(), noStreams(), theMachine(), healthyAnswer()]);
  await attached.controller.composeStatus(0);
  expect(await attached.controller.restartTheRuntimeOnRequest()).toEqual(failedWith(RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL));
});

test("an app that carries no runtime starts none and says why none runs", async () => {
  const { controller, carriedRuntimeStarts } = await controllerOverFakes([], { carriedRuntime: null });
  const status = await controller.composeStatus(0);
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(0);
  expect(status.runtime_state).toBe("not_running");
  expect(status.runtime_not_running_because).toBe("No runtime is running, and this build of Tato Studio carries none to start.");
});

test("opening the app links the command when nothing else holds the name, and leaves a file that is not Tatolab's alone", async () => {
  const free = await controllerOverFakes([]);
  await free.controller.linkTheCommandLineToolUnlessSomethingElseHoldsTheName();
  expect(free.commandLineToolLink.linksAsked).toBe(1);
  expect((await free.controller.composeStatus(0)).command_line_tool_link).toEqual({ kind: "linked", path: "/Users/someone/.local/bin/tatolab" });

  const taken = await controllerOverFakes([]);
  taken.commandLineToolLink.commandLineToolLink = { kind: "taken_by_something_else", path: "/Users/someone/.local/bin/tatolab" };
  await taken.controller.linkTheCommandLineToolUnlessSomethingElseHoldsTheName();
  expect(taken.commandLineToolLink.linksAsked).toBe(0);
});

test("linking the command is refused in its own words", async () => {
  const { controller, commandLineToolLink } = await controllerOverFakes([]);
  commandLineToolLink.linkRefusal = "tatolab couldn't be linked at /Users/someone/.local/bin/tatolab: EACCES: permission denied";
  expect(await controller.linkTheCommandLineTool()).toEqual(failedWith("tatolab couldn't be linked at /Users/someone/.local/bin/tatolab: EACCES: permission denied"));
});

test("each status carries where updates stand", async () => {
  const { controller } = await controllerOverFakes([], { readTheAppUpdateState: () => ({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" }) });
  expect((await controller.composeStatus(0)).app_update).toEqual({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" });
});
