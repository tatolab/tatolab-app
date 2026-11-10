// The History view's rows, from the open project's change feed: one row for each edit, newest first. An undo
// or a redo is no row of its own: it dims or brightens the edit it reverses, following the runtime's per-author
// rule (`what_the_author_can_undo_and_redo` in streamlib's project repository). An author's undone edits stay,
// dimmed, until that author edits again, when the runtime can no longer redo them.

import type { JsonValue, ProjectTransaction, ProjectTransactionAuthor } from "@tatolab/tato-app-view-sdk/studio_readings";
import { whatAnEditChanged, type NodeNamesById } from "./what_an_edit_changed";

/** Studio's own MCP client name, which the runtime records an edit Studio makes under while Studio names no author. */
export const TATO_STUDIO_AGENT_NAME = "tatolab-app";

/** Who made an edit, as a row shows them. */
export type HistoryRowAuthorKind = "person" | "agent" | "runtime";

/** One edit in the History view. */
export interface HistoryRow {
  /** The edit's own transaction, by which the row is chosen. */
  readonly transaction: string;
  readonly author_kind: HistoryRowAuthorKind;
  readonly author_name: string;
  /** The author as the row names them: a person by name, an agent by name and "(agent)", the runtime as "Runtime". */
  readonly who: string;
  /** What it changed, in a sentence, with the node or file it is about named apart so the row can set it bold. */
  readonly what: { readonly lead: string; readonly subject: string | null; readonly rest: string };
  /** Each operation in a line, as the runtime names it. */
  readonly operation_lines: readonly string[];
  /** When the runtime applied the edit, as `applied_at` gives it; `null` from a runtime that gives none. */
  readonly applied_at: string | null;
  /** Undone by its author, and redoable until they edit again. */
  readonly is_undone: boolean;
}

/** One undo or redo, by `author`, that must reverse or reapply `transaction` for History to reach the chosen row. */
export interface HistoryStep {
  readonly undo_or_redo: "undo" | "redo";
  readonly author: ProjectTransactionAuthor;
  readonly transaction: string;
}

/** The steps History takes to reach the row chosen, or why it can't reach it. */
export type HistoryStepsToTheRow = { readonly kind: "steps"; readonly steps: readonly HistoryStep[] } | { readonly kind: "unreachable"; readonly because: string };

interface EditOfTheFeed {
  readonly edit: ProjectTransaction;
  readonly author_key: string;
}

function authorKeyOf(transaction: ProjectTransaction): string {
  return `${transaction.author_kind}\u0000${transaction.author_name}`;
}

function lastPositionOf(transactions: readonly string[], transaction: string): number {
  for (let position = transactions.length - 1; position >= 0; position -= 1) if (transactions[position] === transaction) return position;
  return -1;
}

function authorKindOf(authorKind: string): HistoryRowAuthorKind {
  return authorKind === "person" || authorKind === "agent" ? authorKind : "runtime";
}

/** The author as a row names them. */
export function whoMadeTheEdit(authorKind: string, authorName: string): string {
  if (authorKind === "person") return authorName;
  if (authorKind === "agent") return authorName === TATO_STUDIO_AGENT_NAME ? "Tato Studio" : `${authorName} (agent)`;
  return "Runtime";
}

/** For each transaction of the feed that is an edit or a redo, the edit it applies; and which edits each author can undo and redo now. */
function replayTheFeed(transactionsNewestFirst: readonly ProjectTransaction[]) {
  const editOfTheTransaction = new Map<string, string>();
  const editsOldestFirst: EditOfTheFeed[] = [];
  const undoableByAuthor = new Map<string, string[]>();
  const redoableByAuthor = new Map<string, string[]>();
  for (const transaction of [...transactionsNewestFirst].reverse()) {
    const authorKey = authorKeyOf(transaction);
    const undoable = undoableByAuthor.get(authorKey) ?? [];
    const redoable = redoableByAuthor.get(authorKey) ?? [];
    undoableByAuthor.set(authorKey, undoable);
    redoableByAuthor.set(authorKey, redoable);
    if (transaction.undoes !== null) {
      const position = lastPositionOf(undoable, transaction.undoes);
      if (position !== -1) redoable.push(...undoable.splice(position, 1));
    } else if (transaction.redoes !== null) {
      const position = lastPositionOf(redoable, transaction.redoes);
      const redoneEdit = editOfTheTransaction.get(transaction.redoes);
      if (position !== -1 && redoneEdit !== undefined) {
        redoable.splice(position, 1);
        undoable.push(transaction.transaction);
        editOfTheTransaction.set(transaction.transaction, redoneEdit);
      }
    } else {
      redoable.length = 0;
      undoable.push(transaction.transaction);
      editOfTheTransaction.set(transaction.transaction, transaction.transaction);
      editsOldestFirst.push({ edit: transaction, author_key: authorKey });
    }
  }
  const editsOf = (transactionsByAuthor: Map<string, string[]>) =>
    new Set([...transactionsByAuthor.values()].flat().flatMap((transaction) => editOfTheTransaction.get(transaction) ?? []));
  return { editsOldestFirst, applied: editsOf(undoableByAuthor), undone: editsOf(redoableByAuthor) };
}

