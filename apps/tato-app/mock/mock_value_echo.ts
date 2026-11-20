// The one thing the mock does with a value set on a node's input: it stores it and echoes it back as the
// value the input reads, the way the runtime's graph renders a value it took. The mock checks no value
// against the input's pin; a refusal of one is a recording the runtime gave, replayed by a named scenario
// (`mock_replayed_refusals.ts`).

import type { JsonValue, StreamGraphInputValueRead } from "../src/shared/tatolab_backend_contract";
import type { MockGraphNode } from "./mock_stream_fixtures";

/**
 * Stores `to` as `node`'s input `input`, `null` taking it off, and echoes it as the value the input reads: live, on that value alone, or saved, on its pins too.
 * A live value taken off leaves the saved value read, else the default. Answers the value its pins held before.
 */
export function echoTheInputValueSet(node: MockGraphNode, input: string, to: JsonValue | null, applying: "a_transaction" | "a_live_transaction" | "undo_or_redo"): JsonValue | null {
  const declaredDefault = node.input_defaults?.[input] ?? null;
  const savedLeft = applying === "a_live_transaction" ? (node.pins?.[input] ?? null) : null;
  const valueRead: StreamGraphInputValueRead =
    to !== null
      ? { value: to, comes_from: applying === "a_live_transaction" ? "live" : "saved" }
      : savedLeft !== null
        ? { value: savedLeft, comes_from: "saved" }
        : declaredDefault !== null
          ? { value: declaredDefault, comes_from: "default" }
          : { value: null, comes_from: null };
  node.input_ports = node.input_ports.map((port) => (port.name === input && port.value_read !== null ? { ...port, value_read: valueRead } : port));
  const from = node.pins?.[input] ?? null;
  if (applying === "a_live_transaction") return from;
  const pins = { ...node.pins };
  if (to === null) delete pins[input];
  else pins[input] = to;
  node.pins = pins;
  return from;
}

/**
 * Stores `to` as the member `member` of `node`'s bundle input `input`, `null` taking it off, and echoes it as the value that member
 * reads, as `echoTheInputValueSet` does an input's: live, on that member alone, or saved, as that key of the bundle its pins hold,
 * every other member left as it is. Answers the value that key held before.
 */
export function echoTheMemberValueSet(node: MockGraphNode, input: string, member: string, to: JsonValue | null, applying: "a_transaction" | "a_live_transaction" | "undo_or_redo"): JsonValue | null {
  const savedBundle = node.pins?.[input];
  const savedMembers: Record<string, JsonValue> = typeof savedBundle === "object" && savedBundle !== null && !Array.isArray(savedBundle) ? { ...savedBundle } : {};
  const from = savedMembers[member] ?? null;
  const readOf = (declaredDefault: JsonValue | null): StreamGraphInputValueRead => {
    const savedLeft = applying === "a_live_transaction" ? from : null;
    if (to !== null) return { value: to, comes_from: applying === "a_live_transaction" ? "live" : "saved" };
    if (savedLeft !== null) return { value: savedLeft, comes_from: "saved" };
    return declaredDefault === null ? { value: null, comes_from: null } : { value: declaredDefault, comes_from: "default" };
  };
  node.input_ports = node.input_ports.map((port) =>
    port.name === input && port.member_reads !== undefined
      ? { ...port, member_reads: port.member_reads.map((read) => (read.member === member ? { ...read, value_read: readOf(read.default_value) } : read)) }
      : port,
  );
  if (applying === "a_live_transaction") return from;
  if (to === null) delete savedMembers[member];
  else savedMembers[member] = to;
  const pins = { ...node.pins };
  if (Object.keys(savedMembers).length === 0) delete pins[input];
  else pins[input] = savedMembers;
  node.pins = pins;
  return from;
}
