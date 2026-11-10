import { expect, test } from "vitest";
import { MockProjectTransactions } from "./mock_project_transactions";
import type { ProjectTransactionsReading } from "../src/shared/tatolab_backend_contract";

const SAM = { kind: "person", name: "Sam" } as const;
const CLAUDE = { kind: "agent", name: "claude-code" } as const;

function transactionsOf(reading: ProjectTransactionsReading) {
  return reading.kind === "read" ? reading.project_transactions.transactions : expect.unreachable(reading.because);
}

test("undo and redo follow the runtime's per-author rule, each a transaction of its own told to every listener", () => {
  const history = new MockProjectTransactions("p", "/w/pattern", "edited");
  const readingsHeard: ProjectTransactionsReading[] = [];
  history.onChanged((reading) => readingsHeard.push(reading));
  const [samsUndo, , , samsRename] = transactionsOf(history.read());

  const samsRedo = history.redo(SAM);
  expect(samsRedo.redoes).toBe(samsUndo?.undoes);
  const undoneAgain = history.undo(SAM);
  expect(undoneAgain.undoes).toBe(samsRedo.transaction);
  expect(history.undo(SAM).undoes).toBe(samsRename?.transaction);
  const claudesUndo = history.undo(CLAUDE);
  expect(claudesUndo).toMatchObject({ author_kind: "agent", author_name: "claude-code" });
  expect(() => history.undo(CLAUDE)).toThrow("undo failed: claude-code has no transaction left to undo");
  expect(transactionsOf(readingsHeard.at(-1) ?? history.read())[0]?.transaction).toBe(claudesUndo.transaction);
  expect(readingsHeard).toHaveLength(4);
});

test("an empty history has nothing to undo or redo, in the runtime's words", () => {
  const history = new MockProjectTransactions("p", "/w/pattern", "empty");
  expect(transactionsOf(history.read())).toEqual([]);
  expect(() => history.undo(SAM)).toThrow("undo failed: Sam has no transaction left to undo");
  expect(() => history.redo(SAM)).toThrow("redo failed: Sam has undone nothing that is left to redo");
});
