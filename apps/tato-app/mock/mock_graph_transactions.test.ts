import { expect, test } from "vitest";
import { applyMockGraphTransaction, type MockStreamGraphTarget } from "./mock_graph_transactions";
import { mockNodeIdOf, type MockStreamGraph } from "./mock_stream_fixtures";

const STREAM_ASSET = "a-stream-asset";
const STREAM_ID = "pattern-main-1a2b3c";

function aTestPatternAlone(): MockStreamGraph {
  return {
    nodes: [
      {
        name: "testpatternsource",
        type: "tatolab.stream:TestPatternSource",
        state: "Running",
        config: {},
        input_ports: [],
        output_ports: [{ name: "video", family: "image", stream_facts: null, values_checked: null }],
      },
    ],
    links: [],
    counterRates: { droppedPerSecondByLinkId: {}, refusedPerSecondByOutput: [] },
  };
}

function targetsOf(graph: MockStreamGraph): ReadonlyMap<string, MockStreamGraphTarget> {
  return new Map([[STREAM_ASSET, { stream_id: STREAM_ID, graph }]]);
}

const TEST_PATTERN = mockNodeIdOf(STREAM_ID, "testpatternsource");

test("a node added under `as` is wired by that label in the same transaction, and its config set by its id after", () => {
  const graph = aTestPatternAlone();
  const added = applyMockGraphTransaction(targetsOf(graph), [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", as: "window" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: TEST_PATTERN, port: "video" }, target: { node: "window", port: "video" } },
  ]);
  if (added.kind !== "applied") return expect.unreachable(added.refusal.runtime_words);
  expect(added.transaction.added_nodes).toEqual([{ stream: STREAM_ID, node: mockNodeIdOf(STREAM_ID, "displaywindow"), name: "displaywindow", as: "window" }]);
  expect(graph.links).toMatchObject([{ source_node: "testpatternsource", source_port: "video", target_node: "displaywindow", target_port: "video", state: "wired" }]);

  const configured = applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_node_config", stream: STREAM_ASSET, node: TEST_PATTERN, config: { width: 640 } }]);
  expect(configured.kind).toBe("applied");
  expect(graph.nodes[0]?.config).toEqual({ width: 640 });
});

test("a refused operation leaves every graph as it was, naming the operation, the link and the runtime's words", () => {
  const graph = aTestPatternAlone();
  const refused = applyMockGraphTransaction(targetsOf(graph), [
    { operation: "set_node_config", stream: STREAM_ASSET, node: TEST_PATTERN, config: { width: 640 } },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:MicrophoneSource", as: "mic" },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", as: "window" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "mic", port: "audio" }, target: { node: "window", port: "video" } },
  ]);
  expect(refused).toMatchObject({ kind: "refused", refusal: { action: "transact", refused_operation_index: 3, refused_link: { source: { node: "mic", port: "audio" }, target: { node: "window", port: "video" } } } });
  expect(graph).toEqual(aTestPatternAlone());
});

test("a pin value is refused on an input the node lacks, and an action the mock does not model is refused by name", () => {
  const graph = aTestPatternAlone();
  expect(applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_pin_value", stream: STREAM_ASSET, node: TEST_PATTERN, input: "level", value: 1 }])).toMatchObject({
    kind: "refused",
    refusal: { refused_node: TEST_PATTERN, refused_field: "level", runtime_words: "Processor 'testpatternsource' has no input port named 'level'" },
  });
  expect(applyMockGraphTransaction(targetsOf(graph), [{ operation: "remove_note", stream: STREAM_ASSET, note: "n" }])).toMatchObject({
    kind: "refused",
    refusal: { runtime_words: "the mock runtime does not apply `remove_note`" },
  });
});
