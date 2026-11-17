import { expect, test } from "vitest";
import type { BuiltInPinTypeName } from "../pin_types.js";
import type { StoredPinValue } from "./input_control_element.js";
import type { NodeUiElementHost } from "./node_ui_element_host.js";
import { ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME, inputDeclarationOf } from "./test_fixtures/node_ui_listing_fixtures.js";
import { ReadOnlyValueLineElement } from "./read_only_value_line_element.js";

customElements.define("read-only-value-line-under-test", ReadOnlyValueLineElement);

const NO_STUDIO: NodeUiElementHost = { inputControlFor: () => Promise.reject(new Error("no Studio in this test")) };

/** The line's value and reason as a person reads them. */
function wordsOnTheLine(line: ReadOnlyValueLineElement): { value: string | null | undefined; because: string | null | undefined } {
  return { value: line.shadowRoot?.querySelector("[part=value]")?.textContent, because: line.shadowRoot?.querySelector("[part=because]")?.textContent };
}

test("the read-only line shows the stored value in words, and why no control draws the input", () => {
  const line = new ReadOnlyValueLineElement();
  line.pin = { declaration: inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.color), surface: "properties", studio: NO_STUDIO };
  line.state = "read_only";
  line.value = { red: 1, green: 0.5, blue: 0, alpha: 1 };
  line.because = "No control is registered for an input of type Color.";
  expect(wordsOnTheLine(line)).toEqual({ value: '{"red":1,"green":0.5,"blue":0,"alpha":1}', because: "No control is registered for an input of type Color." });
  expect([line.getAttribute("role"), line.getAttribute("aria-label")]).toEqual(["group", "Level"]);
});

test("the read-only line words each stored form, a value only a wire carries, and an input a wire feeds", () => {
  const line = new ReadOnlyValueLineElement();
  line.state = "read_only";
  const valuesAndTheirWords: [StoredPinValue<BuiltInPinTypeName>, string][] = [
    [0.25, "0.25"],
    [true, "true"],
    ["", ""],
    [9007199254740993n, "9007199254740993"],
    [[1, 2], "[1,2]"],
    [null, "No value"],
  ];
  for (const [value, words] of valuesAndTheirWords) {
    line.value = value;
    expect(wordsOnTheLine(line).value).toBe(words);
  }
  line.state = "driven_by_wire";
  expect(wordsOnTheLine(line).value).toBe("Set by its wire");
});
