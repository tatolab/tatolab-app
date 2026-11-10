// What each gesture on the stream graph asks the runtime for: the graph actions of one transaction, each
// naming the stream by its stream asset and a node by its UUID, as the runtime's action contract spells them.
// The canvas names a card by its node's name, which a link end names it by too.

import type { JsonValue, NodeCatalogEntry, StreamGraphAction, StreamGraphNodeStudioFields, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";

/** A point on the canvas. */
export interface StreamGraphCanvasPosition {
  x: number;
  y: number;
}

/** The `as` an added node goes by in the rest of its transaction, before its UUID is known. */
export const NODE_PLACED_IN_THIS_TRANSACTION = "placed";

/** The size a note is placed at. */
export const PLACED_NOTE_SIZE: [number, number] = [220, 110];

/** What a placed note says before it is edited. */
export const PLACED_NOTE_TEXT = "Note";

/** What a frame is titled before it is renamed. */
export const PLACED_FRAME_TITLE = "Frame";

/** The canvas's rounding of a position, so a drag writes whole canvas pixels. */
const toTheCanvasPixel = (position: StreamGraphCanvasPosition): [number, number] => [Math.round(position.x), Math.round(position.y)];

/** One stream's graph as the edits read it: its stream asset and each node's UUID by its name. */
export interface EditedStreamGraph {
  streamAsset: string;
  graph: StreamGraphSummary;
  nodeIdByName: ReadonlyMap<string, string>;
}

/** `graph` read for edits; why not when the runtime renders it without its stream asset or a node without its UUID. */
export function editedStreamGraphOf(graph: StreamGraphSummary): EditedStreamGraph | { because: string } {
  if (graph.stream_asset === null) return { because: "The runtime's graph names no stream asset, so an edit has no stream to name." };
  const nodeWithoutAnId = graph.nodes.find((node) => node.id === "");
  if (nodeWithoutAnId !== undefined) return { because: `The runtime's graph gives ${nodeWithoutAnId.name} no UUID, so an edit cannot name it.` };
  return { streamAsset: graph.stream_asset, graph, nodeIdByName: new Map(graph.nodes.map((node) => [node.name, node.id])) };
}

/** A node's studio fields as the `studio` object `set_studio_fields` replaces whole: each field the node has kept, and its metadata. */
function studioObjectOf(studio: StreamGraphNodeStudioFields): Record<string, JsonValue> {
  return {
    ...(studio.position === null ? {} : { position: studio.position }),
    ...(studio.group === null ? {} : { group: studio.group }),
    ...(studio.comment === null ? {} : { comment: studio.comment }),
    ...(studio.colour === null ? {} : { colour: studio.colour }),
    ...(studio.collapsed === null ? {} : { collapsed: studio.collapsed }),
    ...(Object.keys(studio.metadata).length === 0 ? {} : { metadata: studio.metadata }),
  };
}

/** The UUID of the node named `nodeName`; the canvas names only nodes the graph holds. */
function nodeIdOf(edited: EditedStreamGraph, nodeName: string): string {
  return edited.nodeIdByName.get(nodeName) ?? nodeName;
}

/** Each moved card's new place: its node's studio fields as they are, with the new position. */
export function cardsMovedEdits(edited: EditedStreamGraph, moves: readonly { node_id: string; position: StreamGraphCanvasPosition }[]): StreamGraphAction[] {
  return moves.flatMap((move) => {
    const node = edited.graph.nodes.find((graphNode) => graphNode.name === move.node_id);
    if (node === undefined) return [];
    const position = toTheCanvasPixel(move.position);
    if (node.studio.position !== null && node.studio.position[0] === position[0] && node.studio.position[1] === position[1]) return [];
    return [{ operation: "set_studio_fields", stream: edited.streamAsset, node: node.id, studio: studioObjectOf({ ...node.studio, position }) }];
  });
}

/** A link from `source`'s output pin to `target`'s input pin. */
export function pinsWiredEdits(edited: EditedStreamGraph, source: { node_id: string; pin: string }, target: { node_id: string; pin: string }): StreamGraphAction[] {
  return [
    {
      operation: "connect",
      stream: edited.streamAsset,
      source: { node: nodeIdOf(edited, source.node_id), port: source.pin },
      target: { node: nodeIdOf(edited, target.node_id), port: target.pin },
    },
  ];
}

/** The first port of `ports` that can take or give `family`; any port when the family is unknown. */
function firstPortOfTheFamily(ports: NodeCatalogEntry["inputs"], family: string | null): string | null {
  return (family === null ? ports[0] : (ports.find((port) => port.family === family || port.family === null) ?? null))?.name ?? null;
}

/** A pin a wire was dragged off and let go of over the canvas. */
export interface LooseWire {
  node_id: string;
  pin: string;
  side: "input" | "output";
  family: string | null;
}

/** A node of `nodeType` placed with its card at `position`, and, from a loose wire, linked to the wire's pin by its first port of the wire's family. */
export function nodePlacedEdits(edited: EditedStreamGraph, nodeType: NodeCatalogEntry, position: StreamGraphCanvasPosition, looseWire: LooseWire | null): StreamGraphAction[] {
  const placed: StreamGraphAction = {
    operation: "add_node",
    stream: edited.streamAsset,
    type: nodeType.type,
    studio: { position: toTheCanvasPixel(position) },
    as: NODE_PLACED_IN_THIS_TRANSACTION,
  };
  if (looseWire === null) return [placed];
  const wiredEnd = { node: nodeIdOf(edited, looseWire.node_id), port: looseWire.pin };
  if (looseWire.side === "output") {
    const input = firstPortOfTheFamily(nodeType.inputs, looseWire.family);
    return input === null ? [placed] : [placed, { operation: "connect", stream: edited.streamAsset, source: wiredEnd, target: { node: NODE_PLACED_IN_THIS_TRANSACTION, port: input } }];
  }
  const output = firstPortOfTheFamily(nodeType.outputs, looseWire.family);
  return output === null ? [placed] : [placed, { operation: "connect", stream: edited.streamAsset, source: { node: NODE_PLACED_IN_THIS_TRANSACTION, port: output }, target: wiredEnd }];
}

/** Whether `nodeType` has a port a loose wire of `family` from `side` could link to. */
export function canANodeTypeTakeTheLooseWire(nodeType: NodeCatalogEntry, looseWire: Pick<LooseWire, "side" | "family">): boolean {
  return firstPortOfTheFamily(looseWire.side === "output" ? nodeType.inputs : nodeType.outputs, looseWire.family) !== null;
}

/** The selected links, nodes and notes taken out: a link of a removed node goes with it, so only the others are disconnected. */
export function deletedEdits(edited: EditedStreamGraph, deleted: { node_ids: readonly string[]; link_ids: readonly string[]; note_ids: readonly string[] }): StreamGraphAction[] {
  const removedNodeNames = new Set(deleted.node_ids);
  const disconnected: StreamGraphAction[] = edited.graph.links
    .filter((link) => deleted.link_ids.includes(linkIdAsTheCanvasKeysIt(link)) && !removedNodeNames.has(link.source_node) && !removedNodeNames.has(link.target_node))
    .map((link) => ({
      operation: "disconnect",
      stream: edited.streamAsset,
      source: { node: nodeIdOf(edited, link.source_node), port: link.source_port },
      target: { node: nodeIdOf(edited, link.target_node), port: link.target_port },
    }));
  const removedNodes: StreamGraphAction[] = edited.graph.nodes.filter((node) => removedNodeNames.has(node.name)).map((node) => ({ operation: "remove_node", stream: edited.streamAsset, node: node.id }));
  const removedNotes: StreamGraphAction[] = deleted.note_ids.map((note) => ({ operation: "remove_note", stream: edited.streamAsset, note }));
  return [...disconnected, ...removedNodes, ...removedNotes];
}

/** A link's id as the canvas keys it: the runtime's id, or its ends while the runtime gives it none. */
export function linkIdAsTheCanvasKeysIt(link: StreamGraphSummary["links"][number]): string {
  return link.id === "" ? `${link.source_node}.${link.source_port}->${link.target_node}.${link.target_port}` : link.id;
}

/** `nodeName`'s node spliced into the link `linkId`: the link's source feeds its first input of that family, its first output of that family feeds the link's target, and the link goes; nothing when it has no such ports. */
export function cardLetGoOverALinkEdits(edited: EditedStreamGraph, nodeName: string, linkId: string): StreamGraphAction[] {
  const node = edited.graph.nodes.find((graphNode) => graphNode.name === nodeName);
  const link = edited.graph.links.find((graphLink) => linkIdAsTheCanvasKeysIt(graphLink) === linkId);
  if (node === undefined || link === undefined) return [];
  const family = edited.graph.nodes.find((graphNode) => graphNode.name === link.source_node)?.output_ports.find((port) => port.name === link.source_port)?.family ?? null;
  const input = firstPortOfTheFamily(node.input_ports.map((port) => ({ name: port.name, description: "", family: port.family })), family);
  const output = firstPortOfTheFamily(node.output_ports.map((port) => ({ name: port.name, description: "", family: port.family })), family);
  if (input === null || output === null) return [];
  const linkSource = { node: nodeIdOf(edited, link.source_node), port: link.source_port };
  const linkTarget = { node: nodeIdOf(edited, link.target_node), port: link.target_port };
  return [
    { operation: "disconnect", stream: edited.streamAsset, source: linkSource, target: linkTarget },
    { operation: "connect", stream: edited.streamAsset, source: linkSource, target: { node: node.id, port: input } },
    { operation: "connect", stream: edited.streamAsset, source: { node: node.id, port: output }, target: linkTarget },
  ];
}

/** A labelled group of the selected nodes, titled to be renamed. */
export function selectionFramedEdits(edited: EditedStreamGraph, nodeNames: readonly string[]): StreamGraphAction[] {
  const nodes = nodeNames.flatMap((nodeName) => {
    const nodeId = edited.nodeIdByName.get(nodeName);
    return nodeId === undefined ? [] : [nodeId];
  });
  return nodes.length === 0 ? [] : [{ operation: "add_group", stream: edited.streamAsset, title: PLACED_FRAME_TITLE, nodes }];
}

/** A note placed with its top-left corner at `position`. */
export function notePlacedEdits(edited: EditedStreamGraph, position: StreamGraphCanvasPosition): StreamGraphAction[] {
  return [{ operation: "add_note", stream: edited.streamAsset, text: PLACED_NOTE_TEXT, position: toTheCanvasPixel(position), size: PLACED_NOTE_SIZE }];
}

/** A note's new text, place or size; a field not given is kept. */
export function noteChangedEdits(
  edited: EditedStreamGraph,
  note: string,
  change: { text?: string; position?: StreamGraphCanvasPosition; size?: { width: number; height: number } },
): StreamGraphAction[] {
  return [
    {
      operation: "set_note_fields",
      stream: edited.streamAsset,
      note,
      ...(change.text === undefined ? {} : { text: change.text }),
      ...(change.position === undefined ? {} : { position: toTheCanvasPixel(change.position) }),
      ...(change.size === undefined ? {} : { size: toTheCanvasPixel({ x: change.size.width, y: change.size.height }) }),
    },
  ];
}
