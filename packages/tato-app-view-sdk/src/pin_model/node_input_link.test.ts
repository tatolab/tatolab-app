import { expect, test } from "vitest";
import { aGraphLink, aGraphNode, aGraphPort, aStreamGraph } from "../stream_graph_builders.js";
import type { StreamGraph, StreamGraphLink } from "../studio_readings.js";
import { freeConversionWords, nodeInputLinkOfTheGraph } from "./node_input_link.js";

/** `beat.count`, an Integer, wired into `warmth.base`, a Float, with the link's marks as `marks` gives them. */
function graphWithTheCountIntoTheBase(marks: Pick<StreamGraphLink, "free_conversion" | "warnings">): StreamGraph {
  return aStreamGraph(
    [
      aGraphNode("beat", { outputs: [aGraphPort("count", "channels", { pin_type: { type: "integer" }, flow: "value" })] }),
      aGraphNode("warmth", { inputs: [aGraphPort("base", "channels", { pin_type: { type: "float" }, flow: "value" })] }),
    ],
    [{ ...aGraphLink("Lcount", ["beat", "count"], ["warmth", "base"]), ...marks }],
  );
}

test("a_link_the_runtime_marks_free_carries_the_outputs_pin_and_the_hint_names_both_types", () => {
  const link = nodeInputLinkOfTheGraph(graphWithTheCountIntoTheBase({ free_conversion: true }), "warmth", "base", null);
  expect(link).toEqual({ converts_for_free_from: { pin_type: { type: "integer" }, flow: "value" }, warnings: [] });
  expect(freeConversionWords(link, { pin_type: { type: "float" }, flow: "value" })).toBe("Reads Integer as Float, for free");
});

test("a_link_the_runtime_marks_neither_way_and_an_unlinked_input_carry_no_marks", () => {
  expect(nodeInputLinkOfTheGraph(graphWithTheCountIntoTheBase({}), "warmth", "base", null)).toBeNull();
  expect(nodeInputLinkOfTheGraph(graphWithTheCountIntoTheBase({ free_conversion: true }), "beat", "level", null)).toBeNull();
  expect(freeConversionWords(null, { pin_type: { type: "float" }, flow: "value" })).toBeNull();
});

test("a_warned_link_carries_the_runtimes_warnings_as_they_came", () => {
  const warnings = [{ warning: "meanings_differ" as const, output_meaning: "seconds", input_meaning: "frames", words: "the output carries `seconds` and the input takes `frames`" }];
  expect(nodeInputLinkOfTheGraph(graphWithTheCountIntoTheBase({ warnings }), "warmth", "base", null)).toEqual({ converts_for_free_from: null, warnings });
});
