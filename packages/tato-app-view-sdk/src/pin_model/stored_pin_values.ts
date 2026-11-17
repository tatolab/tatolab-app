// An input's value as the store holds it, JSON, and as a control holds it, the stored value its pin
// type generates. Only the scalar types are read each way so far; a type whose controls have not
// landed reads as no value, so no control is handed a value of a form it does not declare.

import type { BuiltInPinTypeName, PinType } from "../pin_types.js";
import type { StoredPinValue } from "../node_ui/input_control_element.js";
import type { JsonValue } from "../studio_readings.js";

/** The stored value a control of `pinType` is handed for `value`, or `undefined` when `value` is not one of that type's form, or the type is not read yet. */
export function storedPinValueOfTheJson(pinType: PinType, value: JsonValue | null): StoredPinValue<BuiltInPinTypeName> | undefined {
  switch (pinType.type) {
    case "float":
      return typeof value === "number" ? value : undefined;
    case "integer":
      return typeof value === "number" && Number.isInteger(value) ? value : undefined;
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "string":
      return typeof value === "string" ? value : undefined;
    default:
      return undefined;
  }
}

/** The JSON the store sends for `stored`, a value a control of `pinType` carried in an event, or `undefined` when it is not of that type's form. */
export function jsonOfTheStoredPinValue(pinType: PinType, stored: unknown): JsonValue | undefined {
  switch (pinType.type) {
    case "float":
      return typeof stored === "number" && Number.isFinite(stored) ? stored : undefined;
    case "integer":
      if (typeof stored === "bigint") return Number.isSafeInteger(Number(stored)) ? Number(stored) : undefined;
      return typeof stored === "number" && Number.isSafeInteger(stored) ? stored : undefined;
    case "boolean":
      return typeof stored === "boolean" ? stored : undefined;
    case "string":
      return typeof stored === "string" ? stored : undefined;
    default:
      return undefined;
  }
}
