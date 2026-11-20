// Whether a value is a pin type, by the runtime client's check of the control contract's `PinType`,
// so the Studio holds no shape of a pin type of its own.

import { controlContractIssues } from "@tatolab/runtime-client/contract";
import type { PinType } from "../pin_types.js";

/** Whether `value` is a pin type as the runtime takes it sent to it. */
export function isAPinType(value: unknown): value is PinType {
  return controlContractIssues("PinType", value, "sent").length === 0;
}
