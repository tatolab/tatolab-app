import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterEach, expect, test, vi } from "vitest";
import type { ListedStream } from "../shared/tatolab_backend_contract.js";
import { controlOperationFailedResponse, controlOperationRefusedResponse, controlOperationResponseOfTheRecordedToolResponse, controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { controlOperationCallsReceivedBy } from "./local_api_client_test_support.js";
import { ListedStreams, PersonEditingInStudio, ProjectViewsListed, StudioWindows, tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { cleanUpTheFakesTheLastTestMade, cleanUps, commandHandlersOver, FROM_THE_PROJECTS_WINDOW, recordedResponseBody, sharedStateOverFakes } from "./tatolab_commands_test_support.js";
import { runtimeControlLayer } from "./tatolab_runtime_control_operation_call.js";
import { transactInTheOpenProjectCommand } from "./transact_in_the_open_project_command.js";
import { CommandRefused } from "./window_command.js";

afterEach(cleanUpTheFakesTheLastTestMade);

const HALLWAYS = "/home/sam/projects/hallways";
const STREAM_ASSET = "ab38b36d-ea2a-4948-bc01-f231ca4fa043";
const TEST_PATTERN = "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a";
const HOLD_FRAME = "d28273fd-8094-41f7-b832-a55f58d60f37";
const SAM_EDITING_IN_STUDIO = { kind: "person", name: "sam" } as const;
const FROM_HALLWAYS_STUDIO_WINDOW = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
/** The stream asset the refusals were recorded on, and two of its nodes. */
const RECORDED_REFUSALS_STREAM_ASSET = "dbc5bd2d-25c8-48f5-bbc7-f85390eed673";
const IMAGE_TO_ARRAY = "7fc1b632-c0db-4d98-be98-70f6af6b0abc";
const CHANNELS_TO_ARRAY = "37baed6c-0749-45e7-aa92-bcd8f7720d24";
/** Every place a refusal may name, named by none. */
const NAMING_NOTHING_MORE = { refused_node: null, refused_link: null, refused_field: null, refused_params_pointer: null, refused_file: null, suggested_call: null };

/**
 * The window's `transact_in_the_open_project` on the live `RuntimeControl` over `server`, given up after `timeLimitMs`, Sam
 * editing in the studio window of hallways, whose one listed stream asset is `STREAM_ASSET`; with every line the app logged.
 */
async function transactCommandOver(server: FakeLocalApiServer, timeLimitMs = 2_000) {
  cleanUps.push(() => server.close());
  return transactCommandAt(server.localApiSocketPath, STREAM_ASSET, timeLimitMs);
}

/** The window's `transact_in_the_open_project` on the live `RuntimeControl` over the local API at `localApiSocketPath`, as `transactCommandOver`, hallways listing `streamAsset`. */
async function transactCommandAt(localApiSocketPath: string, streamAsset: string, timeLimitMs: number) {
  const loggedLines: string[] = [];
  const studioRuntime = ManagedRuntime.make(
    Layer.mergeAll(
      runtimeControlLayer(localApiSocketPath, timeLimitMs),
      Layer.mock(StudioWindows, {
        projectFolderOfTheWindow: (commandFromWindow) =>
          commandFromWindow.windowContentsId === FROM_HALLWAYS_STUDIO_WINDOW.windowContentsId ? Effect.succeed(HALLWAYS) : Effect.fail(new CommandRefused({ words: "No project is open in this window." })),
        aStudioWindowHoldsTheProjectIn: (projectFolder) => projectFolder === HALLWAYS,
      }),
      Layer.succeed(ProjectViewsListed, { isListedAsOpening: () => false }),
      Layer.succeed(ListedStreams, { streamAssetsOfTheProject: (projectFolder) => new Set(projectFolder === HALLWAYS ? [streamAsset] : []) }),
      Layer.succeed(PersonEditingInStudio, { author: SAM_EDITING_IN_STUDIO }),
      tatolabAppLogAsEffectsLogger(createTatolabAppLog("debug", (logLine) => loggedLines.push(logLine))),
    ),
  );
  cleanUps.push(() => studioRuntime.dispose());
  return { transact: transactInTheOpenProjectCommand(studioRuntime), loggedLines };
}

/** A server replaying the recorded `transact` answers `fixtureFileNames`, in order. */
async function serverReplaying(...fixtureFileNames: string[]): Promise<FakeLocalApiServer> {
  return FakeLocalApiServer.answering(await Promise.all(fixtureFileNames.map(async (fixtureFileName) => controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody(fixtureFileName)))));
}

/** The window's `ProjectGraphTransactionTheRuntimeAnswered` reads exactly this JSON. */
test("a graph transaction in the open project reaches the runtime's transact held to its shape and to the project's streams, by the person editing, answering what it applied or the runtime's structured refusal, its code and its words unchanged", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-setting-the-test-pattern-to-640-by-360.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-refusal-for-an-array-output-into-a-channels-input.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "hallways-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = commandHandlersOver(sharedState);
  const stream = "ab38b36d-ea2a-4948-bc01-f231ca4fa043";
  const testPattern = "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a";
  const setTheSize = { operation: "set_node_config", stream, node: testPattern, config: { width: 640, height: 360 } };
  const hallwaysMainListed: ListedStream = {
    stream: "hallways-main-3990b7",
    display_name: "main",
    location: { project_directory: projectFolder, project: "6f1d0b7e-hallways", stream_asset: stream },
    state: "running",
    node_count: 3,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
  vi.spyOn(sharedState.statusPublisher, "lastPublishedStatusNow").mockReturnValue({
    app_version: "0.68.55",
    app_build: null,
    platform: "linux",
    runtime_state: "running",
    runtime_not_running_because: null,
    machine_name: "hallways-box",
    streams: [hallwaysMainListed],
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "not_linked", path: "/home/sam/.local/bin/tatolab" },
    project_venv_syncs_under_way: [],
    project_venv_syncs_just_ended: [],
    project_stream_action_failures: [],
    app_update: { kind: "not_offered", reason: "a test updates nothing" },
    app_update_announcement: null,
    local_api_socket: sharedState.localApiSocketPath,
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "reading" },
    studio_warnings: [],
  });

  expect(await commandHandlers.read_the_person_editing_in_studio(undefined, fromTheStudioWindow)).toEqual({ ok: true, value: { kind: "person", name: "sam" } });
  const anotherProjectsStream = "0c4e2f9a-7b13-4d58-a6e1-3f9b2c7d8e10";
  expect(await commandHandlers.transact_in_the_open_project({ operations: [setTheSize, { ...setTheSize, stream: anotherProjectsStream }], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: `The stream asset ${anotherProjectsStream} is not one of the streams the runtime lists in ${projectFolder}.`,
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [setTheSize], mode: "commit", idempotency_key: "5a8e1c3f-2d47-4b6a-9f01-8c7d6e5b4a32" }, fromTheStudioWindow)).toEqual({
    ok: true,
    value: {
      kind: "applied",
      transaction: {
        mode: "commit",
        transaction: "0e29a20a-60d9-4cf1-9fdc-6c66a4b5136d",
        commit: "5e2cdcdc1f1b5e5cfde4d4c870c83197dcc29b7c",
        operations: [{ operation: "set_node_config", node: testPattern, from: {}, to: { width: 640, height: 360 }, stream: "hallways-main-3990b7" }],
        added_nodes: [],
        connected_links: [],
        added_groups: [],
        added_notes: [],
      },
    },
  });
  const link = { source: { node: IMAGE_TO_ARRAY, port: "array" }, target: { node: CHANNELS_TO_ARRAY, port: "channels" } };
  expect(await commandHandlers.transact_in_the_open_project({ operations: [{ operation: "connect", stream, ...link }], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "refused",
        action: "transact",
        refused_operation_index: 0,
        refused_link: link,
        runtime_words: "Invalid link: cannot link imagetoarray.array (Array) to channelstoarray.channels (Channels): a link joins two ports of one family; place an ArrayToChannels node between them",
      },
    },
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [{ ...setTheSize, force: true }], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: 'transact_in_the_open_project: not a graph action the runtime takes: Unrecognized key: "force"\n  at ["operations"][0]',
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: 'transact_in_the_open_project: Expected a value with a length of at least 1\n  at ["operations"]',
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [setTheSize], mode: "kept", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: 'transact_in_the_open_project: not a graph edit mode, commit or live: Invalid option: expected one of "commit"|"live"\n  at ["mode"]',
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [setTheSize], mode: "commit", idempotency_key: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
});

