// A stream's graph as the node graph canvas draws it: a card per node keyed by its name and titled as the
// studio writes it, its declared ports as pins of their families, and a link per link of the graph, drawn by
// its state.

import type { NodeGraphCanvasLink, NodeGraphCanvasNode, NodeGraphCardCondition, NodeGraphLinkLook } from "@tatolab/tato-app-view-sdk/kit/node_graph_canvas";
import type { StreamGraphLink, StreamGraphNode, StreamGraphSummary } from "../../view_host/studio_view_contract";
import { nodeTitle } from "../node_words";
import { portStreamFactsWords, streamFactsAnInputReceives } from "../port_stream_facts_words";

/** What the canvas draws of one stream's graph. */
export interface StreamGraphCanvasContents {
  nodes: NodeGraphCanvasNode[];
  links: NodeGraphCanvasLink[];
}

/** How a link in `linkState` is drawn, and its state in words; a state newer than this app is drawn waiting, in its own spelling. */
function linkLookAndWords(linkState: string): { look: NodeGraphLinkLook; words: string } {
  switch (linkState) {
    case "wired":
      return { look: "carrying", words: "wired" };
    case "pending":
      return { look: "waiting", words: "waiting to be wired" };
    case "awaiting_remote":
      return { look: "waiting", words: "waiting for the other machine" };
    case "error":
      return { look: "failed", words: "failed" };
    case "disconnecting":
      return { look: "ending", words: "disconnecting" };
    case "disconnected":
      return { look: "ending", words: "disconnected" };
    default:
      return { look: "waiting", words: linkState };
  }
}

/** How a node's card shows its processor state: `Error` failed with the runtime's reason, `Restarting` restarting, every other state healthy. */
function cardConditionOf(node: StreamGraphNode): NodeGraphCardCondition {
  if (node.state === "Error") return { look: "failed", failed_because: node.failed_because };
  if (node.state === "Restarting") return { look: "restarting" };
  return { look: "healthy" };
}

function canvasLinkOf(link: StreamGraphLink): NodeGraphCanvasLink {
  const { look, words } = linkLookAndWords(link.state);
  return {
    link_id: link.id === "" ? `${link.source_node}.${link.source_port}->${link.target_node}.${link.target_port}` : link.id,
    source_node_id: link.source_node,
    source_pin: link.source_port,
    target_node_id: link.target_node,
    target_pin: link.target_port,
    look,
    description: `${link.source_node}.${link.source_port} → ${link.target_node}.${link.target_port}, ${words}`,
  };
}

/** `graph` as the canvas draws it, each node keyed by its name, as a link's ends name it. */
export function streamGraphCanvasContents(graph: StreamGraphSummary): StreamGraphCanvasContents {
  return {
    nodes: graph.nodes.map((node) => ({
      node_id: node.name,
      title: nodeTitle(node.name, node.type),
      condition: cardConditionOf(node),
      input_pins: node.input_ports.map((port) => ({ name: port.name, family: port.family, stream_facts_words: portStreamFactsWords(streamFactsAnInputReceives(graph, node.name, port)) })),
      output_pins: node.output_ports.map((port) => ({ name: port.name, family: port.family, stream_facts_words: portStreamFactsWords(port) })),
    })),
    links: graph.links.map(canvasLinkOf),
  };
}
