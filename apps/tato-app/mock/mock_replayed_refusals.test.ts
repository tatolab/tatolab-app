import { expect, test } from "vitest";
import { MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE, mockRecordedGraphOfTheEveryPinKindSample } from "./mock_recordings";
import { MockReplayedRefusals } from "./mock_replayed_refusals";
import type { StreamGraphAction } from "../src/shared/tatolab_backend_contract";

const STREAM_ASSET = "a-stream-asset";
const STREAM_ID = "every-pin-kind-main-8c1d2e";

function idOfTheRecordedNode(name: string): string {
  return mockRecordedGraphOfTheEveryPinKindSample().nodes.find((node) => node.name === name)?.id_kept_through_renames ?? expect.unreachable(`no ${name} in the recorded sample`);
}

function valueSetOn(node: string, input: string): StreamGraphAction {
  return { operation: "set_node_input_value", stream: STREAM_ASSET, node, input, value: 0.3 };
}

test("a recorded value refusal answers a value set on the input it was recorded for alone, at its index in the transaction, until a commit is refused", () => {
  const replayed = new MockReplayedRefusals("value_of_another_type");
  expect(replayed.refusalOf([valueSetOn(idOfTheRecordedNode("beat"), "beats_per_minute")], "commit", () => STREAM_ID)).toBeNull();

  const onBase = valueSetOn(idOfTheRecordedNode("warmth"), "base");
  const asTheRuntimeAnswered = { ...MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE, refused_operation_index: 1, refused_params_pointer: "/operations/1/value" };
  expect(replayed.refusalOf([valueSetOn(idOfTheRecordedNode("beat"), "beats_per_minute"), onBase], "live", () => STREAM_ID)).toEqual(asTheRuntimeAnswered);
  expect(replayed.refusalOf([valueSetOn(idOfTheRecordedNode("beat"), "beats_per_minute"), onBase], "commit", () => STREAM_ID)).toEqual(asTheRuntimeAnswered);
  expect(replayed.refusalOf([onBase], "commit", () => STREAM_ID)).toBeNull();
});

test("no refusal is replayed while the page names none", () => {
  expect(new MockReplayedRefusals(null).refusalOf([valueSetOn(idOfTheRecordedNode("warmth"), "base")], "commit", () => STREAM_ID)).toBeNull();
});

test("the stand-in refusal of a Sweep into a Float answers that connect alone, suggesting the transact that places SweepPosition on the stream the connect names, by its id", () => {
  const replayed = new MockReplayedRefusals("link_needs_a_module_conversion");
  const sweep = "3e8b1c47-9d2a-4f60-b5e8-1a7c4d9f2e36";
  const connect = (port: string): StreamGraphAction => ({ operation: "connect", stream: STREAM_ASSET, source: { node: sweep, port: "result" }, target: { node: idOfTheRecordedNode("beat"), port } });
  expect(replayed.refusalOf([connect("level")], "commit", () => STREAM_ID)).toBeNull();

  const refusal = replayed.refusalOf([connect("beats_per_minute")], "commit", (stream) => (stream === STREAM_ASSET ? STREAM_ID : "another-stream"));
  expect(refusal).toMatchObject({ refusal_code: "link_needs_a_module_conversion", refused_operation_index: 0, refused_link: { source: { node: sweep, port: "result" }, target: { port: "beats_per_minute" } } });
  expect(refusal?.suggested_call).toEqual({
    operation: "transact",
    params: {
      operations: [
        { operation: "add_node", stream: STREAM_ID, type: "nodes.sweep:SweepPosition", as: "conversion" },
        { operation: "connect", stream: STREAM_ID, source: { node: sweep, port: "result" }, target: { node: "conversion", port: "sweep" } },
        { operation: "connect", stream: STREAM_ID, source: { node: "conversion", port: "result" }, target: { node: idOfTheRecordedNode("beat"), port: "beats_per_minute" } },
      ],
    },
  });
  expect(replayed.refusalOf([connect("beats_per_minute")], "commit", () => STREAM_ID)).toBeNull();
});
