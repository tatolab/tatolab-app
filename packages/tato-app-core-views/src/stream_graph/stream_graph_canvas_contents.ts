// A stream's graph as the node graph canvas draws it: a card per node keyed by its name and titled as the
// studio writes it, where it was left and the frame it sits in, its declared ports as pins of their types,
// a link per link of the graph drawn by its state and the warnings the runtime gives it, a frame per
// labelled group and the graph's canvas notes. A node or link the running stream does not hold yet, and one
// a diagnostic of the stream names, shows it.

import type {
  NodeGraphCanvasFrame,
  NodeGraphCanvasLink,
  NodeGraphCanvasNode,
  NodeGraphCanvasNote,
  NodeGraphCardCondition,
  NodeGraphCardKind,
  NodeGraphLinkLook,
} from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_canvas_contract";
import type { GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import {
  canvasNotesOfTheGraph,
  fragmentKindOfTheNode,
  fragmentOfTheNode,
  isLiveInTheRunningGraph,
  studioFieldsOfTheNode,
  type NodeTypeDescription,
  type StreamCondition,
  type StreamDiagnosticKind,
  type StreamGraph,
  type StreamGraphLink,
  type StreamGraphNode,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { descriptionWords, nodeInputs, nodeOutputs, type WiresReadAt } from "../shared/node_pins_of_the_graph";
import { isANameTheCodeGave, nodeTitle, nodeTypeClassName } from "../shared/node_words";
import { linkIdAsTheCanvasKeysIt } from "../shared/stream_graph_edits";
import { diagnosticsAtTheLink, diagnosticsAtTheNode, doesTheDiagnosticWarn } from "../shared/stream_condition_words";

/** What a card or link says of a part the running stream does not hold yet. */
const NOT_LIVE_YET_WORDS = "Not live yet: the running stream hasn't taken this edit. Restart the playback to make it live.";

/** The diagnostics a node's own fields already carry, which its card shows from them. */
const DIAGNOSTICS_THE_NODE_CARRIES: ReadonlySet<StreamDiagnosticKind> = new Set(["node_failed", "node_raising", "node_not_ready", "edit_not_live"]);

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

/**
 * How a node's card shows how it is doing: not ready while the running stream does not hold it yet, `Error` failed with the
 * runtime's reason, a `process()` that keeps raising failed with what it raised, a node not ready yet not ready with the
 * runtime's reason, any other diagnostic of `condition` at it in its words, `Restarting` restarting, every other state healthy.
 */
function cardConditionOf(node: StreamGraphNode, condition: StreamCondition | null): NodeGraphCardCondition {
  const { components } = node;
  if (!isLiveInTheRunningGraph(node)) return { look: "not_ready", not_ready_because: NOT_LIVE_YET_WORDS };
  if (components.state === "Error") return { look: "failed", failed_because: components.failed_because };
  if (components.process_raising_because !== null) return { look: "failed", failed_because: components.process_raising_because };
  if (components.not_ready_because !== null) return { look: "not_ready", not_ready_because: components.not_ready_because };
  const diagnostic = diagnosticsAtTheNode(condition, node.name).find(({ kind }) => !DIAGNOSTICS_THE_NODE_CARRIES.has(kind));
  if (diagnostic !== undefined) return doesTheDiagnosticWarn(diagnostic.kind) ? { look: "not_ready", not_ready_because: diagnostic.words } : { look: "failed", failed_because: diagnostic.words };
  if (components.state === "Restarting") return { look: "restarting" };
  return { look: "healthy" };
}

/** How `link` is drawn: waiting while the running stream does not hold it yet, failed while a diagnostic of `condition` names it, else by its state. */
function linkLookAndWordsOf(link: StreamGraphLink, condition: StreamCondition | null): { look: NodeGraphLinkLook; words: string } {
  if (!isLiveInTheRunningGraph(link)) return { look: "waiting", words: NOT_LIVE_YET_WORDS };
  const diagnostic = diagnosticsAtTheLink(condition, link).at(0);
  if (diagnostic !== undefined) return { look: doesTheDiagnosticWarn(diagnostic.kind) ? "waiting" : "failed", words: diagnostic.words };
  return linkLookAndWords(link.state);
}

/** How `link` is drawn and what it says: by its state or what `condition` says of it, with the warnings the runtime gives it in its words, which a pointer resting on it reads after its state. */
function canvasLinkOf(link: StreamGraphLink, condition: StreamCondition | null): NodeGraphCanvasLink {
  const { look, words } = linkLookAndWordsOf(link, condition);
  const warningWords = (link.warnings ?? []).map((warning) => warning.words);
  return {
    link_id: linkIdAsTheCanvasKeysIt(link),
    source_node_id: link.source.node,
    source_pin: link.source.port,
    target_node_id: link.target.node,
    target_pin: link.target.port,
    look,
    description: [`${link.source.node}.${link.source.port} → ${link.target.node}.${link.target.port}, ${words}`, ...warningWords].join("\n"),
    warning_words: warningWords,
  };
}

/** The quiet type beside a card's title: a generated subgraph's generator, or a node's type when its name is the one the code gave; none on a placed stream, whose header's mark already says it. */
function typeNameOnTheCard(node: StreamGraphNode): string | null {
  if (fragmentOfTheNode(node) !== null)
    return fragmentKindOfTheNode(node) === "placed_stream"
      ? null
      : nodeTypeClassName(node.type);
  return isANameTheCodeGave(node.name, node.type)
    ? nodeTypeClassName(node.type)
    : null;
}

/**
 * What kind of node `node`'s card shows: a subgraph by how it came to be, any other node by how the runtime says its code
 * runs, with a function's language; `unknown` where the runtime names no kind, as for a type nothing registers.
 */
function cardKindOf(node: StreamGraphNode): NodeGraphCardKind {
  if (fragmentOfTheNode(node) !== null)
    return { look: fragmentKindOfTheNode(node) === "placed_stream" ? "placed_stream" : "subgraph" };
  switch (node.kind) {
    case "process":
    case "shader":
      return { look: node.kind };
    case "function":
      return { look: "function", language: node.language ?? null };
    case "fragment":
      return { look: "subgraph" };
    case undefined:
    case null:
      return { look: "unknown" };
  }
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
 * documentation as `describedByType`, each node type's description by its type, gives it, and each unlinked input that holds a value addressed at `valuesAt`, the level of the
 * graph it is; `null` addresses none. A link renders on every input it feeds, one that takes no stored value too, so a
 * linked input is addressed by none. A node that `previous` draws the same is drawn by the very object `previous` holds, so its
 * card is not drawn again; a value is not part of it. Each diagnostic of `condition`, the stream's as the runtime lists it, shows
 * on the node or link it names; a level inside a subgraph is handed none. Each input that takes a wire reads it at `wiresAt`,
 * `null` reading none.
 */
export function streamGraphCanvasContents(
  graph: StreamGraph,
  describedByType: ReadonlyMap<string, NodeTypeDescription>,
  previous: StreamGraphCanvasContents | null = null,
  valuesAt: GraphAddress | null = null,
  condition: StreamCondition | null = null,
  wiresAt: WiresReadAt | null = null,
): StreamGraphCanvasContents {
  const groups = graph.groups ?? [];
  const groupIds = new Set(groups.map((group) => group.id));
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
        node_type: node.type,
        description: descriptionWords(
          describedByType.get(node.type)?.documentation,
        ),
        condition: cardConditionOf(node, condition),
        inputs: nodeInputs(
          graph,
          node,
          describedByType.get(node.type),
          valuesAt,
          wiresAt,
        ),
        outputs: nodeOutputs(node, describedByType.get(node.type)),
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
        kind: cardKindOf(node),
      });
    }),
    links: graph.links.map((link) => canvasLinkOf(link, condition)),
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
