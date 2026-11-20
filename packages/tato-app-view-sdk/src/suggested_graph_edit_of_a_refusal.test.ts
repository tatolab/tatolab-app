import { expect, test } from "vitest";
import type { SuggestedCall } from "./studio_readings.js";
import { suggestedGraphEditOf } from "./suggested_graph_edit_of_a_refusal.js";

const SWEEP = "3e8b1c47-9d2a-4f60-b5e8-1a7c4d9f2e36";
const BEAT = "2f44fe9c-94cb-4bf0-af2c-b91345adc7c9";

/** The `transact` streamlib's `link_needs_a_module_conversion` suggests for a `Sweep` linked into a Float: `SweepPosition` placed between the two ends. */
const PLACING_THE_SWEEP_POSITION: SuggestedCall = {
  operation: "transact",
  params: {
    operations: [
      { operation: "add_node", stream: "every-pin-kind-main-8c1d2e", type: "nodes.sweep:SweepPosition", as: "conversion" },
      { operation: "connect", stream: "every-pin-kind-main-8c1d2e", source: { node: SWEEP, port: "result" }, target: { node: "conversion", port: "sweep" } },
      { operation: "connect", stream: "every-pin-kind-main-8c1d2e", source: { node: "conversion", port: "result" }, target: { node: BEAT, port: "beats_per_minute" } },
    ],
  },
};

test("a suggested transact that commits is a graph edit of its operations as the runtime named them; a live one is none, since Undo would not take it back", () => {
  expect(suggestedGraphEditOf(PLACING_THE_SWEEP_POSITION)).toEqual({ operations: PLACING_THE_SWEEP_POSITION.params["operations"], mode: "commit" });
  expect(suggestedGraphEditOf({ operation: "transact", params: { ...PLACING_THE_SWEEP_POSITION.params, mode: "commit" } })?.mode).toBe("commit");
  expect(suggestedGraphEditOf({ operation: "transact", params: { ...PLACING_THE_SWEEP_POSITION.params, mode: "live" } })).toBeNull();
});

test("a suggested read, a call naming no operation, or one the graph-edit command would not send as given is no graph edit", () => {
  expect(suggestedGraphEditOf(null)).toBeNull();
  expect(suggestedGraphEditOf({ operation: "describe_operations", params: { operations: ["transact"] } })).toBeNull();
  expect(suggestedGraphEditOf({ operation: "list_node_types", params: {} })).toBeNull();
  expect(suggestedGraphEditOf({ operation: "transact", params: { operations: [] } })).toBeNull();
  expect(suggestedGraphEditOf({ operation: "transact", params: { operations: [{ operation: "add_node" }] } })).toBeNull();
  expect(suggestedGraphEditOf({ operation: "transact", params: { ...PLACING_THE_SWEEP_POSITION.params, author: { kind: "agent", name: "alice" } } })).toBeNull();
  expect(suggestedGraphEditOf({ operation: "transact", params: { ...PLACING_THE_SWEEP_POSITION.params, idempotency_key: "k" } })).toBeNull();
});
