import { describe, expect, it } from "vitest";
import { propertiesListedWords, propertiesMatchingTheSearch } from "./properties_matching_the_search";

describe("searching a node's properties", () => {
  it("keeps the inputs, settings among them, and outputs whose name matches, ignoring case, and counts them", () => {
    const matching = propertiesMatchingTheSearch(["saturation", "hue_shift", "edge_softness", "video_from_upstream", "amount"], ["video_to_downstream"], "SAT");
    expect([...matching.inputs_listed]).toEqual(["saturation"]);
    expect(matching.outputs_listed.size).toBe(0);
    expect(propertiesListedWords(matching)).toBe("1 of 6 properties");
  });

  it("matches an input by its name in words as well as its name", () => {
    expect([...propertiesMatchingTheSearch(["hue_shift"], [], "hue shift").inputs_listed]).toEqual(["hue_shift"]);
  });

  it("matches inputs and outputs by name", () => {
    const matching = propertiesMatchingTheSearch(["saturation", "video_from_upstream"], ["video_to_downstream"], "video");
    expect([matching.inputs_listed.has("video_from_upstream"), matching.outputs_listed.has("video_to_downstream"), matching.listed_count]).toEqual([true, true, 2]);
  });

  it("keeps every property for a blank search", () => {
    const matching = propertiesMatchingTheSearch(["saturation", "amount"], [], " ");
    expect([matching.is_searching, matching.listed_count]).toEqual([false, 2]);
  });
});
