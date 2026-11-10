// What the Transactions view shows of a project's change feed: one row per transaction applied or
// action refused, the choices its Filter popover offers, and what a row copies as JSON.

import type {
  JsonValue,
  ListedStream,
  ProjectTransaction,
  ProjectTransactions,
  RefusedProjectAction,
} from "@tatolab/tato-app-view-sdk";

/** Whether the runtime applied a change or refused it. */
export type TransactionResult = "applied" | "refused";

/** A change-feed entry exactly as the runtime sent it: a transaction it applied, or an action it refused. */
export type ChangeFeedEntryAsSent =
  | { kind: "applied"; transaction: ProjectTransaction }
  | { kind: "refused"; refused_action: RefusedProjectAction };

/** One row of the Transactions table and its detail pane. */
export interface TransactionsViewRow {
  /** The transaction's UUID, or for a refused action its time, a hash of what it carries and which of its identical twins it is. */
  row_id: string;
  /** The time it applied or was refused, as this machine's clock reads it. */
  happened_at_words: string;
  /** `person · Sam`, `agent · claude-code` or `runtime`. */
  author_words: string;
  /** Each stream it touched, by the name the runtime lists it under; empty for a change to the project alone. */
  stream_words: readonly string[];
  /** The Stream cell: the streams it touched, or `project` for a change to the project alone. */
  stream_cell_words: string;
  /** Each operation's verb, once each, in order. */
  operation_verbs: readonly string[];
  /** `undo · set_node_config`, or the verbs it ran or asked for. */
  operations_words: string;
  result: TransactionResult;
  /** The Commit cell: the commit's first seven hex digits, or a dash for a refused action, which no history records. */
  commit_cell_words: string;
  /** The entry exactly as the runtime sent it. */
  sent: ChangeFeedEntryAsSent;
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
export const NO_TRANSACTIONS_FILTER: TransactionsViewFilter = {
  search_words: "",
  result: null,
  author_words: null,
  stream_words: null,
  operation_verb: null,
};

/** The choices each of the Filter popover's lists offers: every value the rows hold, in the order first seen. */
export interface TransactionsFilterChoices {
  results: readonly TransactionResult[];
  author_words: readonly string[];
  stream_words: readonly string[];
  operation_verbs: readonly string[];
}

const SHORT_COMMIT_LENGTH = 7;

function stringFieldOf(value: JsonValue, field: string): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : null;
}

function distinctInOrder<Value extends string>(
  values: readonly Value[],
): Value[] {
  return [...new Set(values)];
}

/** How a change's author reads: the runtime by its kind alone, anyone else by kind and name. */
export function authorWordsOf(author: {
  author_kind: string;
  author_name: string;
}): string {
  return author.author_kind === "runtime"
    ? "runtime"
    : `${author.author_kind} · ${author.author_name}`;
}

/** The name each operation's `stream` reads as: the listed stream whose stream asset or stream id it names, or the value itself. */
export function streamWordsByOperationStream(
  listedStreams: readonly ListedStream[],
): (operationStream: string) => string {
  return (operationStream) =>
    listedStreams.find(
      (listedStream) =>
        listedStream.location?.stream_asset === operationStream ||
        listedStream.stream === operationStream,
    )?.display_name ?? operationStream;
}

/** `happenedAt`, RFC 3339, as hours, minutes and seconds in `timeZone`, with milliseconds when the runtime sent a fraction, for display only. */
export function happenedAtWordsOf(
  happenedAt: string,
  timeZone?: string,
): string {
  const happened = new Date(happenedAt);
  if (Number.isNaN(happened.getTime())) return happenedAt;
  const sentAFraction = /T\d{2}:\d{2}:\d{2}\.\d/.test(happenedAt);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(sentAFraction ? { fractionalSecondDigits: 3 } : {}),
    hourCycle: "h23",
    timeZone,
  }).format(happened);
}

function operationVerbsOf(operations: readonly JsonValue[]): string[] {
  return distinctInOrder(
    operations.map(
      (operation) =>
        stringFieldOf(operation, "operation") ?? "unnamed operation",
    ),
  );
}

function streamWordsOfOperations(
  operations: readonly JsonValue[],
  streamWordsOf: (operationStream: string) => string,
): string[] {
  return distinctInOrder(
    operations.flatMap((operation) => {
      const operationStream = stringFieldOf(operation, "stream");
      return operationStream === null ? [] : [streamWordsOf(operationStream)];
    }),
  );
}

function verbsWords(operationVerbs: readonly string[]): string {
  return operationVerbs.length === 0
    ? "no operations"
    : operationVerbs.join(", ");
}

