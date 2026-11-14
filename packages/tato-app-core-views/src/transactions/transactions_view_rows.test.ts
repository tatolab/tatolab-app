import type { ListedStream, ProjectTransaction, RefusedProjectAction } from "@tatolab/tato-app-view-sdk";
import { describe, expect, it } from "vitest";
import {
  changeFeedEntryAsJson,
  happenedAtWordsOf,
  NO_TRANSACTIONS_FILTER,
  refusedNamesRowsOf,
  refusedOperationWordsOf,
  streamWordsByOperationStream,
  transactionsFilterButtonWordsOf,
  transactionsFilterChoicesOf,
  transactionsFiltersOnCount,
  transactionsViewRowOf,
  TRANSACTIONS_LOG_FOLLOWING_THE_FEED,
  transactionsLogAsJson,
  transactionsLogCleared,
  transactionsLogFileNameOf,
  transactionsLogPausedOrResumed,
  transactionsLogRowsShown,
  transactionsViewRowsAsJson,
  transactionsViewRowsOf,
  transactionsViewRowsShownBy,
} from "./transactions_view_rows";

const MAIN_STREAM_ASSET = "0b6c5e2a-4c1d-4e8f-9a7b-3d2c1b0a9f8e";

const MAIN_STREAM: ListedStream = {
  stream: "pattern-main-1a2b3c",
  display_name: "Main",
  location: { project_directory: "/Users/sam/streams/pattern", project: "5d1f0e3c-0000-4000-8000-000000000001", stream_asset: MAIN_STREAM_ASSET },
  state: "running",
  node_count: 3,
  failed_because: null,
  capture_devices_whose_access_was_never_asked_for: [],
  action: null,
  step: null,
};

function transactionWith(fields: Partial<ProjectTransaction>): ProjectTransaction {
  return {
    format_version: 2,
    transaction: "7d21a9c4-0000-4000-8000-000000000001",
    commit: "3b0fc2d9e1a4b5c6d7e8f90123456789abcdef01",
    parent_commit: "e72d1189e1a4b5c6d7e8f90123456789abcdef01",
    author_kind: "person",
    author_name: "Sam",
    operations: [],
    inverse_operations: [],
    undoes: null,
    redoes: null,
    idempotency_key: null,
    undo_state: "applied",
    applied_at: "2026-11-09T18:42:31.204Z",
    ...fields,
  };
}

function refusedActionWith(fields: Partial<RefusedProjectAction>): RefusedProjectAction {
  return {
    author_kind: "agent",
    author_name: "claude-code",
    mode: "commit",
    operations: [{ operation: "set_node_config", stream: MAIN_STREAM_ASSET, node: "9c41", to: { softness: 2 } }],
    idempotency_key: null,
    refusal: {
      action: "edit_graph",
      refused_operation_index: 0,
      refused_node: "9c41",
      refused_link: null,
      refused_field: "softness",
      runtime_words: "softness 2 is above its maximum 1",
    },
    refused_at: "2026-11-09T18:42:31Z",
    ...fields,
  };
}

const streamWordsOf = streamWordsByOperationStream([MAIN_STREAM]);

