import { expect, test } from "vitest";
import type { NodePin } from "../../pin_model/node_pins";
import { pinTypeKeyOfTheLink } from "./node_graph_link_colour";

const pin = (name: string, typed: NodePin["pin"]): NodePin => ({ name, pin: typed, family: null, description: null, stream_facts_words: [], value_address: null });

test("a_link_takes_the_type_key_of_the_output_it_starts_from_not_the_input_it_ends_on", () => {
  const nodeById = new Map([
    ["source", { outputs: [pin("video", { pin_type: { type: "texture" }, flow: "stream" }), pin("level", null)] }],
    ["effect", { outputs: [pin("out", { pin_type: { type: "float" }, flow: "value" })] }],
  ]);
  expect(pinTypeKeyOfTheLink({ source_node_id: "source", source_pin: "video" }, nodeById)).toBe("texture");
  expect(pinTypeKeyOfTheLink({ source_node_id: "effect", source_pin: "out" }, nodeById)).toBe("float");
  expect(pinTypeKeyOfTheLink({ source_node_id: "source", source_pin: "level" }, nodeById)).toBe("untyped");
  expect(pinTypeKeyOfTheLink({ source_node_id: "gone", source_pin: "video" }, nodeById)).toBe("untyped");
});
