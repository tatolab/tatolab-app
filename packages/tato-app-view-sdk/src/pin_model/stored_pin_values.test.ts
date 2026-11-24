import { expect, test } from "vitest";
import type { PinType } from "../pin_types.js";
import type { JsonValue } from "../studio_readings.js";
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

const MENU: PinType = { type: "menu", option_names: ["light", "regular", "bold"] };
const ASSET: PinType = { type: "asset", media: ["image"] };
const LIST_OF_FLOATS: PinType = { type: "list_of", element_type: { type: "float" } };
const LIST_OF_COLORS: PinType = { type: "list_of", element_type: COLOR };
const AN_ASSET = "baaf9e5a-0aff-45f7-a7ea-b83db51e5a3b";
const AN_IMPORT = "0df4a7aa-1111-2222-3333-444444444444";

test("a String, a Menu option, an Asset and a List read each way in their type's form, the empty string and the empty List among them", () => {
  const cases: [PinType, JsonValue][] = [
    [{ type: "string" }, ""],
    [{ type: "string" }, "Live from the lobby"],
    [MENU, "bold"],
    [ASSET, { asset: AN_ASSET }],
    [ASSET, { asset: AN_ASSET, from: AN_IMPORT }],
    [LIST_OF_FLOATS, []],
    [LIST_OF_FLOATS, [0, 0.5, 1]],
    [LIST_OF_COLORS, [{ red: 1, green: 0.6, blue: 0.2, alpha: 1 }]],
  ];
  for (const [pinType, value] of cases) {
    expect(storedPinValueOfTheJson(pinType, value), pinType.type).toEqual(value);
    expect(jsonOfTheStoredPinValue(pinType, value), pinType.type).toEqual(value);
  }
});

test("a Menu value that is no option, an Asset that is a bare UUID or holds another key, and a List holding an element of another form read as no value", () => {
  expect(storedPinValueOfTheJson(MENU, "Bold")).toBeUndefined();
  expect(jsonOfTheStoredPinValue(MENU, "heavy")).toBeUndefined();
  expect(storedPinValueOfTheJson(ASSET, AN_ASSET)).toBeUndefined();
  expect(storedPinValueOfTheJson(ASSET, { asset: "" })).toBeUndefined();
  expect(storedPinValueOfTheJson(ASSET, { asset: AN_ASSET, path: "media/poster.png" })).toBeUndefined();
  expect(jsonOfTheStoredPinValue(ASSET, { asset: AN_ASSET, from: "" })).toBeUndefined();
  expect(storedPinValueOfTheJson(LIST_OF_FLOATS, [0, "1"])).toBeUndefined();
  expect(storedPinValueOfTheJson(LIST_OF_FLOATS, { 0: 1 })).toBeUndefined();
  expect(jsonOfTheStoredPinValue(LIST_OF_COLORS, [{ red: 1, green: 0.6, blue: 0.2 }])).toBeUndefined();
});

test("a Trigger stores no value, so it reads as none either way", () => {
  expect(storedPinValueOfTheJson({ type: "trigger" }, null)).toBeUndefined();
  expect(jsonOfTheStoredPinValue({ type: "trigger" }, null)).toBeUndefined();
});

const ANY_TYPE: PinType = { type: "pin_type_choice" };
const A_NUMBER_TYPE: PinType = { type: "pin_type_choice", among: [{ type: "float" }, { type: "integer" }] };

test("a Pin type choice reads each way as the pin type it chose, a narrowed one with its narrowing", () => {
  const cases: [PinType, JsonValue][] = [
    [ANY_TYPE, { type: "float" }],
    [ANY_TYPE, { type: "texture", pixel_formats: ["nv12"] }],
    [ANY_TYPE, { type: "encoded_video", codecs: ["h264"] }],
    [A_NUMBER_TYPE, { type: "integer" }],
  ];
  for (const [pinType, value] of cases) {
    expect(storedPinValueOfTheJson(pinType, value), JSON.stringify(value)).toEqual(value);
    expect(jsonOfTheStoredPinValue(pinType, value), JSON.stringify(value)).toEqual(value);
  }
});

test("a Pin type choice holding no pin type, one the contract refuses, one the menu does not offer, or one its `among` list leaves out reads as no value", () => {
  expect(storedPinValueOfTheJson(ANY_TYPE, "float")).toBeUndefined();
  expect(storedPinValueOfTheJson(ANY_TYPE, null)).toBeUndefined();
  expect(storedPinValueOfTheJson(ANY_TYPE, [{ type: "float" }])).toBeUndefined();
  expect(storedPinValueOfTheJson(ANY_TYPE, { type: "warmth" })).toBeUndefined();
  expect(storedPinValueOfTheJson(ANY_TYPE, { type: "texture", pixel_formats: "nv12" })).toBeUndefined();
  expect(storedPinValueOfTheJson(ANY_TYPE, { type: "encoded_video", codecs: "h264" })).toBeUndefined();
  expect(storedPinValueOfTheJson(ANY_TYPE, { type: "list_of" })).toBeUndefined();
  expect(storedPinValueOfTheJson(ANY_TYPE, { type: "list_of", element_type: { type: "float" } })).toBeUndefined();
  expect(storedPinValueOfTheJson(ANY_TYPE, { type: "pin_type_choice" })).toBeUndefined();
  expect(storedPinValueOfTheJson(A_NUMBER_TYPE, { type: "boolean" })).toBeUndefined();
  expect(jsonOfTheStoredPinValue(ANY_TYPE, { kind: "float" })).toBeUndefined();
  expect(jsonOfTheStoredPinValue(ANY_TYPE, { type: "texture", pixel_formats: "nv12" })).toBeUndefined();
  expect(jsonOfTheStoredPinValue(ANY_TYPE, { type: "pin_type_choice" })).toBeUndefined();
  expect(jsonOfTheStoredPinValue(A_NUMBER_TYPE, { type: "string" })).toBeUndefined();
});

