import { expect, test } from "vitest";
import { entryTheChoiceHolds, isTheEntryHeld, PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS, pinTypesTheChoiceOffers, pinTypeTheChoiceTakes } from "./pin_type_choice.js";
import type { PinType } from "../pin_types.js";

const READING_MEMBERS = [
  { name: "level", member_type: { type: "float" } },
  { name: "pitch", member_type: { type: "integer" } },
] as const satisfies Extract<PinType, { type: "bundle" }>["members"];
const READING: PinType = { type: "bundle", name: "Reading", members: [...READING_MEMBERS] };
const TONE: PinType = { type: "bundle", name: "Tone", members: [{ name: "hertz", member_type: { type: "float" } }] };
const PITCH: PinType = { type: "bundle", name: "Pitch", members: [...READING_MEMBERS] };
const OTHER_READING: PinType = { type: "bundle", name: "Reading", members: [{ name: "level", member_type: { type: "string" } }] };
const READING_SAVED_UNNAMED: PinType = { type: "bundle", members: [...READING_MEMBERS] };

const amongTheBundles = (among: PinType[]) => pinTypesTheChoiceOffers({ type: "pin_type_choice", among_the_bundles_its_stream_declares: true, among });

test("a choice with no list offers every built-in type written by its name alone, and one with a list offers each entry of it once", () => {
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice" })).toEqual({ offers: "any_type", entries: PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS });
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice", among: [{ type: "encoded_video", codecs: ["h264"] }, { type: "encoded_video", codecs: ["av1"] }, { codecs: ["h264"], type: "encoded_video" }] })).toEqual({
    offers: "one_of_its_list",
    entries: [
      { type: "encoded_video", codecs: ["h264"] },
      { type: "encoded_video", codecs: ["av1"] },
    ],
  });
});

test("a choice among the bundles its stream declares offers each of them, two of the same members or the same name staying two, and none while the stream declares none", () => {
  expect(amongTheBundles([READING, TONE, OTHER_READING, READING])).toEqual({ offers: "the_bundles_its_stream_declares", entries: [READING, TONE, OTHER_READING] });
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice", among_the_bundles_its_stream_declares: true })).toEqual({ offers: "the_bundles_its_stream_declares", entries: [] });
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice", among_the_bundles_its_stream_declares: false })).toEqual({ offers: "any_type", entries: PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS });
});

test("a bundle saved before bundles were named is the one listed bundle of its members, and a named one only itself", () => {
  const offered = amongTheBundles([OTHER_READING, READING, TONE]);
  expect(pinTypeTheChoiceTakes(offered, READING_SAVED_UNNAMED)).toEqual(READING);
  expect(entryTheChoiceHolds(offered, READING_SAVED_UNNAMED)).toEqual(READING);
  expect(pinTypeTheChoiceTakes(offered, { type: "bundle", name: null, members: [{ name: "level", member_type: { type: "float" }, default_value: 0.5, meaning: "loudness" }, READING_MEMBERS[1]] })).toEqual(READING);
  expect(pinTypeTheChoiceTakes(offered, TONE)).toEqual(TONE);
  expect(pinTypeTheChoiceTakes(offered, PITCH)).toBeUndefined();
  expect(pinTypeTheChoiceTakes(offered, { type: "bundle", members: [{ name: "level", member_type: { type: "float" } }] })).toBeUndefined();
  expect(pinTypeTheChoiceTakes(offered, { type: "float" })).toBeUndefined();
  expect(pinTypeTheChoiceTakes(amongTheBundles([]), READING)).toBeUndefined();
});

test("a member's type is compared with its absent or null fields left out and its keys in any order", () => {
  const offered = amongTheBundles([{ type: "bundle", name: "Reading", members: [{ name: "level", member_type: { type: "float", exact_size: null } }] }]);
  expect(entryTheChoiceHolds(offered, { type: "bundle", members: [{ name: "level", member_type: { type: "float" } }] })).toEqual(offered.entries[0]);
  const listed = pinTypesTheChoiceOffers({ type: "pin_type_choice", among: [{ type: "encoded_video", codecs: ["h264"] }] });
  expect(pinTypeTheChoiceTakes(listed, { codecs: ["h264"], type: "encoded_video" })).toEqual({ type: "encoded_video", codecs: ["h264"] });
});

test("a bundle saved unnamed with the members of several listed bundles is stored as it is and holds no entry, so either entry picked is a change", () => {
  const offered = amongTheBundles([READING, PITCH, TONE]);
  expect(pinTypeTheChoiceTakes(offered, READING_SAVED_UNNAMED)).toEqual(READING_SAVED_UNNAMED);
  expect(entryTheChoiceHolds(offered, READING_SAVED_UNNAMED)).toBeUndefined();
  expect(isTheEntryHeld(offered, READING, READING_SAVED_UNNAMED)).toBe(false);
  expect(isTheEntryHeld(offered, PITCH, READING_SAVED_UNNAMED)).toBe(false);
  expect(isTheEntryHeld(offered, PITCH, PITCH)).toBe(true);
});

test("a choice of any type takes a built-in type with its narrowing, holding the entry of its tag, and one with a list takes and holds only an entry of it", () => {
  const anyType = pinTypesTheChoiceOffers({ type: "pin_type_choice" });
  expect(pinTypeTheChoiceTakes(anyType, { type: "texture", pixel_formats: ["nv12"] })).toEqual({ type: "texture", pixel_formats: ["nv12"] });
  expect(isTheEntryHeld(anyType, { type: "texture" }, { type: "texture", pixel_formats: ["nv12"] })).toBe(true);
  expect(pinTypeTheChoiceTakes(anyType, READING)).toBeUndefined();
  const twoNarrowings = pinTypesTheChoiceOffers({ type: "pin_type_choice", among: [{ type: "encoded_video", codecs: ["h264"] }, { type: "encoded_video", codecs: ["av1"] }] });
  expect(isTheEntryHeld(twoNarrowings, { type: "encoded_video", codecs: ["av1"] }, { type: "encoded_video", codecs: ["h264"] })).toBe(false);
  expect(isTheEntryHeld(twoNarrowings, { type: "encoded_video", codecs: ["h264"] }, { type: "encoded_video", codecs: ["h264"] })).toBe(true);
  expect(pinTypeTheChoiceTakes(twoNarrowings, { type: "encoded_video" })).toBeUndefined();
  expect(isTheEntryHeld(twoNarrowings, { type: "encoded_video", codecs: ["h264"] }, null)).toBe(false);
});
