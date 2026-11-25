import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Effect, ManagedRuntime } from "effect";
import { afterEach, expect, test, vi } from "vitest";
import type { ListedStream } from "../shared/tatolab_backend_contract.js";
import { controlOperationFailedResponse, controlOperationRefusedResponse, controlOperationResponseOfTheRecordedToolResponse, controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { controlOperationCallsReceivedBy } from "./runtime_operations_test_support.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { cleanUpTheFakesTheLastTestMade, cleanUps, commandHandlersOver, FROM_THE_PROJECTS_WINDOW, recordedResponseBody, sharedStateOverFakes, studioServicesLayerForTest } from "./tatolab_commands_test_support.js";
import { transactInTheOpenProject, transactInTheOpenProjectCommand } from "./transact_in_the_open_project_command.js";

afterEach(cleanUpTheFakesTheLastTestMade);

const HALLWAYS = "/home/sam/projects/hallways";
const STREAM_ASSET = "ab38b36d-ea2a-4948-bc01-f231ca4fa043";
/** The stream id the runtime lists hallways' `main` under, which a suggested edit names it by. */
const HALLWAYS_MAIN = "hallways-main-3990b7";
const TEST_PATTERN = "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a";
const HOLD_FRAME = "d28273fd-8094-41f7-b832-a55f58d60f37";
const SAM_EDITING_IN_STUDIO = { kind: "person", name: "sam" } as const;
const FROM_HALLWAYS_STUDIO_WINDOW = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
/** The stream asset the refusals were recorded on, and two of its nodes. */
const RECORDED_REFUSALS_STREAM_ASSET = "0eaf9ee2-0f73-4154-a3f6-a99c261b850d";
const RECORDED_TEST_PATTERN = "777c0dab-ae92-4df3-9d8f-bb1c4d4e98b6";
const RECORDED_HALFTONE = "02a2b427-bbc4-4d9f-a376-854af4fa8755";
/** Every place a refusal may name, named by none. */
const NAMING_NOTHING_MORE = { refused_node: null, refused_link: null, refused_input: null, refused_params_pointer: null, refused_file: null, suggested_call: null };

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
    studioServicesLayerForTest({
      localApiSocketPath,
      localApiTimeLimitMs: timeLimitMs,
      studioWindow: { windowContentsId: FROM_HALLWAYS_STUDIO_WINDOW.windowContentsId, projectFolder: HALLWAYS },
      streamAssetsOfTheProject: (projectFolder) => new Set(projectFolder === HALLWAYS ? [streamAsset] : []),
      namesAStreamOfTheProject: (projectFolder, stream) => projectFolder === HALLWAYS && (stream === streamAsset || stream === HALLWAYS_MAIN),
      author: SAM_EDITING_IN_STUDIO,
      tatolabAppLog: createTatolabAppLog("debug", (logLine) => loggedLines.push(logLine)),
    }),
  );
  cleanUps.push(() => studioRuntime.dispose());
  return { transact: transactInTheOpenProjectCommand(studioRuntime), studioRuntime, loggedLines };
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
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-refusal-for-a-texture-output-into-an-integer-input.json")),
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
  const setTheSize = [
    { operation: "set_node_input_value", stream, node: testPattern, input: "width", value: 640 },
    { operation: "set_node_input_value", stream, node: testPattern, input: "height", value: 360 },
  ];
  const hallwaysMainListed: ListedStream = {
    stream: "hallways-main-3990b7",
    display_name: "main",
    location: { project_directory: projectFolder, project: "6f1d0b7e-hallways", stream_asset: stream },
    state: "running",
    node_count: 3,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [], condition: null,
    action: null,
    step: null,
  };
  vi.spyOn(sharedState.statusPublisher, "lastPublishedStatusNow").mockReturnValue({
    app_version: "0.68.55",
    app_build: null,
    platform: "linux",
    runtime_state: "running",
    runtime_not_running_because: null,
    runtime_of_another_age: null,
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
  expect(await commandHandlers.transact_in_the_open_project({ operations: [...setTheSize, ...setTheSize.map((setting) => ({ ...setting, stream: anotherProjectsStream }))], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: `The stream ${anotherProjectsStream} is not one of the streams the runtime lists in ${projectFolder}, by its stream asset or its stream id.`,
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: setTheSize, mode: "commit", idempotency_key: "5a8e1c3f-2d47-4b6a-9f01-8c7d6e5b4a32" }, fromTheStudioWindow)).toEqual({
    ok: true,
    value: {
      kind: "applied",
      transaction: {
        mode: "commit",
        transaction: "0e29a20a-60d9-4cf1-9fdc-6c66a4b5136d",
        commit: "5e2cdcdc1f1b5e5cfde4d4c870c83197dcc29b7c",
        operations: [
          { operation: "set_node_input_value", node: testPattern, input: "width", from: null, to: 640, stream: "hallways-main-3990b7" },
          { operation: "set_node_input_value", node: testPattern, input: "height", from: null, to: 360, stream: "hallways-main-3990b7" },
        ],
        added_nodes: [],
        connected_links: [],
        added_groups: [],
        added_notes: [],
      },
    },
  });
  const link = { source: { node: RECORDED_TEST_PATTERN, port: "video" }, target: { node: RECORDED_TEST_PATTERN, port: "width" } };
  expect(await commandHandlers.transact_in_the_open_project({ operations: [{ operation: "connect", stream, ...link }], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "link_pin_types_do_not_connect",
        action: "transact",
        refused_operation_index: 0,
        refused_link: link,
        runtime_words: "cannot link `testpatternsource.video` (Texture (rgba8_unorm)) to `testpatternsource.width` (Integer): a Texture (rgba8_unorm) output does not connect to a Integer input; no node type converts between them",
      },
    },
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [{ ...setTheSize[0], force: true }], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: 'transact_in_the_open_project: not a StreamGraphAction the runtime takes: the contract names no such field\n  at ["operations"][0]["force"]',
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: 'transact_in_the_open_project: Expected a value with a length of at least 1\n  at ["operations"]',
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: setTheSize, mode: "kept", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: 'transact_in_the_open_project: not a GraphEditMode the runtime takes: matches none of the 2 alternatives the contract allows here\n  at ["mode"]',
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: setTheSize, mode: "commit", idempotency_key: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
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
  const addAConstantHoldingAHalf = [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.ops:Constant", as: "c" },
    { operation: "set_node_input_value", stream: STREAM_ASSET, node: "c", input: "value", value: 0.5 },
  ];

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

test("an edit naming the project's stream by its stream id, as a refusal's suggested edit does, is sent to the runtime's transact as given; another project's stream id is refused", async () => {
  const server = await serverReplaying("local-api-transact-tool-result-of-adding-hold-frame-wired-to-the-test-pattern-in-hallways.json");
  const { transact } = await transactCommandOver(server);
  const placingTheHoldFrame = [
    { operation: "add_node", stream: HALLWAYS_MAIN, type: "tatolab.ops:HoldFrame", as: "hold" },
    { operation: "connect", stream: HALLWAYS_MAIN, source: { node: TEST_PATTERN, port: "video" }, target: { node: "hold", port: "frame" } },
  ];

  expect(await transact({ operations: [{ ...placingTheHoldFrame[0], stream: "lobby-main-1a2b3c" }], mode: "commit", idempotency_key: null }, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({
    ok: false,
    refusal: `The stream lobby-main-1a2b3c is not one of the streams the runtime lists in ${HALLWAYS}, by its stream asset or its stream id.`,
  });
  expect(await transact({ operations: placingTheHoldFrame, mode: "commit", idempotency_key: "3f1e2d4c-5b6a-4789-8c0d-1e2f3a4b5c6d" }, FROM_HALLWAYS_STUDIO_WINDOW)).toMatchObject({ ok: true, value: { kind: "applied" } });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["transact", { operations: placingTheHoldFrame, mode: "commit", author: SAM_EDITING_IN_STUDIO, idempotency_key: "3f1e2d4c-5b6a-4789-8c0d-1e2f3a4b5c6d" }],
  ]);
});

test("a drag's live edits answer no transaction and its commit under the same key answers the change from the saved value", async () => {
  const { transact } = await transactCommandOver(
    await serverReplaying("local-api-transact-tool-result-of-a-live-pin-value-mid-drag.json", "local-api-transact-tool-result-of-the-drags-commit-from-the-saved-value.json"),
  );
  const setTheValue = (value: number) => [{ operation: "set_node_input_value", stream: STREAM_ASSET, node: "cbbe8192-d3a7-4208-9c4d-3ad78cd04910", input: "value", value }];
  const gesture = "9c0e5d2a-41b7-4f3e-8a6d-1b2c3d4e5f60";

  expect(await transact({ operations: setTheValue(0.1), mode: "live", idempotency_key: gesture }, FROM_HALLWAYS_STUDIO_WINDOW)).toMatchObject({
    ok: true,
    value: { kind: "applied", transaction: { mode: "live", transaction: null, commit: null, operations: [{ operation: "set_node_input_value", from: 0.5, to: 0.1 }] } },
  });
  expect(await transact({ operations: setTheValue(0.3), mode: "commit", idempotency_key: gesture }, FROM_HALLWAYS_STUDIO_WINDOW)).toMatchObject({
    ok: true,
    value: { kind: "applied", transaction: { mode: "commit", transaction: expect.any(String), operations: [{ operation: "set_node_input_value", from: 0.5, to: 0.3 }] } },
  });
});

test("a refused link, rename or pin value answers the runtime's structured refusal, its code, the place it names and its words unchanged", async () => {
  const server = await serverReplaying(
    "local-api-transact-refusal-for-a-rename-to-a-name-another-node-has.json",
    "local-api-transact-refusal-for-a-texture-output-into-an-integer-input.json",
    "local-api-transact-refusal-for-a-value-on-an-input-the-test-pattern-lacks.json",
  );
  cleanUps.push(() => server.close());
  const { transact } = await transactCommandAt(server.localApiSocketPath, RECORDED_REFUSALS_STREAM_ASSET, 2_000);
  const link = { source: { node: RECORDED_TEST_PATTERN, port: "video" }, target: { node: RECORDED_TEST_PATTERN, port: "width" } };
  const sent = (operation: Record<string, unknown>) => ({ operations: [{ stream: RECORDED_REFUSALS_STREAM_ASSET, ...operation }], mode: "commit", idempotency_key: null });

  const rename = await transact(sent({ operation: "rename_node", node: RECORDED_HALFTONE, name: "brightnessmeter" }), FROM_HALLWAYS_STUDIO_WINDOW);
  const connect = await transact(sent({ operation: "connect", ...link }), FROM_HALLWAYS_STUDIO_WINDOW);
  const pin = await transact(sent({ operation: "set_node_input_value", node: RECORDED_TEST_PATTERN, input: "no_such_input", value: 1 }), FROM_HALLWAYS_STUDIO_WINDOW);

  expect(rename).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "node_name_taken",
        action: "transact",
        refused_operation_index: 0,
        refused_node: RECORDED_HALFTONE,
        runtime_words: expect.stringMatching(/^the node name `brightnessmeter` casts to `brightnessmeter`, which node `brightnessmeter` in this graph already has/),
      },
    },
  });
  expect(connect).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "link_pin_types_do_not_connect",
        action: "transact",
        refused_operation_index: 0,
        refused_link: link,
        runtime_words: "cannot link `testpatternsource.video` (Texture (rgba8_unorm)) to `testpatternsource.width` (Integer): a Texture (rgba8_unorm) output does not connect to a Integer input; no node type converts between them",
      },
    },
  });
  expect(pin).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: {
        ...NAMING_NOTHING_MORE,
        refusal_code: "port_not_found",
        action: "transact",
        refused_operation_index: 0,
        refused_node: RECORDED_TEST_PATTERN,
        refused_input: "no_such_input",
        refused_params_pointer: "/operations/0/value",
        suggested_call: { operation: "describe_node_types", params: { project_directory: "/tmp/claude-0/proj/harbour", node_types: ["tatolab.testpattern:TestPatternSource"] } },
        runtime_words: "node `testpatternsource` (`tatolab.testpattern:TestPatternSource`) has no input `no_such_input`; its inputs are `width`, `height`. To fix: name one of them",
      },
    },
  });
});

