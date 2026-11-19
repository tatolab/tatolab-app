import { expect, test } from "vitest";
import { jsonTextOf } from "./json_text.js";

test("a_reading_holding_a_whole_number_past_the_exact_doubles_is_written_with_its_digits", () => {
  expect(jsonTextOf({ id: "P0", config_checksum: 6086514543335466803n, inputs: [{ value: -9007199254740993n }] })).toBe(
    '{"id":"P0","config_checksum":6086514543335466803,"inputs":[{"value":-9007199254740993}]}',
  );
});

test("a_reading_of_plain_json_is_written_as_json_stringify_writes_it", () => {
  const reading = { kind: "read", graph: { nodes: [{ name: "a \"quoted\" name", gain: 0.5, on: true, from: null }], links: [] } };

  expect(jsonTextOf(reading)).toBe(JSON.stringify(reading));
});

test("what_json_leaves_out_is_left_out_of_an_object_and_null_in_an_array_and_alone", () => {
  expect(jsonTextOf({ shown: 1, unset: undefined })).toBe('{"shown":1}');
  expect(jsonTextOf([1, undefined])).toBe("[1,null]");
  expect(jsonTextOf(undefined)).toBe("null");
});