describe("a Transactions row", () => {
  it("names its author, the streams it touched by their listed names, its verbs once each, and its short commits", () => {
    const row = transactionsViewRowOf(
      transactionWith({
        operations: [
          { operation: "add_node", stream: MAIN_STREAM_ASSET, node: { id: "9c41", name: "loudness" } },
          { operation: "connect", stream: MAIN_STREAM_ASSET, link: {} },
          { operation: "connect", stream: MAIN_STREAM_ASSET, link: {} },
        ],
      }),
      streamWordsOf,
      "UTC",
    );
    expect(row).toMatchObject({
      happened_at_words: "18:42:31.204",
      author_words: "person · Sam",
      stream_words: ["Main"],
      operation_verbs: ["add_node", "connect"],
      operations_words: "add_node, connect",
      mode_words: "commit",
      mode_chip_tone: "neutral",
      result: "applied",
      result_chip_tone: "positive",
      commit_cell_words: "3b0fc2d",
      stream_cell_words: "Main",
    });
  });

  it("reads the runtime by its kind alone, an asset change as touching no stream, and an unlisted stream by what the runtime sent", () => {
    const imported = transactionsViewRowOf(transactionWith({ author_kind: "runtime", author_name: "tatolab", parent_commit: null, operations: [{ operation: "import_asset", asset: {} }] }), streamWordsOf);
    expect(imported).toMatchObject({ author_words: "runtime", stream_words: [], stream_cell_words: "project" });
    const elsewhere = transactionsViewRowOf(transactionWith({ operations: [{ operation: "rename_node", stream: "a-stream-no-longer-listed" }] }), streamWordsOf);
    expect(elsewhere.stream_words).toEqual(["a-stream-no-longer-listed"]);
  });

  it("leads an undo and a redo with what it is", () => {
    expect(transactionsViewRowOf(transactionWith({ undoes: "x", operations: [{ operation: "set_node_config" }] }), streamWordsOf).operations_words).toBe("undo · set_node_config");
    expect(transactionsViewRowOf(transactionWith({ redoes: "x", operations: [{ operation: "set_node_config" }] }), streamWordsOf).operations_words).toBe("redo · set_node_config");
  });

  it("shows a time it cannot read as sent, and a time to the second without milliseconds it never had", () => {
    expect(happenedAtWordsOf("not a time")).toBe("not a time");
    expect(happenedAtWordsOf("2026-11-09T18:42:31Z", "UTC")).toBe("18:42:31");
  });

  it("copies the transaction as JSON exactly as the runtime sent it", () => {
    const transaction = transactionWith({ operations: [{ operation: "set_pin_value", stream: MAIN_STREAM_ASSET, input: "dot_size", from: 1, to: 1.45 }] });
    expect(JSON.parse(changeFeedEntryAsJson({ kind: "applied", transaction }))).toEqual(transaction);
  });
});

describe("a refused action's row", () => {
  it("reads refused, names who asked and what, has no commit, and carries the runtime's own words", () => {
    const refusedAction = refusedActionWith({});
    const row = transactionsViewRowsOf({ project: "p", project_directory: "/p", transactions: [], refused_actions: [refusedAction] }, streamWordsOf, "UTC")[0];
    expect(row).toMatchObject({
      result: "refused",
      author_words: "agent · claude-code",
      stream_cell_words: "Main",
      operations_words: "set_node_config",
      happened_at_words: "18:42:31",
      mode_words: "commit",
      commit_cell_words: "none",
    });
    expect(row?.sent).toEqual({ kind: "refused", refused_action: refusedAction });
    expect(JSON.parse(changeFeedEntryAsJson({ kind: "refused", refused_action: refusedAction }))).toEqual(refusedAction);
  });

  it("is found by a search for the runtime's words", () => {
    const rows = transactionsViewRowsOf({ project: "p", project_directory: "/p", transactions: [transactionWith({ transaction: "t1" })], refused_actions: [refusedActionWith({})] }, streamWordsOf);
    expect(transactionsViewRowsShownBy(rows, { ...NO_TRANSACTIONS_FILTER, search_words: "MAXIMUM" }).map((row) => row.result)).toEqual(["refused"]);
    expect(transactionsViewRowsShownBy(rows, { ...NO_TRANSACTIONS_FILTER, result: "refused" }).map((row) => row.result)).toEqual(["refused"]);
    expect(transactionsFilterChoicesOf(rows).results).toEqual(["refused", "applied"]);
  });
});

