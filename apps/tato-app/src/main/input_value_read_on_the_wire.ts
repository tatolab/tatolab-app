// The value an input of a running graph reads while unlinked, as `graph` renders it beside the
// input's pin type: `value` and `value_comes_from`, both absent on an input that takes no stored
// value. A link that feeds the input renders `value_comes_from` `wire` and no `value`; an input that
// reads nothing renders a `null` value and no `value_comes_from`. A shape this app's contract cannot
// read is read as no value, as the input read before the runtime served one.

import type { StreamGraphInputValueRead } from "../shared/tatolab_backend_contract.js";
import { isAJsonValue } from "./json_on_the_wire.js";
import { readControlContractValue } from "./tatolab_runtime_control_operation_call.js";

/** What input `port`, or an `input_value_changed` naming it, says it reads while unlinked and where that comes from; `null` for an input that takes no stored value, and for an output. */
export function inputValueReadOnTheWire(port: { readonly value?: unknown; readonly value_comes_from?: unknown }): StreamGraphInputValueRead | null {
  const value = port["value"];
  const valueComesFrom = port["value_comes_from"];
  if (valueComesFrom === undefined) return value === null ? { value: null, comes_from: null } : null;
  const comesFrom = readControlContractValue("InputValueComesFromOnTheWire", valueComesFrom);
  if (!comesFrom.read) return null;
  if (comesFrom.value === "wire") return { value: null, comes_from: "wire" };
  return isAJsonValue(value) ? { value, comes_from: comesFrom.value } : null;
}
