// The one graph action that sets an input's value, saved or live as the transaction carrying it says.

import type { JsonValue, StreamGraphAction } from "../studio_readings.js";
import type { InputAddress } from "./node_inputs.js";

/** The `set_node_input_value` action setting the input at `address` to `value`; `null` takes the value off, so the input reads its declared default. */
export function setNodeInputValueAction(address: InputAddress, value: JsonValue | null): StreamGraphAction {
  return {
    operation: "set_node_input_value",
    stream: address.graph.stream_asset,
    ...(address.graph.level.length === 0 ? {} : { level: [...address.graph.level] }),
    node: address.node_id,
    input: address.input,
    value,
  };
}
