// The mock's change feed for its open project: a few transactions by the person, an agent and the
// runtime, newest first, as the runtime's `streamlib://project/<project>/transactions` resource
// holds them. Undo and redo follow the runtime's per-author rule (`what_the_author_can_undo_and_redo`
// in streamlib's project repository): an author's edits are undone newest first, an undo can be
// redone until that author's next edit, and every undo and redo is a transaction of its own.
// `?history=empty` opens a project with no transactions.

import type { JsonValue, ProjectTransaction, ProjectTransactionAuthor, ProjectTransactions, ProjectTransactionsReading } from "../src/shared/tatolab_backend_contract";

/** What `?history=` names. */
export type MockProjectHistoryScenario = "edited" | "empty";

/** The scenario `?history=` names: `edited` unless it names `empty`. */
export function mockProjectHistoryScenarioNamed(historyInTheQuery: string | null): MockProjectHistoryScenario {
  return historyInTheQuery === "empty" ? "empty" : "edited";
}

const MOCK_MAIN_STREAM = "pattern-main-1a2b3c";

function mockTransaction(
  number: number,
  author: { kind: string; name: string },
  operations: JsonValue[],
  inverseOperations: JsonValue[],
  lineage: { undoes?: string; redoes?: string } = {},
): ProjectTransaction {
  const hex = number.toString(16).padStart(4, "0");
  return {
    transaction: `5b0e${hex}-0000-4000-8000-00000000${hex}`,
    commit: `c0ffee${hex}`.padEnd(40, "0"),
    parent_commit: number === 1 ? null : `c0ffee${(number - 1).toString(16).padStart(4, "0")}`.padEnd(40, "0"),
    author_kind: author.kind,
    author_name: author.name,
    operations,
    inverse_operations: inverseOperations,
    undoes: lineage.undoes ?? null,
    redoes: lineage.redoes ?? null,
    applied_at: new Date(Date.UTC(2026, 10, 9, 18, 0) + number * 7 * 60_000).toISOString(),
  };
}

const YOU = { kind: "person", name: "Sam" };
const CLAUDE = { kind: "agent", name: "claude-code" };
const THE_RUNTIME = { kind: "runtime", name: "tatolab" };

/** The mock project's transactions, oldest first. */
function mockTransactionsOldestFirst(): ProjectTransaction[] {
  const imported = mockTransaction(
    1,
    YOU,
    [{ operation: "import_asset", asset: "a1", asset_path: "media/warm.cube" }],
    [{ operation: "delete_asset", asset: "a1" }],
  );
  const refreshed = mockTransaction(
    2,
    THE_RUNTIME,
    [{ operation: "refresh_fragment", stream: MOCK_MAIN_STREAM, node: "f1", name: "mic_levels" }],
    [{ operation: "refresh_fragment", stream: MOCK_MAIN_STREAM, node: "f1", name: "mic_levels" }],
  );
  const renamed = mockTransaction(
    3,
    YOU,
    [{ operation: "rename_node", stream: MOCK_MAIN_STREAM, node: "7f3a", name: "camera" }],
    [{ operation: "rename_node", stream: MOCK_MAIN_STREAM, node: "7f3a", name: "camera_source" }],
  );
  const added = mockTransaction(
    4,
    CLAUDE,
    [
      { operation: "add_node", stream: MOCK_MAIN_STREAM, node: "9c41", name: "loudness", type: "LoudnessMeter" },
      { operation: "connect", stream: MOCK_MAIN_STREAM, from: { node: "9c41", port: "level" }, to: { node: "4d2e", port: "level" } },
    ],
    [
      { operation: "disconnect", stream: MOCK_MAIN_STREAM, from: { node: "9c41", port: "level" }, to: { node: "4d2e", port: "level" } },
      { operation: "remove_node", stream: MOCK_MAIN_STREAM, node: "9c41" },
    ],
  );
  const softened = mockTransaction(
    5,
    YOU,
    [{ operation: "set_node_config", stream: MOCK_MAIN_STREAM, node: "4d2e", key: "softness", value: 0.64 }],
    [{ operation: "set_node_config", stream: MOCK_MAIN_STREAM, node: "4d2e", key: "softness", value: 0.42 }],
  );
  const softenedUndone = mockTransaction(6, YOU, softened.inverse_operations, softened.operations, { undoes: softened.transaction });
  return [imported, refreshed, renamed, added, softened, softenedUndone];
}

