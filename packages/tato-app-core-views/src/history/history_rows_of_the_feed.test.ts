import type { JsonValue, ProjectTransaction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { historyRowsOfTheFeed, historyStepsToTheRow, nodeNamesTheFeedGives, theStepReachedItsEdit, type HistoryRow } from "./history_rows_of_the_feed";

const STREAM = "30c076a8-91cc-4340-9e15-9b89ca6c0b45";
const INVERT = "7d1f0c2a-1111-4c1d-8e55-000000000001";
const METER = "7d1f0c2a-2222-4c1d-8e55-000000000002";
const DISPLAY = "7d1f0c2a-3333-4c1d-8e55-000000000003";
const SAM = { kind: "person", name: "Sam" } as const;
const CLAUDE = { kind: "agent", name: "claude-code" } as const;
const THE_RUNTIME = { kind: "runtime", name: "tatolab" };

let transactionsMade = 0;

function transaction(author: { kind: string; name: string }, operations: JsonValue[], lineage: { undoes?: string; redoes?: string } = {}): ProjectTransaction {
  transactionsMade += 1;
  return {
    transaction: `t${transactionsMade}`,
    commit: `c${transactionsMade}`,
    parent_commit: null,
    author_kind: author.kind,
    author_name: author.name,
    operations,
    inverse_operations: [],
    undoes: lineage.undoes ?? null,
    redoes: lineage.redoes ?? null,
    applied_at: null,
  };
}

/** A project edited by Sam, claude-code and the runtime, oldest first. */
function anEditedProject() {
  const warmLut = { asset: "a1", kind: "data", path: "media/warm.cube", content_sha256: "9f", content_byte_len: 75, import_settings: {} };
  const imported = transaction(SAM, [{ operation: "import_asset", asset: warmLut }]);
  const refreshed = transaction(THE_RUNTIME, [{ stream: STREAM, operation: "refresh_fragment", node: "f1", from: { type: "nodes.mic:MicLevels", config: {} }, to: { type: "nodes.mic:MicLevels", config: {} } }]);
  const renamed = transaction(SAM, [{ stream: STREAM, operation: "rename_node", node: INVERT, from: "invert", to: "invertingeffect" }]);
  const meter = { id: METER, name: "brightnessmeter", type: "nodes.brightness_meter:BrightnessMeter", config: {} };
  const link = { source: { node: INVERT, port: "video_to_downstream" }, target: { node: METER, port: "video_from_upstream" } };
  const added = transaction(CLAUDE, [
    { stream: STREAM, operation: "add_node", node: meter, links: [] },
    { stream: STREAM, operation: "connect", link },
  ]);
  const fitted = transaction(SAM, [{ stream: STREAM, operation: "set_node_config", node: DISPLAY, from: { title: "Tatolab", scaling: "fill" }, to: { title: "Tatolab", scaling: "fit" } }]);
  return { imported, refreshed, renamed, added, fitted };
}

function newestFirst(...transactions: ProjectTransaction[]): ProjectTransaction[] {
  return [...transactions].reverse();
}

function sentenceOf(row: HistoryRow): string {
  return [row.what.lead, row.what.subject, row.what.rest].filter((words) => words !== null && words !== "").join(" ");
}

test("each edit is a row, newest first, naming who made it and what it changed, its nodes by the names the graph gives", () => {
  const { imported, refreshed, renamed, added, fitted } = anEditedProject();
  const feed = newestFirst(imported, refreshed, renamed, added, fitted);
  const nodeNames = new Map([...nodeNamesTheFeedGives(feed), [DISPLAY, "displaywindow"]]);

  const rows = historyRowsOfTheFeed(feed, nodeNames);

  expect(rows.map((row) => [row.who, sentenceOf(row), row.is_undone])).toEqual([
    ["Sam", "Set displaywindow scaling to fit", false],
    ["claude-code (agent)", "Added brightnessmeter and 1 more change", false],
    ["Sam", "Renamed invert to invertingeffect", false],
    ["Runtime", "Refreshed MicLevels from its code", false],
    ["Sam", "Imported warm.cube", false],
  ]);
  expect(rows[0]?.operation_lines).toEqual(["set_node_config scaling fill → fit"]);
  expect(rows[1]?.operation_lines).toEqual(["add_node BrightnessMeter", "connect invertingeffect.video_to_downstream → brightnessmeter.video_from_upstream"]);
});

test("an undo dims the edit it reverses and is no row of its own; a redo brightens it again", () => {
  const { imported, refreshed, renamed, added, fitted } = anEditedProject();
  const fittedUndone = transaction(SAM, [], { undoes: fitted.transaction });
  const renamedUndone = transaction(SAM, [], { undoes: renamed.transaction });
  const undoneRows = historyRowsOfTheFeed(newestFirst(imported, refreshed, renamed, added, fitted, fittedUndone, renamedUndone), new Map());
  expect(undoneRows.map((row) => [row.transaction, row.is_undone])).toEqual([
    [fitted.transaction, true],
    [added.transaction, false],
    [renamed.transaction, true],
    [refreshed.transaction, false],
    [imported.transaction, false],
  ]);

  const renamedRedone = transaction(SAM, [], { redoes: renamed.transaction });
  const redoneRows = historyRowsOfTheFeed(newestFirst(imported, refreshed, renamed, added, fitted, fittedUndone, renamedUndone, renamedRedone), new Map());
  expect(redoneRows.filter((row) => row.is_undone).map((row) => row.transaction)).toEqual([fitted.transaction]);
});

test("an author's undone rows stay until that author edits again, and another author's edit leaves them", () => {
  const { imported, refreshed, renamed, added, fitted } = anEditedProject();
  const fittedUndone = transaction(SAM, [], { undoes: fitted.transaction });
  const claudesNextEdit = transaction(CLAUDE, [{ stream: STREAM, operation: "rename_node", node: METER, from: "brightnessmeter", to: "meter" }]);
  const samsNextEdit = transaction(SAM, [{ stream: STREAM, operation: "rename_node", node: INVERT, from: "invertingeffect", to: "invert" }]);

  const afterClaudeEdits = historyRowsOfTheFeed(newestFirst(imported, refreshed, renamed, added, fitted, fittedUndone, claudesNextEdit), new Map());
  expect(afterClaudeEdits.find((row) => row.transaction === fitted.transaction)?.is_undone).toBe(true);

  const afterSamEdits = historyRowsOfTheFeed(newestFirst(imported, refreshed, renamed, added, fitted, fittedUndone, claudesNextEdit, samsNextEdit), new Map());
  expect(afterSamEdits.map((row) => row.transaction)).not.toContain(fitted.transaction);
});

test("choosing an earlier row undoes every later edit still applied, newest first, each by its own author", () => {
  const { imported, refreshed, renamed, added, fitted } = anEditedProject();
  const rows = historyRowsOfTheFeed(newestFirst(imported, refreshed, renamed, added, fitted), new Map());

  expect(historyStepsToTheRow(rows, renamed.transaction)).toEqual({
    kind: "steps",
    steps: [
      { undo_or_redo: "undo", author: SAM, transaction: fitted.transaction },
      { undo_or_redo: "undo", author: CLAUDE, transaction: added.transaction },
    ],
  });
  expect(historyStepsToTheRow(rows, fitted.transaction)).toEqual({ kind: "steps", steps: [] });
  expect(historyStepsToTheRow(rows, imported.transaction)).toEqual({ kind: "unreachable", because: "The runtime's own edit after it (Refreshed MicLevels from its code) can't be undone." });
});

test("choosing a dimmed row redoes it and every undone row before it, oldest first", () => {
  const { imported, refreshed, renamed, added, fitted } = anEditedProject();
  const fittedUndone = transaction(SAM, [], { undoes: fitted.transaction });
  const addedUndone = transaction(CLAUDE, [], { undoes: added.transaction });
  const rows = historyRowsOfTheFeed(newestFirst(imported, refreshed, renamed, added, fitted, fittedUndone, addedUndone), new Map());

  expect(historyStepsToTheRow(rows, fitted.transaction)).toEqual({
    kind: "steps",
    steps: [
      { undo_or_redo: "redo", author: CLAUDE, transaction: added.transaction },
      { undo_or_redo: "redo", author: SAM, transaction: fitted.transaction },
    ],
  });
  expect(historyStepsToTheRow(rows, added.transaction)).toEqual({ kind: "steps", steps: [{ undo_or_redo: "redo", author: CLAUDE, transaction: added.transaction }] });
});

test("a step reached its edit when the answer reverses it, or a redo of it, and not when it reverses another", () => {
  const { renamed, fitted } = anEditedProject();
  const renamedUndone = transaction(SAM, [], { undoes: renamed.transaction });
  const renamedRedone = transaction(SAM, [], { redoes: renamed.transaction });
  const feed = newestFirst(renamed, fitted, renamedUndone, renamedRedone);
  const undoTheRename = { undo_or_redo: "undo" as const, author: SAM, transaction: renamed.transaction };

  expect(theStepReachedItsEdit(undoTheRename, transaction(SAM, [], { undoes: renamedRedone.transaction }), feed)).toBe(true);
  expect(theStepReachedItsEdit(undoTheRename, transaction(SAM, [], { undoes: fitted.transaction }), feed)).toBe(false);
});
