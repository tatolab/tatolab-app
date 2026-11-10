// What the Transactions view shows of a project's change feed: one row per transaction, the
// choices its Filter popover offers, and what a row copies as JSON.

import type { JsonValue, ListedStream, ProjectTransaction } from "@tatolab/tato-app-view-sdk";

/** Whether the runtime applied a transaction or refused it; every row reads applied while the feed carries no refusals. */
export type TransactionResult = "applied" | "refused";

/** One row of the Transactions table and its detail pane. */
export interface TransactionsViewRow {
  transaction: string;
  /** The time it applied, as this machine's clock reads it; `null` from a runtime that does not say. */
  applied_at_words: string | null;
  /** `person · Sam`, `agent · claude-code` or `runtime`. */
  author_words: string;
  /** The Time cell: `applied_at_words`, or a dash when the runtime does not say. */
  time_cell_words: string;
  /** Each stream it touched, by the name the runtime lists it under; empty for a change to the project alone. */
  stream_words: readonly string[];
  /** The Stream cell: the streams it touched, or `project` for a change to the project alone. */
  stream_cell_words: string;
  /** Each operation's verb, once each, in order. */
  operation_verbs: readonly string[];
  /** `undo · set_node_config`, or the verbs it ran. */
  operations_words: string;
  result: TransactionResult;
  /** The commit's first seven hex digits. */
  commit_words: string;
  /** The transaction exactly as the runtime sent it. */
  transaction_as_sent: ProjectTransaction;
  /** Everything the search matches against, lowercased once. */
  searched_words: string;
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
  results: readonly TransactionResult[];
  author_words: readonly string[];
  stream_words: readonly string[];
  operation_verbs: readonly string[];
}

const SHORT_COMMIT_LENGTH = 7;

function stringFieldOf(value: JsonValue, field: string): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : null;
}

function distinctInOrder<Value extends string>(values: readonly Value[]): Value[] {
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
  const appliedAtWords = appliedAtWordsOf(transaction.applied_at, timeZone);
  const authorWords = authorWordsOf(transaction);
  const streamWords = distinctInOrder(
    transaction.operations.flatMap((operation) => {
      const operationStream = stringFieldOf(operation, "stream");
      return operationStream === null ? [] : [streamWordsOf(operationStream)];
    }),
  );
  const operationsWords = `${lineage}${operationVerbs.length === 0 ? "no operations" : operationVerbs.join(", ")}`;
  return {
    transaction: transaction.transaction,
    applied_at_words: appliedAtWords,
    time_cell_words: appliedAtWords ?? "—",
    author_words: authorWords,
    stream_words: streamWords,
    stream_cell_words: streamWords.length === 0 ? "project" : streamWords.join(", "),
    operation_verbs: operationVerbs,
    operations_words: operationsWords,
    result: "applied",
    commit_words: transaction.commit.slice(0, SHORT_COMMIT_LENGTH),
    transaction_as_sent: transaction,
    searched_words: [authorWords, operationsWords, ...streamWords, JSON.stringify(transaction)].join("\n").toLowerCase(),
  };
}

/** Every value the rows hold for the Filter popover's Result, Author, Stream and Operation lists. */
export function transactionsFilterChoicesOf(rows: readonly TransactionsViewRow[]): TransactionsFilterChoices {
  return {
    results: distinctInOrder(rows.map((row) => row.result)),
    author_words: distinctInOrder(rows.map((row) => row.author_words)),
    stream_words: distinctInOrder(rows.flatMap((row) => row.stream_words)),
    operation_verbs: distinctInOrder(rows.flatMap((row) => row.operation_verbs)),
  };
}

/** How many of the Filter popover's narrowings are on, the search field apart. */
export function transactionsFiltersOnCount(filter: TransactionsViewFilter): number {
  return [filter.result, filter.author_words, filter.stream_words, filter.operation_verb].filter((narrowing) => narrowing !== null).length;
}

/** The Filter ▾ button's words and its accessible name, saying how many narrowings are on. */
export function transactionsFilterButtonWordsOf(filtersOnCount: number): { words: string; label: string } {
  return filtersOnCount === 0
    ? { words: "Filter", label: "Filter transactions: no filters on" }
    : { words: `Filter · ${filtersOnCount}`, label: `Filter transactions: ${filtersOnCount} on` };
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
      (searchWords === "" || row.searched_words.includes(searchWords)),
  );
}
