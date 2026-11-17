// A port's pin type and flow as the runtime renders them beside its `family`: `pin_type` and `flow`,
// both present on a port whose code states its type exactly and both absent on any other. `graph`
// renders a port's resolved pin type, the node catalog the declared one. Each is read by the
// generated runtime client's checker against the control contract's own schema, so its shape is the
// contract's; a port that serves neither, only one, or one this app's contract cannot read is read
// as untyped, as it read before the runtime served them.

import { readControlContractValue, type ControlContractComponents, type PinFlow } from "@tatolab/runtime-client";
import type { NodeCatalogPortPin, StreamGraphPortPin } from "../shared/tatolab_backend_contract.js";
import type { JsonObjectOnTheWire } from "./json_on_the_wire.js";

/** The contract's pin type `pinTypeComponent` read under the port's `pin_type`, with its flow; `null` unless both read. */
function pinOnTheWire<PinTypeComponent extends "PinType" | "DeclaredPinType">(
  port: JsonObjectOnTheWire,
  pinTypeComponent: PinTypeComponent,
): { pin_type: ControlContractComponents[PinTypeComponent]; flow: PinFlow } | null {
  const pinType = readControlContractValue(pinTypeComponent, port["pin_type"]);
  const flow = readControlContractValue("PinFlow", port["flow"]);
  return pinType.read && flow.read ? { pin_type: pinType.value, flow: flow.value } : null;
}

/** The resolved pin type and flow a port of `graph` carries; `null` for an untyped port. */
export function streamGraphPortPinOnTheWire(port: JsonObjectOnTheWire): StreamGraphPortPin | null {
  return pinOnTheWire(port, "PinType");
}

/** The pin type and flow a node catalog port declares; `null` for an untyped port. */
export function nodeCatalogPortPinOnTheWire(port: JsonObjectOnTheWire): NodeCatalogPortPin | null {
  return pinOnTheWire(port, "DeclaredPinType");
}
