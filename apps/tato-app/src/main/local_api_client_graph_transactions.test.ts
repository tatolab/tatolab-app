import { afterEach, expect, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse, controlOperationFailedResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy, failureOf, fakeLocalApiServerAnswering, recordedResponseBody } from "./local_api_client_test_support.js";

afterEach(cleanUpWhatTheTestStarted);

const SAM_EDITING_IN_STUDIO = { kind: "person", name: "sam" } as const;

test("undo_and_redo_ask_the_runtime_by_the_author_and_answer_the_transaction_or_the_runtimes_refusal_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-redo-tool-result-of-sam-redoing-their-import-into-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-refusal-for-sam-with-nothing-left-to-undo.json")),
  ]);
  const sam = { kind: "person", name: "Sam" } as const;
  const projectFolder = "/tmp/claude-0/-home-user/e49a0dd5-7a95-5fdd-b9ce-70d350d7c52d/scratchpad/streams/lobby";

  const undone = answerOf(await server.client().undoInTheProject(projectFolder, sam));
  expect(answerOf(await server.client().redoInTheProject(projectFolder, sam)).redoes).toBe(undone.undoes);
  const refusal = failureOf(await server.client().undoInTheProject(projectFolder, sam));
  expect(refusal).toMatchObject({ isTheRuntimesRefusal: true, failureDescription: "undo failed: Sam has no transaction left to undo" });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["undo", { project_directory: projectFolder, author: sam }],
    ["redo", { project_directory: projectFolder, author: sam }],
    ["undo", { project_directory: projectFolder, author: sam }],
  ]);
});

test("an_undo_of_the_persons_graph_edit_answers_each_operation_by_its_stream_asset_with_from_and_to_swapped", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-result-of-a-person-undoing-a-rename-and-a-pin-value-sent-from-studio.json")),
  ]);
  const undone = answerOf(await server.client().undoInTheProject("/home/user/projects/hallways", { kind: "person", name: "user" }));
  expect(undone).toMatchObject({
    author_kind: "person",
    author_name: "user",
    operations: [
      { stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", operation: "set_pin_value", input: "value", from: 0.25, to: 0.5 },
      { stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", operation: "rename_node", from: "half", to: "constant" },
    ],
  });
});

test("a_graph_transaction_is_sent_as_the_runtimes_transact_by_the_person_editing_and_answers_what_it_applied_a_retry_under_its_key_answering_the_first", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-adding-hold-frame-wired-to-the-test-pattern-in-hallways.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-the-hold-frame-add-sent-again-under-the-same-idempotency-key.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-adding-a-constant-holding-a-half.json")),
  ]);
  const streamAsset = "ab38b36d-ea2a-4948-bc01-f231ca4fa043";
  const testPattern = "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a";
  const addHoldFrameWiredToTheTestPattern = [
    { operation: "add_node", stream: streamAsset, type: "tatolab.ops:HoldFrame", as: "hold" },
    { operation: "connect", stream: streamAsset, source: { node: testPattern, port: "video" }, target: { node: "hold", port: "frame" } },
  ] as const;
  const gesture = "7d1f8c52-3b0e-4a39-9a51-2f6a0b9c4e11";

  const first = answerOf(await server.client().transactOnTheStreamGraphs(addHoldFrameWiredToTheTestPattern, "commit", gesture, SAM_EDITING_IN_STUDIO));
  const retry = answerOf(await server.client().transactOnTheStreamGraphs(addHoldFrameWiredToTheTestPattern, "commit", gesture, SAM_EDITING_IN_STUDIO));
  const addAConstantHoldingAHalf = [{ operation: "add_node", stream: streamAsset, type: "tatolab.ops:Constant", pins: { value: 0.5 }, as: "c" }] as const;
  const constant = answerOf(await server.client().transactOnTheStreamGraphs(addAConstantHoldingAHalf, "commit", null, SAM_EDITING_IN_STUDIO));

  if (first.kind !== "applied" || retry.kind !== "applied" || constant.kind !== "applied") return expect.unreachable("every transaction applied");
  expect(first.transaction).toMatchObject({
    mode: "commit",
    transaction: "918d0afc-9357-4e3a-92f2-9b8cf1cb8b47",
    added_nodes: [{ stream: "hallways-main-3990b7", node: "d28273fd-8094-41f7-b832-a55f58d60f37", name: "holdframe", as: "hold" }],
    connected_links: [
      { stream: "hallways-main-3990b7", source: { node: testPattern, port: "video" }, target: { node: "d28273fd-8094-41f7-b832-a55f58d60f37", port: "frame" }, state: "wired", error_reason: null },
    ],
    added_groups: [],
    added_notes: [],
  });
  expect(retry.transaction.transaction).toBe(first.transaction.transaction);
  expect(constant.transaction.operations).toHaveLength(2);
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["transact", { operations: addHoldFrameWiredToTheTestPattern, mode: "commit", author: SAM_EDITING_IN_STUDIO, idempotency_key: gesture }],
    ["transact", { operations: addHoldFrameWiredToTheTestPattern, mode: "commit", author: SAM_EDITING_IN_STUDIO, idempotency_key: gesture }],
    ["transact", { operations: addAConstantHoldingAHalf, mode: "commit", author: SAM_EDITING_IN_STUDIO }],
  ]);
});