/** The row `transaction`, one the runtime applied, shows. */
export function transactionsViewRowOf(
  transaction: ProjectTransaction,
  streamWordsOf: (operationStream: string) => string,
  timeZone?: string,
): TransactionsViewRow {
  const operationVerbs = operationVerbsOf(transaction.operations);
  const lineage =
    transaction.undoes !== null
      ? "undo · "
      : transaction.redoes !== null
        ? "redo · "
        : "";
  const happenedAtWords = happenedAtWordsOf(transaction.applied_at, timeZone);
  const authorWords = authorWordsOf(transaction);
  const streamWords = streamWordsOfOperations(
    transaction.operations,
    streamWordsOf,
  );
  const operationsWords = `${lineage}${verbsWords(operationVerbs)}`;
  return {
    row_id: transaction.transaction,
    happened_at_words: happenedAtWords,
    author_words: authorWords,
    stream_words: streamWords,
    stream_cell_words:
      streamWords.length === 0 ? "project" : streamWords.join(", "),
    operation_verbs: operationVerbs,
    operations_words: operationsWords,
    result: "applied",
    commit_cell_words: transaction.commit.slice(0, SHORT_COMMIT_LENGTH),
    sent: { kind: "applied", transaction },
    searched_words: [
      authorWords,
      operationsWords,
      ...streamWords,
      JSON.stringify(transaction),
    ]
      .join("\n")
      .toLowerCase(),
  };
}

