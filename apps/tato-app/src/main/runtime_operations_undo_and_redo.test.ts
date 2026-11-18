import { afterEach, expect, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy, failureOf, fakeLocalApiServerAnswering, recordedResponseBody } from "./runtime_operations_test_support.js";
import { undoOrRedo } from "./runtime_operations.js";

afterEach(cleanUpWhatTheTestStarted);

test("undo_and_redo_ask_the_runtime_by_the_author_and_answer_the_transaction_or_the_runtimes_refusal_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-redo-tool-result-of-sam-redoing-their-import-into-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-refusal-for-sam-with-nothing-left-to-undo.json")),
  ]);
  const sam = { kind: "person", name: "Sam" } as const;
  const projectFolder = "/tmp/claude-0/-home-user/e49a0dd5-7a95-5fdd-b9ce-70d350d7c52d/scratchpad/streams/lobby";

  const undone = answerOf(await server.run(undoOrRedo("undo", projectFolder, sam)));
  expect(answerOf(await server.run(undoOrRedo("redo", projectFolder, sam))).redoes).toBe(undone.undoes);
  const refusal = failureOf(await server.run(undoOrRedo("undo", projectFolder, sam)));
  expect(refusal).toMatchObject({ _tag: "RuntimeRefused", words: "undo failed: Sam has no transaction left to undo" });
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
  const undone = answerOf(await server.run(undoOrRedo("undo", "/home/user/projects/hallways", { kind: "person", name: "user" })));
  expect(undone).toMatchObject({
    author_kind: "person",
    author_name: "user",
    operations: [
      { stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", operation: "set_pin_value", input: "value", from: 0.25, to: 0.5 },
      { stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", operation: "rename_node", from: "half", to: "constant" },
    ],
  });
});
