// The family the mock's runtime carries each port's messages in, read from the port's pin type as the
// runtime finds it. The Studio reads no family; only the mock's own runtime keeps them.

import { familyCarryingAWholeValueOf, type PortFamily } from "@tatolab/tato-app-view-sdk/port_families";
import type { DeclaredPinType, PinType } from "@tatolab/tato-app-view-sdk/pin_type_readings";

/** The pin type `pinType` names: itself when resolved, or the one a declared `is` names; `null` for any other declaration. */
function thePinTypeNamed(pinType: PinType | DeclaredPinType | null | undefined): PinType | null {
  if (pinType === null || pinType === undefined) return null;
  if ("type" in pinType) return pinType;
  return pinType.kind === "is" ? pinType.pin_type : null;
}

/** The family a whole value of the port's pin type travels in; `null` for a port with no pin type, or one no family carries. */
export function mockFamilyOfThePort(port: { readonly pin_type?: PinType | DeclaredPinType | null | undefined }): PortFamily | null {
  const pinType = thePinTypeNamed(port.pin_type);
  return pinType === null ? null : familyCarryingAWholeValueOf(pinType);
}
