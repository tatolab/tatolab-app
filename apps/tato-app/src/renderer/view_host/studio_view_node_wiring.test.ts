import { describe, expect, it } from "vitest";
import type { StreamGraphNode, StreamGraphSummary } from "./studio_view_contract";
import { nodesOfTheStudioViewType, studioViewInputWiring, STUDIO_VIEW_NODE_TYPE } from "./studio_view_node_wiring";
import { NODE_STUDIO_FIELDS_NONE_SET } from "@tatolab/tato-app-view-sdk/studio_readings";

function graphNode(name: string, type: string, config: StreamGraphNode["config"], outputs: StreamGraphNode["output_ports"]): StreamGraphNode {
  return { id: `id-${name}`, name, type, state: "Running", failed_because: null, config, input_ports: [], output_ports: outputs, dropped_bags_by_link: {}, refused_bags_by_output_port: {}, pins: {}, studio: NODE_STUDIO_FIELDS_NONE_SET };
}

const DECK = graphNode("djdeck", STUDIO_VIEW_NODE_TYPE, { view_type: "acme-dj:deck" }, []);
const GRAPH: StreamGraphSummary = {
  stream: "set",
  nodes: [
    graphNode("player", "acme_dj:Player", {}, [{ name: "audio", family: "channels", stream_facts: null, values_checked: null }]),
    graphNode("camera", "tatolab.stream:Camera", {}, [{ name: "video", family: "image", stream_facts: null, values_checked: null }]),
    DECK,
    graphNode("otherview", STUDIO_VIEW_NODE_TYPE, { view_type: "acme-stage:rig" }, []),
  ],
  links: [
    { id: "L1", source_node: "player", source_port: "audio", target_node: "djdeck", target_port: "deck_a", state: "wired" },
    { id: "L2", source_node: "camera", source_port: "video", target_node: "djdeck", target_port: "deck_b", state: "wired" },
    { id: "L3", source_node: "lobby-a1b2c3/player", source_port: "audio", target_node: "djdeck", target_port: "booth", state: "wired" },
  ],
  stream_asset: null,
  groups: [],
  notes: [],
  graph_document_text: "{}",
};

describe("a view node's wiring", () => {
  it("finds the nodes standing for a view type by their config's view_type", () => {
    expect(nodesOfTheStudioViewType(GRAPH, "acme-dj:deck").map((node) => node.name)).toEqual(["djdeck"]);
    expect(nodesOfTheStudioViewType(GRAPH, "acme-dj:mixer")).toEqual([]);
  });

  it("reads each input from the output linked into it, and says why an input reads nothing", () => {
    expect(
      studioViewInputWiring(GRAPH, DECK, [
        { name: "deck_a", family: "channels" },
        { name: "deck_b", family: "channels" },
        { name: "booth", family: "channels" },
        { name: "cue", family: "channels" },
      ]),
    ).toEqual({
      deck_a: { kind: "wired", target: { stream: "set", node_id: "id-player", port: "audio" }, wired_from_words: "player › audio" },
      deck_b: { kind: "unwired", because: "camera › video carries image, and deck_b takes channels." },
      booth: { kind: "unwired", because: "booth is wired from lobby-a1b2c3/player, in another stream, which a view does not read." },
      cue: { kind: "unwired", because: "Nothing is wired into cue." },
    });
  });
});
