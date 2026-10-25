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

/** A number as the runtime wrote it, kept by its source text, which a float would round past 2^53. */
class JsonNumberAsWritten {
  constructor(readonly writtenDigits: string) {}
}

/** The source text `JSON.parse` hands a reviver beside a primitive, in engines that pass it (Node 22, Chromium). */
interface JsonParseSourceContext {
  source?: string;
}

function jsonTextKeepingTheWrittenNumbers(value: unknown): string {
  if (value instanceof JsonNumberAsWritten) return value.writtenDigits;
  if (Array.isArray(value)) return `[${value.map(jsonTextKeepingTheWrittenNumbers).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${jsonTextKeepingTheWrittenNumbers(nestedValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * The values `pickValues` picks out of `jsonText`, each as compact JSON text whose numbers keep the digits they were
 * written in; or why `jsonText` is not JSON. `pickValues` sees the parsed text with every number held as its digits,
 * so it walks objects and arrays but reads no number.
 */
export function jsonTextsKeepingTheWrittenNumbers(jsonText: string, pickValues: (parsedValue: unknown) => readonly unknown[]): Result<string[], string> {
  try {
    const parsedValue: unknown = JSON.parse(jsonText, (_key: string, value: unknown, context?: JsonParseSourceContext) =>
      typeof value === "number" ? new JsonNumberAsWritten(context?.source ?? String(value)) : value,
    );
    return succeeded(pickValues(parsedValue).map(jsonTextKeepingTheWrittenNumbers));
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

/** `jsonObject[key]`, which must be `true` or `false`. */
export function requiredTrueOrFalse(jsonObject: JsonObjectOnTheWire, key: string): Result<boolean, string> {
  const value = jsonObject[key];
  if (value === undefined) return failedWith(`missing field \`${key}\``);
  return typeof value === "boolean" ? succeeded(value) : failedWith(`\`${key}\` is not true or false`);
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

/** The object at `key`, or an empty one when it is absent. */
export function objectOrEmpty(jsonObject: JsonObjectOnTheWire, key: string): Result<JsonObjectOnTheWire, string> {
  const value = jsonObject[key];
  if (value === undefined) return succeeded({});
  return isAJsonObject(value) ? succeeded(value) : failedWith(`\`${key}\` is not an object`);
}

/** Each of `values` read by `readOne`, or the first one's failure. */
export function everyOneRead<ValueToRead, ReadValue>(values: readonly ValueToRead[], readOne: (value: ValueToRead) => Result<ReadValue, string>): Result<ReadValue[], string> {
  const read: ReadValue[] = [];
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
