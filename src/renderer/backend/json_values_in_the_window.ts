import type { JsonValue } from "../../shared/tatolab_backend_contract";

/** Whether `value` is an object holding JSON: not `null`, not an array. */
export function isAJsonRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether `value` is JSON all the way down, with finite numbers only. */
export function isAJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isAJsonValue);
  return isAJsonRecord(value) && Object.values(value).every(isAJsonValue);
}
