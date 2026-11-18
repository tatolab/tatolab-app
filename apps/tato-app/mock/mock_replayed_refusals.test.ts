import { expect, test } from "vitest";
import { MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE, mockRecordedGraphOfTheEveryPinKindSample } from "./mock_recordings";
import { MockReplayedRefusals } from "./mock_replayed_refusals";
import type { StreamGraphAction } from "../src/shared/tatolab_backend_contract";

const STREAM_ASSET = "a-stream-asset";

function idOfTheRecordedNode(name: string): string {
  return mockRecordedGraphOfTheEveryPinKindSample().nodes.find((node) => node.name === name)?.id_kept_through_renames ?? expect.unreachable(`no ${name} in the recorded sample`);
}

function valueSetOn(node: string, input: string): StreamGraphAction {
  return { operation: "set_node_input_value", stream: STREAM_ASSET, node, input, value: 0.3 };
}

test("a recorded value refusal answers a value set on the input it was recorded for alone, at its index in the transaction, until a commit is refused", () => {
  const replayed = new MockReplayedRefusals("value_of_another_type");
  expect(replayed.refusalOf([valueSetOn(idOfTheRecordedNode("beat"), "beats_per_minute")], "commit")).toBeNull();

  const onBase = valueSetOn(idOfTheRecordedNode("warmth"), "base");
  const asTheRuntimeAnswered = { ...MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE, refused_operation_index: 1, refused_params_pointer: "/operations/1/value" };
  expect(replayed.refusalOf([valueSetOn(idOfTheRecordedNode("beat"), "beats_per_minute"), onBase], "live")).toEqual(asTheRuntimeAnswered);
  expect(replayed.refusalOf([valueSetOn(idOfTheRecordedNode("beat"), "beats_per_minute"), onBase], "commit")).toEqual(asTheRuntimeAnswered);
  expect(replayed.refusalOf([onBase], "commit")).toBeNull();
});

test("no refusal is replayed while the page names none", () => {
  expect(new MockReplayedRefusals(null).refusalOf([valueSetOn(idOfTheRecordedNode("warmth"), "base")], "commit")).toBeNull();
});
