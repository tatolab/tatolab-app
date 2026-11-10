// The mock's change feed for its open project: a few transactions by the person, an agent and the
// runtime, on its `main` stream, newest first, as the runtime's `streamlib://project/<project>/transactions` resource
// holds them. Undo and redo follow the runtime's per-author rule (`what_the_author_can_undo_and_redo`
// in streamlib's project repository): an author's edits are undone newest first, an undo can be
// redone until that author's next edit, and every undo and redo is a transaction of its own.
// `?history=empty` opens a project with no transactions.

import { mockNodeIdOf, mockStreamIdOf, mockStreamLocationOf } from "./mock_stream_fixtures";
import type { JsonValue, ProjectTransaction, ProjectTransactionAuthor, ProjectTransactions, ProjectTransactionsReading } from "../src/shared/tatolab_backend_contract";

/** What `?history=` names. */
export type MockProjectHistoryScenario = "edited" | "empty";

/** The scenario `?history=` names: `edited` unless it names `empty`. */
export function mockProjectHistoryScenarioNamed(historyInTheQuery: string | null): MockProjectHistoryScenario {
  return historyInTheQuery === "empty" ? "empty" : "edited";
}

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

/** The mock project's transactions, oldest first, each operation in the shape the runtime records it (`ProjectOperation`): a graph one names its stream by its asset's UUID and its nodes by UUID. */
function mockTransactionsOldestFirst(projectDirectory: string): ProjectTransaction[] {
  const mainStreamAddress = { project_directory: projectDirectory, stream_name: "main" };
  const mainStream = mockStreamLocationOf(mainStreamAddress).stream_asset;
  const mainStreamId = mockStreamIdOf(mainStreamAddress);
  const nodeOf = (nodeName: string) => mockNodeIdOf(mainStreamId, nodeName);
  const warmLut = { asset: "a7c1e0d2-5b3f-4e8a-9d61-0f2c4b8e7a15", kind: "data", path: "media/warm.cube", content_sha256: "9f".repeat(32), content_byte_len: 1_048_576, import_settings: {} };
  const imported = mockTransaction(1, YOU, [{ operation: "import_asset", asset: warmLut }], [{ operation: "delete_asset", asset: warmLut }]);
  const micLevelsBefore = { type: "nodes.mic_levels:mic_levels", config: { bands: 8 }, fragment: { nodes: [], links: [] } };
  const micLevelsAfter = { type: "nodes.mic_levels:mic_levels", config: { bands: 16 }, fragment: { nodes: [], links: [] } };
  const refreshed = mockTransaction(
    2,
    THE_RUNTIME,
    [{ stream: mainStream, operation: "refresh_fragment", node: "e3b0c442-98fc-4c14-9afb-f4c8996fb924", from: micLevelsBefore, to: micLevelsAfter }],
    [{ stream: mainStream, operation: "refresh_fragment", node: "e3b0c442-98fc-4c14-9afb-f4c8996fb924", from: micLevelsAfter, to: micLevelsBefore }],
  );
  const renamed = mockTransaction(
    3,
    YOU,
    [{ stream: mainStream, operation: "rename_node", node: nodeOf("invertingeffect"), from: "invert", to: "invertingeffect" }],
    [{ stream: mainStream, operation: "rename_node", node: nodeOf("invertingeffect"), from: "invertingeffect", to: "invert" }],
  );
  const meter = { id: nodeOf("brightnessmeter"), name: "brightnessmeter", type: "nodes.brightness_meter:BrightnessMeter", config: {} };
  const meterLinks = [{ source: { node: nodeOf("invertingeffect"), port: "video_to_downstream" }, target: { node: meter.id, port: "video_from_upstream" } }];
  const added = mockTransaction(4, CLAUDE, [{ stream: mainStream, operation: "add_node", node: meter, links: meterLinks }], [{ stream: mainStream, operation: "remove_node", node: meter, links: meterLinks }]);
  const fitted = mockTransaction(
    5,
    YOU,
    [{ stream: mainStream, operation: "set_node_config", node: nodeOf("displaywindow"), from: { title: "Tatolab", scaling: "fill" }, to: { title: "Tatolab", scaling: "fit" } }],
    [{ stream: mainStream, operation: "set_node_config", node: nodeOf("displaywindow"), from: { title: "Tatolab", scaling: "fit" }, to: { title: "Tatolab", scaling: "fill" } }],
  );
  const fittedUndone = mockTransaction(6, YOU, fitted.inverse_operations, fitted.operations, { undoes: fitted.transaction });
  return [imported, refreshed, renamed, added, fitted, fittedUndone];
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
    this.transactionsOldestFirst = scenario === "empty" ? [] : mockTransactionsOldestFirst(projectDirectory);
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
    if (undone === undefined) throw `undo failed: ${author.name} has no transaction left to undo`;
    return this.apply(author, undone.inverse_operations, undone.operations, { undoes: undone.transaction });
  }

  /** Redo what `author`'s latest undo reversed, in the runtime's words when there is none. */
  redo(author: ProjectTransactionAuthor): ProjectTransaction {
    const redone = this.whatTheAuthorCanUndoAndRedo(author).redoable.at(-1);
    if (redone === undefined) throw `redo failed: ${author.name} has undone nothing that is left to redo`;
    return this.apply(author, redone.operations, redone.inverse_operations, { redoes: redone.transaction });
  }

  /** Record a graph transaction `author` applied, with what undoes it. */
  record(author: ProjectTransactionAuthor, operations: JsonValue[], inverseOperations: JsonValue[]): ProjectTransaction {
    return this.apply(author, operations, inverseOperations, {});
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
