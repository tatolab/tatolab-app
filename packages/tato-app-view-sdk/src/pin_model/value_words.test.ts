import { expect, test } from "vitest";
import { valueWords } from "./value_words.js";

test("a_float_reads_to_at_most_three_decimals_and_never_as_a_whole_number", () => {
  const float = { type: "float" } as const;
  expect(valueWords(float, 0.5)).toBe("0.5");
  expect(valueWords(float, 1)).toBe("1.0");
  expect(valueWords(float, -0)).toBe("0.0");
  expect(valueWords(float, 0.123456)).toBe("0.123");
  expect(valueWords(float, 1234567.5)).toBe("1234567.5");
  expect(valueWords(float, 0.00001234)).toBe("1.23e-5");
});

test("a_value_reads_in_its_types_words_and_a_value_not_of_its_type_reads_as_none", () => {
  expect(valueWords({ type: "integer" }, 12)).toBe("12");
  expect(valueWords({ type: "integer" }, 1.5)).toBeNull();
  expect(valueWords({ type: "boolean" }, true)).toBe("On");
  expect(valueWords({ type: "boolean" }, false)).toBe("Off");
  expect(valueWords({ type: "menu", option_names: ["fit", "fill"] }, "fill")).toBe("fill");
  expect(valueWords({ type: "string" }, "")).toBe("");
  expect(valueWords({ type: "float" }, "0.5")).toBeNull();
  expect(valueWords({ type: "float" }, null)).toBeNull();
  expect(valueWords(null, 0.5)).toBeNull();
  expect(valueWords({ type: "texture" }, 0.5)).toBeNull();
});