test("a_drags_live_edits_answer_no_transaction_and_its_commit_under_the_same_key_answers_the_change_from_the_saved_value", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-a-live-pin-value-mid-drag.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-the-drags-commit-from-the-saved-value.json")),
  ]);
  const setTheValue = (value: number) => [{ operation: "set_pin_value", stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", node: "cbbe8192-d3a7-4208-9c4d-3ad78cd04910", input: "value", value }] as const;
  const gesture = "9c0e5d2a-41b7-4f3e-8a6d-1b2c3d4e5f60";

  const live = answerOf(await server.client().transactOnTheStreamGraphs(setTheValue(0.1), "live", gesture, SAM_EDITING_IN_STUDIO));
  const committed = answerOf(await server.client().transactOnTheStreamGraphs(setTheValue(0.3), "commit", gesture, SAM_EDITING_IN_STUDIO));

  expect(live).toMatchObject({ kind: "applied", transaction: { mode: "live", transaction: null, commit: null, operations: [{ operation: "set_pin_value", from: 0.5, to: 0.1 }] } });
  expect(committed).toMatchObject({ kind: "applied", transaction: { mode: "commit", transaction: expect.any(String), operations: [{ operation: "set_pin_value", from: 0.5, to: 0.3 }] } });
});

test("a_refused_graph_transaction_answers_the_runtimes_structured_refusal_naming_the_node_the_link_or_the_field", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-refusal-for-a-rename-to-a-name-another-node-has.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-refusal-for-an-image-output-into-a-channels-input.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-refusal-for-a-pin-value-on-an-input-holdframe-lacks.json")),
  ]);
  const streamAsset = "ab38b36d-ea2a-4948-bc01-f231ca4fa043";
  const holdFrame = "d28273fd-8094-41f7-b832-a55f58d60f37";
  const testPattern = "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a";

  const rename = answerOf(await server.client().transactOnTheStreamGraphs([{ operation: "rename_node", stream: streamAsset, node: holdFrame, name: "testpatternsource" }], "commit", null, SAM_EDITING_IN_STUDIO));
  const link = { source: { node: testPattern, port: "video" }, target: { node: holdFrame, port: "refresh" } };
  const connect = answerOf(await server.client().transactOnTheStreamGraphs([{ operation: "connect", stream: streamAsset, ...link }], "commit", null, SAM_EDITING_IN_STUDIO));
  const pin = answerOf(await server.client().transactOnTheStreamGraphs([{ operation: "set_pin_value", stream: streamAsset, node: holdFrame, input: "no_such_input", value: 1 }], "commit", null, SAM_EDITING_IN_STUDIO));

  expect(rename).toMatchObject({ kind: "refused", refusal: { action: "transact", refused_operation_index: 0, refused_node: holdFrame, refused_link: null, refused_field: null } });
  if (rename.kind !== "refused") return expect.unreachable("the rename was refused");
  expect(rename.refusal.runtime_words).toMatch(/^the node name `testpatternsource` casts to `testpatternsource`, which node `testpatternsource` in this graph already has/);
  expect(connect).toEqual({
    kind: "refused",
    refusal: {
      action: "transact",
      refused_operation_index: 0,
      refused_node: null,
      refused_link: link,
      refused_field: null,
      runtime_words:
        "Invalid link: cannot link testpatternsource.video (Image) to holdframe.refresh (Channels): a link joins two ports of one family; no one node converts between them; chain the conversion nodes that do",
    },
  });
  expect(pin).toEqual({
    kind: "refused",
    refusal: { action: "transact", refused_operation_index: 0, refused_node: holdFrame, refused_link: null, refused_field: "no_such_input", runtime_words: "Processor 'holdframe' has no input port named 'no_such_input'" },
  });
});

test("a_graph_transaction_refused_with_no_structured_refusal_fails_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationFailedResponse("transact failed: the runtime is shutting down")]);

  const failure = failureOf(await server.client().transactOnTheStreamGraphs([{ operation: "remove_node", stream: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68", node: "n" }], "live", null, SAM_EDITING_IN_STUDIO));

  expect(failure).toEqual({ isTheRuntimesRefusal: true, failureDescription: "transact failed: the runtime is shutting down" });
});
