// A stream's graph as the node graph canvas draws it: a card per node keyed by its name and titled as the
// studio writes it, where it was left and the frame it sits in, its declared ports as pins of their types,
// a link per link of the graph drawn by its state, a frame per labelled group and the graph's canvas notes.

import type {
  NodeGraphCanvasFrame,
  NodeGraphCanvasLink,
  NodeGraphCanvasNode,
  NodeGraphCanvasNote,
  NodeGraphCardCondition,
  NodeGraphLinkLook,
} from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_canvas_contract";
import type { GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import {
  canvasNotesOfTheGraph,
  fragmentKindOfTheNode,
  fragmentOfTheNode,
  studioFieldsOfTheNode,
  type NodeCatalog,
  type StreamGraph,
  type StreamGraphLink,
  type StreamGraphNode,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import {
  descriptionWords,
  nodeInputs,
  nodeOutputs,
} from "../shared/node_pins_of_the_graph";
import {
  isANameTheCodeGave,
  nodeTitle,
  nodeTypeClassName,
} from "../shared/node_words";
import { linkIdAsTheCanvasKeysIt } from "../shared/stream_graph_edits";

/** What the canvas draws of one stream's graph. */
export interface StreamGraphCanvasContents {
  nodes: NodeGraphCanvasNode[];
  links: NodeGraphCanvasLink[];
  frames: NodeGraphCanvasFrame[];
  notes: NodeGraphCanvasNote[];
}

/** How a link in `linkState` is drawn, and its state in words; a link the runtime renders with no state is waiting to be wired, as the runtime reads it. */
function linkLookAndWords(linkState: StreamGraphLink["state"]): {
  look: NodeGraphLinkLook;
  words: string;
} {
  switch (linkState) {
    case "wired":
      return { look: "carrying", words: "wired" };
    case undefined:
    case "pending":
      return { look: "waiting", words: "waiting to be wired" };
    case "error":
      return { look: "failed", words: "failed" };
    case "disconnecting":
      return { look: "ending", words: "disconnecting" };
    case "disconnected":
      return { look: "ending", words: "disconnected" };
  }
}

/** How a node's card shows its processor state: `Error` failed with the runtime's reason, a `process()` that keeps raising failed with what it raised, a node not ready yet not ready with the runtime's reason, `Restarting` restarting, every other state healthy. */
function cardConditionOf({
  components,
}: StreamGraphNode): NodeGraphCardCondition {
  if (components.state === "Error")
    return { look: "failed", failed_because: components.failed_because };
  if (components.process_raising_because !== null)
    return {
      look: "failed",
      failed_because: components.process_raising_because,
    };
  if (components.not_ready_because !== null)
    return {
      look: "not_ready",
      not_ready_because: components.not_ready_because,
    };
  if (components.state === "Restarting") return { look: "restarting" };
  return { look: "healthy" };
}

function canvasLinkOf(link: StreamGraphLink): NodeGraphCanvasLink {
  const { look, words } = linkLookAndWords(link.state);
  return {
    link_id: linkIdAsTheCanvasKeysIt(link),
    source_node_id: link.source.node,
    source_pin: link.source.port,
    target_node_id: link.target.node,
    target_pin: link.target.port,
    look,
    description: `${link.source.node}.${link.source.port} → ${link.target.node}.${link.target.port}, ${words}`,
  };
}

/** The quiet type beside a card's title: a subgraph's kind (a generated one by its generator), or a node's type when its name is the one the code gave. */
function typeNameOnTheCard(node: StreamGraphNode): string | null {
  if (fragmentOfTheNode(node) !== null)
    return fragmentKindOfTheNode(node) === "placed_stream"
      ? "Subgraph"
      : nodeTypeClassName(node.type);
  return isANameTheCodeGave(node.name, node.type)
    ? nodeTypeClassName(node.type)
    : null;
}

/** Whether `a` and `b` hold the same values; it compares JSON-shaped data only (plain objects, arrays and primitives), as a `NodeGraphCanvasNode` is. */
function holdTheSameValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const aEntries = Object.entries(a);
  const bValues = new Map(Object.entries(b));
  return (
    aEntries.length === bValues.size &&
    aEntries.every(
      ([key, value]) =>
        bValues.has(key) && holdTheSameValues(value, bValues.get(key)),
    )
  );
}

/**
 * `graph` as the canvas draws it, each node keyed by its name, as a link's ends name it, with each node type's and port's
 * description as `catalog` gives it, and each unlinked input that holds a value addressed at `valuesAt`, the level of the
 * graph it is; `null` addresses none. A link renders on every input it feeds, one that takes no stored value too, so a
 * linked input is addressed by none. A node that `previous` draws the same is drawn by the very object `previous` holds, so its
 * card is not drawn again; a value is not part of it.
 */
export function streamGraphCanvasContents(
  graph: StreamGraph,
  catalog: NodeCatalog | null,
  previous: StreamGraphCanvasContents | null = null,
  valuesAt: GraphAddress | null = null,
): StreamGraphCanvasContents {
  const groups = graph.groups ?? [];
  const groupIds = new Set(groups.map((group) => group.id));
  const catalogEntryByType = new Map(
    (catalog?.node_types ?? []).map((entry) => [entry.type, entry]),
  );
  const previousNodeById = new Map(
    (previous?.nodes ?? []).map((node) => [node.node_id, node]),
  );
  const keptWhereTheSame = (node: NodeGraphCanvasNode): NodeGraphCanvasNode => {
    const previousNode = previousNodeById.get(node.node_id);
    return previousNode !== undefined && holdTheSameValues(previousNode, node)
      ? previousNode
      : node;
  };
  return {
    nodes: graph.nodes.map((node) => {
      const studio = studioFieldsOfTheNode(node);
      return keptWhereTheSame({
        node_id: node.name,
        title: nodeTitle(node.name, node.type),
        type_name: typeNameOnTheCard(node),
        description: descriptionWords(
          catalogEntryByType.get(node.type)?.description,
        ),
        condition: cardConditionOf(node),
        inputs: nodeInputs(
          graph,
          node,
          catalogEntryByType.get(node.type),
          valuesAt,
        ),
        outputs: nodeOutputs(node, catalogEntryByType.get(node.type)),
        saved_position:
          studio.position === null
            ? null
            : { x: studio.position[0], y: studio.position[1] },
        frame_id:
          studio.group !== null && groupIds.has(studio.group)
            ? studio.group
            : null,
        is_collapsed: studio.collapsed === true,
        subgraph:
          fragmentOfTheNode(node) === null ? null : fragmentKindOfTheNode(node),
      });
    }),
    links: graph.links.map(canvasLinkOf),
    frames: groups.map((group) => ({
      frame_id: group.id,
      title: group.title,
      description: group.description ?? null,
      colour: group.colour ?? null,
    })),
    notes: canvasNotesOfTheGraph(graph).map((note) => ({
      note_id: note.id,
      text: note.text,
      position: { x: note.position[0], y: note.position[1] },
      size: { width: note.size[0], height: note.size[1] },
    })),
  };
}