describe("the feed as one list", () => {
  it("puts applied transactions and refused actions newest first, a refusal first within the same second", () => {
    const rows = transactionsViewRowsOf(
      {
        project: "p",
        project_directory: "/p",
        transactions: [
          transactionWith({ transaction: "t-newest", applied_at: "2026-11-09T18:45:00.250Z" }),
          transactionWith({ transaction: "t-same-second", applied_at: "2026-11-09T18:44:00.900Z" }),
          transactionWith({ transaction: "t-oldest", applied_at: "2026-11-09T18:40:00.000Z" }),
        ],
        refused_actions: [refusedActionWith({ refused_at: "2026-11-09T18:44:00Z" }), refusedActionWith({ refused_at: "2026-11-09T18:42:00Z" })],
      },
      streamWordsOf,
    );
    expect(rows.map((row) => (row.sent.kind === "applied" ? row.sent.transaction.transaction : row.sent.refused_action.refused_at))).toEqual([
      "t-newest",
      "2026-11-09T18:44:00Z",
      "t-same-second",
      "2026-11-09T18:42:00Z",
      "t-oldest",
    ]);
  });

  it("keeps a refused row's id when the runtime drops its oldest refusal, and tells identical twins apart", () => {
    const twin = refusedActionWith({ refused_at: "2026-11-09T18:44:00Z" });
    const oldest = refusedActionWith({ refused_at: "2026-11-09T18:30:00Z" });
    const feedOf = (refusedActions: RefusedProjectAction[]) => transactionsViewRowsOf({ project: "p", project_directory: "/p", transactions: [], refused_actions: refusedActions }, streamWordsOf).map((row) => row.row_id);
    const before = feedOf([twin, twin, oldest]);
    expect(new Set(before).size).toBe(3);
    expect(feedOf([twin, twin])).toEqual(before.slice(0, 2));
  });

  it("names a refused undo or redo, which asks for no operations, by its action", () => {
    const refusedRedo = refusedActionWith({ operations: [], refusal: { action: "redo", refused_operation_index: null, refused_node: null, refused_link: null, refused_field: null, runtime_words: "nothing left to redo" } });
    const row = transactionsViewRowsOf({ project: "p", project_directory: "/p", transactions: [], refused_actions: [refusedRedo] }, streamWordsOf)[0];
    expect(row).toMatchObject({ operations_words: "redo", operation_verbs: [], stream_cell_words: "project" });
  });
});

describe("the Filter popover", () => {
  const rows = [
    transactionsViewRowOf(transactionWith({ transaction: "t1", operations: [{ operation: "add_node", stream: MAIN_STREAM_ASSET }] }), streamWordsOf),
    transactionsViewRowOf(transactionWith({ transaction: "t2", author_kind: "agent", author_name: "claude-code", operations: [{ operation: "set_node_config", stream: MAIN_STREAM_ASSET, to: { softness: 0.64 } }] }), streamWordsOf),
    transactionsViewRowOf(transactionWith({ transaction: "t3", author_kind: "runtime", author_name: "tatolab", operations: [{ operation: "import_asset" }] }), streamWordsOf),
  ];
  const shownTransactions = (filter: Partial<typeof NO_TRANSACTIONS_FILTER>) => transactionsViewRowsShownBy(rows, { ...NO_TRANSACTIONS_FILTER, ...filter }).map((row) => row.row_id);

  it("offers every result, author, stream and operation the rows hold", () => {
    expect(transactionsFilterChoicesOf(rows)).toEqual({
      results: ["applied"],
      author_words: ["person · Sam", "agent · claude-code", "runtime"],
      stream_words: ["Main"],
      operation_verbs: ["add_node", "set_node_config", "import_asset"],
    });
  });

  it("narrows by author, stream, operation and result, and searches what the runtime sent", () => {
    expect(shownTransactions({})).toEqual(["t1", "t2", "t3"]);
    expect(shownTransactions({ author_words: "agent · claude-code" })).toEqual(["t2"]);
    expect(shownTransactions({ stream_words: "Main" })).toEqual(["t1", "t2"]);
    expect(shownTransactions({ operation_verb: "import_asset" })).toEqual(["t3"]);
    expect(shownTransactions({ result: "refused" })).toEqual([]);
    expect(shownTransactions({ search_words: "  SOFTNESS " })).toEqual(["t2"]);
  });

  it("says on its button how many narrowings are on", () => {
    expect(transactionsFilterButtonWordsOf(0)).toEqual({ words: "Filter", label: "Filter transactions: no filters on" });
    expect(transactionsFilterButtonWordsOf(2)).toEqual({ words: "Filter · 2", label: "Filter transactions: 2 on" });
  });

  it("counts the narrowings that are on, not the search", () => {
    expect(transactionsFiltersOnCount({ ...NO_TRANSACTIONS_FILTER, search_words: "x" })).toBe(0);
    expect(transactionsFiltersOnCount({ ...NO_TRANSACTIONS_FILTER, result: "refused", operation_verb: "connect" })).toBe(2);
  });
});

