import { CONTROL_CONTRACT_REVISION, CONTROL_CONTRACT_VERSION } from "@tatolab/runtime-client";
import { afterEach, expect, test } from "vitest";
import type { CarriedRuntime } from "./platform/carried_runtime.js";
import { RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL, RUNTIME_STARTING_GRACE_PERIOD_MS } from "./carried_runtime_run_as_the_apps_child.js";
import { fakeControlWebSocketRuntime, resultLine, DISCOVERED_AT_THIS_STUDIOS_CONTRACT } from "./fake_control_websocket_runtime.js";
import { FakeLocalApiServer, httpResponse, controlOperationFailedResponse, controlOperationResultResponse, controlWebSocketUpgradeRefusedWithWords, runtimeDescribedResponse } from "./fake_local_api_server.js";
import { FakeCarriedRuntimeStarts, FakeTatolabCommandLineToolLink, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded } from "./result.js";
import { AskedOncePerRuntimeUpEpisode, TatolabAppController, type TatolabAppControllerSources } from "./tatolab_app_controller.js";
import type { TatolabAppUpdateState } from "../shared/tatolab_backend_contract.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

test("an_answer_is_asked_once_while_the_runtime_answering_stays_the_same", async () => {
  const askedOnce = new AskedOncePerRuntimeUpEpisode<string | null>();
  let timesAsked = 0;

  for (let round = 0; round < 3; round += 1) {
    const answer = await askedOnce.answer(async () => {
      timesAsked += 1;
      return "jonathanf-macbook";
    });
    expect(answer).toBe("jonathanf-macbook");
  }
  expect(timesAsked).toBe(1);
});

test("an_answer_the_runtime_did_not_give_holds_until_the_runtime_asked_is_gone_and_then_is_asked_again", async () => {
  const askedOnce = new AskedOncePerRuntimeUpEpisode<string | null>();

  expect(await askedOnce.answer(async () => null)).toBe(null);
  expect(await askedOnce.answer(async () => "asked-twice")).toBe(null);

  askedOnce.runtimeIsGone();
  expect(await askedOnce.answer(async () => "jonathanf-macbook")).toBe("jonathanf-macbook");
});

interface ControllerOverFakesOptions {
  projectVenvSyncsOfTheFollowedStreamActions?: TatolabAppControllerSources["projectVenvSyncsOfTheFollowedStreamActions"];
  projectStreamActionFailuresOfTheFollowedStreamActions?: TatolabAppControllerSources["projectStreamActionFailuresOfTheFollowedStreamActions"];
  readMonotonicClockMs?: () => number;
  tatolabAppLog?: ReturnType<typeof createTatolabAppLog>;
  carriedRuntime?: CarriedRuntime | null;
  readTheAppUpdateState?: () => TatolabAppUpdateState;
}

async function controllerOverFakes(scriptedLocalApiResponses: readonly Buffer[], options: ControllerOverFakesOptions = {}) {
  const localApiServer = await FakeLocalApiServer.answering(scriptedLocalApiResponses);
  cleanUps.push(() => localApiServer.close());
  return { ...controllerReadingTheLocalApiAt(localApiServer.localApiSocketPath, options), localApiServer };
}