/** 32-bit FNV-1a of `words`, as eight hex digits. */
function fnv1aHexOf(words: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < words.length; index += 1) {
    hash ^= words.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A refused action's identity across feed readings, which give it no id: its time and a hash of everything it carries, then which of its identical twins it is, counted from the oldest. */
function refusedActionRowIdOf(
  refusedAction: RefusedProjectAction,
  twinsOlderThanIt: number,
): string {
  return `refused:${refusedAction.refused_at}:${fnv1aHexOf(JSON.stringify(refusedAction))}:${twinsOlderThanIt}`;
}

/** Which of the action's operations the runtime refused, as `n of m`, or `null` when it names none the action carries. */
export function refusedOperationWordsOf(
  refusedAction: RefusedProjectAction,
): string | null {
  const refusedOperationIndex = refusedAction.refusal.refused_operation_index;
  const operationCount = refusedAction.operations.length;
  return refusedOperationIndex === null ||
    refusedOperationIndex >= operationCount
    ? null
    : `${refusedOperationIndex + 1} of ${operationCount}`;
}

/** The node, field, link and idempotency key the refusal names, each as a labelled row, leaving out what it does not name. */
export function refusedNamesRowsOf(
  refusedAction: RefusedProjectAction,
): (readonly [string, string])[] {
  const refusal = refusedAction.refusal;
  const refusedLink = refusal.refused_link;
  return [
    ...(refusal.refused_node === null
      ? []
      : [["Node", refusal.refused_node] as const]),
    ...(refusal.refused_field === null
      ? []
      : [["Field", refusal.refused_field] as const]),
    ...(refusedLink === null
      ? []
      : [
          [
            "Link",
            `${refusedLink.source.node}:${refusedLink.source.port} → ${refusedLink.target.node}:${refusedLink.target.port}`,
          ] as const,
        ]),
    ...(refusedAction.idempotency_key === null
      ? []
      : [["Key", refusedAction.idempotency_key] as const]),
  ];
}

/** The row `refusedAction` shows, under `rowId`; an undo or redo, which asks for no operations, reads as its action. */
function refusedActionViewRowOf(
  refusedAction: RefusedProjectAction,
  rowId: string,
  streamWordsOf: (operationStream: string) => string,
  timeZone?: string,
): TransactionsViewRow {
  const operationVerbs = operationVerbsOf(refusedAction.operations);
  const happenedAtWords = happenedAtWordsOf(refusedAction.refused_at, timeZone);
  const authorWords = authorWordsOf(refusedAction);
  const streamWords = streamWordsOfOperations(
    refusedAction.operations,
    streamWordsOf,
  );
  const operationsWords =
    refusedAction.operations.length === 0
      ? refusedAction.refusal.action
      : verbsWords(operationVerbs);
  return {
    row_id: rowId,
    happened_at_words: happenedAtWords,
    author_words: authorWords,
    stream_words: streamWords,
    stream_cell_words:
      streamWords.length === 0 ? "project" : streamWords.join(", "),
    operation_verbs: operationVerbs,
    operations_words: operationsWords,
    result: "refused",
    commit_cell_words: "—",
    sent: { kind: "refused", refused_action: refusedAction },
    searched_words: [
      authorWords,
      operationsWords,
      ...streamWords,
      JSON.stringify(refusedAction),
    ]
      .join("\n")
      .toLowerCase(),
  };
}

/** The second `happenedAt` falls in, or `null` for a time the runtime sent that cannot be read. */
function secondOf(happenedAt: string): number | null {
  const milliseconds = new Date(happenedAt).getTime();
  return Number.isNaN(milliseconds) ? null : Math.floor(milliseconds / 1000);
}

/** The feed's applied transactions and refused actions as one list, newest first; a refusal in the same second as a transaction comes first, as the runtime orders them, and so does a refusal beside a time that cannot be read. */
export function transactionsViewRowsOf(
  feed: ProjectTransactions,
  streamWordsOf: (operationStream: string) => string,
  timeZone?: string,
): TransactionsViewRow[] {
  const appliedRows = feed.transactions.map((transaction) => ({
    second: secondOf(transaction.applied_at),
    row: transactionsViewRowOf(transaction, streamWordsOf, timeZone),
  }));
  const twinsSeenByIdentity = new Map<string, number>();
  const refusedRows = [...feed.refused_actions]
    .reverse()
    .map((refusedAction) => {
      const identity = refusedActionRowIdOf(refusedAction, 0);
      const twinsOlderThanIt = twinsSeenByIdentity.get(identity) ?? 0;
      twinsSeenByIdentity.set(identity, twinsOlderThanIt + 1);
      return {
        second: secondOf(refusedAction.refused_at),
        row: refusedActionViewRowOf(
          refusedAction,
          refusedActionRowIdOf(refusedAction, twinsOlderThanIt),
          streamWordsOf,
          timeZone,
        ),
      };
    })
    .reverse();
  const rowsNewestFirst: TransactionsViewRow[] = [];
  let appliedIndex = 0;
  let refusedIndex = 0;
  for (;;) {
    const nextApplied = appliedRows[appliedIndex];
    const nextRefused = refusedRows[refusedIndex];
    if (
      nextRefused !== undefined &&
      (nextApplied === undefined ||
        nextRefused.second === null ||
        nextApplied.second === null ||
        nextRefused.second >= nextApplied.second)
    ) {
      rowsNewestFirst.push(nextRefused.row);
      refusedIndex += 1;
    } else if (nextApplied !== undefined) {
      rowsNewestFirst.push(nextApplied.row);
      appliedIndex += 1;
    } else {
      return rowsNewestFirst;
    }
  }
}

/** Every value the rows hold for the Filter popover's Result, Author, Stream and Operation lists. */
export function transactionsFilterChoicesOf(
  rows: readonly TransactionsViewRow[],
): TransactionsFilterChoices {
  return {
    results: distinctInOrder(rows.map((row) => row.result)),
    author_words: distinctInOrder(rows.map((row) => row.author_words)),
    stream_words: distinctInOrder(rows.flatMap((row) => row.stream_words)),
    operation_verbs: distinctInOrder(
      rows.flatMap((row) => row.operation_verbs),
    ),
  };
}

/** How many of the Filter popover's narrowings are on, the search field apart. */
export function transactionsFiltersOnCount(
  filter: TransactionsViewFilter,
): number {
  return [
    filter.result,
    filter.author_words,
    filter.stream_words,
    filter.operation_verb,
  ].filter((narrowing) => narrowing !== null).length;
}

/** The Filter ▾ button's words and its accessible name, saying how many narrowings are on. */
export function transactionsFilterButtonWordsOf(filtersOnCount: number): {
  words: string;
  label: string;
} {
  return filtersOnCount === 0
    ? { words: "Filter", label: "Filter transactions: no filters on" }
    : {
        words: `Filter · ${filtersOnCount}`,
        label: `Filter transactions: ${filtersOnCount} on`,
      };
}

/** The entry as JSON, indented, exactly as the runtime sent it. */
export function changeFeedEntryAsJson(sent: ChangeFeedEntryAsSent): string {
  return JSON.stringify(
    sent.kind === "applied" ? sent.transaction : sent.refused_action,
    null,
    2,
  );
}

/** The rows `filter` keeps, in their order; the search matches the row's words or anything the runtime sent, ignoring case. */
export function transactionsViewRowsShownBy(
  rows: readonly TransactionsViewRow[],
  filter: TransactionsViewFilter,
): TransactionsViewRow[] {
  const searchWords = filter.search_words.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.result === null || row.result === filter.result) &&
      (filter.author_words === null ||
        row.author_words === filter.author_words) &&
      (filter.stream_words === null ||
        row.stream_words.includes(filter.stream_words)) &&
      (filter.operation_verb === null ||
        row.operation_verbs.includes(filter.operation_verb)) &&
      (searchWords === "" || row.searched_words.includes(searchWords)),
  );
}