function lastPositionOf(transactions: readonly ProjectTransaction[], transaction: string): number {
  for (let position = transactions.length - 1; position >= 0; position -= 1) if (transactions[position]?.transaction === transaction) return position;
  return -1;
}

function isTheAuthor(transaction: ProjectTransaction, author: ProjectTransactionAuthor): boolean {
  return transaction.author_kind === author.kind && transaction.author_name === author.name;
}

/** The mock project's change feed, and its undo and redo. */
export class MockProjectTransactions {
  private readonly transactionsOldestFirst: ProjectTransaction[];
  private readonly listeners = new Set<(reading: ProjectTransactionsReading) => void>();

  constructor(
    private readonly project: string,
    private readonly projectDirectory: string,
    scenario: MockProjectHistoryScenario,
  ) {
    this.transactionsOldestFirst = scenario === "empty" ? [] : mockTransactionsOldestFirst();
  }

  /** The feed as the runtime's resource holds it. */
  read(): ProjectTransactionsReading {
    const projectTransactions: ProjectTransactions = { project: this.project, project_directory: this.projectDirectory, transactions: [...this.transactionsOldestFirst].reverse() };
    return { kind: "read", project_transactions: structuredClone(projectTransactions) };
  }

  /** Calls `listener` with the feed after each transaction; the answer stops it. */
  onChanged(listener: (reading: ProjectTransactionsReading) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Undo `author`'s latest transaction not undone yet, in the runtime's words when there is none. */
  undo(author: ProjectTransactionAuthor): ProjectTransaction {
    const undone = this.whatTheAuthorCanUndoAndRedo(author).undoable.at(-1);
    if (undone === undefined) throw `undo failed: ${author.name} has nothing to undo`;
    return this.apply(author, undone.inverse_operations, undone.operations, { undoes: undone.transaction });
  }

  /** Redo what `author`'s latest undo reversed, in the runtime's words when there is none. */
  redo(author: ProjectTransactionAuthor): ProjectTransaction {
    const redone = this.whatTheAuthorCanUndoAndRedo(author).redoable.at(-1);
    if (redone === undefined) throw `redo failed: ${author.name} has nothing to redo`;
    return this.apply(author, redone.operations, redone.inverse_operations, { redoes: redone.transaction });
  }

  private apply(author: ProjectTransactionAuthor, operations: JsonValue[], inverseOperations: JsonValue[], lineage: { undoes?: string; redoes?: string }): ProjectTransaction {
    const applied = mockTransaction(this.transactionsOldestFirst.length + 1, author, operations, inverseOperations, lineage);
    this.transactionsOldestFirst.push(applied);
    const reading = this.read();
    for (const listener of this.listeners) listener(structuredClone(reading));
    return structuredClone(applied);
  }

  private whatTheAuthorCanUndoAndRedo(author: ProjectTransactionAuthor): { undoable: ProjectTransaction[]; redoable: ProjectTransaction[] } {
    const undoable: ProjectTransaction[] = [];
    const redoable: ProjectTransaction[] = [];
    for (const transaction of this.transactionsOldestFirst) {
      if (!isTheAuthor(transaction, author)) continue;
      if (transaction.undoes !== null) {
        const position = lastPositionOf(undoable, transaction.undoes);
        if (position !== -1) redoable.push(...undoable.splice(position, 1));
      } else if (transaction.redoes !== null) {
        const position = lastPositionOf(redoable, transaction.redoes);
        if (position !== -1) {
          redoable.splice(position, 1);
          undoable.push(transaction);
        }
      } else {
        redoable.length = 0;
        undoable.push(transaction);
      }
    }
    return { undoable, redoable };
  }
}
