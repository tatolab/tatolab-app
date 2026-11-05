// A port's family as the runtime's `graph` and `/api/registry` render it. streamlib's plan decides a port renders
// its family but not yet the spelling; this reads a `family` key holding one of the five names, in any case.

import { PORT_FAMILIES, type PortFamily } from "../shared/tatolab_backend_contract.js";
import type { JsonObjectOnTheWire } from "./json_on_the_wire.js";

/** The family `port` names under `family`; `null` for none, or a name that is not one of the five. */
export function portFamilyOnTheWire(port: JsonObjectOnTheWire): PortFamily | null {
  const familyOnTheWire = port["family"];
  if (typeof familyOnTheWire !== "string") return null;
  const familyName = familyOnTheWire.toLowerCase();
  return PORT_FAMILIES.find((family) => family === familyName) ?? null;
}
