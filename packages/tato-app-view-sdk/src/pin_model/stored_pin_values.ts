// An input's value as the store holds it, JSON, and as a control holds it, the stored value its pin
// type generates. Each built-in type that stores a value and has a control is read each way; any
// other type, a bundle among them, reads as no value, so no control is handed a value of a form it
// does not declare. A Trigger stores none. A Pin type choice stores the pin type it chose, read as
// the type the choice takes it as: an entry of its `among` list, a type its menu offers when the list
// is empty, or the listed bundle of the stream an unnamed saved bundle has the members of.

import { pinTypesTheChoiceOffers, pinTypeTheChoiceTakes, type PinTypeChoice } from "../built_in_pin_types.js";
import type { AssetPinValue, BuiltInPinTypeName, ColorPinValue, PinType, RectanglePinValue, VectorComponentCount, VectorPinValue } from "../pin_types.js";
import type { StoredPinValue } from "../node_ui/input_control_element.js";
import { isAJsonValue, type JsonValue } from "../studio_readings.js";
import { isAPinType } from "./pin_type_check.js";

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

/** `value` as an Asset: an object holding the asset's UUID under `asset` and, for an asset of an import, that project's UUID under `from`, and no other key. */
function assetOf(value: unknown): AssetPinValue | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries = new Map<string, unknown>(Object.entries(value));
  const asset = entries.get("asset");
  const from = entries.get("from");
  if (typeof asset !== "string" || asset === "") return undefined;
  if (!entries.has("from")) return entries.size === 1 ? { asset } : undefined;
  return entries.size === 2 && typeof from === "string" && from !== "" ? { asset, from } : undefined;
}

/** `value` as one of a Menu's `optionNames`, spelled as declared. */
function menuOptionOf(value: unknown, optionNames: readonly string[]): string | undefined {
  return typeof value === "string" && optionNames.includes(value) ? value : undefined;
}

/** `value` as a List of `elementType`: each element read by `readTheElement`, or `undefined` when it is no list or any element is not of that type's form. */
function listOf<Element>(value: unknown, readTheElement: (element: unknown) => Element | undefined): Element[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const elements: Element[] = [];
  for (const element of value) {
    const read = readTheElement(element);
    if (read === undefined) return undefined;
    elements.push(read);
  }
  return elements;
}

/** The pin type `choice` takes `value` as, as JSON; `undefined` for a value that is no pin type, or one the choice does not take. */
function pinTypeTheChoiceTakesTheValueAs(choice: PinTypeChoice, value: unknown): (PinType & JsonValue) | undefined {
  if (!isAJsonValue(value) || !isAPinType(value)) return undefined;
  const taken = pinTypeTheChoiceTakes(pinTypesTheChoiceOffers(choice), value);
  return taken !== undefined && isAJsonValue(taken) ? taken : undefined;
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
    case "menu":
      return menuOptionOf(value, pinType.option_names);
    case "asset":
      return assetOf(value);
    case "list_of": {
      const elementType = pinType.element_type;
      return listOf(value, (element) => (isAJsonValue(element) ? storedPinValueOfTheJson(elementType, element) : undefined));
    }
    case "pin_type_choice":
      return pinTypeTheChoiceTakesTheValueAs(pinType, value);
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
    case "menu":
      return menuOptionOf(stored, pinType.option_names);
    case "asset": {
      const asset = assetOf(stored);
      if (asset === undefined) return undefined;
      return asset.from === undefined ? { asset: asset.asset } : { asset: asset.asset, from: asset.from };
    }
    case "list_of": {
      const elementType = pinType.element_type;
      return listOf(stored, (element) => jsonOfTheStoredPinValue(elementType, element));
    }
    case "pin_type_choice":
      return pinTypeTheChoiceTakesTheValueAs(pinType, stored);
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
