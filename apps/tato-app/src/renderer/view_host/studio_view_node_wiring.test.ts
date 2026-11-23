import { describe, expect, it } from "vitest";
import type { StreamGraphNode, StreamGraph } from "./studio_view_contract";
import { nodeShownByTheArea, nodesOfTheStudioViewType, studioViewInputWiring, studioViewNodeAddressOf } from "./studio_view_node_wiring";
import { aGraphLink, aGraphNode, aGraphPort, aStreamGraph } from "@tatolab/tato-app-view-sdk/stream_graph_builders";

function graphNode(name: string, type: string, config: StreamGraphNode["config"], outputs: StreamGraphNode["ports"]["outputs"]): StreamGraphNode {
  return aGraphNode(name, { id: `id-${name}`, type, kind: "process", config, outputs, components: { state: "Running" } });
}

const DECK = graphNode("djdeck", "acme-dj:deck", { level: 0.5 }, []);
const GRAPH: StreamGraph = aStreamGraph(
  [graphNode("player", "acme_dj:Player", {}, [aGraphPort("audio", "channels")]), graphNode("camera", "tatolab.stream:Camera", {}, [aGraphPort("video", "image")]), DECK, graphNode("otherview", "acme-stage:rig", {}, [])],
  [
    aGraphLink("L1", ["player", "audio"], ["djdeck", "deck_a"]),
    aGraphLink("L2", ["camera", "video"], ["djdeck", "deck_b"]),
    aGraphLink("L3", ["lobby-a1b2c3/player", "audio"], ["djdeck", "booth"]),
  ],
  { stream: "set" },
);

describe("a view node's wiring", () => {
  it("finds the nodes of a view type by their type, the view type itself", () => {
    expect(nodesOfTheStudioViewType(GRAPH, "acme-dj:deck").map((node) => node.name)).toEqual(["djdeck"]);
    expect(nodesOfTheStudioViewType(GRAPH, "acme-dj:mixer")).toEqual([]);
  });

  it("reads each input from whatever output is linked into it, which the runtime judged by the two pins' types, and says why an input reads nothing", () => {
    expect(
      studioViewInputWiring("set", GRAPH, DECK, [
        { name: "deck_a", family: "channels", pin_type: { type: "audio" } },
        { name: "deck_b", family: "image", pin_type: { type: "texture" } },
        { name: "booth", family: "channels", pin_type: { type: "audio" } },
        { name: "cue", family: "channels", pin_type: { type: "float" } },
      ]),
    ).toEqual({
      deck_a: { kind: "wired", target: { stream: "set", node_id: "id-player", port: "audio" }, wired_from_words: "player › audio" },
      deck_b: { kind: "wired", target: { stream: "set", node_id: "id-camera", port: "video" }, wired_from_words: "camera › video" },
      booth: { kind: "unwired", because: "booth is wired from lobby-a1b2c3/player, in another stream, which Studio does not read." },
      cue: { kind: "unwired", because: "Nothing is wired into cue." },
    });
    expect(studioViewInputWiring("set", GRAPH, DECK, [{ name: "deck_a", family: "channels", pin_type: { type: "float" } }])).toEqual({
      deck_a: { kind: "wired", target: { stream: "set", node_id: "id-player", port: "audio" }, wired_from_words: "player › audio" },
    });
  });

  it("sets a value on the node's inputs at the stream's own level of the window's project, and says why not while the project or the stream asset is unknown", () => {
    const unnamedDeck = graphNode("deck", "acme-dj:deck", {}, []);
    expect(studioViewNodeAddressOf("/set", { ...GRAPH, asset: "s-uuid" }, DECK, "Set")).toEqual({ kind: "addressed", graph: { project_folder: "/set", stream_asset: "s-uuid", level: [] }, node_id: "id-djdeck" });
    expect(studioViewNodeAddressOf("/set", GRAPH, unnamedDeck, "Set")).toEqual({ kind: "not_addressed", because: "The runtime's graph of Set names no stream asset, so nothing is set on its Deck node." });
    expect(studioViewNodeAddressOf(null, { ...GRAPH, asset: "s-uuid" }, DECK, "Set")).toEqual({ kind: "not_addressed", because: "No project is open in this window, so nothing is set on the djdeck node in Set." });
  });
});

describe("the node a node view's area shows", () => {
  const nodes = [{ id: "first" }, { id: "second" }];

  it("is the one the area keeps, or the first when it keeps none or that node is gone", () => {
    expect(nodeShownByTheArea(nodes, "second")).toEqual({ id: "second" });
    expect(nodeShownByTheArea(nodes, null)).toEqual({ id: "first" });
    expect(nodeShownByTheArea(nodes, "removed")).toEqual({ id: "first" });
    expect(nodeShownByTheArea([], null)).toBeNull();
  });
});
