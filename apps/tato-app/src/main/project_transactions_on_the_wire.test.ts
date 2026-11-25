import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { projectActionRefusalAt, projectTransactionFromTheUndoOrRedoToolResult, projectTransactionsFromTheChangeFeed } from "./project_transactions_on_the_wire.js";
import { recordedResponseBody } from "./runtime_operations_test_support.js";
import type { Result } from "./result.js";

/** The first text block of a recorded JSON-RPC answer: a tool result's `content[0].text` or a resource read's `contents[0].text`. */
async function recordedAnswerText(fixtureFileName: string): Promise<string> {
  const answer: unknown = JSON.parse(await readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8"));
  const result = typeof answer === "object" && answer !== null && "result" in answer ? answer.result : null;
  const blocks = typeof result === "object" && result !== null ? ("contents" in result ? result.contents : "content" in result ? result.content : null) : null;
  const firstBlock: unknown = Array.isArray(blocks) ? blocks[0] : null;
  return typeof firstBlock === "object" && firstBlock !== null && "text" in firstBlock && typeof firstBlock.text === "string" ? firstBlock.text : expect.unreachable(`${fixtureFileName} holds no text block`);
}

/** The `result` of a recorded JSON-RPC answer. */
async function recordedControlResult(fixtureFileName: string): Promise<unknown> {
  const answer: unknown = JSON.parse(await recordedResponseBody(fixtureFileName));
  return typeof answer === "object" && answer !== null && "result" in answer ? answer.result : expect.unreachable(`${fixtureFileName} holds no result`);
}

/** A recorded read of a project's change feed, which `read_project_changes` answers in the same shape. */
async function recordedChangeFeed(fixtureFileName: string): Promise<unknown> {
  return JSON.parse(await recordedAnswerText(fixtureFileName));
}

function answerOf<T>(result: Result<T, string>): T {
  if (!result.ok) return expect.unreachable(result.failure);
  return result.value;
}

const PROJECT = "a42cad69-0768-448c-b62d-a1869c950ca7";
const SAMS_IMPORT = "a25a70ab-229d-4e68-9e05-27cfb771da50";
const CLAUDES_IMPORT = "9a862e59-f61a-4be0-80a6-997677b5b683";

test("a recorded change feed reads its applied transactions newest first, each naming its author, lineage, undo state and time", async () => {
  const feed = answerOf(projectTransactionsFromTheChangeFeed(await recordedChangeFeed("local-api-transactions-resource-of-lobby-after-sam-redid-and-claude-code-undid.json")));

  expect(feed.project).toBe(PROJECT);
  expect(feed.transactions.map((transaction) => [transaction.author_kind, transaction.author_name, transaction.undoes, transaction.redoes, transaction.undo_state])).toEqual([
    ["agent", "claude-code", CLAUDES_IMPORT, null, null],
    ["person", "Sam", null, SAMS_IMPORT, "applied"],
    ["person", "Sam", SAMS_IMPORT, null, null],
    ["agent", "tatolab-app", null, null, "applied"],
    ["agent", "claude-code", null, null, "undone_redoable"],
    ["person", "Sam", null, null, "applied"],
  ]);
  expect(feed.transactions.at(-1)).toMatchObject({
    format_version: 2,
    transaction: SAMS_IMPORT,
    idempotency_key: "sam-imports-warm-1",
    applied_at: "2026-11-10T18:17:08Z",
    operations: [{ operation: "import_asset", asset: { path: "media/warm.cube" } }],
  });
  expect(feed.transactions.find((transaction) => transaction.transaction === CLAUDES_IMPORT)?.idempotency_key).toBeNull();
});

/** What a refusal recorded from a runtime that sent no code and named no place reads as beside its action and words. */
const A_REFUSAL_FROM_A_RUNTIME_THAT_SENDS_NO_CODE = {
  refusal_code: "refused",
  refused_operation_index: null,
  refused_node: null,
  refused_link: null,
  refused_input: null,
  refused_params_pointer: null,
  refused_file: null,
  suggested_call: null,
};

test("the refusals a recorded feed holds read apart from its transactions, newest first, each in the runtime's own words, a refusal sent with no code read as refused", async () => {
  const feed = answerOf(projectTransactionsFromTheChangeFeed(await recordedChangeFeed("local-api-transactions-resource-of-lobby-after-sam-redid-and-claude-code-undid.json")));

  expect(feed.refused_actions).toEqual([
    {
      author_kind: "person",
      author_name: "Sam",
      mode: "commit",
      operations: [],
      idempotency_key: null,
      refusal: { ...A_REFUSAL_FROM_A_RUNTIME_THAT_SENDS_NO_CODE, action: "redo", runtime_words: "Sam has undone nothing that is left to redo" },
      refused_at: "2026-11-10T18:17:13Z",
    },
    {
      author_kind: "person",
      author_name: "Sam",
      mode: "commit",
      operations: [],
      idempotency_key: null,
      refusal: { ...A_REFUSAL_FROM_A_RUNTIME_THAT_SENDS_NO_CODE, action: "undo", runtime_words: "Sam has no transaction left to undo" },
      refused_at: "2026-11-10T18:17:12Z",
    },
  ]);
});

test("the refused edits a recorded feed holds read with each code and place the runtime sent and its words unchanged", async () => {
  const feed = answerOf(projectTransactionsFromTheChangeFeed(await recordedControlResult("local-api-read-project-changes-of-harbour-after-three-refused-edits.json")));
  const channelsToArray = "37baed6c-0749-45e7-aa92-bcd8f7720d24";

  expect(feed.refused_actions.map((refused) => refused.refusal)).toEqual([
    {
      refusal_code: "refused",
      action: "transact",
      refused_operation_index: 0,
      refused_node: channelsToArray,
      refused_link: null,
      refused_input: null,
      refused_params_pointer: null,
      refused_file: null,
      suggested_call: null,
      runtime_words: expect.stringMatching(/^the node name `imagetoarray` casts to `imagetoarray`, which node `imagetoarray` in this graph already has/),
    },
    {
      refusal_code: "refused",
      action: "transact",
      refused_operation_index: 0,
      refused_node: channelsToArray,
      refused_link: null,
      refused_input: "no_such_input",
      refused_params_pointer: null,
      refused_file: null,
      suggested_call: null,
      runtime_words: "Node 'channelstoarray' has no input port named 'no_such_input'",
    },
    {
      refusal_code: "refused",
      action: "transact",
      refused_operation_index: 0,
      refused_node: null,
      refused_link: { source: { node: "7fc1b632-c0db-4d98-be98-70f6af6b0abc", port: "array" }, target: { node: channelsToArray, port: "channels" } },
      refused_input: null,
      refused_params_pointer: null,
      refused_file: null,
      suggested_call: null,
      runtime_words: "Invalid link: cannot link imagetoarray.array (Array) to channelstoarray.channels (Channels): a link joins two ports of one family; place an ArrayToChannels node between them",
    },
  ]);
});

test("a recorded refusal that suggests a call reads its code, the pointer into the params and the call exactly as the runtime sent them", async () => {
  const toolResult = await recordedControlResult("local-api-transact-tool-refusal-for-a-stream-named-by-its-stream-id-suggesting-describe-operations.json");
  const structuredContent = typeof toolResult === "object" && toolResult !== null && "structuredContent" in toolResult ? toolResult.structuredContent : null;
  const refusal = typeof structuredContent === "object" && structuredContent !== null && "refusal" in structuredContent ? structuredContent.refusal : expect.unreachable("the tool result carries its refusal");

  expect(projectActionRefusalAt({ refusal })).toEqual({
    ok: true,
    value: {
      refusal_code: "params_do_not_match_schema",
      action: "transact",
      refused_operation_index: null,
      refused_node: null,
      refused_link: null,
      refused_input: null,
      refused_params_pointer: "/operations/0",
      refused_file: null,
      suggested_call: { operation: "describe_operations", params: { operations: ["transact"] } },
      runtime_words: "`transact`'s params do not match its request: UUID parsing failed: invalid character: expected an optional prefix of `urn:uuid:` followed by [0-9a-fA-F-], found `h` at 1",
    },
  });
});

test("a refusal naming a place in a project file reads it, and a code this app does not know reads as refused", () => {
  const refusal = { refusal_code: "a_code_from_a_newer_runtime", action: "check_project_code", refused_file: { path: "nodes/invert.py", line: 12 }, runtime_words: "the check ran out of time" };

  expect(projectActionRefusalAt({ refusal })).toEqual({
    ok: true,
    value: { ...A_REFUSAL_FROM_A_RUNTIME_THAT_SENDS_NO_CODE, action: "check_project_code", refused_file: { path: "nodes/invert.py", line: 12 }, runtime_words: "the check ran out of time" },
  });
  expect(projectActionRefusalAt({ refusal: { action: "transact" } })).toEqual({ ok: false, failure: expect.stringMatching(/^a refused action's refusal is not the contract's refusal: runtime_words: /) });
});

test("an edit whose author edited again after undoing it reads as no longer redoable, with every redo of it", async () => {
  const feed = answerOf(projectTransactionsFromTheChangeFeed(await recordedChangeFeed("local-api-transactions-resource-of-lobby-after-sam-undid-their-redo-and-renamed-the-project.json")));
  const undoStateOf = (transaction: string) => feed.transactions.find((applied) => applied.transaction === transaction)?.undo_state;

  expect(feed.transactions[0]).toMatchObject({ author_name: "Sam", operations: [{ operation: "set_project_name", from: "lobby", to: "Lobby screens" }], undo_state: "applied" });
  expect(undoStateOf(SAMS_IMPORT)).toBe("undone_not_redoable");
  expect(feed.transactions.filter((applied) => applied.redoes === SAMS_IMPORT).map((redo) => redo.undo_state)).toEqual(["undone_not_redoable"]);
  expect(undoStateOf(CLAUDES_IMPORT)).toBe("undone_redoable");
});

test("the transaction a recorded undo and redo answer is read with its lineage", async () => {
  const undone = answerOf(projectTransactionFromTheUndoOrRedoToolResult("undo", JSON.parse(await recordedAnswerText("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json"))));
  const redone = answerOf(projectTransactionFromTheUndoOrRedoToolResult("redo", JSON.parse(await recordedAnswerText("local-api-redo-tool-result-of-sam-redoing-their-import-into-lobby.json"))));

  expect(undone).toMatchObject({ author_kind: "person", author_name: "Sam", undoes: SAMS_IMPORT, redoes: null, undo_state: null });
  expect(redone).toMatchObject({ redoes: SAMS_IMPORT, undoes: null, undo_state: "applied", operations: [{ operation: "import_asset" }] });
});

test("a refused graph edit reads with the node, link and field it names", () => {
  const link = { source: { node: "n1", port: "video_to_downstream" }, target: { node: "n2", port: "video_from_upstream" } };
  const feed = answerOf(
    projectTransactionsFromTheChangeFeed(
      ({
        project: "p",
        project_directory: "/d",
        transactions: [
          {
            status: "refused",
            author_kind: "agent",
            author_name: "claude-code",
            mode: "live",
            operations: [{ operation: "connect", link }],
            idempotency_key: "k1",
            refusal: { action: "transact", refused_operation_index: 0, refused_node: "n2", refused_link: link, refused_input: "video_from_upstream", runtime_words: "the words" },
            refused_at: "2026-11-10T18:00:00Z",
          },
        ],
      }),
    ),
  );
  expect(feed.transactions).toEqual([]);
  expect(feed.refused_actions[0]).toMatchObject({ mode: "live", idempotency_key: "k1", refusal: { refused_operation_index: 0, refused_node: "n2", refused_link: link, refused_input: "video_from_upstream" } });
});

test("an entry or an undo state newer than this app leaves the rest of the feed readable", () => {
  const appliedInANewerState = { status: "applied", format_version: 3, transaction: "t", commit: "c", author_kind: "person", author_name: "Sam", operations: [], inverse_operations: [], undo_state: "parked", applied_at: "2026-11-10T18:00:00Z" };
  const feed = answerOf(projectTransactionsFromTheChangeFeed(({ project: "p", project_directory: "/d", transactions: [{ status: "pending", anything: 1 }, appliedInANewerState] })));
  expect(feed.transactions.map((transaction) => [transaction.transaction, transaction.undo_state])).toEqual([["t", "parked"]]);
  expect(feed.refused_actions).toEqual([]);
});

test("a change feed or undo result missing what it must carry is not read", () => {
  expect(projectTransactionsFromTheChangeFeed({ project: "p", project_directory: "/d" })).toEqual({ ok: false, failure: expect.stringMatching(/^the project's change feed could not be read: .*transactions/) });
  expect(projectTransactionFromTheUndoOrRedoToolResult("redo", JSON.parse('{"format_version":2,"transaction":"t"}'))).toEqual({ ok: false, failure: expect.stringMatching(/^the runtime's redo result could not be read: .*commit/) });
  expect(projectTransactionsFromTheChangeFeed({ project: "p", project_directory: "/d", transactions: [{ transaction: "t" }] })).toEqual({ ok: false, failure: expect.stringMatching(/`status`/) });

});
