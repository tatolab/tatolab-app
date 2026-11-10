import { expect, test } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { streamGraphCanvasContents } from "./stream_graph_canvas_contents";

function graphNode(name: string, inputs: string[], outputs: string[]): StreamGraphNode {
  return {
    id: name.toUpperCase(),
    name,
    type: `nodes.${name}:Effect`,
    state: "Running",
    failed_because: null,
    config: {},
    input_ports: inputs.map((port) => ({ name: port, family: "image" as const, stream_facts: null, values_checked: null })),
    output_ports: outputs.map((port) => ({ name: port, family: null, stream_facts: null, values_checked: null })),
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    pins: {},
    studio: NODE_STUDIO_FIELDS_NONE_SET,
  };
}

const GRAPH: StreamGraphSummary = {
  stream: "main",
  stream_asset: null,
  groups: [],
  notes: [],
  nodes: [
    {
      ...graphNode("camera", [], []),
      output_ports: [
        {
          name: "video",
          family: "image",
          stream_facts: { family: "image", frame_rate: { numerator: 30000, denominator: 1001 }, content_light_level: null, mastering_display_colour_volume: null },
          values_checked: null,
        },
      ],
    },
    graphNode("invert", ["video_in"], ["video_out"]),
  ],
  links: [
    { id: "L1", source_node: "camera", source_port: "video", target_node: "invert", target_port: "video_in", state: "wired" },
    { id: "", source_node: "invert", source_port: "video_out", target_node: "display", target_port: "video", state: "awaiting_remote" },
    { id: "L3", source_node: "camera", source_port: "video", target_node: "display", target_port: "video", state: "reconnecting_later" },
  ],
  graph_document_text: "{}",
};

test("each_node_is_a_card_keyed_by_its_name_with_its_ports_as_pins_and_an_input_shows_the_facts_its_one_link_carries", () => {
  expect(streamGraphCanvasContents(GRAPH).nodes).toEqual([
    { node_id: "camera", title: "camera", condition: { look: "healthy" }, input_pins: [], output_pins: [{ name: "video", family: "image", stream_facts_words: ["29.97 fps"] }] },
    {
      node_id: "invert",
      title: "invert",
      condition: { look: "healthy" },
      input_pins: [{ name: "video_in", family: "image", stream_facts_words: ["29.97 fps"] }],
      output_pins: [{ name: "video_out", family: null, stream_facts_words: [] }],
    },
  ]);
});

test("each_link_is_drawn_by_its_state_and_described_in_words", () => {
  expect(streamGraphCanvasContents(GRAPH).links.map((link) => [link.link_id, link.look, link.description])).toEqual([
    ["L1", "carrying", "camera.video → invert.video_in, wired"],
    ["invert.video_out->display.video", "waiting", "invert.video_out → display.video, waiting for the other machine"],
    ["L3", "waiting", "camera.video → display.video, reconnecting_later"],
  ]);
});

test("a_node_in_error_is_a_failed_card_carrying_why_word_for_word_and_a_restarting_node_a_restarting_card", () => {
  const failedBecause = "start() raised: RuntimeError: no Rive file at ./missing.riv";
  const graph: StreamGraphSummary = {
    ...GRAPH,
    nodes: [
      { ...graphNode("rivesource", [], ["video"]), state: "Error", failed_because: failedBecause },
      { ...graphNode("browsersource", [], ["video"]), state: "Error" },
      { ...graphNode("camera", [], ["video"]), state: "Restarting" },
      { ...graphNode("invert", ["video_in"], ["video_out"]), state: "Pending" },
    ],
    links: [],
  };

  expect(streamGraphCanvasContents(graph).nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["rivesource", { look: "failed", failed_because: failedBecause }],
    ["browsersource", { look: "failed", failed_because: null }],
    ["camera", { look: "restarting" }],
    ["invert", { look: "healthy" }],
  ]);
});
