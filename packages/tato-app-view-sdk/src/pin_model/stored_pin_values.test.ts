import { expect, test } from "vitest";
import type { PinType } from "../pin_types.js";
import { jsonOfTheStoredPinValue, storedPinValueOfTheJson } from "./stored_pin_values.js";

const COLOR: PinType = { type: "color" };
const VECTOR_2: PinType = { type: "vector", component_count: "two" };
const VECTOR_4: PinType = { type: "vector", component_count: "four" };
const RECTANGLE: PinType = { type: "rectangle" };
const TRANSFORM: PinType = { type: "transform" };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

test("a value made of numbers reads each way in its type's form, a Color part outside 0 to 1 as sent", () => {
  for (const [pinType, value] of [
    [COLOR, { red: 1.5, green: 0.6, blue: 0.2, alpha: 1 }],
    [VECTOR_2, { x: 0.5, y: -2 }],
    [VECTOR_4, { x: 1, y: 2, z: 3, w: 4 }],
    [RECTANGLE, { x: -0.25, y: 0.25, width: 0, height: 0.5 }],
    [TRANSFORM, IDENTITY],
  ] as const) {
    expect(storedPinValueOfTheJson(pinType, value), pinType.type).toEqual(value);
    expect(jsonOfTheStoredPinValue(pinType, value), pinType.type).toEqual(value);
  }
});

test("a value not of its type's form reads as no value", () => {
  expect(storedPinValueOfTheJson(COLOR, { red: 1, green: 0.6, blue: 0.2 })).toBeUndefined();
  expect(storedPinValueOfTheJson(COLOR, { red: 1, green: 0.6, blue: 0.2, alpha: 1, extra: 0 })).toBeUndefined();
  expect(storedPinValueOfTheJson(COLOR, { red: "1", green: 0.6, blue: 0.2, alpha: 1 })).toBeUndefined();
  expect(storedPinValueOfTheJson(VECTOR_2, { x: 1, y: 2, z: 3 })).toBeUndefined();
  expect(storedPinValueOfTheJson(VECTOR_4, { x: 1, y: 2, z: 3 })).toBeUndefined();
  expect(storedPinValueOfTheJson(RECTANGLE, { x: 0, y: 0, width: -1, height: 1 })).toBeUndefined();
  expect(storedPinValueOfTheJson(TRANSFORM, IDENTITY.slice(1))).toBeUndefined();
  expect(storedPinValueOfTheJson(TRANSFORM, [...IDENTITY.slice(1), "1"])).toBeUndefined();
  expect(jsonOfTheStoredPinValue(VECTOR_2, { x: Number.NaN, y: 0 })).toBeUndefined();
  expect(jsonOfTheStoredPinValue(TRANSFORM, [...IDENTITY.slice(1), Number.POSITIVE_INFINITY])).toBeUndefined();
});
