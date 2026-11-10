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

test("a recorded change feed reads newest first, each transaction naming its author and what it undoes or redoes", async () => {
  const feed = answerOf(projectTransactionsFromTheResourceText(await recordedAnswerText("local-api-transactions-resource-of-lobby-after-sam-redid-and-claude-code-undid.json")));

  expect(feed.project).toBe("f87f7e2e-aebf-4678-b2be-c7396a592732");
  expect(feed.transactions.map((transaction) => [transaction.author_kind, transaction.author_name, transaction.undoes?.slice(0, 8) ?? null, transaction.redoes?.slice(0, 8) ?? null])).toEqual([
    ["agent", "claude-code", "c64576f0", null],
    ["person", "Sam", null, "7680e08a"],
    ["person", "Sam", "7680e08a", null],
    ["agent", "claude-code", null, null],
    ["person", "Sam", null, null],
  ]);
  expect(feed.transactions[4]?.operations).toMatchObject([{ operation: "import_asset", asset: { path: "media/warm.cube" } }]);
  expect(feed.transactions[4]?.applied_at).toBeNull();
});

test("the transaction a recorded undo and redo answer is read with its lineage", async () => {
  const undone = answerOf(projectTransactionFromTheUndoOrRedoToolResult("undo", await recordedAnswerText("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json")));
  const redone = answerOf(projectTransactionFromTheUndoOrRedoToolResult("redo", await recordedAnswerText("local-api-redo-tool-result-of-sam-redoing-their-import-into-lobby.json")));

  expect(undone).toMatchObject({ author_kind: "person", author_name: "Sam", redoes: null });
  expect(undone.undoes).toMatch(/^7680e08a-/);
  expect(redone.redoes).toBe(undone.undoes);
  expect(redone.operations).toMatchObject([{ operation: "import_asset" }]);
});

test("list_assets names the project's change feed", async () => {
  const uri = answerOf(transactionsResourceUriFromTheListAssetsToolResult(await recordedAnswerText("local-api-list-assets-tool-result-of-the-project-lobby-naming-its-transactions-resource.json")));
  expect(uri).toBe("streamlib://project/f87f7e2e-aebf-4678-b2be-c7396a592732/transactions");
});

test("a change feed or undo result missing what it must carry is not read", () => {
  expect(projectTransactionsFromTheResourceText('{"project":"p","project_directory":"/d"}')).toEqual({ ok: false, failure: expect.stringMatching(/^the project's change feed could not be read: .*transactions/) });
  expect(projectTransactionFromTheUndoOrRedoToolResult("redo", '{"transaction":"t"}')).toEqual({ ok: false, failure: expect.stringMatching(/^the runtime's redo result could not be read: .*commit/) });
  expect(transactionsResourceUriFromTheListAssetsToolResult('{"assets":[]}')).toEqual({ ok: false, failure: expect.stringMatching(/^the runtime's list_assets result names no change feed: /) });
});
