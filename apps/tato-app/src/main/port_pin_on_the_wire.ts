// A port's pin type and flow as the runtime renders them beside its `family`: `pin_type` and `flow`,
// both present on a port whose code states its type exactly and both absent on any other. `graph`
// renders a port's resolved pin type, the node catalog the declared one. Each is checked against
// the control contract's own schema in the generated runtime client, so its shape is the
// contract's; a port that serves neither, only one, or one this app's contract cannot read is read
// as untyped, as it read before the runtime served them.

import { ControlSchemas } from "@tatolab/runtime-client";
import type { NodeCatalogPortPin, StreamGraphPortPin } from "../shared/tatolab_backend_contract.js";
import type { JsonObjectOnTheWire } from "./json_on_the_wire.js";

/** The resolved pin type and flow a port of `graph` carries; `null` for an untyped port. */
export function streamGraphPortPinOnTheWire(port: JsonObjectOnTheWire): StreamGraphPortPin | null {
  const pinType = ControlSchemas.components.PinType.safeParse(port["pin_type"]);
  const flow = ControlSchemas.components.PinFlow.safeParse(port["flow"]);
  return pinType.success && flow.success ? { pin_type: pinType.data, flow: flow.data } : null;
}

/** The pin type and flow a node catalog port declares; `null` for an untyped port. */
export function nodeCatalogPortPinOnTheWire(port: JsonObjectOnTheWire): NodeCatalogPortPin | null {
  const pinType = ControlSchemas.components.DeclaredPinType.safeParse(port["pin_type"]);
  const flow = ControlSchemas.components.PinFlow.safeParse(port["flow"]);
  return pinType.success && flow.success ? { pin_type: pinType.data, flow: flow.data } : null;
}
