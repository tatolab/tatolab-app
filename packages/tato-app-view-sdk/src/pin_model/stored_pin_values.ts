// An input's value as the store holds it, JSON, and as a control holds it, the stored value its pin
// type generates. The scalar types and the types made of numbers are read each way so far; a type
// whose controls have not landed reads as no value, so no control is handed a value of a form it
// does not declare.

import type { BuiltInPinTypeName, ColorPinValue, PinType, RectanglePinValue, VectorComponentCount, VectorPinValue } from "../pin_types.js";
import type { StoredPinValue } from "../node_ui/input_control_element.js";
import type { JsonValue } from "../studio_readings.js";

/** The keys a Color's value holds, in the order a control shows them. */
const COLOR_PARTS = ["red", "green", "blue", "alpha"] as const satisfies readonly (keyof ColorPinValue)[];

/** The keys a Rectangle's value holds, in the order a control shows them. */
const RECTANGLE_PARTS = ["x", "y", "width", "height"] as const satisfies readonly (keyof RectanglePinValue)[];

/** The keys a Vector of each size holds, in the order a control shows them. */
const VECTOR_PARTS: Readonly<Record<VectorComponentCount, readonly (keyof VectorPinValue)[]>> = {
  two: ["x", "y"],
  three: ["x", "y", "z"],
  four: ["x", "y", "z", "w"],
};

/** How many numbers a Transform's value holds: a 4 by 4 matrix, row by row. */
const TRANSFORM_NUMBER_COUNT = 16;

/** The keys a Vector of `componentCount` holds, in the order a control shows them. */
function vectorPartsOf(componentCount: VectorComponentCount): readonly (keyof VectorPinValue)[] {
  return VECTOR_PARTS[componentCount];
}

function isAFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The numbers `value` holds under `parts`, in their order, or `undefined` unless it is an object holding exactly `parts`, each a finite number. */
function numbersUnder(value: unknown, parts: readonly string[]): number[] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries = new Map<string, unknown>(Object.entries(value));
  if (entries.size !== parts.length) return undefined;
  const numbers = parts.map((part) => entries.get(part));
  return numbers.every(isAFiniteNumber) ? numbers : undefined;
}

function colorOf(value: unknown): ColorPinValue | undefined {
  const numbers = numbersUnder(value, COLOR_PARTS);
  if (numbers === undefined) return undefined;
  const [red = 0, green = 0, blue = 0, alpha = 0] = numbers;
  return { red, green, blue, alpha };
}

function vectorOf(value: unknown, componentCount: VectorComponentCount): VectorPinValue | undefined {
  const parts = vectorPartsOf(componentCount);
  const numbers = numbersUnder(value, parts);
  if (numbers === undefined) return undefined;
  const vector: VectorPinValue = { x: 0, y: 0 };
  parts.forEach((part, index) => {
    vector[part] = numbers[index] ?? 0;
  });
  return vector;
}

/** `value` as a Rectangle, whose width and height are never below 0. */
function rectangleOf(value: unknown): RectanglePinValue | undefined {
  const numbers = numbersUnder(value, RECTANGLE_PARTS);
  if (numbers === undefined) return undefined;
  const [x = 0, y = 0, width = 0, height = 0] = numbers;
  return width >= 0 && height >= 0 ? { x, y, width, height } : undefined;
}

/** `value` as a Transform's 16 finite numbers, or `undefined` when it is not. */
function transformNumbersOf(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.length === TRANSFORM_NUMBER_COUNT && value.every(isAFiniteNumber) ? [...value] : undefined;
}

/** The value of a type made of numbers, as `pinType` declares its form, or `undefined` for another type or a value not of that form; the store's JSON and a control's value have the same form. */
function numbersOfThePinType(pinType: PinType, value: unknown): ColorPinValue | VectorPinValue | RectanglePinValue | number[] | undefined {
  switch (pinType.type) {
    case "color":
      return colorOf(value);
    case "vector":
      return vectorOf(value, pinType.component_count);
    case "rectangle":
      return rectangleOf(value);
    case "transform":
      return transformNumbersOf(value);
    default:
      return undefined;
  }
}

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
    case "color":
    case "vector":
    case "rectangle":
    case "transform":
      return numbersOfThePinType(pinType, value);
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
    case "color":
    case "vector":
    case "rectangle":
    case "transform": {
      const numbers = numbersOfThePinType(pinType, stored);
      if (numbers === undefined || Array.isArray(numbers)) return numbers;
      return Object.fromEntries(Object.entries(numbers).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
    }
    default:
      return undefined;
  }
}
