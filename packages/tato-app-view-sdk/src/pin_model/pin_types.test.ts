import { expect, test } from "vitest";
import { exactPinOfTheDeclaredPort, nodePinRows, type NodePin } from "./node_pins.js";
import { PIN_TYPE_KEYS, pinTypeKey, pinTypeWords, pinWords } from "./pin_types.js";

test("a_pin_with_no_exact_type_takes_the_untyped_key_and_names_no_family", () => {
  expect(pinTypeKey(null)).toBe("untyped");
  expect(pinWords(null)).toBe("No exact type");
});

test("a_pins_key_is_its_types_tag_and_a_list_takes_its_elements", () => {
  expect(pinTypeKey({ pin_type: { type: "float", exact_size: null }, flow: "value" })).toBe("float");
  expect(pinTypeKey({ pin_type: { type: "texture" }, flow: "stream" })).toBe("texture");
  expect(pinTypeKey({ pin_type: { type: "list_of", element_type: { type: "list_of", element_type: { type: "rectangle" } } }, flow: "value" })).toBe("rectangle");
  expect(new Set(PIN_TYPE_KEYS).size).toBe(PIN_TYPE_KEYS.length);
});

test("a_pin_type_reads_in_plain_words", () => {
  expect(pinTypeWords({ type: "texture", pixel_formats: ["nv12"] })).toBe("Texture");
  expect(pinTypeWords({ type: "list_of", element_type: { type: "rectangle" } })).toBe("List of Rectangle");
  expect(pinTypeWords({ type: "encoded_video", codecs: ["h264"] })).toBe("Encoded video · H.264");
  expect(pinTypeWords({ type: "encoded_audio", codecs: ["opus", "flac"] })).toBe("Encoded audio · Opus or flac");
  expect(pinTypeWords({ type: "float", exact_size: "float32" })).toBe("Float · 32-bit");
  expect(pinTypeWords({ type: "integer", exact_size: "uint8" })).toBe("Integer · unsigned 8-bit");
  expect(pinTypeWords({ type: "integer" })).toBe("Integer");
  expect(pinTypeWords({ type: "vector", component_count: "three" })).toBe("Vector · 3 components");
  expect(pinTypeWords({ type: "named", named_pin_type: "FaceLandmarks" })).toBe("FaceLandmarks");
});

test("a_pins_words_name_its_type_and_how_its_messages_are_read", () => {
  expect(pinWords({ pin_type: { type: "float" }, flow: "value" })).toBe("Float, one value at a time");
  expect(pinWords({ pin_type: { type: "texture" }, flow: "stream" })).toBe("Texture, a stream");
  expect(pinWords({ pin_type: { type: "trigger" }, flow: "trigger" })).toBe("Trigger");
});

const pin = (name: string): NodePin => ({ name, pin: null, family: null, description: null, stream_facts_words: [] });

test("a_cards_rows_are_its_outputs_then_its_inputs", () => {
  expect(nodePinRows([pin("a"), pin("b")], [pin("out")]).map((row) => `${row.side}:${row.pin.name}`)).toEqual(["output:out", "input:a", "input:b"]);
});

test("a_declared_port_shows_an_exact_type_only_where_its_node_type_states_one", () => {
  expect(exactPinOfTheDeclaredPort({ pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream" })).toEqual({ pin_type: { type: "texture" }, flow: "stream" });
  expect(exactPinOfTheDeclaredPort({ pin_type: { kind: "same_as_input", input_port_name: "a" }, flow: "value" })).toBeNull();
  expect(exactPinOfTheDeclaredPort(null)).toBeNull();
});
