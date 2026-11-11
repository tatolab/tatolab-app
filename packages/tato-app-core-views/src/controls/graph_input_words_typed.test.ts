import { expect, test } from "vitest";
import { jsonFromTheWordsTyped, jsonObjectFromTheWordsTyped, numberFromTheWordsTyped } from "./graph_input_words_typed";

test("words typed as a number read as a finite number, and blank, non-finite or other words are refused naming them", () => {
  expect(numberFromTheWordsTyped(" 0.75 ")).toEqual({ kind: "value", value: 0.75 });
  expect(numberFromTheWordsTyped("-3")).toEqual({ kind: "value", value: -3 });
  expect(numberFromTheWordsTyped("  ")).toEqual({ kind: "not_a_value", because: "“  ” isn't a number." });
  expect(numberFromTheWordsTyped("Infinity")).toEqual({ kind: "not_a_value", because: "“Infinity” isn't a number." });
  expect(numberFromTheWordsTyped("bright")).toEqual({ kind: "not_a_value", because: "“bright” isn't a number." });
});

test("words typed as JSON read as the JSON they spell, and words that don't parse are refused naming them", () => {
  expect(jsonFromTheWordsTyped('{"scene": "finale"}')).toEqual({ kind: "value", value: { scene: "finale" } });
  expect(jsonFromTheWordsTyped("[0.2, 0.4, 0.6]")).toEqual({ kind: "value", value: [0.2, 0.4, 0.6] });
  expect(jsonFromTheWordsTyped("{scene: finale}")).toEqual({ kind: "not_a_value", because: "“{scene: finale}” isn't JSON." });
  expect(jsonFromTheWordsTyped("")).toEqual({ kind: "not_a_value", because: "“” isn't JSON." });
});

test("words typed for a Records Input read only as a JSON object, and any other JSON is refused naming them before the runtime is asked", () => {
  expect(jsonObjectFromTheWordsTyped('{"scene": "finale"}')).toEqual({ kind: "value", value: { scene: "finale" } });
  expect(jsonObjectFromTheWordsTyped('"finale"')).toEqual({ kind: "not_a_value", because: "“\"finale\"” isn't a JSON object." });
  expect(jsonObjectFromTheWordsTyped("[1, 2]")).toEqual({ kind: "not_a_value", because: "“[1, 2]” isn't a JSON object." });
  expect(jsonObjectFromTheWordsTyped("null")).toEqual({ kind: "not_a_value", because: "“null” isn't a JSON object." });
  expect(jsonObjectFromTheWordsTyped("{scene")).toEqual({ kind: "not_a_value", because: "“{scene” isn't JSON." });
});
