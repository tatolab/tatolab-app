// The one thing the mock does with a value set on a node's input: it stores it and echoes it back as the
// value the input reads, the way the runtime's graph renders a value it took. The mock checks no value
// against the input's pin; a refusal of one is a recording the runtime gave, replayed by a named scenario
// (`mock_replayed_refusals.ts`).

import type { JsonValue, StreamGraphInputValueRead } from "../src/shared/tatolab_backend_contract";
import type { MockGraphNode } from "./mock_stream_fixtures";

/**
 * Stores `to` as `node`'s input `input`, `null` taking it off, and echoes it as the value the input reads: live, on that value alone, or saved, on its pins too.
 * Answers the value its pins held before.
 */
export function echoTheInputValueSet(node: MockGraphNode, input: string, to: JsonValue | null, applying: "a_transaction" | "a_live_transaction" | "undo_or_redo"): JsonValue | null {
  const declaredDefault = node.input_defaults?.[input] ?? null;
  const valueRead: StreamGraphInputValueRead =
    to !== null ? { value: to, comes_from: applying === "a_live_transaction" ? "live" : "saved" } : declaredDefault !== null ? { value: declaredDefault, comes_from: "default" } : { value: null, comes_from: null };
  node.input_ports = node.input_ports.map((port) => (port.name === input && port.value_read !== null ? { ...port, value_read: valueRead } : port));
  const from = node.pins?.[input] ?? null;
  if (applying === "a_live_transaction") return from;
  const pins = { ...node.pins };
  if (to === null) delete pins[input];
  else pins[input] = to;
  node.pins = pins;
  return from;
}
