// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Reading the runtime's JSON: a required key that is absent or of another type is refused, an
// optional one reads `null`, a defaulted one reads its default, and keys the app does not know are
// ignored, so a newer runtime's additions never break the app.

import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** A JSON object as `JSON.parse` returns it. */
export type JsonObjectOnTheWire = { readonly [key: string]: unknown };

/** `jsonText` parsed, or why it is not JSON. */
export function parseJsonOnTheWire(jsonText: string): Result<unknown, string> {
  try {
    return succeeded(JSON.parse(jsonText));
  } catch (parseFailure) {
    return failedWith(describeCaughtFailure(parseFailure));
  }
}

/** Whether `value` is a JSON object rather than an array, a scalar or `null`. */
export function isAJsonObject(value: unknown): value is JsonObjectOnTheWire {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether `value` is a whole number from 0 up. */
export function isAnUnsignedInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** `value` as an object, or why it is not one. */
export function jsonObject(value: unknown, what: string): Result<JsonObjectOnTheWire, string> {
  return isAJsonObject(value) ? succeeded(value) : failedWith(`${what} is not an object`);
}

/** The required text at `key`. */
export function requiredText(jsonObject: JsonObjectOnTheWire, key: string): Result<string, string> {
  const value = jsonObject[key];
  if (value === undefined) return failedWith(`missing field \`${key}\``);
  return typeof value === "string" ? succeeded(value) : failedWith(`\`${key}\` is not a string`);
}

/** The text at `key`, or `defaultText` when it is absent. */
export function textOrDefault(jsonObject: JsonObjectOnTheWire, key: string, defaultText: string): Result<string, string> {
  return jsonObject[key] === undefined ? succeeded(defaultText) : requiredText(jsonObject, key);
}

/** The text at `key`, or `null` when it is absent or `null`. */
export function optionalText(jsonObject: JsonObjectOnTheWire, key: string): Result<string | null, string> {
  const value = jsonObject[key];
  if (value === undefined || value === null) return succeeded(null);
  return typeof value === "string" ? succeeded(value) : failedWith(`\`${key}\` is not a string`);
}

/** The required unsigned integer at `key`. */
export function requiredUnsignedInteger(jsonObject: JsonObjectOnTheWire, key: string): Result<number, string> {
  const value = jsonObject[key];
  if (value === undefined) return failedWith(`missing field \`${key}\``);
  return isAnUnsignedInteger(value) ? succeeded(value) : failedWith(`\`${key}\` is not an unsigned integer`);
}

/** The unsigned integer at `key`, or `null` when it is absent or `null`. */
export function optionalUnsignedInteger(jsonObject: JsonObjectOnTheWire, key: string): Result<number | null, string> {
  const value = jsonObject[key];
  if (value === undefined || value === null) return succeeded(null);
  return isAnUnsignedInteger(value) ? succeeded(value) : failedWith(`\`${key}\` is not an unsigned integer`);
}

/** The array at `key`, or an empty one when it is absent. */
export function arrayOrEmpty(jsonObject: JsonObjectOnTheWire, key: string): Result<readonly unknown[], string> {
  const value = jsonObject[key];
  if (value === undefined) return succeeded([]);
  return Array.isArray(value) ? succeeded(value) : failedWith(`\`${key}\` is not an array`);
}

/** Each of `values` read by `readOne`, or the first one's failure. */
export function everyOneRead<T>(values: readonly unknown[], readOne: (value: unknown) => Result<T, string>): Result<T[], string> {
  const read: T[] = [];
  for (const value of values) {
    const readValue = readOne(value);
    if (!readValue.ok) return readValue;
    read.push(readValue.value);
  }
  return succeeded(read);
}

/** `value`'s JSON text, compact, with every object's keys in sorted order so the same value always reads the same. */
export function jsonTextWithSortedKeys(value: unknown): string {
  return JSON.stringify(value, (_key, nestedValue: unknown) =>
    isAJsonObject(nestedValue)
      ? Object.fromEntries(Object.keys(nestedValue).sort().map((nestedKey) => [nestedKey, nestedValue[nestedKey]]))
      : nestedValue,
  );
}
