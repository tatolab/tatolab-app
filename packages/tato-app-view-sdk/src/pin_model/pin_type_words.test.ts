import { readFileSync } from "node:fs";
import type { PinType } from "../pin_type_readings.js";
import { expect, test } from "vitest";
import { exactPinOfTheDeclaredPort, nodePinRows, type NodePin } from "./node_pins.js";
import { membersOfAnOfferedPinTypeInWords, PIN_TYPE_KEYS, pinTypeKey, pinTypeWords, pinWords, wordsOfAnOfferedPinType, wordsOfTheBundleMembers } from "./pin_type_words.js";

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
  expect(pinTypeWords({ type: "encoded_audio", codecs: ["opus", "flac"] })).toBe("Encoded audio · Opus or FLAC");
  expect(pinTypeWords({ type: "float", exact_size: "float32" })).toBe("Float · 32-bit");
  expect(pinTypeWords({ type: "integer", exact_size: "uint8" })).toBe("Integer · unsigned 8-bit");
  expect(pinTypeWords({ type: "integer" })).toBe("Integer");
  expect(pinTypeWords({ type: "vector", component_count: "three" })).toBe("Vector · 3 components");
  expect(pinTypeWords({ type: "named", named_pin_type: "FaceLandmarks" })).toBe("FaceLandmarks");
  expect(pinTypeWords({ type: "connection", connection_type: "acme:RelayConnection" })).toBe("Connection · acme:RelayConnection");
});

const READING_MEMBERS = [
  { name: "level", member_type: { type: "float", exact_size: "float32" } },
  { name: "tags", member_type: { type: "list_of", element_type: { type: "string" } } },
] as const satisfies Extract<PinType, { type: "bundle" }>["members"];

test("a_bundle_reads_as_the_class_that_declares_it_and_its_members", () => {
  expect(pinTypeWords({ type: "bundle", name: "Reading", members: [...READING_MEMBERS] })).toBe("Bundle Reading · level, tags");
  expect(pinTypeWords({ type: "bundle", members: [...READING_MEMBERS] })).toBe("Bundle · level, tags");
  expect(pinTypeWords({ type: "bundle", name: null, members: [...READING_MEMBERS] })).toBe("Bundle · level, tags");
  expect(pinWords({ pin_type: { type: "bundle", name: "Reading", members: [...READING_MEMBERS] }, flow: "value" })).toBe("Bundle Reading · level, tags, one value at a time");
});

test("a_bundles_members_read_each_by_its_name_and_type", () => {
  expect(wordsOfTheBundleMembers({ type: "bundle", name: "Reading", members: [...READING_MEMBERS] })).toBe("level: Float · 32-bit, tags: List of String");
  expect(wordsOfTheBundleMembers({ type: "bundle", members: [] })).toBe("no members");
});

test("a type a choice offers is picked by its bundle's class, or in plain words with its narrowing, and only a bundle shows members on its tooltip", () => {
  expect(wordsOfAnOfferedPinType({ type: "bundle", name: "Reading", members: [...READING_MEMBERS] })).toBe("Reading");
  expect(membersOfAnOfferedPinTypeInWords({ type: "bundle", name: "Reading", members: [...READING_MEMBERS] })).toBe("level: Float · 32-bit, tags: List of String");
  expect(wordsOfAnOfferedPinType({ type: "bundle", members: [...READING_MEMBERS] })).toBe("Bundle · level, tags");
  expect(wordsOfAnOfferedPinType({ type: "encoded_video", codecs: ["h264"] })).toBe("Encoded video · H.264");
  expect(wordsOfAnOfferedPinType({ type: "encoded_video" })).toBe("Encoded video");
  expect(membersOfAnOfferedPinTypeInWords({ type: "encoded_video" })).toBeUndefined();
});

test("a_pins_words_name_its_type_and_how_its_messages_are_read", () => {
  expect(pinWords({ pin_type: { type: "float" }, flow: "value" })).toBe("Float, one value at a time");
  expect(pinWords({ pin_type: { type: "texture" }, flow: "stream" })).toBe("Texture, a stream");
  expect(pinWords({ pin_type: { type: "trigger" }, flow: "trigger" })).toBe("Trigger");
});

const pin = (name: string): NodePin => ({ name, member: null, pin: null, family: null, description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null, bundle: null, slot: null });

test("a_cards_rows_are_its_outputs_then_its_inputs", () => {
  expect(nodePinRows([pin("a"), pin("b")], [pin("out")]).map((row) => `${row.side}:${row.node_pin.name}`)).toEqual(["output:out", "input:a", "input:b"]);
});

test("a_declared_port_shows_an_exact_type_only_where_its_node_type_states_one", () => {
  expect(exactPinOfTheDeclaredPort({ pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream" })).toEqual({ pin_type: { type: "texture" }, flow: "stream" });
  expect(exactPinOfTheDeclaredPort({ pin_type: { kind: "same_as_input", input_port_name: "a" }, flow: "value" })).toBeNull();
  expect(exactPinOfTheDeclaredPort({})).toBeNull();
});

test("every_pin_type_key_has_a_socket_colour_rule_and_a_colour_token", () => {
  const canvasStyles = readFileSync(new URL("../design_system/styles/node_graph_canvas.css", import.meta.url), "utf8");
  const tokens = readFileSync(new URL("../design_system/styles/tokens.css", import.meta.url), "utf8");
  const keysWithoutARule = PIN_TYPE_KEYS.filter((key) => !canvasStyles.includes(`[data-pin-type="${key}"] { --node-graph-pin-colour: var(--studio-pin-type-${key.replaceAll("_", "-")}); }`));
  const keysWithoutAToken = PIN_TYPE_KEYS.filter((key) => !new RegExp(`--studio-pin-type-${key.replaceAll("_", "-")}:`).test(tokens));
  expect({ keysWithoutARule, keysWithoutAToken }).toEqual({ keysWithoutARule: [], keysWithoutAToken: [] });
});
