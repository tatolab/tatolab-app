// A value an input holds as a person reads it on its row, in the JSON form the runtime stores it in.

import type { PinType } from "../pin_type_readings.js";
import type { JsonValue } from "../studio_readings.js";

/** A Float to at most three decimals and at least one, so it never reads as a whole number. */
const FLOAT_FORMAT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 3, useGrouping: false });

/** The smallest Float three decimals still show; one nearer zero is written with its exponent. */
const SMALLEST_FLOAT_SHOWN_IN_DECIMALS = 0.0005;

function floatWords(value: number): string {
  if (value === 0) return FLOAT_FORMAT.format(0);
  return Math.abs(value) < SMALLEST_FLOAT_SHOWN_IN_DECIMALS ? value.toExponential(2) : FLOAT_FORMAT.format(value);
}

/** `value` in plain words for an input of `pinType`: "0.5", "On", the text of a String or a Menu; `null` for no value, a value not of that type, or a type whose values are not written as words yet. */
export function valueWords(pinType: PinType | null, value: JsonValue | null): string | null {
  if (pinType === null || value === null) return null;
  switch (pinType.type) {
    case "float":
      return typeof value === "number" ? floatWords(value) : null;
    case "integer":
      return typeof value === "number" && Number.isInteger(value) ? String(value) : null;
    case "boolean":
      return typeof value === "boolean" ? (value ? "On" : "Off") : null;
    case "string":
    case "menu":
      return typeof value === "string" ? value : null;
    default:
      return null;
  }
}

/** A value of an input with no exact type in words, as JSON is written compactly, a string as itself; `null` for no value. */
export function wordsOfAValueOfNoType(value: JsonValue | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}
