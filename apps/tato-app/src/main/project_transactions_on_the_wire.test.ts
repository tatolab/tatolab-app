import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { projectTransactionFromTheUndoOrRedoToolResult, projectTransactionsFromTheResourceText, transactionsResourceUriFromTheListAssetsToolResult } from "./project_transactions_on_the_wire.js";
import type { Result } from "./result.js";

/** The first text block of a recorded JSON-RPC answer: a tool result's `content[0].text` or a resource read's `contents[0].text`. */
async function recordedAnswerText(fixtureFileName: string): Promise<string> {
  const answer: unknown = JSON.parse(await readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8"));
  const result = typeof answer === "object" && answer !== null && "result" in answer ? answer.result : null;
  const blocks = typeof result === "object" && result !== null ? ("contents" in result ? result.contents : "content" in result ? result.content : null) : null;
  const firstBlock: unknown = Array.isArray(blocks) ? blocks[0] : null;
  return typeof firstBlock === "object" && firstBlock !== null && "text" in firstBlock && typeof firstBlock.text === "string" ? firstBlock.text : expect.unreachable(`${fixtureFileName} holds no text block`);
}

function answerOf<T>(result: Result<T, string>): T {
  if (!result.ok) return expect.unreachable(result.failure);
  return result.value;
}

const PROJECT = "a42cad69-0768-448c-b62d-a1869c950ca7";
const SAMS_IMPORT = "a25a70ab-229d-4e68-9e05-27cfb771da50";
const CLAUDES_IMPORT = "9a862e59-f61a-4be0-80a6-997677b5b683";

test("a recorded change feed reads its applied transactions newest first, each naming its author, lineage, undo state and time", async () => {
  const feed = answerOf(projectTransactionsFromTheResourceText(await recordedAnswerText("local-api-transactions-resource-of-lobby-after-sam-redid-and-claude-code-undid.json")));

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

test("the refusals a recorded feed holds read apart from its transactions, newest first, each in the runtime's own words", async () => {
  const feed = answerOf(projectTransactionsFromTheResourceText(await recordedAnswerText("local-api-transactions-resource-of-lobby-after-sam-redid-and-claude-code-undid.json")));

  expect(feed.refused_actions).toEqual([
    {
      author_kind: "person",
      author_name: "Sam",
      mode: "commit",
      operations: [],
      idempotency_key: null,
      refusal: { action: "redo", refused_operation_index: null, refused_node: null, refused_link: null, refused_field: null, runtime_words: "Sam has undone nothing that is left to redo" },
      refused_at: "2026-11-10T18:17:13Z",
    },
    {
      author_kind: "person",
      author_name: "Sam",
      mode: "commit",
      operations: [],
      idempotency_key: null,
      refusal: { action: "undo", refused_operation_index: null, refused_node: null, refused_link: null, refused_field: null, runtime_words: "Sam has no transaction left to undo" },
      refused_at: "2026-11-10T18:17:12Z",
    },
  ]);
});

test("an edit whose author edited again after undoing it reads as no longer redoable, with every redo of it", async () => {
  const feed = answerOf(projectTransactionsFromTheResourceText(await recordedAnswerText("local-api-transactions-resource-of-lobby-after-sam-undid-their-redo-and-renamed-the-project.json")));
  const undoStateOf = (transaction: string) => feed.transactions.find((applied) => applied.transaction === transaction)?.undo_state;

  expect(feed.transactions[0]).toMatchObject({ author_name: "Sam", operations: [{ operation: "set_project_name", from: "lobby", to: "Lobby screens" }], undo_state: "applied" });
  expect(undoStateOf(SAMS_IMPORT)).toBe("undone_not_redoable");
  expect(feed.transactions.filter((applied) => applied.redoes === SAMS_IMPORT).map((redo) => redo.undo_state)).toEqual(["undone_not_redoable"]);
  expect(undoStateOf(CLAUDES_IMPORT)).toBe("undone_redoable");
});

test("the transaction a recorded undo and redo answer is read with its lineage", async () => {
  const undone = answerOf(projectTransactionFromTheUndoOrRedoToolResult("undo", await recordedAnswerText("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json")));
  const redone = answerOf(projectTransactionFromTheUndoOrRedoToolResult("redo", await recordedAnswerText("local-api-redo-tool-result-of-sam-redoing-their-import-into-lobby.json")));

  expect(undone).toMatchObject({ author_kind: "person", author_name: "Sam", undoes: SAMS_IMPORT, redoes: null, undo_state: null });
  expect(redone).toMatchObject({ redoes: SAMS_IMPORT, undoes: null, undo_state: "applied", operations: [{ operation: "import_asset" }] });
});

test("list_assets names the project's change feed", async () => {
  const uri = answerOf(transactionsResourceUriFromTheListAssetsToolResult(await recordedAnswerText("local-api-list-assets-tool-result-of-the-project-lobby-naming-its-transactions-resource.json")));
  expect(uri).toBe(`streamlib://project/${PROJECT}/transactions`);
});

test("a refused graph edit reads with the node, link and field it names", () => {
  const link = { source: { node: "n1", port: "video_to_downstream" }, target: { node: "n2", port: "video_from_upstream" } };
  const feed = answerOf(
    projectTransactionsFromTheResourceText(
      JSON.stringify({
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
            refusal: { action: "transact", refused_operation_index: 0, refused_node: "n2", refused_link: link, refused_field: "video_from_upstream", runtime_words: "the words" },
            refused_at: "2026-11-10T18:00:00Z",
          },
        ],
      }),
    ),
  );
  expect(feed.transactions).toEqual([]);
  expect(feed.refused_actions[0]).toMatchObject({ mode: "live", idempotency_key: "k1", refusal: { refused_operation_index: 0, refused_node: "n2", refused_link: link, refused_field: "video_from_upstream" } });
});

test("a change feed or undo result missing what it must carry is not read", () => {
  expect(projectTransactionsFromTheResourceText('{"project":"p","project_directory":"/d"}')).toEqual({ ok: false, failure: expect.stringMatching(/^the project's change feed could not be read: .*transactions/) });
  expect(projectTransactionFromTheUndoOrRedoToolResult("redo", '{"format_version":2,"transaction":"t"}')).toEqual({ ok: false, failure: expect.stringMatching(/^the runtime's redo result could not be read: .*commit/) });
  expect(transactionsResourceUriFromTheListAssetsToolResult('{"assets":[]}')).toEqual({ ok: false, failure: expect.stringMatching(/^the runtime's list_assets result names no change feed: /) });
  expect(projectTransactionsFromTheResourceText('{"project":"p","project_directory":"/d","transactions":[{"status":"pending"}]}')).toEqual({ ok: false, failure: expect.stringMatching(/`status` is `pending`/) });
  expect(projectTransactionsFromTheResourceText('{"project":"p","project_directory":"/d","transactions":[{"transaction":"t"}]}')).toEqual({ ok: false, failure: expect.stringMatching(/`status`/) });
  const appliedWithAnUnknownUndoState = { status: "applied", format_version: 2, transaction: "t", commit: "c", author_kind: "person", author_name: "Sam", operations: [], inverse_operations: [], undo_state: "parked", applied_at: "x" };
  expect(projectTransactionsFromTheResourceText(JSON.stringify({ project: "p", project_directory: "/d", transactions: [appliedWithAnUnknownUndoState] }))).toEqual({ ok: false, failure: expect.stringMatching(/`undo_state` is `parked`/) });
});
