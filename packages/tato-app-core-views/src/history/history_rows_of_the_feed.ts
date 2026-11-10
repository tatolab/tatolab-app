// The History view's rows, from the open project's change feed: one row for each edit, newest first. An undo
// or a redo is no row of its own. Each edit stands as the runtime's `undo_state` says: applied, undone and
// dimmed while its author can still redo it, and gone from History once they can't.

import { TATO_STUDIO_MCP_CLIENT_NAME, type JsonValue, type ProjectTransaction, type ProjectTransactionAuthor } from "@tatolab/tato-app-view-sdk/studio_readings";
import { whatAnEditChanged, type NodeNamesById } from "./what_an_edit_changed";

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
  /** When the runtime applied the edit, as `applied_at` gives it. */
  readonly applied_at: string;
  /** Undone by its author, who can still redo it. */
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

function authorKindOf(authorKind: string): HistoryRowAuthorKind {
  return authorKind === "person" || authorKind === "agent" ? authorKind : "runtime";
}

/** The author as a row names them. */
export function whoMadeTheEdit(authorKind: string, authorName: string): string {
  if (authorKind === "person") return authorName;
  if (authorKind === "agent") return authorName === TATO_STUDIO_MCP_CLIENT_NAME ? "Tato Studio" : `${authorName} (agent)`;
  return "Runtime";
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
  return transactionsNewestFirst
    .filter((transaction) => transaction.undoes === null && transaction.redoes === null && transaction.undo_state !== "undone_not_redoable")
    .map((edit) => {
      const whatChanged = whatAnEditChanged(edit.operations, nodeNames);
      return {
        transaction: edit.transaction,
        author_kind: authorKindOf(edit.author_kind),
        author_name: edit.author_name,
        who: whoMadeTheEdit(edit.author_kind, edit.author_name),
        what: whatChanged.what,
        operation_lines: whatChanged.operation_lines,
        applied_at: edit.applied_at,
        is_undone: edit.undo_state === "undone_redoable",
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