/** Every node a feed's operations name, by id, with the name it last had there: `add_node` and `remove_node` carry it, `rename_node` its new one. */
export function nodeNamesTheFeedGives(transactionsNewestFirst: readonly ProjectTransaction[]): NodeNamesById {
  const nodeNames = new Map<string, string>();
  for (const transaction of [...transactionsNewestFirst].reverse()) {
    for (const operation of transaction.operations) {
      if (typeof operation !== "object" || operation === null || Array.isArray(operation)) continue;
      const node: JsonValue | undefined = operation["node"];
      if (operation["operation"] === "rename_node" && typeof node === "string" && typeof operation["to"] === "string") nodeNames.set(node, operation["to"]);
      if (typeof node === "object" && node !== null && !Array.isArray(node) && typeof node["id"] === "string" && typeof node["name"] === "string") nodeNames.set(node["id"], node["name"]);
    }
  }
  return nodeNames;
}

/** The feed's edits as History shows them, newest first, each node named as `nodeNames` names it now. */
export function historyRowsOfTheFeed(transactionsNewestFirst: readonly ProjectTransaction[], nodeNames: NodeNamesById): HistoryRow[] {
  const { editsOldestFirst, applied, undone } = replayTheFeed(transactionsNewestFirst);
  return editsOldestFirst
    .filter(({ edit }) => applied.has(edit.transaction) || undone.has(edit.transaction) || authorKindOf(edit.author_kind) === "runtime")
    .reverse()
    .map(({ edit }) => {
      const whatChanged = whatAnEditChanged(edit.operations, nodeNames);
      return {
        transaction: edit.transaction,
        author_kind: authorKindOf(edit.author_kind),
        author_name: edit.author_name,
        who: whoMadeTheEdit(edit.author_kind, edit.author_name),
        what: whatChanged.what,
        operation_lines: whatChanged.operation_lines,
        applied_at: edit.applied_at,
        is_undone: undone.has(edit.transaction),
      };
    });
}

/**
 * The undos and redos that bring the project to just after `chosenTransaction`'s row: every later edit still applied is
 * undone, newest first, by its own author; an undone row chosen is redone, with every undone row before it, oldest first.
 */
export function historyStepsToTheRow(rowsNewestFirst: readonly HistoryRow[], chosenTransaction: string): HistoryStepsToTheRow {
  const chosenPosition = rowsNewestFirst.findIndex((row) => row.transaction === chosenTransaction);
  const chosenRow = rowsNewestFirst[chosenPosition];
  if (chosenRow === undefined) return { kind: "unreachable", because: "That edit is no longer in the project's history." };
  const stepOf = (undoOrRedo: "undo" | "redo", row: HistoryRow): HistoryStep => ({
    undo_or_redo: undoOrRedo,
    author: { kind: row.author_kind === "person" ? "person" : "agent", name: row.author_name },
    transaction: row.transaction,
  });
  if (chosenRow.is_undone) {
    return { kind: "steps", steps: rowsNewestFirst.slice(chosenPosition).filter((row) => row.is_undone).reverse().map((row) => stepOf("redo", row)) };
  }
  const laterRowsApplied = rowsNewestFirst.slice(0, chosenPosition).filter((row) => !row.is_undone);
  const runtimeRow = laterRowsApplied.find((row) => row.author_kind === "runtime");
  if (runtimeRow !== undefined) {
    const { lead, subject, rest } = runtimeRow.what;
    return { kind: "unreachable", because: `The runtime's own edit after it (${[lead, subject, rest].filter((words) => words !== null && words !== "").join(" ")}) can't be undone.` };
  }
  return { kind: "steps", steps: laterRowsApplied.map((row) => stepOf("undo", row)) };
}

/** Whether the transaction an undo or redo step answered reversed or reapplied the edit the step was for. */
export function theStepReachedItsEdit(step: HistoryStep, answered: ProjectTransaction, transactionsNewestFirst: readonly ProjectTransaction[]): boolean {
  const named = step.undo_or_redo === "undo" ? answered.undoes : answered.redoes;
  if (named === null) return false;
  const byTransaction = new Map(transactionsNewestFirst.map((transaction) => [transaction.transaction, transaction]));
  let edit: string | null = named;
  for (let hops = 0; edit !== null && hops <= transactionsNewestFirst.length; hops += 1) {
    if (edit === step.transaction) return true;
    edit = byTransaction.get(edit)?.redoes ?? null;
  }
  return false;
}
