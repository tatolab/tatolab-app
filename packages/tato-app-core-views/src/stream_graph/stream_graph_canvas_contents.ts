// A stream's graph as the node graph canvas draws it: a card per node keyed by its name and titled as the
// studio writes it, where it was left and the frame it sits in, its declared ports as pins of their types,
// a link per link of the graph drawn by its state, a frame per labelled group and the graph's canvas notes.

import type { NodeGraphCanvasFrame, NodeGraphCanvasLink, NodeGraphCanvasNode, NodeGraphCanvasNote, NodeGraphCardCondition, NodeGraphLinkLook } from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_canvas_contract";
import { valueAddressOfTheInput, type GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
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

/** How a node's card shows its processor state: `Error` failed with the runtime's reason, a `process()` that keeps raising failed with what it raised, a node not ready yet not ready with the runtime's reason, `Restarting` restarting, every other state healthy. */
function cardConditionOf(node: StreamGraphNode): NodeGraphCardCondition {
  if (node.state === "Error") return { look: "failed", failed_because: node.failed_because };
  if (node.process_raising_because !== null) return { look: "failed", failed_because: node.process_raising_because };
  if (node.not_ready_because !== null) return { look: "not_ready", not_ready_because: node.not_ready_because };
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
  if (node.fragment?.kind === "placed_stream") return "Subgraph";
  if (node.fragment?.kind === "generated") return nodeTypeClassName(node.type);
  return isANameTheCodeGave(node.name, node.type) ? nodeTypeClassName(node.type) : null;
}

const descriptionWords = (description: string | undefined): string | null => (description === undefined || description.trim() === "" ? null : description.trim());

const portDescription = (ports: readonly NodeCatalogPort[] | undefined, portName: string): string | null => descriptionWords(ports?.find((port) => port.name === portName)?.description);

/** Whether `a` and `b` hold the same values; it compares JSON-shaped data only (plain objects, arrays and primitives), as a `NodeGraphCanvasNode` is. */
function holdTheSameValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const aEntries = Object.entries(a);
  const bValues = new Map(Object.entries(b));
  return aEntries.length === bValues.size && aEntries.every(([key, value]) => bValues.has(key) && holdTheSameValues(value, bValues.get(key)));
}

/**
 * `graph` as the canvas draws it, each node keyed by its name, as a link's ends name it, with each node type's and port's
 * description as `catalog` gives it, and each unlinked input that holds a value addressed at `valuesAt`, the level of the
 * graph it is; `null` addresses none. A link renders on every input it feeds, one that takes no stored value too, so a
 * linked input is addressed by none. A node that `previous` draws the same is drawn by the very object `previous` holds, so its
 * card is not drawn again; a value is not part of it.
 */
export function streamGraphCanvasContents(
  graph: StreamGraphSummary,
  catalog: NodeCatalog | null,
  previous: StreamGraphCanvasContents | null = null,
  valuesAt: GraphAddress | null = null,
): StreamGraphCanvasContents {
  const groupIds = new Set(graph.groups.map((group) => group.id));
  const catalogEntryByType = new Map((catalog?.node_types ?? []).map((entry) => [entry.type, entry]));
  const previousNodeById = new Map((previous?.nodes ?? []).map((node) => [node.node_id, node]));
  const keptWhereTheSame = (node: NodeGraphCanvasNode): NodeGraphCanvasNode => {
    const previousNode = previousNodeById.get(node.node_id);
    return previousNode !== undefined && holdTheSameValues(previousNode, node) ? previousNode : node;
  };
  return {
    nodes: graph.nodes.map((node) => keptWhereTheSame({
      node_id: node.name,
      title: nodeTitle(node.name, node.type),
      type_name: typeNameOnTheCard(node),
      description: descriptionWords(catalogEntryByType.get(node.type)?.description),
      condition: cardConditionOf(node),
      inputs: node.input_ports.map((port) => ({
        name: port.name,
        pin: port.pin,
        family: port.family,
        description: portDescription(catalogEntryByType.get(node.type)?.inputs, port.name),
        stream_facts_words: portStreamFactsWords(streamFactsAnInputReceives(graph, node.name, port)),
        value_address: valueAddressOfTheInput(valuesAt, node.id, port),
      })),
      outputs: node.output_ports.map((port) => ({
        name: port.name,
        pin: port.pin,
        family: port.family,
        description: portDescription(catalogEntryByType.get(node.type)?.outputs, port.name),
        stream_facts_words: portStreamFactsWords(port),
        value_address: null,
      })),
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
