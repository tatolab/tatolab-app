// A node catalog port's declared pin type and flow, as the runtime renders them beside its `family`:
// `pin_type` and `flow`, both present on a port whose code states its type exactly and both absent on
// any other. Each is read by the generated runtime client's checker against the control contract's
// own schema, so its shape is the contract's; a port that serves neither, only one, or one this app's
// contract cannot read is read as untyped, as it read before the runtime served them.

import type { NodeCatalogPortPin } from "../shared/tatolab_backend_contract.js";
import type { JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { readControlContractValue } from "./tatolab_runtime_control_operation_call.js";

/** The pin type and flow a node catalog port declares; `null` for an untyped port. */
export function nodeCatalogPortPinOnTheWire(port: JsonObjectOnTheWire): NodeCatalogPortPin | null {
  const pinType = readControlContractValue("DeclaredPinType", port["pin_type"]);
  const flow = readControlContractValue("PinFlow", port["flow"]);
  return pinType.read && flow.read ? { pin_type: pinType.value, flow: flow.value } : null;
}
