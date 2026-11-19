import { expect, test } from "vitest";
import { aGraphLink, aGraphNode, aGraphPort, aStreamGraph } from "../stream_graph_builders.js";
import type { StreamGraph, StreamGraphLink } from "../studio_readings.js";
import { freeConversionWords, nodeInputLinkOfTheGraph, wordsOfTheLinkWarning, wordsOfTheLinkWarnings } from "./node_input_link.js";

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
  const link = nodeInputLinkOfTheGraph(graphWithTheCountIntoTheBase({ free_conversion: true }), "warmth", "base");
  expect(link).toEqual({ converts_for_free_from: { pin_type: { type: "integer" }, flow: "value" }, warnings: [] });
  expect(freeConversionWords(link, { pin_type: { type: "float" }, flow: "value" })).toBe("Reads Integer as Float, for free");
});

test("a_link_the_runtime_marks_neither_way_and_an_unlinked_input_carry_no_marks", () => {
  expect(nodeInputLinkOfTheGraph(graphWithTheCountIntoTheBase({}), "warmth", "base")).toBeNull();
  expect(nodeInputLinkOfTheGraph(graphWithTheCountIntoTheBase({ free_conversion: true }), "beat", "level")).toBeNull();
  expect(freeConversionWords(null, { pin_type: { type: "float" }, flow: "value" })).toBeNull();
});

test("a_warned_link_carries_the_runtimes_warnings_as_they_came", () => {
  const warnings = [{ warning: "meanings_differ" as const, output_meaning: "seconds", input_meaning: "frames" }];
  expect(nodeInputLinkOfTheGraph(graphWithTheCountIntoTheBase({ warnings }), "warmth", "base")).toEqual({ converts_for_free_from: null, warnings });
});

test("each_warning_reads_as_the_runtime_writes_it", () => {
  expect(wordsOfTheLinkWarning({ warning: "meanings_differ", output_meaning: "seconds", input_meaning: "frames" })).toBe("The output carries `seconds` and the input takes `frames`");
  expect(wordsOfTheLinkWarning({ warning: "member_meanings_differ", member: "x", output_meaning: "metres", input_meaning: "pixels" })).toBe("Member `x` of the output carries `metres` and of the input takes `pixels`");
  expect(wordsOfTheLinkWarning({ warning: "vector_read_as_a_color" })).toBe("A Vector is read as a Color: x, y, z and w become red, green, blue and alpha");
  expect(wordsOfTheLinkWarning({ warning: "menu_options_the_input_does_not_list", option_names: ["light", "bold", "black"] })).toBe("The output may send `light`, `bold`, `black`, which the input does not list");
  expect(wordsOfTheLinkWarning({ warning: "menu_options_the_input_does_not_list", option_names: ["bold"] })).toBe("The output may send `bold`, which the input does not list");
  expect(wordsOfTheLinkWarning({ warning: "texture_output_states_no_format" })).toBe("The output states no pixel format, so it may send one the input cannot take");
  expect(wordsOfTheLinkWarning({ warning: "type_found_only_once_placed" })).toBe(
    "The node type's port finds its type from a link into its node or from a setting, so it is judged as taking the other end's type until a node of the type is placed",
  );
});

test("a_links_warnings_read_in_turn_and_a_link_with_none_reads_none", () => {
  expect(wordsOfTheLinkWarnings([{ warning: "vector_read_as_a_color" }, { warning: "texture_output_states_no_format" }])).toEqual([
    "A Vector is read as a Color: x, y, z and w become red, green, blue and alpha",
    "The output states no pixel format, so it may send one the input cannot take",
  ]);
  expect(wordsOfTheLinkWarnings(undefined)).toEqual([]);
});
