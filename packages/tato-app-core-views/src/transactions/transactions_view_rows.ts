// What the Transactions view shows of a project's change feed: one row per transaction, the
// choices its Filter popover offers, and what a row copies as JSON.

import type { JsonValue, ListedStream, ProjectTransaction } from "@tatolab/tato-app-view-sdk";

/** Whether the runtime applied a transaction or refused it; the feed carries only applied ones until streamlib #3424. */
export type TransactionResult = "applied" | "refused";

/** One row of the Transactions table and its detail pane. */
export interface TransactionsViewRow {
  transaction: string;
  /** The time it applied, as this machine's clock reads it; `null` from a runtime that does not say. */
  applied_at_words: string | null;
  /** `person · Sam`, `agent · claude-code` or `runtime`. */
  author_words: string;
  /** Each stream it touched, by the name the runtime lists it under; empty for a change to the project alone. */
  stream_words: string[];
  /** Each operation's verb, once each, in order. */
  operation_verbs: string[];
  /** `undo · set_node_config`, or the verbs it ran. */
  operations_words: string;
  result: TransactionResult;
  /** The commit's first seven hex digits. */
  commit_words: string;
  /** The commit history stood at, as its first seven hex digits; `null` for the project's first. */
  parent_commit_words: string | null;
  /** The transaction exactly as the runtime sent it. */
  transaction_as_sent: ProjectTransaction;
}

/** What the Filter popover narrows to; `null` is any. */
export interface TransactionsViewFilter {
  search_words: string;
  result: TransactionResult | null;
  author_words: string | null;
  stream_words: string | null;
  operation_verb: string | null;
}

/** The filter with nothing narrowed. */
export const NO_TRANSACTIONS_FILTER: TransactionsViewFilter = { search_words: "", result: null, author_words: null, stream_words: null, operation_verb: null };

/** The choices each of the Filter popover's lists offers: every value the rows hold, in the order first seen. */
export interface TransactionsFilterChoices {
  author_words: string[];
  stream_words: string[];
  operation_verbs: string[];
}

const SHORT_COMMIT_LENGTH = 7;

function stringFieldOf(value: JsonValue, field: string): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : null;
}

function distinctInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** How a transaction's author reads: the runtime by its kind alone, anyone else by kind and name. */
export function authorWordsOf(transaction: ProjectTransaction): string {
  return transaction.author_kind === "runtime" ? "runtime" : `${transaction.author_kind} · ${transaction.author_name}`;
}

/** The name each operation's `stream` reads as: the listed stream whose stream asset or stream id it names, or the value itself. */
export function streamWordsByOperationStream(listedStreams: readonly ListedStream[]): (operationStream: string) => string {
  return (operationStream) =>
    listedStreams.find((listedStream) => listedStream.location?.stream_asset === operationStream || listedStream.stream === operationStream)?.display_name ?? operationStream;
}

/** `appliedAt`, RFC 3339, as hours, minutes, seconds and milliseconds in `timeZone`, for display only. */
export function appliedAtWordsOf(appliedAt: string | null, timeZone?: string): string | null {
  if (appliedAt === null) return null;
  const applied = new Date(appliedAt);
  if (Number.isNaN(applied.getTime())) return appliedAt;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hourCycle: "h23", timeZone }).format(applied);
}

/** The row `transaction` shows. */
export function transactionsViewRowOf(transaction: ProjectTransaction, streamWordsOf: (operationStream: string) => string, timeZone?: string): TransactionsViewRow {
  const operationVerbs = distinctInOrder(transaction.operations.map((operation) => stringFieldOf(operation, "operation") ?? "unnamed operation"));
  const lineage = transaction.undoes !== null ? "undo · " : transaction.redoes !== null ? "redo · " : "";
  return {
    transaction: transaction.transaction,
    applied_at_words: appliedAtWordsOf(transaction.applied_at, timeZone),
    author_words: authorWordsOf(transaction),
    stream_words: distinctInOrder(transaction.operations.flatMap((operation) => {
      const operationStream = stringFieldOf(operation, "stream");
      return operationStream === null ? [] : [streamWordsOf(operationStream)];
    })),
    operation_verbs: operationVerbs,
    operations_words: `${lineage}${operationVerbs.length === 0 ? "no operations" : operationVerbs.join(", ")}`,
    result: "applied",
    commit_words: transaction.commit.slice(0, SHORT_COMMIT_LENGTH),
    parent_commit_words: transaction.parent_commit?.slice(0, SHORT_COMMIT_LENGTH) ?? null,
    transaction_as_sent: transaction,
  };
}

/** Every value the rows hold for the Filter popover's Author, Stream and Operation lists. */
export function transactionsFilterChoicesOf(rows: readonly TransactionsViewRow[]): TransactionsFilterChoices {
  return {
    author_words: distinctInOrder(rows.map((row) => row.author_words)),
    stream_words: distinctInOrder(rows.flatMap((row) => row.stream_words)),
    operation_verbs: distinctInOrder(rows.flatMap((row) => row.operation_verbs)),
  };
}

/** How many of the Filter popover's narrowings are on, the search field apart. */
export function transactionsFiltersOnCount(filter: TransactionsViewFilter): number {
  return [filter.result, filter.author_words, filter.stream_words, filter.operation_verb].filter((narrowing) => narrowing !== null).length;
}

/** `transaction` as JSON, indented, exactly as the runtime sent it. */
export function transactionAsJson(transaction: ProjectTransaction): string {
  return JSON.stringify(transaction, null, 2);
}

/** The rows `filter` keeps, in their order; the search matches the row's words or anything the runtime sent, ignoring case. */
export function transactionsViewRowsShownBy(rows: readonly TransactionsViewRow[], filter: TransactionsViewFilter): TransactionsViewRow[] {
  const searchWords = filter.search_words.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.result === null || row.result === filter.result) &&
      (filter.author_words === null || row.author_words === filter.author_words) &&
      (filter.stream_words === null || row.stream_words.includes(filter.stream_words)) &&
      (filter.operation_verb === null || row.operation_verbs.includes(filter.operation_verb)) &&
      (searchWords === "" || [row.author_words, row.operations_words, ...row.stream_words, JSON.stringify(row.transaction_as_sent)].some((words) => words.toLowerCase().includes(searchWords))),
  );
}