test("adding a node wired to the test pattern is sent as the runtime's transact by the person editing and answers what it applied, a retry under its key answering the first", async () => {
  const server = await serverReplaying(
    "local-api-transact-tool-result-of-adding-hold-frame-wired-to-the-test-pattern-in-hallways.json",
    "local-api-transact-tool-result-of-the-hold-frame-add-sent-again-under-the-same-idempotency-key.json",
    "local-api-transact-tool-result-of-adding-a-constant-holding-a-half.json",
  );
  const { transact, loggedLines } = await transactCommandOver(server);
  const addHoldFrameWiredToTheTestPattern = [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.ops:HoldFrame", as: "hold" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: TEST_PATTERN, port: "video" }, target: { node: "hold", port: "frame" } },
  ];
  const gesture = "7d1f8c52-3b0e-4a39-9a51-2f6a0b9c4e11";
  const addAConstantHoldingAHalf = [{ operation: "add_node", stream: STREAM_ASSET, type: "tatolab.ops:Constant", pins: { value: 0.5 }, as: "c" }];

  const first = await transact({ operations: addHoldFrameWiredToTheTestPattern, mode: "commit", idempotency_key: gesture }, FROM_HALLWAYS_STUDIO_WINDOW);
  const retry = await transact({ operations: addHoldFrameWiredToTheTestPattern, mode: "commit", idempotency_key: gesture }, FROM_HALLWAYS_STUDIO_WINDOW);
  const constant = await transact({ operations: addAConstantHoldingAHalf, mode: "commit", idempotency_key: null }, FROM_HALLWAYS_STUDIO_WINDOW);

  if (!first.ok || !retry.ok || !constant.ok || first.value.kind !== "applied" || retry.value.kind !== "applied" || constant.value.kind !== "applied") {
    return expect.unreachable("every transaction applied");
  }
  expect(first.value.transaction).toEqual({
    mode: "commit",
    transaction: "918d0afc-9357-4e3a-92f2-9b8cf1cb8b47",
    commit: expect.any(String),
    operations: expect.any(Array),
    added_nodes: [{ stream: "hallways-main-3990b7", node: HOLD_FRAME, name: "holdframe", as: "hold" }],
    connected_links: [{ stream: "hallways-main-3990b7", source: { node: TEST_PATTERN, port: "video" }, target: { node: HOLD_FRAME, port: "frame" }, state: "wired", error_reason: null }],
    added_groups: [],
    added_notes: [],
  });
  expect(retry.value.transaction.transaction).toBe(first.value.transaction.transaction);
  expect(constant.value.transaction.operations).toHaveLength(2);
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["transact", { operations: addHoldFrameWiredToTheTestPattern, mode: "commit", author: SAM_EDITING_IN_STUDIO, idempotency_key: gesture }],
    ["transact", { operations: addHoldFrameWiredToTheTestPattern, mode: "commit", author: SAM_EDITING_IN_STUDIO, idempotency_key: gesture }],
    ["transact", { operations: addAConstantHoldingAHalf, mode: "commit", author: SAM_EDITING_IN_STUDIO }],
  ]);
  expect(loggedLines).toEqual([]);
});