function controllerReadingTheLocalApiAt(localApiSocketPath: string, options: ControllerOverFakesOptions = {}) {
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const commandLineToolLink = new FakeTatolabCommandLineToolLink();
  const runtimeExits: string[] = [];
  const controller = TatolabAppController.create({
    platform: "macos",
    platformForThisBuild: fakeTatolabPlatformForThisBuild({
      localApiSocket: localApiSocketPath,
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
    projectStreamActionFailuresOfTheFollowedStreamActions: options.projectStreamActionFailuresOfTheFollowedStreamActions ?? { projectStreamActionFailuresNow: () => [] },
    tatolabAppLog: options.tatolabAppLog ?? createTatolabAppLog("error", () => {}),
  });
  return { controller, carriedRuntimeStarts, commandLineToolLink, runtimeExits };
}

const healthyAnswer = () => httpResponse("200 OK", "text/plain", "ok");
const noStreams = () => controlOperationResultResponse({ streams: [] });
const describedRuntime = () => runtimeDescribedResponse("0.68.90+old.1");
/** A first round's answers from a healthy runtime listing `streams`: its health, its streams, the contract age left unread, and its description. */
const aFirstHealthyRound = (streams = noStreams()) => [healthyAnswer(), streams, controlWebSocketUpgradeRefusedWithWords(), describedRuntime()];
test("a healthy runtime's status names its streams and machine, read as the window reads them, and starts no runtime of the app's", async () => {
  const { controller, localApiServer, carriedRuntimeStarts } = await controllerOverFakes(
    aFirstHealthyRound(
      controlOperationResultResponse({ streams: [{ stream: "p-main-0a1b2c", display_name: "main", location: { project_directory: "/p", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" }, state: "running", node_count: 4, failed_because: null, capture_devices_whose_access_was_never_asked_for: [] }] }),
    ),
  );

  expect(JSON.stringify(await controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","app_build":null,"platform":"macos","runtime_state":"running","runtime_not_running_because":null,"runtime_of_another_age":null,' +
      '"machine_name":"jonathanf-macbook","streams":[{"stream":"p-main-0a1b2c","display_name":"main","location":{"project_directory":"/p","project":"0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55","stream_asset":"7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68"},' +
      '"state":"running","node_count":4,"failed_because":null,"capture_devices_whose_access_was_never_asked_for":[],"condition":null,"action":null,"step":null}],"project_venv_syncs_under_way":[],"project_venv_syncs_just_ended":[],"project_stream_action_failures":[],"streams_not_listed_because":null,' +
      '"command_line_tool_link":{"kind":"not_linked","path":"/Users/someone/.local/bin/tatolab"},' +
      '"app_update":{"kind":"not_checked"},"app_update_announcement":null,' +
      `"local_api_socket":${JSON.stringify(localApiServer.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"developer_mode":false,' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"},"studio_warnings":[]}',
  );
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(0);
});


test("the machine's name is read with the runtime answering each round, kept through rounds it cannot be read, and logged once", async () => {
  const loggedLines: string[] = [];
  const { controller, localApiServer } = await controllerOverFakes(
    [
      ...aFirstHealthyRound(),
      healthyAnswer(),
      noStreams(),
      controlOperationFailedResponse("the engine is busy"),
      healthyAnswer(),
      noStreams(),
      controlOperationFailedResponse("the engine is busy"),
    ],
    { tatolabAppLog: createTatolabAppLog("info", (line) => loggedLines.push(line)) },
  );

  expect((await controller.composeStatus(0)).machine_name).toBe("jonathanf-macbook");
  expect((await controller.composeStatus(0)).machine_name).toBe("jonathanf-macbook");
  expect((await controller.composeStatus(0)).machine_name).toBe("jonathanf-macbook");

  expect(localApiServer.receivedRequests().filter((request) => request.includes('"method":"describe_runtime"'))).toHaveLength(3);
  expect(localApiServer.receivedRequests().some((request) => request.startsWith("GET /api/"))).toBe(false);
  expect(loggedLines.filter((line) => line.includes("the runtime's machine name could not be read"))).toHaveLength(1);
});

test("a runtime that comes back up still unable to give its machine's name is warned of again", async () => {
  const loggedLines: string[] = [];
  const machineNameUnread = () => controlOperationFailedResponse("the engine is busy");
  const { controller } = await controllerOverFakes(
    [
      healthyAnswer(),
      noStreams(),
      controlWebSocketUpgradeRefusedWithWords(),
      machineNameUnread(),
      httpResponse("503 Service Unavailable", "text/plain", "down"),
      healthyAnswer(),
      noStreams(),
      controlWebSocketUpgradeRefusedWithWords(),
      machineNameUnread(),
    ],
    { tatolabAppLog: createTatolabAppLog("info", (line) => loggedLines.push(line)) },
  );

  expect((await controller.composeStatus(0)).machine_name).toBeNull();
  expect((await controller.composeStatus(0)).machine_name).toBeNull();
  expect((await controller.composeStatus(0)).machine_name).toBeNull();

  expect(loggedLines.filter((line) => line.includes("the runtime's machine name could not be read"))).toHaveLength(2);
});

test("each status round carries the syncs the followed stream actions took", async () => {
  const syncJustEnded = {
    action: "Rvxjb0uiacgp6c3o13o9qvzj1-1",
    project_directory: "/private/tmp/tatolab-proof-projects/numpy-pillow",
    venv_sync: { phase: "installed", packages_resolved: 8, packages_prepared: 4, packages_installed: 8, downloads_started: 0, downloads_done: 0, packages: [] },
  };
  const { controller } = await controllerOverFakes(aFirstHealthyRound(), {
    projectVenvSyncsOfTheFollowedStreamActions: {
      takeTheProjectVenvSyncs: () => ({ underWay: [], justEnded: [syncJustEnded] }),
    },
  });

  const status = await controller.composeStatus(0);

  expect(status.project_venv_syncs_under_way).toEqual([]);
  expect(status.project_venv_syncs_just_ended).toEqual([syncJustEnded]);
});

test("each status round carries each project whose latest stream action failed, in the runtime's words", async () => {
  const openThatFailed = {
    action: "Rvxjb0uiacgp6c3o13o9qvzj1-2",
    project_directory: "/Users/someone/Sample Project",
    kind: "open",
    failed_because: "the stream id is held by a record an earlier runtime wrote",
  };
  const { controller } = await controllerOverFakes(aFirstHealthyRound(), {
    projectStreamActionFailuresOfTheFollowedStreamActions: { projectStreamActionFailuresNow: () => [openThatFailed] },
  });

  const status = await controller.composeStatus(0);

  expect(status.project_stream_action_failures).toEqual([openThatFailed]);
});


test("a healthy runtime whose streams cannot be read lists none, and says why in the failure's own words", async () => {
  const { controller } = await controllerOverFakes(
    aFirstHealthyRound(
      controlOperationResultResponse({ streams: [{ stream: "p-main-0a1b2c", display_name: "main", location: { project_directory: "/p", stream_function: "stream:main" }, state: "running", node_count: 4, failed_because: null, capture_devices_whose_access_was_never_asked_for: [] }] }),
    ),
  );

  const status = await controller.composeStatus(0);
  expect(status.streams).toBeNull();
  expect(status.streams_not_listed_because).toBe(
    "the runtime's answer to `list_streams` is not the contract's `ListStreamsToolResult`: streams.0.location: matches none of the 2 alternatives the contract allows here",
  );
});

test("a round that finds no runtime answering starts the carried one, which reads starting, then running once it answers", async () => {
  const { controller, carriedRuntimeStarts, localApiServer } = await controllerOverFakes([]);

  expect((await controller.composeStatus(0)).runtime_state).toBe("starting");
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
  expect((await controller.composeStatus(2_000)).runtime_state).toBe("starting");
  expect(carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
  expect((await controller.composeStatus(RUNTIME_STARTING_GRACE_PERIOD_MS)).runtime_not_running_because).toBe("The runtime is running but not answering.");

  localApiServer.answerNext(aFirstHealthyRound());
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

/** The runtime's older-than-this-Studio record, release 0.68.90 at revision 0, as the status carries it for a runtime the app did not start. */
const THE_OLDER_RUNTIME = {
  older_side: "runtime",
  runtime_version: "0.68.90",
  runtime_contract: { version: CONTROL_CONTRACT_VERSION, revision: 0 },
  studio_contract: { version: CONTROL_CONTRACT_VERSION, revision: CONTROL_CONTRACT_REVISION },
  remedy: "quit_the_running_runtime",
};

/** The JSON-RPC answer refusing `discover`'s call `id` with the older runtime's record. */
function discoverRefusedByTheOlderRuntime(id: unknown): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: {
      code: 3,
      message: "refused",
      data: {
        client_contract_version: CONTROL_CONTRACT_VERSION,
        runtime_contract_version: CONTROL_CONTRACT_VERSION,
        client_contract_revision: CONTROL_CONTRACT_REVISION,
        runtime_contract_revision: 0,
        older_side: "runtime",
        runtime_version: "0.68.90",
      },
    },
  });
}

/**
 * A runtime the test swaps under the socket: whether it answers its health check, which build answers `describe_runtime`, and
 * whether `discover` refuses this Studio as the older runtime does or agrees; every round's requests are counted.
 */
async function aRuntimeTheTestSwaps() {
  const runtime = { answersHealth: true, buildId: "0.68.90+old.1", isOlder: true };
  const fake = await fakeControlWebSocketRuntime(
    () => null,
    (call) => [runtime.isOlder ? discoverRefusedByTheOlderRuntime(call["id"]) : resultLine(call["id"], DISCOVERED_AT_THIS_STUDIOS_CONTRACT)],
    {
      answerHttpRequest: (request) => {
        if (request.startsWith("GET /health ")) return runtime.answersHealth ? healthyAnswer() : httpResponse("503 Service Unavailable", "text/plain", "down");
        if (request.includes('"method":"list_streams"')) return noStreams();
        if (request.includes('"method":"describe_runtime"')) return runtimeDescribedResponse(runtime.buildId);
        return null;
      },
    },
  );
  cleanUps.push(() => fake.close());
  return { runtime, upgradesRead: () => fake.upgradeRequestsRead.length, localApiSocketPath: fake.localApiSocketPath };
}

test("a runtime older than this Studio is named in the status, read once while it stays up, and read again after it goes down and a runtime of this age comes up", async () => {
  const { runtime, upgradesRead, localApiSocketPath } = await aRuntimeTheTestSwaps();
  const { controller } = controllerReadingTheLocalApiAt(localApiSocketPath);

  expect((await controller.composeStatus(0)).runtime_of_another_age).toEqual(THE_OLDER_RUNTIME);
  expect((await controller.composeStatus(0)).runtime_of_another_age).toEqual(THE_OLDER_RUNTIME);
  expect(upgradesRead()).toBe(1);

  runtime.answersHealth = false;
  expect((await controller.composeStatus(0)).runtime_of_another_age).toBeNull();

  Object.assign(runtime, { answersHealth: true, buildId: "0.69.84+new.1", isOlder: false });
  expect((await controller.composeStatus(0)).runtime_of_another_age).toBeNull();
  expect(upgradesRead()).toBe(2);
});

test("a runtime replaced between two healthy rounds is read again, so the older one's notice goes with it", async () => {
  const { runtime, upgradesRead, localApiSocketPath } = await aRuntimeTheTestSwaps();
  const { controller } = controllerReadingTheLocalApiAt(localApiSocketPath);

  expect((await controller.composeStatus(0)).runtime_of_another_age).toEqual(THE_OLDER_RUNTIME);

  Object.assign(runtime, { buildId: "0.69.84+new.1", isOlder: false });
  expect((await controller.composeStatus(0)).runtime_of_another_age).toBeNull();
  expect(upgradesRead()).toBe(2);
});

test("a contract that could not be read is read once for the runtime answering and logged once, not every round", async () => {
  const loggedLines: string[] = [];
  const { controller, localApiServer } = await controllerOverFakes(
    [...aFirstHealthyRound(), healthyAnswer(), noStreams(), describedRuntime()],
    { tatolabAppLog: createTatolabAppLog("info", (line) => loggedLines.push(line)) },
  );

  expect((await controller.composeStatus(0)).runtime_of_another_age).toBeNull();
  expect((await controller.composeStatus(0)).runtime_of_another_age).toBeNull();

  expect(localApiServer.receivedRequests().filter((request) => request.startsWith("GET /control/ws "))).toHaveLength(1);
  expect(loggedLines.filter((line) => line.includes("the runtime's control contract could not be read"))).toHaveLength(1);
});

test("restart stops the app's runtime and refuses a runtime the app did not start", async () => {
  const started = await controllerOverFakes([]);
  await started.controller.composeStatus(0);
  expect(await started.controller.restartTheRuntimeOnRequest()).toEqual(succeeded(undefined));
  expect(started.carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);

  const attached = await controllerOverFakes([...aFirstHealthyRound(), healthyAnswer()]);
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