test("params the runtime does not read are refused with the code and the pointer it sent, whatever JSON-RPC code carried them, its words unchanged", async () => {
  const { transact } = await transactCommandOver(await serverReplaying("local-api-transact-refusal-for-a-remove-node-naming-no-node.json"));
  const runtimeWords = "`transact`'s params do not match its request: missing field `node`";

  expect(await transact({ operations: [{ operation: "remove_node", stream: STREAM_ASSET, node: "n" }], mode: "commit", idempotency_key: null }, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({
    ok: true,
    value: {
      kind: "refused",
      refusal: { ...NAMING_NOTHING_MORE, refusal_code: "params_do_not_match_schema", action: "transact", refused_operation_index: null, refused_params_pointer: "/operations/0", runtime_words: runtimeWords },
    },
  });
});

test("a refusal code this app does not know reads as refused and keeps the place it names and the runtime's words", async () => {
  const recorded: unknown = JSON.parse(await recordedResponseBody("local-api-transact-refusal-for-a-value-on-an-input-the-test-pattern-lacks.json"));
  const recordedError = typeof recorded === "object" && recorded !== null && "error" in recorded && typeof recorded.error === "object" && recorded.error !== null ? recorded.error : expect.unreachable("the recording is a refusal");
  const recordedRefusal = "data" in recordedError && typeof recordedError.data === "object" && recordedError.data !== null ? recordedError.data : expect.unreachable("the recording carries its refusal");
  const server = await FakeLocalApiServer.answering([controlOperationRefusedResponse("transact failed: a later runtime's refusal", { ...recordedRefusal, refusal_code: "input_value_not_valid_in_a_later_runtime" })]);
  cleanUps.push(() => server.close());
  const { transact } = await transactCommandAt(server.localApiSocketPath, RECORDED_REFUSALS_STREAM_ASSET, 2_000);

  const pin = await transact(
    { operations: [{ operation: "set_node_input_value", stream: RECORDED_REFUSALS_STREAM_ASSET, node: RECORDED_TEST_PATTERN, input: "no_such_input", value: 1 }], mode: "commit", idempotency_key: null },
    FROM_HALLWAYS_STUDIO_WINDOW,
  );

  expect(pin).toMatchObject({ ok: true, value: { kind: "refused", refusal: { refusal_code: "refused", refused_input: "no_such_input", runtime_words: "node `testpatternsource` (`tatolab.testpattern:TestPatternSource`) has no input `no_such_input`; its inputs are `width`, `height`. To fix: name one of them" } } });
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
  expect(await offTheContract.transact(removeANode, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^the runtime's answer to `transact` is not the contract's `GraphTransactionToolResult`: operations: required, and absent; /) });
  expect(offTheContract.loggedLines).toEqual([]);
});

test("an answer on the contract in a mode the window does not read is refused as the window's reading, not as a contract mismatch", async () => {
  const dryRunAnswer = { mode: "dry_run", transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [] };
  const removeANode = { operations: [{ operation: "remove_node" as const, stream: STREAM_ASSET, node: "n" }], mode: "commit" as const, idempotency_key: null };
  const { studioRuntime } = await transactCommandOver(await FakeLocalApiServer.answering([controlOperationResultResponse(dryRunAnswer)]));

  const settled = await studioRuntime.runPromise(Effect.result(transactInTheOpenProject(removeANode, FROM_HALLWAYS_STUDIO_WINDOW)));

  expect(settled._tag).toBe("Failure");
  if (settled._tag !== "Failure") return;
  expect(settled.failure).toEqual(
    expect.objectContaining({ _tag: "TransactAnswerTheWindowDoesNotRead", words: "the runtime's transact answered on the contract in the mode `dry_run`, but the window reads only commit or live" }),
  );
});

test("an edit naming another project's stream asset, or sent from the Projects window, is refused in Studio's words before it reaches the runtime", async () => {
  const server = await FakeLocalApiServer.answering([]);
  const { transact } = await transactCommandOver(server);
  const anotherProjectsStream = "0c4e2f9a-7b13-4d58-a6e1-3f9b2c7d8e10";
  const setTheSize = (stream: string) => ({ operation: "set_node_input_value", stream, node: TEST_PATTERN, input: "width", value: 640 });

  expect(await transact({ operations: [setTheSize(STREAM_ASSET), setTheSize(anotherProjectsStream)], mode: "commit", idempotency_key: null }, FROM_HALLWAYS_STUDIO_WINDOW)).toEqual({
    ok: false,
    refusal: `The stream ${anotherProjectsStream} is not one of the streams the runtime lists in ${HALLWAYS}, by its stream asset or its stream id.`,
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
        refusal_code: "node_not_found",
        action: "transact",
        refused_operation_index: 0,
        refused_node: nodeNoGraphHolds,
        runtime_words: expect.stringMatching(new RegExp(`^the graph holds no node ${nodeNoGraphHolds}\\. It holds: `)),
      },
    },
  });
});