describe("a refused action's detail words", () => {
  it("names the refused operation as n of m, and nothing when the index is absent or past the operations", () => {
    const refusedAction = refusedActionWith({});
    expect(refusedOperationWordsOf(refusedAction)).toBe("1 of 1");
    expect(refusedOperationWordsOf({ ...refusedAction, refusal: { ...refusedAction.refusal, refused_operation_index: null } })).toBeNull();
    expect(refusedOperationWordsOf({ ...refusedAction, refusal: { ...refusedAction.refusal, refused_operation_index: 1 } })).toBeNull();
  });

  it("lists only the names the refusal carries, a link as node:port → node:port", () => {
    const refusedAction = refusedActionWith({ idempotency_key: "k-1" });
    const refusal = { ...refusedAction.refusal, refused_node: null, refused_field: null, refused_link: { source: { node: "camera", port: "video" }, target: { node: "display", port: "video" } } };
    expect(refusedNamesRowsOf({ ...refusedAction, refusal })).toEqual([
      ["Link", "camera:video → display:video"],
      ["Key", "k-1"],
    ]);
    expect(refusedNamesRowsOf({ ...refusedAction, idempotency_key: null, refusal: { ...refusal, refused_link: null } })).toEqual([]);
  });
});

describe("the log menu's rows", () => {
  it("copies the rows shown as one JSON array, each entry exactly as the runtime sent it", () => {
    const transaction = transactionWith({ transaction: "t1" });
    const refusedAction = refusedActionWith({ mode: "live" });
    const rows = transactionsViewRowsOf({ project: "p", project_directory: "/p", transactions: [transaction], refused_actions: [refusedAction] }, streamWordsOf);
    expect(rows.find((row) => row.result === "refused")).toMatchObject({ mode_words: "live", mode_chip_tone: "caution", result_chip_tone: "danger" });
    expect(JSON.parse(transactionsViewRowsAsJson(rows))).toEqual(rows.map((row) => (row.sent.kind === "applied" ? transaction : refusedAction)));
  });

  const feedOf = (transactionIds: string[]) =>
    transactionsViewRowsOf({ project: "p", project_directory: "/p", transactions: transactionIds.map((transaction) => transactionWith({ transaction })), refused_actions: [] }, streamWordsOf);
  const idsOf = (rows: readonly { row_id: string }[]) => rows.map((row) => row.row_id);

  it("freezes the rows while paused and follows the feed again once resumed", () => {
    const paused = transactionsLogPausedOrResumed(TRANSACTIONS_LOG_FOLLOWING_THE_FEED, feedOf(["t1"]));
    expect(idsOf(transactionsLogRowsShown(feedOf(["t2", "t1"]), paused))).toEqual(["t1"]);
    expect(idsOf(transactionsLogRowsShown(feedOf(["t2", "t1"]), transactionsLogPausedOrResumed(paused, feedOf(["t2", "t1"]))))).toEqual(["t2", "t1"]);
  });

  it("clears what is shown, and shows what the runtime records after", () => {
    const cleared = transactionsLogCleared(TRANSACTIONS_LOG_FOLLOWING_THE_FEED, feedOf(["t1"]));
    expect(transactionsLogRowsShown(feedOf(["t1"]), cleared)).toEqual([]);
    expect(idsOf(transactionsLogRowsShown(feedOf(["t2", "t1"]), cleared))).toEqual(["t2"]);
  });

  it("keeps a row that reached the feed unseen while paused, so it shows once the log resumes after a clear", () => {
    const paused = transactionsLogPausedOrResumed(TRANSACTIONS_LOG_FOLLOWING_THE_FEED, feedOf(["t1"]));
    const clearedWhilePaused = transactionsLogCleared(paused, feedOf(["t2", "t1"]));
    expect(transactionsLogRowsShown(feedOf(["t2", "t1"]), clearedWhilePaused)).toEqual([]);
    expect(idsOf(transactionsLogRowsShown(feedOf(["t2", "t1"]), transactionsLogPausedOrResumed(clearedWhilePaused, feedOf(["t2", "t1"]))))).toEqual(["t2"]);
  });
});

describe("the downloaded transaction log", () => {
  it("holds every applied transaction and refused action exactly as the runtime sent them, whatever the view shows", () => {
    const feed = { project: "p", project_directory: "/p", transactions: [transactionWith({ transaction: "t1" })], refused_actions: [refusedActionWith({})] };
    expect(JSON.parse(transactionsLogAsJson(feed))).toEqual(feed);
  });

  it("is named after the project, with any character no file name holds made a dash", () => {
    expect(transactionsLogFileNameOf("Lobby")).toBe("Lobby transactions.json");
    expect(transactionsLogFileNameOf('Night: show/2 "B"')).toBe("Night- show-2 -B- transactions.json");
  });
});
