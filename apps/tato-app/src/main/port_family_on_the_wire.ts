// A port's family as the runtime's `graph`, `streamlib://node-catalog` and `/api/registry` render it: the
// port's family declaration under `family`, whose own `family` names one of the five, in lowercase.

import { PORT_FAMILIES, type PortFamily } from "../shared/tatolab_backend_contract.js";
import { isAJsonObject, type JsonObjectOnTheWire } from "./json_on_the_wire.js";

/** The family `port` declares under `family.family`, or under `family` itself; `null` for none, or a name that is not one of the five. */
export function portFamilyOnTheWire(port: JsonObjectOnTheWire): PortFamily | null {
  const familyDeclaration = port["family"];
  const familyOnTheWire = isAJsonObject(familyDeclaration) ? familyDeclaration["family"] : familyDeclaration;
  if (typeof familyOnTheWire !== "string") return null;
  const familyName = familyOnTheWire.toLowerCase();
  return PORT_FAMILIES.find((family) => family === familyName) ?? null;
}
