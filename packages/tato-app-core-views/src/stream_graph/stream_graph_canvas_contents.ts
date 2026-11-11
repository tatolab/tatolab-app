// A stream's graph as the node graph canvas draws it: a card per node keyed by its name and titled as the
// studio writes it, where it was left and the frame it sits in, its declared ports as pins of their families,
// a link per link of the graph drawn by its state, a frame per labelled group and the graph's canvas notes.

import type { NodeGraphCanvasFrame, NodeGraphCanvasLink, NodeGraphCanvasNode, NodeGraphCanvasNote, NodeGraphCardCondition, NodeGraphLinkLook } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import type { NodeCatalog, NodeCatalogPort, StreamGraphLink, StreamGraphNode, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { isANameTheCodeGave, nodeTitle, nodeTypeClassName } from "../shared/node_words";
import { portStreamFactsWords, streamFactsAnInputReceives } from "../shared/port_stream_facts_words";
import { linkIdAsTheCanvasKeysIt } from "../shared/stream_graph_edits";

/** What the canvas draws of one stream's graph. */
export interface StreamGraphCanvasContents {
  nodes: NodeGraphCanvasNode[];
  links: NodeGraphCanvasLink[];
  frames: NodeGraphCanvasFrame[];
  notes: NodeGraphCanvasNote[];
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

/** How a node's card shows its processor state: `Error` failed with the runtime's reason, a `process()` that keeps raising failed with what it raised, `Restarting` restarting, every other state healthy. */
function cardConditionOf(node: StreamGraphNode): NodeGraphCardCondition {
  if (node.state === "Error") return { look: "failed", failed_because: node.failed_because };
  if (node.process_raising_because !== null) return { look: "failed", failed_because: node.process_raising_because };
  if (node.state === "Restarting") return { look: "restarting" };
  return { look: "healthy" };
}

function canvasLinkOf(link: StreamGraphLink): NodeGraphCanvasLink {
  const { look, words } = linkLookAndWords(link.state);
  return {
    link_id: linkIdAsTheCanvasKeysIt(link),
    source_node_id: link.source_node,
    source_pin: link.source_port,
    target_node_id: link.target_node,
    target_pin: link.target_port,
    look,
    description: `${link.source_node}.${link.source_port} → ${link.target_node}.${link.target_port}, ${words}`,
  };
}

/** The quiet type beside a card's title: a subgraph's kind (a generated one by its generator), or a node's type when its name is the one the code gave. */
function typeNameOnTheCard(node: StreamGraphNode): string | null {
  if (node.fragment?.kind === "authored") return "Subgraph";
  if (node.fragment?.kind === "placed_stream") return "Stream";
  if (node.fragment?.kind === "generated") return nodeTypeClassName(node.type);
  return isANameTheCodeGave(node.name, node.type) ? nodeTypeClassName(node.type) : null;
}

const descriptionWords = (description: string | undefined): string | null => (description === undefined || description.trim() === "" ? null : description.trim());

const portDescription = (ports: readonly NodeCatalogPort[] | undefined, portName: string): string | null => descriptionWords(ports?.find((port) => port.name === portName)?.description);

/** `graph` as the canvas draws it, each node keyed by its name, as a link's ends name it, with each node type's and port's description as `catalog` gives it. */
export function streamGraphCanvasContents(graph: StreamGraphSummary, catalog: NodeCatalog | null): StreamGraphCanvasContents {
  const groupIds = new Set(graph.groups.map((group) => group.id));
  const catalogEntryByType = new Map((catalog?.node_types ?? []).map((entry) => [entry.type, entry]));
  return {
    nodes: graph.nodes.map((node) => ({
      node_id: node.name,
      title: nodeTitle(node.name, node.type),
      type_name: typeNameOnTheCard(node),
      description: descriptionWords(catalogEntryByType.get(node.type)?.description),
      condition: cardConditionOf(node),
      input_pins: node.input_ports.map((port) => ({
        name: port.name,
        family: port.family,
        description: portDescription(catalogEntryByType.get(node.type)?.inputs, port.name),
        stream_facts_words: portStreamFactsWords(streamFactsAnInputReceives(graph, node.name, port)),
      })),
      output_pins: node.output_ports.map((port) => ({ name: port.name, family: port.family, description: portDescription(catalogEntryByType.get(node.type)?.outputs, port.name), stream_facts_words: portStreamFactsWords(port) })),
      saved_position: node.studio.position === null ? null : { x: node.studio.position[0], y: node.studio.position[1] },
      frame_id: node.studio.group !== null && groupIds.has(node.studio.group) ? node.studio.group : null,
      is_collapsed: node.studio.collapsed === true,
      subgraph: node.fragment?.kind ?? null,
    })),
    links: graph.links.map(canvasLinkOf),
    frames: graph.groups.map((group) => ({ frame_id: group.id, title: group.title, description: group.description, colour: group.colour })),
    notes: graph.notes.map((note) => ({ note_id: note.id, text: note.text, position: { x: note.position[0], y: note.position[1] }, size: { width: note.size[0], height: note.size[1] } })),
  };
}