test("a drag's live edits answer no transaction and its commit under the same key answers the change from the saved value", async () => {
  const { transact } = await transactCommandOver(
    await serverReplaying("local-api-transact-tool-result-of-a-live-pin-value-mid-drag.json", "local-api-transact-tool-result-of-the-drags-commit-from-the-saved-value.json"),
  );
  const setTheValue = (value: number) => [{ operation: "set_pin_value", stream: STREAM_ASSET, node: "cbbe8192-d3a7-4208-9c4d-3ad78cd04910", input: "value", value }];
  const gesture = "9c0e5d2a-41b7-4f3e-8a6d-1b2c3d4e5f60";

  expect(await transact({ operations: setTheValue(0.1), mode: "live", idempotency_key: gesture }, FROM_HALLWAYS_STUDIO_WINDOW)).toMatchObject({
    ok: true,
    value: { kind: "applied", transaction: { mode: "live", transaction: null, commit: null, operations: [{ operation: "set_pin_value", from: 0.5, to: 0.1 }] } },
  });
  expect(await transact({ operations: setTheValue(0.3), mode: "commit", idempotency_key: gesture }, FROM_HALLWAYS_STUDIO_WINDOW)).toMatchObject({
    ok: true,
    value: { kind: "applied", transaction: { mode: "commit", transaction: expect.any(String), operations: [{ operation: "set_pin_value", from: 0.5, to: 0.3 }] } },
  });
});

