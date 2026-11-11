// What each gesture on the stream graph asks the runtime for: the graph actions of one transaction, each
// naming the stream by its stream asset and a node by its UUID, as the runtime's action contract spells them.
// The canvas names a card by its node's name, which a link end names it by too.

import {
  NODE_STUDIO_FIELDS_NONE_SET,
  streamGraphNodeStudioFieldsSchema,
  type JsonValue,
  type NodeCatalogEntry,
  type StreamGraphAction,
  type StreamGraphNode,
  type StreamGraphNodeStudioFields,
  type StreamGraphSummary,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { castAsTheRuntimeNamesAnUnnamedNode, nodeTypeClassName } from "../shared/node_words";

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

/** One stream's graph as the edits read it: its stream asset, each node's UUID by its name, and the studio fields sent for a node that the graph doesn't show yet, by node UUID. */
export interface EditedStreamGraph {
  streamAsset: string;
  graph: StreamGraphSummary;
  nodeIdByName: ReadonlyMap<string, string>;
  studioSentAheadByNodeId: ReadonlyMap<string, StreamGraphNodeStudioFields>;
}

/** `graph` read for edits; why not when the runtime renders it without its stream asset or a node without its UUID. */
export function editedStreamGraphOf(graph: StreamGraphSummary, studioSentAheadByNodeId: ReadonlyMap<string, StreamGraphNodeStudioFields> = new Map()): EditedStreamGraph | { because: string } {
  if (graph.stream_asset === null) return { because: "The runtime's graph names no stream asset, so an edit has no stream to name." };
  const nodeWithoutAnId = graph.nodes.find((node) => node.id === "");
  if (nodeWithoutAnId !== undefined) return { because: `The runtime's graph gives ${nodeWithoutAnId.name} no UUID, so an edit cannot name it.` };
  return { streamAsset: graph.stream_asset, graph, nodeIdByName: new Map(graph.nodes.map((node) => [node.name, node.id])), studioSentAheadByNodeId };
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

/** A node's studio fields as the next `set_studio_fields` builds on: those sent ahead of the graph, else the graph's. */
function studioToBuildOn(edited: EditedStreamGraph, node: StreamGraphNode): StreamGraphNodeStudioFields {
  return edited.studioSentAheadByNodeId.get(node.id) ?? node.studio;
}

/** Each node's studio fields that `actions` set, by node UUID, so a second edit sent before the graph shows the first builds on it. */
export function studioFieldsSetBy(actions: readonly StreamGraphAction[]): Map<string, StreamGraphNodeStudioFields> {
  const studioByNodeId = new Map<string, StreamGraphNodeStudioFields>();
  for (const action of actions) {
    if (action.operation !== "set_studio_fields") continue;
    const studio = streamGraphNodeStudioFieldsSchema.safeParse({ ...NODE_STUDIO_FIELDS_NONE_SET, ...action.studio });
    if (studio.success) studioByNodeId.set(action.node, studio.data);
  }
  return studioByNodeId;
}

/** Whether the graph now shows each studio field set ahead for its node, whatever else another edit set beside them. */
export function doesTheGraphShowTheStudioSentAhead(graph: StreamGraphSummary, nodeId: string, studioSentAhead: StreamGraphNodeStudioFields): boolean {
  const node = graph.nodes.find((graphNode) => graphNode.id === nodeId);
  if (node === undefined) return true;
  const shown = studioObjectOf(node.studio);
  return Object.entries(studioObjectOf(studioSentAhead)).every(([field, value]) => JSON.stringify(shown[field]) === JSON.stringify(value));
}

/** The UUID of the node named `nodeName`; `null` once the graph no longer holds it. */
function nodeIdOf(edited: EditedStreamGraph, nodeName: string): string | null {
  return edited.nodeIdByName.get(nodeName) ?? null;
}

/** Each moved card's new place and the group it now belongs to: its node's studio fields as they are, with the new position and group. */
export function cardsMovedEdits(edited: EditedStreamGraph, moves: readonly { node_id: string; position: StreamGraphCanvasPosition; frame_id: string | null }[]): StreamGraphAction[] {
  return moves.flatMap((move) => {
    const node = edited.graph.nodes.find((graphNode) => graphNode.name === move.node_id);
    if (node === undefined) return [];
    const position = toTheCanvasPixel(move.position);
    const studio = studioToBuildOn(edited, node);
    const group = move.frame_id;
    const isWhereItWas = studio.position !== null && studio.position[0] === position[0] && studio.position[1] === position[1];
    if (isWhereItWas && studio.group === group) return [];
    return [{ operation: "set_studio_fields", stream: edited.streamAsset, node: node.id, studio: studioObjectOf({ ...studio, position, group }) }];
  });
}

/** A link from `source`'s output pin to `target`'s input pin. */
export function pinsWiredEdits(edited: EditedStreamGraph, source: { node_id: string; pin: string }, target: { node_id: string; pin: string }): StreamGraphAction[] {
  const sourceNode = nodeIdOf(edited, source.node_id);
  const targetNode = nodeIdOf(edited, target.node_id);
  if (sourceNode === null || targetNode === null) return [];
  return [{ operation: "connect", stream: edited.streamAsset, source: { node: sourceNode, port: source.pin }, target: { node: targetNode, port: target.pin } }];
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
  const wiredNode = looseWire === null ? null : nodeIdOf(edited, looseWire.node_id);
  if (looseWire === null || wiredNode === null) return [placed];
  const wiredEnd = { node: wiredNode, port: looseWire.pin };
  if (looseWire.side === "output") {
    const input = firstPortOfTheFamily(nodeType.inputs, looseWire.family);
    return input === null ? [placed] : [placed, { operation: "connect", stream: edited.streamAsset, source: wiredEnd, target: { node: NODE_PLACED_IN_THIS_TRANSACTION, port: input } }];
  }
  const output = firstPortOfTheFamily(nodeType.outputs, looseWire.family);
  return output === null ? [placed] : [placed, { operation: "connect", stream: edited.streamAsset, source: { node: NODE_PLACED_IN_THIS_TRANSACTION, port: output }, target: wiredEnd }];
}

/** The port of `nodeType` a loose wire of `family` from `side` links to when a node of it is placed, or `null` when it has none. */
export function portALooseWireLinksTo(nodeType: NodeCatalogEntry, looseWire: Pick<LooseWire, "side" | "family">): string | null {
  return firstPortOfTheFamily(looseWire.side === "output" ? nodeType.inputs : nodeType.outputs, looseWire.family);
}

/** Whether `nodeType` has a port a loose wire of `family` from `side` could link to. */
export function canANodeTypeTakeTheLooseWire(nodeType: NodeCatalogEntry, looseWire: Pick<LooseWire, "side" | "family">): boolean {
  return portALooseWireLinksTo(nodeType, looseWire) !== null;
}

/** The selected links, nodes and notes taken out: a link of a removed node goes with it, so only the others are disconnected. */
export function deletedEdits(edited: EditedStreamGraph, deleted: { node_ids: readonly string[]; link_ids: readonly string[]; note_ids: readonly string[] }): StreamGraphAction[] {
  const removedNodeNames = new Set(deleted.node_ids);
  const disconnected: StreamGraphAction[] = edited.graph.links
    .filter((link) => deleted.link_ids.includes(linkIdAsTheCanvasKeysIt(link)) && !removedNodeNames.has(link.source_node) && !removedNodeNames.has(link.target_node))
    .flatMap((link) => {
      const sourceNode = nodeIdOf(edited, link.source_node);
      const targetNode = nodeIdOf(edited, link.target_node);
      if (sourceNode === null || targetNode === null) return [];
      return [{ operation: "disconnect", stream: edited.streamAsset, source: { node: sourceNode, port: link.source_port }, target: { node: targetNode, port: link.target_port } }];
    });
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
  const linkSourceNode = nodeIdOf(edited, link.source_node);
  const linkTargetNode = nodeIdOf(edited, link.target_node);
  if (input === null || output === null || linkSourceNode === null || linkTargetNode === null) return [];
  const linkSource = { node: linkSourceNode, port: link.source_port };
  const linkTarget = { node: linkTargetNode, port: link.target_port };
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

/** A frame's new title, description or colour, each one that differs from the frame's; a blank title is no edit, since the runtime refuses a group with no title. */
export function frameChangedEdits(edited: EditedStreamGraph, group: string, change: { title?: string; description?: string; colour?: string }): StreamGraphAction[] {
  const frame = edited.graph.groups.find((graphGroup) => graphGroup.id === group);
  if (frame === undefined) return [];
  const title = change.title?.trim();
  const description = change.description?.trim();
  const changedFields = {
    ...(title === undefined || title === "" || title === frame.title ? {} : { title }),
    ...(description === undefined || description === (frame.description ?? "") ? {} : { description }),
    ...(change.colour === undefined || change.colour === frame.colour ? {} : { colour: change.colour }),
  };
  return Object.keys(changedFields).length === 0 ? [] : [{ operation: "set_group_fields", stream: edited.streamAsset, group, ...changedFields }];
}

/** A frame taken out, its nodes left where they are, ungrouped. */
export function frameRemovedEdits(edited: EditedStreamGraph, group: string): StreamGraphAction[] {
  return edited.graph.groups.some((graphGroup) => graphGroup.id === group) ? [{ operation: "remove_group", stream: edited.streamAsset, group }] : [];
}

/** A card collapsed to its header, or opened again: its node's studio fields as they are, with `collapsed`. */
export function cardCollapsedEdits(edited: EditedStreamGraph, nodeName: string, collapsed: boolean): StreamGraphAction[] {
  const node = edited.graph.nodes.find((graphNode) => graphNode.name === nodeName);
  if (node === undefined) return [];
  const studio = studioToBuildOn(edited, node);
  if (studio.collapsed === collapsed) return [];
  return [{ operation: "set_studio_fields", stream: edited.streamAsset, node: node.id, studio: studioObjectOf({ ...studio, collapsed }) }];
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

/** What a collapsed selection's subgraph is named: `subgraph`, or the first of `subgraph-2`, `subgraph-3` … no node of the graph has. */
export function nameOfTheNewSubgraph(graph: Pick<StreamGraphSummary, "nodes">): string {
  const takenNames = new Set(graph.nodes.map((node) => node.name));
  let name = "subgraph";
  for (let suffix = 2; takenNames.has(name); suffix += 1) name = `subgraph-${suffix}`;
  return name;
}

/** The selected cards collapsed into one new subgraph named `subgraphName`, which the runtime makes an authored fragment wired as they were. */
export function selectionCollapsedEdits(edited: EditedStreamGraph, nodeNames: readonly string[], subgraphName: string): StreamGraphAction[] {
  const nodes = nodeNames.flatMap((nodeName) => {
    const nodeId = edited.nodeIdByName.get(nodeName);
    return nodeId === undefined ? [] : [nodeId];
  });
  return nodes.length === 0 ? [] : [{ operation: "collapse_selection_into_subgraph", stream: edited.streamAsset, nodes, name: subgraphName }];
}

/** A subgraph unlocked: its nodes become plain nodes of the stream, wired as they were. */
export function subgraphUnlockedEdits(edited: EditedStreamGraph, subgraphName: string): StreamGraphAction[] {
  const fragment = edited.nodeIdByName.get(subgraphName);
  return fragment === undefined ? [] : [{ operation: "unlock_generator_fragment", stream: edited.streamAsset, fragment }];
}

/** The name a newly placed generator's subgraph takes: the generator function's name as the runtime casts it, with the next free `-2`, `-3` … so it never refreshes a subgraph the graph holds already. */
export function nameOfTheNewGeneratorSubgraph(graph: Pick<StreamGraphSummary, "nodes">, generator: string): string {
  const takenNames = new Set(graph.nodes.map((node) => node.name));
  const functionName = castAsTheRuntimeNamesAnUnnamedNode(nodeTypeClassName(generator));
  let name = functionName;
  for (let suffix = 2; takenNames.has(name); suffix += 1) name = `${functionName}-${suffix}`;
  return name;
}

/** A graph generator run and its subgraph placed with its card at `position`, under a name no node holds. */
export function generatorSubgraphPlacedEdits(edited: EditedStreamGraph, generator: string, position: StreamGraphCanvasPosition): StreamGraphAction[] {
  return [
    { operation: "import_graph_generator", stream: edited.streamAsset, generator, name: nameOfTheNewGeneratorSubgraph(edited.graph, generator), as: NODE_PLACED_IN_THIS_TRANSACTION },
    { operation: "set_studio_fields", stream: edited.streamAsset, node: NODE_PLACED_IN_THIS_TRANSACTION, studio: { position: toTheCanvasPixel(position) } },
  ];
}

/** A graph generator's subgraph run again from its code with the settings it holds, which the runtime replaces in place under its name. */
export function subgraphRefreshedEdits(edited: EditedStreamGraph, subgraphName: string): StreamGraphAction[] {
  const subgraph = edited.graph.nodes.find((node) => node.name === subgraphName);
  if (subgraph === undefined || subgraph.fragment?.kind !== "generated") return [];
  return [{ operation: "import_graph_generator", stream: edited.streamAsset, generator: subgraph.type, name: subgraph.name, config: subgraph.config }];
}
