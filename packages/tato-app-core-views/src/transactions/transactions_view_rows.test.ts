import type { ListedStream, ProjectTransaction } from "@tatolab/tato-app-view-sdk";
import { describe, expect, it } from "vitest";
import {
  appliedAtWordsOf,
  NO_TRANSACTIONS_FILTER,
  streamWordsByOperationStream,
  transactionAsJson,
  transactionsFilterChoicesOf,
  transactionsFiltersOnCount,
  transactionsViewRowOf,
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
    transaction: "7d21a9c4-0000-4000-8000-000000000001",
    commit: "3b0fc2d9e1a4b5c6d7e8f90123456789abcdef01",
    parent_commit: "e72d1189e1a4b5c6d7e8f90123456789abcdef01",
    author_kind: "person",
    author_name: "Sam",
    operations: [],
    inverse_operations: [],
    undoes: null,
    redoes: null,
    applied_at: "2026-11-09T18:42:31.204Z",
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
      applied_at_words: "18:42:31.204",
      author_words: "person · Sam",
      stream_words: ["Main"],
      operation_verbs: ["add_node", "connect"],
      operations_words: "add_node, connect",
      result: "applied",
      commit_words: "3b0fc2d",
      parent_commit_words: "e72d118",
    });
  });

  it("reads the runtime by its kind alone, an asset change as touching no stream, and an unlisted stream by what the runtime sent", () => {
    const imported = transactionsViewRowOf(transactionWith({ author_kind: "runtime", author_name: "tatolab", parent_commit: null, operations: [{ operation: "import_asset", asset: {} }] }), streamWordsOf);
    expect(imported).toMatchObject({ author_words: "runtime", stream_words: [], parent_commit_words: null });
    const elsewhere = transactionsViewRowOf(transactionWith({ operations: [{ operation: "rename_node", stream: "a-stream-no-longer-listed" }] }), streamWordsOf);
    expect(elsewhere.stream_words).toEqual(["a-stream-no-longer-listed"]);
  });

  it("leads an undo and a redo with what it is", () => {
    expect(transactionsViewRowOf(transactionWith({ undoes: "x", operations: [{ operation: "set_node_config" }] }), streamWordsOf).operations_words).toBe("undo · set_node_config");
    expect(transactionsViewRowOf(transactionWith({ redoes: "x", operations: [{ operation: "set_node_config" }] }), streamWordsOf).operations_words).toBe("redo · set_node_config");
  });

  it("has no time from a runtime that does not say, and shows a time it cannot read as sent", () => {
    expect(appliedAtWordsOf(null)).toBeNull();
    expect(appliedAtWordsOf("not a time")).toBe("not a time");
  });

  it("copies the transaction as JSON exactly as the runtime sent it", () => {
    const transaction = transactionWith({ operations: [{ operation: "set_pin_value", stream: MAIN_STREAM_ASSET, input: "dot_size", from: 1, to: 1.45 }] });
    expect(JSON.parse(transactionAsJson(transaction))).toEqual(transaction);
  });
});

describe("the Filter popover", () => {
  const rows = [
    transactionsViewRowOf(transactionWith({ transaction: "t1", operations: [{ operation: "add_node", stream: MAIN_STREAM_ASSET }] }), streamWordsOf),
    transactionsViewRowOf(transactionWith({ transaction: "t2", author_kind: "agent", author_name: "claude-code", operations: [{ operation: "set_node_config", stream: MAIN_STREAM_ASSET, to: { softness: 0.64 } }] }), streamWordsOf),
    transactionsViewRowOf(transactionWith({ transaction: "t3", author_kind: "runtime", author_name: "tatolab", operations: [{ operation: "import_asset" }] }), streamWordsOf),
  ];
  const shownTransactions = (filter: Partial<typeof NO_TRANSACTIONS_FILTER>) => transactionsViewRowsShownBy(rows, { ...NO_TRANSACTIONS_FILTER, ...filter }).map((row) => row.transaction);

  it("offers every author, stream and operation the rows hold", () => {
    expect(transactionsFilterChoicesOf(rows)).toEqual({
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

  it("counts the narrowings that are on, not the search", () => {
    expect(transactionsFiltersOnCount({ ...NO_TRANSACTIONS_FILTER, search_words: "x" })).toBe(0);
    expect(transactionsFiltersOnCount({ ...NO_TRANSACTIONS_FILTER, result: "refused", operation_verb: "connect" })).toBe(2);
  });
});