test("a refused link, rename or pin value answers the runtime's structured refusal, its code, the place it names and its words unchanged", async () => {
  const server = await serverReplaying(
    "local-api-transact-refusal-for-a-rename-to-a-name-another-node-has.json",
    "local-api-transact-refusal-for-an-array-output-into-a-channels-input.json",
    "local-api-transact-refusal-for-a-pin-value-on-an-input-channelstoarray-lacks.json",
  );
  cleanUps.push(() => server.close());
  const { transact } = await transactCommandAt(server.localApiSocketPath, RECORDED_REFUSALS_STREAM_ASSET, 2_000);
  const link = { source: { node: IMAGE_TO_ARRAY, port: "array" }, target: { node: CHANNELS_TO_ARRAY, port: "channels" } };
  const sent = (operation: Record<string, unknown>) => ({ operations: [{ stream: RECORDED_REFUSALS_STREAM_ASSET, ...operation }], mode: "commit", idempotency_key: null });

  const rename = await transact(sent({ operation: "rename_node", node: CHANNELS_TO_ARRAY, name: "imagetoarray" }), FROM_HALLWAYS_STUDIO_WINDOW);
  const connect = await transact(sent({ operation: "connect", ...link }), FROM_HALLWAYS_STUDIO_WINDOW);
  const pin = await transact(sent({ operation: "set_pin_value", node: CHANNELS_TO_ARRAY, input: "no_such_input", value: 1 }), FROM_HALLWAYS_STUDIO_WINDOW);

  expect(rename).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "refused",
        action: "transact",
        refused_operation_index: 0,
        refused_node: CHANNELS_TO_ARRAY,
        runtime_words: expect.stringMatching(/^the node name `imagetoarray` casts to `imagetoarray`, which node `imagetoarray` in this graph already has/),
      },
    },
  });
  expect(connect).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "refused",
        action: "transact",
        refused_operation_index: 0,
        refused_link: link,
        runtime_words: "Invalid link: cannot link imagetoarray.array (Array) to channelstoarray.channels (Channels): a link joins two ports of one family; place an ArrayToChannels node between them",
      },
    },
  });
  expect(pin).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "refused",
        action: "transact",
        refused_operation_index: 0,
        refused_node: CHANNELS_TO_ARRAY,
        refused_field: "no_such_input",
        runtime_words: "Node 'channelstoarray' has no input port named 'no_such_input'",
      },
    },
  });
});

test("params the runtime does not read are refused with the code and the pointer it sent, whatever JSON-RPC code carried them, its words unchanged", async () => {
  const { transact } = await transactCommandOver(await serverReplaying("local-api-transact-refusal-for-a-stream-named-by-its-stream-id-not-its-asset-uuid.json"));
  const runtimeWords =
    "`transact`'s params do not match its request: UUID parsing failed: invalid character: expected an optional prefix of `urn:uuid:` followed by [0-9a-fA-F-], found `h` at 1";

  expect(await transact({ operations: [{ operation: "remove_node", stream: STREAM_ASSET, node: "n" }], mode: "commit", idempotency_key: null }, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: { ...NAMING_NOTHING_MORE, refusal_code: "params_do_not_match_schema", action: "transact", refused_operation_index: null, refused_params_pointer: "/operations/0", runtime_words: runtimeWords },
    },
  });
});

test("a refusal code this app does not know reads as refused and keeps the place it names and the runtime's words", async () => {
  const recorded: unknown = JSON.parse(await recordedResponseBody("local-api-transact-refusal-for-a-pin-value-on-an-input-channelstoarray-lacks.json"));
  const recordedError = typeof recorded === "object" && recorded !== null && "error" in recorded && typeof recorded.error === "object" && recorded.error !== null ? recorded.error : expect.unreachable("the recording is a refusal");
  const recordedRefusal = "data" in recordedError && typeof recordedError.data === "object" && recordedError.data !== null ? recordedError.data : expect.unreachable("the recording carries its refusal");
  const server = await FakeLocalApiServer.answering([controlOperationRefusedResponse("transact failed: a later runtime's refusal", { ...recordedRefusal, refusal_code: "input_value_not_valid_in_a_later_runtime" })]);
  cleanUps.push(() => server.close());
  const { transact } = await transactCommandAt(server.localApiSocketPath, RECORDED_REFUSALS_STREAM_ASSET, 2_000);

  const pin = await transact(
    { operations: [{ operation: "set_pin_value", stream: RECORDED_REFUSALS_STREAM_ASSET, node: CHANNELS_TO_ARRAY, input: "no_such_input", value: 1 }], mode: "commit", idempotency_key: null },
    FROM_HALLWAYS_STUDIO_WINDOW,
  );

  expect(pin).toMatchObject({ ok: true, value: { kind: "refused", refusal: { refusal_code: "refused", refused_field: "no_such_input", runtime_words: "Node 'channelstoarray' has no input port named 'no_such_input'" } } });
});

