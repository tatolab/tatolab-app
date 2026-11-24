// The family the mock's runtime serves on each port, as a runtime on contract 3 still names it beside
// the port's pin type. The Studio reads no family; only the mock's own runtime keeps them.

import { PORT_FAMILIES, type PortFamily } from "@tatolab/tato-app-view-sdk/port_families";

/** The family a port names under its `family` key, or under that declaration's own `family`; `null` for none, or one the mock does not know. */
export function mockFamilyOfThePort(port: { readonly family?: unknown }): PortFamily | null {
  const familyOnTheWire = typeof port.family === "object" && port.family !== null && "family" in port.family ? port.family.family : port.family;
  if (typeof familyOnTheWire !== "string") return null;
  const familyName = familyOnTheWire.toLowerCase();
  return PORT_FAMILIES.find((family) => family === familyName) ?? null;
}