test("a Pin type choice whose `among` list names narrowed types takes only an entry of it, its narrowing as listed", () => {
  const AN_ENCODED_VIDEO_TYPE: PinType = { type: "pin_type_choice", among: [{ type: "encoded_video", codecs: ["h264"] }] };
  expect(storedPinValueOfTheJson(AN_ENCODED_VIDEO_TYPE, { type: "encoded_video", codecs: ["h264"] })).toEqual({ type: "encoded_video", codecs: ["h264"] });
  expect(storedPinValueOfTheJson(AN_ENCODED_VIDEO_TYPE, { type: "encoded_video", codecs: ["hevc"] })).toBeUndefined();
  expect(jsonOfTheStoredPinValue(AN_ENCODED_VIDEO_TYPE, { type: "encoded_video" })).toBeUndefined();
});

const READING = { type: "bundle", name: "Reading", members: [{ name: "level", member_type: { type: "float" } }] } satisfies PinType & JsonValue;
const TONE = { type: "bundle", name: "Tone", members: [{ name: "hertz", member_type: { type: "float" } }] } satisfies PinType & JsonValue;
const A_BUNDLE_OF_THE_STREAM: PinType = { type: "pin_type_choice", among_the_bundles_its_stream_declares: true, among: [READING, TONE] };

test("a choice among the bundles its stream declares reads a bundle saved unnamed as the listed bundle of its members, and sends that named bundle", () => {
  expect(storedPinValueOfTheJson(A_BUNDLE_OF_THE_STREAM, { type: "bundle", members: [{ name: "level", member_type: { type: "float" } }] })).toEqual(READING);
  expect(storedPinValueOfTheJson(A_BUNDLE_OF_THE_STREAM, TONE)).toEqual(TONE);
  expect(jsonOfTheStoredPinValue(A_BUNDLE_OF_THE_STREAM, TONE)).toEqual(TONE);
  expect(jsonOfTheStoredPinValue(A_BUNDLE_OF_THE_STREAM, { type: "bundle", members: [{ name: "level", member_type: { type: "float" } }] })).toEqual(READING);
});

test("a bundle saved unnamed with the members of two listed bundles reads as it was saved", () => {
  const PITCH = { type: "bundle", name: "Pitch", members: [{ name: "level", member_type: { type: "float" } }] } satisfies PinType & JsonValue;
  const TWO_OF_THE_SAME_MEMBERS: PinType = { type: "pin_type_choice", among_the_bundles_its_stream_declares: true, among: [READING, PITCH] };
  const savedUnnamed = { type: "bundle", members: [{ name: "level", member_type: { type: "float" } }] } satisfies PinType & JsonValue;
  expect(storedPinValueOfTheJson(TWO_OF_THE_SAME_MEMBERS, savedUnnamed)).toEqual(savedUnnamed);
  expect(jsonOfTheStoredPinValue(TWO_OF_THE_SAME_MEMBERS, PITCH)).toEqual(PITCH);
});

test("a choice among the bundles of a stream that declares none takes no type, not any type", () => {
  const NO_BUNDLE_OF_THE_STREAM: PinType = { type: "pin_type_choice", among_the_bundles_its_stream_declares: true, among: [] };
  expect(storedPinValueOfTheJson(NO_BUNDLE_OF_THE_STREAM, { type: "float" })).toBeUndefined();
  expect(storedPinValueOfTheJson(NO_BUNDLE_OF_THE_STREAM, READING)).toBeUndefined();
  expect(jsonOfTheStoredPinValue(NO_BUNDLE_OF_THE_STREAM, { type: "float" })).toBeUndefined();
  expect(storedPinValueOfTheJson(A_BUNDLE_OF_THE_STREAM, { type: "bundle", name: "Pitch", members: [{ name: "level", member_type: { type: "float" } }] })).toBeUndefined();
});

const LAYERS = {
  type: "list_of",
  element_type: {
    type: "bundle",
    name: "Layer",
    members: [
      { name: "label", member_type: { type: "string" } },
      { name: "opacity", member_type: { type: "float" }, default_value: 1 },
    ],
  },
} satisfies PinType & JsonValue;

test("a List of bundles reads and sends each element as its members, each in its type's form, a member with a default left out", () => {
  const saved = [{ label: "back" }, { label: "front", opacity: 0.5 }];
  expect(storedPinValueOfTheJson(LAYERS, saved)).toEqual(saved);
  expect(jsonOfTheStoredPinValue(LAYERS, saved)).toEqual(saved);
});

test("a List of bundles with an element missing a member that declares no default, naming no member, or holding a member not of its type's form reads as no value", () => {
  for (const element of [{ opacity: 0.5 }, { label: "back", depth: 2 }, { label: 3 }, "back"]) {
    expect(storedPinValueOfTheJson(LAYERS, [element])).toBeUndefined();
    expect(jsonOfTheStoredPinValue(LAYERS, [element])).toBeUndefined();
  }
});