test("a refusal with no structure answers the runtime's own words, and a runtime that does not answer, answers late or answers off the contract says so", async () => {
  const removeANode = { operations: [{ operation: "remove_node", stream: STREAM_ASSET, node: "n" }], mode: "live", idempotency_key: null };
  const shuttingDown = await transactCommandOver(await FakeLocalApiServer.answering([controlOperationFailedResponse("transact failed: the runtime is shutting down")]));
  expect(await shuttingDown.transact(removeANode, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({ ok: false, refusal: "transact failed: the runtime is shutting down" });

  const silent = await FakeLocalApiServer.answering([]);
  const unanswered = await transactCommandOver(silent);
  expect(await unanswered.transact(removeANode, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(new RegExp(`^\`transact\` to ${silent.localApiSocketPath} got no answer: `)) });

  const late = await FakeLocalApiServer.answering([controlOperationResultResponse({})], 1_000);
  const answeredLate = await transactCommandOver(late, 100);
  expect(await answeredLate.transact(removeANode, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({ ok: false, refusal: `\`transact\` to ${late.localApiSocketPath} did not answer within 100ms` });

  const offTheContract = await transactCommandOver(await FakeLocalApiServer.answering([controlOperationResultResponse({ mode: "commit" })]));
  expect(await offTheContract.transact(removeANode, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^the runtime's answer to `transact` does not match the control contract: operations: /) });
  expect(offTheContract.loggedLines).toEqual([]);
});

test("an edit naming another project's stream asset, or sent from the Projects window, is refused in Studio's words before it reaches the runtime", async () => {
  const server = await FakeLocalApiServer.answering([]);
  const { transact } = await transactCommandOver(server);
  const anotherProjectsStream = "0c4e2f9a-7b13-4d58-a6e1-3f9b2c7d8e10";
  const setTheSize = (stream: string) => ({ operation: "set_node_config", stream, node: TEST_PATTERN, config: { width: 640, height: 360 } });

  expect(await transact({ operations: [setTheSize(STREAM_ASSET), setTheSize(anotherProjectsStream)], mode: "commit", idempotency_key: null }, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({
    ok: false,
    refusal: `The stream asset ${anotherProjectsStream} is not one of the streams the runtime lists in ${HALLWAYS}.`,
  });
  expect(await transact({ operations: [setTheSize(STREAM_ASSET)], mode: "commit", idempotency_key: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(await transact({ operations: [setTheSize(STREAM_ASSET)], mode: "commit", idempotency_key: 7 }, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({
    ok: false,
    refusal: 'transact_in_the_open_project: Expected string | null\n  at ["idempotency_key"]',
  });
  expect(server.receivedRequests()).toEqual([]);
});

const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "";
const liveLoadedStreamAsset = process.env["TATOLAB_APP_LIVE_LOADED_STREAM_ASSET"] ?? "";
test.skipIf(liveLocalApiSocket === "" || liveLoadedStreamAsset === "")("a real runtime refuses a graph edit with its code, the node it names and its own words", async () => {
  const { transact } = await transactCommandAt(liveLocalApiSocket, liveLoadedStreamAsset, 5_000);
  const nodeNoGraphHolds = "00000000-0000-4000-8000-000000000001";

  expect(await transact({ operations: [{ operation: "remove_node", stream: liveLoadedStreamAsset, node: nodeNoGraphHolds }], mode: "live", idempotency_key: null }, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "refused",
        action: "transact",
        refused_operation_index: 0,
        refused_node: nodeNoGraphHolds,
        runtime_words: expect.stringMatching(new RegExp(`^the graph holds no node ${nodeNoGraphHolds}\\. It holds: `)),
      },
    },
  });
});
