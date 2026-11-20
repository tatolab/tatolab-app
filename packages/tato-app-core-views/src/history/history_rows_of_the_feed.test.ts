import type { JsonValue, ProjectTransaction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { historyRowsOfTheFeed, historyStepsToTheRow, nodeNamesTheFeedGives, theStepReachedItsEdit, type HistoryRow } from "./history_rows_of_the_feed";

const STREAM = "30c076a8-91cc-4340-9e15-9b89ca6c0b45";
const KALEIDOSCOPE = "7d1f0c2a-1111-4c1d-8e55-000000000001";
const GLOW_BLUR = "7d1f0c2a-2222-4c1d-8e55-000000000002";
const CLICK = "7d1f0c2a-3333-4c1d-8e55-000000000003";
const SAM = { kind: "person", name: "Sam" } as const;
const CLAUDE = { kind: "agent", name: "claude-code" } as const;
const THE_RUNTIME = { kind: "runtime", name: "tatolab" };
const TATO_STUDIO = { kind: "agent", name: "tatolab-app" };

let transactionsMade = 0;

function transaction(
  author: { kind: string; name: string },
  operations: JsonValue[],
  lineage: { undoes?: string; redoes?: string; undo_state?: string } = {},
): ProjectTransaction {
  transactionsMade += 1;
  return {
    format_version: 2,
    transaction: `t${transactionsMade}`,
    commit: `c${transactionsMade}`,
    parent_commit: null,
    author_kind: author.kind,
    author_name: author.name,
    operations,
    inverse_operations: [],
    undoes: lineage.undoes ?? null,
    redoes: lineage.redoes ?? null,
    idempotency_key: null,
    undo_state: lineage.undoes === undefined ? (lineage.undo_state ?? "applied") : null,
    applied_at: `2026-11-10T18:${String(transactionsMade % 60).padStart(2, "0")}:00Z`,
  };
}

/** A project edited by Sam, claude-code and the runtime, oldest first. */
function anEditedProject() {
  const warmLut = { asset: "a1", kind: "data", path: "media/warm.cube", content_sha256: "9f", content_byte_len: 75, import_settings: {} };
  const imported = transaction(SAM, [{ operation: "import_asset", asset: warmLut }]);
  const refreshed = transaction(THE_RUNTIME, [{ stream: STREAM, operation: "refresh_fragment", node: "f1", from: { type: "nodes.mic:MicLevels", config: {} }, to: { type: "nodes.mic:MicLevels", config: {} } }]);
  const renamed = transaction(SAM, [{ stream: STREAM, operation: "rename_node", node: KALEIDOSCOPE, from: "fold", to: "kaleidoscope" }]);
  const glowBlur = { id: GLOW_BLUR, name: "glowblur", type: "nodes.looks:GlowBlur", config: {} };
  const link = { source: { node: KALEIDOSCOPE, port: "result" }, target: { node: GLOW_BLUR, port: "image" } };
  const added = transaction(CLAUDE, [
    { stream: STREAM, operation: "add_node", node: glowBlur, links: [] },
    { stream: STREAM, operation: "connect", link },
  ]);
  const quieter = transaction(SAM, [{ stream: STREAM, operation: "set_node_config", node: CLICK, from: { volume: 0.8, pitch: 880 }, to: { volume: 0.4, pitch: 880 } }]);
  return { imported, refreshed, renamed, added, quieter };
}

function newestFirst(...transactions: ProjectTransaction[]): ProjectTransaction[] {
  return [...transactions].reverse();
}

function sentenceOf(row: HistoryRow): string {
  return [row.what.lead, row.what.subject, row.what.rest].filter((words) => words !== null && words !== "").join(" ");
}

test("each edit is a row, newest first, naming who made it and what it changed, its nodes by the names the graph gives", () => {
  const { imported, refreshed, renamed, added, quieter } = anEditedProject();
  const feed = newestFirst(imported, refreshed, renamed, added, quieter);
  const nodeNames = new Map([...nodeNamesTheFeedGives(feed), [CLICK, "click"]]);

  const rows = historyRowsOfTheFeed(feed, nodeNames);

  expect(rows.map((row) => [row.who, sentenceOf(row), row.is_undone])).toEqual([
    ["Sam", "Set click volume to 0.4", false],
    ["claude-code (agent)", "Added glowblur and linked it to kaleidoscope.result", false],
    ["Sam", "Renamed fold to kaleidoscope", false],
    ["Runtime", "Refreshed MicLevels from its code", false],
    ["Sam", "Imported warm.cube", false],
  ]);
  expect(rows[0]?.operation_lines).toEqual(["set_node_config volume 0.8 → 0.4"]);
  expect(rows[1]?.operation_lines).toEqual(["add_node GlowBlur", "connect kaleidoscope.result → glowblur.image"]);
});

/** `transaction` as the runtime serves it once its author's undo and redo stand at `undoState`. */
function standingAt(edit: ProjectTransaction, undoState: string): ProjectTransaction {
  return { ...edit, undo_state: undoState };
}

test("an edit the runtime holds undone and redoable is dimmed, an undo or a redo is no row of its own, and one no longer redoable is gone", () => {
  const { imported, refreshed, renamed, added, quieter } = anEditedProject();
  const quieterUndone = transaction(SAM, [], { undoes: quieter.transaction });
  const renamedUndone = transaction(SAM, [], { undoes: renamed.transaction });
  const renamedRedone = transaction(SAM, [], { redoes: renamed.transaction });
  const rows = historyRowsOfTheFeed(
    newestFirst(standingAt(imported, "undone_not_redoable"), refreshed, renamed, added, standingAt(quieter, "undone_redoable"), quieterUndone, renamedUndone, renamedRedone),
    new Map(),
  );

  expect(rows.map((row) => [row.transaction, row.is_undone])).toEqual([
    [quieter.transaction, true],
    [added.transaction, false],
    [renamed.transaction, false],
    [refreshed.transaction, false],
  ]);
});

test("an edit made in Tato Studio, recorded under its MCP client name, is yours, shown as a person's and undone as the agent history records", () => {
  const described = transaction(TATO_STUDIO, [{ operation: "set_project_description", from: null, to: "The lobby screens" }]);
  const rows = historyRowsOfTheFeed([described], new Map());

  expect(rows.map((row) => [row.who, row.shown_author_kind, row.author_kind, row.author_name, row.applied_at])).toEqual([["You", "person", "agent", "tatolab-app", described.applied_at]]);
});

test("choosing an earlier row undoes every later edit still applied, newest first, each by its own author", () => {
  const { imported, refreshed, renamed, added, quieter } = anEditedProject();
  const rows = historyRowsOfTheFeed(newestFirst(imported, refreshed, renamed, added, quieter), new Map());

  expect(historyStepsToTheRow(rows, renamed.transaction)).toEqual({
    kind: "steps",
    steps: [
      { undo_or_redo: "undo", author: SAM, transaction: quieter.transaction },
      { undo_or_redo: "undo", author: CLAUDE, transaction: added.transaction },
    ],
  });
  expect(historyStepsToTheRow(rows, quieter.transaction)).toEqual({ kind: "steps", steps: [] });
  expect(historyStepsToTheRow(rows, imported.transaction)).toEqual({ kind: "unreachable", because: "The runtime's own edit after it (Refreshed MicLevels from its code) can't be undone." });
});

test("choosing a dimmed row redoes it and every undone row before it, oldest first", () => {
  const { imported, refreshed, renamed, added, quieter } = anEditedProject();
  const quieterUndone = transaction(SAM, [], { undoes: quieter.transaction });
  const addedUndone = transaction(CLAUDE, [], { undoes: added.transaction });
  const rows = historyRowsOfTheFeed(newestFirst(imported, refreshed, renamed, standingAt(added, "undone_redoable"), standingAt(quieter, "undone_redoable"), quieterUndone, addedUndone), new Map());

  expect(historyStepsToTheRow(rows, quieter.transaction)).toEqual({
    kind: "steps",
    steps: [
      { undo_or_redo: "redo", author: CLAUDE, transaction: added.transaction },
      { undo_or_redo: "redo", author: SAM, transaction: quieter.transaction },
    ],
  });
  expect(historyStepsToTheRow(rows, added.transaction)).toEqual({ kind: "steps", steps: [{ undo_or_redo: "redo", author: CLAUDE, transaction: added.transaction }] });
});

test("a step reached its edit when the answer reverses it, or a redo of it, and not when it reverses another", () => {
  const { renamed, quieter } = anEditedProject();
  const renamedUndone = transaction(SAM, [], { undoes: renamed.transaction });
  const renamedRedone = transaction(SAM, [], { redoes: renamed.transaction });
  const feed = newestFirst(renamed, quieter, renamedUndone, renamedRedone);
  const undoTheRename = { undo_or_redo: "undo" as const, author: SAM, transaction: renamed.transaction };

  expect(theStepReachedItsEdit(undoTheRename, transaction(SAM, [], { undoes: renamedRedone.transaction }), feed)).toBe(true);
  expect(theStepReachedItsEdit(undoTheRename, transaction(SAM, [], { undoes: quieter.transaction }), feed)).toBe(false);
});
