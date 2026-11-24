import { expect, test } from "vitest";
import { membersOfAnOfferedPinTypeInWords, PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS, pinTypesTheChoiceOffers, pinTypeTheChoiceTakes, wordsOfAnOfferedPinType } from "./built_in_pin_types.js";
import type { PinType } from "./pin_types.js";

const READING_MEMBERS = [
  { name: "level", member_type: { type: "float" } },
  { name: "pitch", member_type: { type: "integer" } },
] as const satisfies Extract<PinType, { type: "bundle" }>["members"];
const READING: PinType = { type: "bundle", name: "Reading", members: [...READING_MEMBERS] };
const TONE: PinType = { type: "bundle", name: "Tone", members: [...READING_MEMBERS] };
const OTHER_READING: PinType = { type: "bundle", name: "Reading", members: [{ name: "level", member_type: { type: "string" } }] };

test("a choice with no list offers every built-in type written by its name alone, and one with a list offers each entry of it once", () => {
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice" })).toEqual({ offers: "any_type", entries: PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS });
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice", among: [{ type: "encoded_video", codecs: ["h264"] }, { type: "encoded_video", codecs: ["av1"] }, { type: "encoded_video", codecs: ["h264"] }] })).toEqual({
    offers: "one_of_its_list",
    entries: [
      { type: "encoded_video", codecs: ["h264"] },
      { type: "encoded_video", codecs: ["av1"] },
    ],
  });
});

test("a choice among the bundles its stream declares offers each of them, two of the same members or the same name staying two, and none while the stream declares none", () => {
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice", among_the_bundles_its_stream_declares: true, among: [READING, TONE, OTHER_READING, READING] })).toEqual({ offers: "the_bundles_its_stream_declares", entries: [READING, TONE, OTHER_READING] });
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice", among_the_bundles_its_stream_declares: true })).toEqual({ offers: "the_bundles_its_stream_declares", entries: [] });
  expect(pinTypesTheChoiceOffers({ type: "pin_type_choice", among_the_bundles_its_stream_declares: false })).toEqual({ offers: "any_type", entries: PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS });
});

test("a bundle saved before bundles were named is taken as the listed bundle of the same members, and a named one only as itself", () => {
  const offered = pinTypesTheChoiceOffers({ type: "pin_type_choice", among_the_bundles_its_stream_declares: true, among: [OTHER_READING, READING, TONE] });
  expect(pinTypeTheChoiceTakes(offered, { type: "bundle", members: [...READING_MEMBERS] })).toEqual(READING);
  expect(pinTypeTheChoiceTakes(offered, { type: "bundle", name: null, members: [{ name: "level", member_type: { type: "float" }, default_value: 0.5, meaning: "loudness" }, READING_MEMBERS[1]] })).toEqual(READING);
  expect(pinTypeTheChoiceTakes(offered, TONE)).toEqual(TONE);
  expect(pinTypeTheChoiceTakes(offered, { type: "bundle", name: "Pitch", members: [...READING_MEMBERS] })).toBeUndefined();
  expect(pinTypeTheChoiceTakes(offered, { type: "bundle", members: [{ name: "level", member_type: { type: "float" } }] })).toBeUndefined();
  expect(pinTypeTheChoiceTakes(offered, { type: "float" })).toBeUndefined();
  expect(pinTypeTheChoiceTakes(pinTypesTheChoiceOffers({ type: "pin_type_choice", among_the_bundles_its_stream_declares: true }), READING)).toBeUndefined();
});

test("a choice of any type takes a built-in type with its narrowing, and one with a list takes only an entry of it", () => {
  expect(pinTypeTheChoiceTakes(pinTypesTheChoiceOffers({ type: "pin_type_choice" }), { type: "texture", pixel_formats: ["nv12"] })).toEqual({ type: "texture", pixel_formats: ["nv12"] });
  expect(pinTypeTheChoiceTakes(pinTypesTheChoiceOffers({ type: "pin_type_choice" }), READING)).toBeUndefined();
  const aNumber = pinTypesTheChoiceOffers({ type: "pin_type_choice", among: [{ type: "float" }, { type: "integer" }] });
  expect(pinTypeTheChoiceTakes(aNumber, { type: "integer" })).toEqual({ type: "integer" });
  expect(pinTypeTheChoiceTakes(aNumber, { type: "boolean" })).toBeUndefined();
});

test("an offered bundle is named by the class that declares it, with its members on its tooltip, and any other type as the built-in type list names it", () => {
  expect(wordsOfAnOfferedPinType(READING)).toBe("Reading");
  expect(membersOfAnOfferedPinTypeInWords(READING)).toBe("level: Float, pitch: Integer");
  expect(wordsOfAnOfferedPinType({ type: "bundle", members: [...READING_MEMBERS] })).toBe("Bundle · level, pitch");
  expect(wordsOfAnOfferedPinType({ type: "encoded_video", codecs: ["h264"] })).toBe("Encoded video");
  expect(membersOfAnOfferedPinTypeInWords({ type: "encoded_video" })).toBeUndefined();
});
