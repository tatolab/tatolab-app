// What each gesture on the stream graph asks the runtime for: the graph actions of one transaction, each
// naming the stream by its stream asset and a node by its UUID, as the runtime's action contract spells them.
// The canvas names a card by its node's name, which a link end names it by too.

import { isTheSamePinType } from "@tatolab/tato-app-view-sdk/built_in_pin_types";
import type { PinType } from "@tatolab/tato-app-view-sdk/pin_type_readings";
import {
  fragmentKindOfTheNode,
  fragmentOfTheNode,
  isAJsonValue,
  jsonObjectMembersOf,
  NODE_STUDIO_FIELDS_NONE_SET,
  studioFieldsOfTheNode,
  type JsonValue,
  type NodeTypeDescription,
  type NodeTypeInputDescribed,
  type StreamGraphAction,
  type StreamGraphActionLinkEnd,
  type StreamGraphNode,
  type StreamGraphNodeStudioFields,
  type StreamGraphPort,
  type StudioCanvasPair,
  type StreamGraph,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { castAsTheRuntimeNamesAnUnnamedNode, nodeTypeClassName } from "./node_words";
import { doesTheDescribedInputTakeAWire, doesTheInputPortTakeAWire, OPEN_BUNDLES_METADATA_KEY, openBundlesOfTheMetadata, openBundlesWith } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";

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
  graph: StreamGraph;
  nodeIdByName: ReadonlyMap<string, string>;
  studioSentAheadByNodeId: ReadonlyMap<string, StreamGraphNodeStudioFields>;
}

/** `graph` read for edits; why not when the runtime renders it without its stream asset or a node without its UUID. */
export function editedStreamGraphOf(graph: StreamGraph, studioSentAheadByNodeId: ReadonlyMap<string, StreamGraphNodeStudioFields> = new Map()): EditedStreamGraph | { because: string } {
  const streamAsset = graph.asset ?? null;
  if (streamAsset === null) return { because: "The runtime's graph names no stream asset, so an edit has no stream to name." };
  const nodeWithoutAnId = graph.nodes.find((node) => node.id === "");
  if (nodeWithoutAnId !== undefined) return { because: `The runtime's graph gives ${nodeWithoutAnId.name} no UUID, so an edit cannot name it.` };
  return { streamAsset, graph, nodeIdByName: new Map(graph.nodes.map((node) => [node.name, node.id])), studioSentAheadByNodeId };
}

/** A node's studio fields as the `studio` object `set_studio_fields` replaces whole: each field the node has kept, and its metadata. */
function studioObjectOf(studio: Readonly<StreamGraphNodeStudioFields>): Record<string, JsonValue> {
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
function studioToBuildOn(edited: EditedStreamGraph, node: StreamGraphNode): Readonly<StreamGraphNodeStudioFields> {
  return edited.studioSentAheadByNodeId.get(node.id) ?? studioFieldsOfTheNode(node);
}

/** Whether `value` is a point or a size on the canvas. */
function isACanvasPair(value: unknown): value is StudioCanvasPair {
  return Array.isArray(value) && value.length === 2 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}

/** A field that is unset or of the type `isOfItsType` names. */
function unsetOr<FieldType>(value: unknown, isOfItsType: (value: unknown) => value is FieldType): value is FieldType | null {
  return value === null || isOfItsType(value);
}

const isText = (value: unknown): value is string => typeof value === "string";
const isTrueOrFalse = (value: unknown): value is boolean => typeof value === "boolean";

/** The studio fields a `set_studio_fields` action's `studio` sets, a field it leaves out unset; `null` when one it sets is not of its field's type. */
function studioFieldsOfTheAction(studio: { readonly [field: string]: unknown }): StreamGraphNodeStudioFields | null {
  const { position, group, comment, colour, collapsed, metadata } = { ...NODE_STUDIO_FIELDS_NONE_SET, ...studio };
  if (!unsetOr(position, isACanvasPair) || !unsetOr(group, isText) || !unsetOr(comment, isText) || !unsetOr(colour, isText) || !unsetOr(collapsed, isTrueOrFalse)) return null;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const metadataEntries = Object.entries(metadata);
  const jsonMetadataEntries = metadataEntries.filter((entry): entry is [string, JsonValue] => isAJsonValue(entry[1]));
  if (jsonMetadataEntries.length !== metadataEntries.length) return null;
  return { position, group, comment, colour, collapsed, metadata: Object.fromEntries(jsonMetadataEntries) };
}

/** Each node's studio fields that `actions` set, by node UUID, so a second edit sent before the graph shows the first builds on it. */
export function studioFieldsSetBy(actions: readonly StreamGraphAction[]): Map<string, StreamGraphNodeStudioFields> {
  const studioByNodeId = new Map<string, StreamGraphNodeStudioFields>();
  for (const action of actions) {
    if (action.operation !== "set_studio_fields") continue;
    const studio = studioFieldsOfTheAction(action.studio);
    if (studio !== null) studioByNodeId.set(action.node, studio);
  }
  return studioByNodeId;
}

/** The node of UUID `nodeId` at any level of `nodes` and the subgraphs they hold. */
function nodeAtAnyLevel(nodes: readonly StreamGraphNode[], nodeId: string): StreamGraphNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const fragment = fragmentOfTheNode(node);
    const inside = fragment === null ? undefined : nodeAtAnyLevel(fragment.nodes, nodeId);
    if (inside !== undefined) return inside;
  }
  return undefined;
}

/** Whether the graph now shows each studio field set ahead for its node, at whatever level of its subgraphs the node is, whatever else another edit set beside them. */
export function doesTheGraphShowTheStudioSentAhead(graph: StreamGraph, nodeId: string, studioSentAhead: StreamGraphNodeStudioFields): boolean {
  const node = nodeAtAnyLevel(graph.nodes, nodeId);
  if (node === undefined) return true;
  const shown = studioObjectOf(studioFieldsOfTheNode(node));
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
export function pinsWiredEdits(edited: EditedStreamGraph, source: WiredPinEnd, target: WiredPinEnd): StreamGraphAction[] {
  const sourceNode = nodeIdOf(edited, source.node_id);
  const targetNode = nodeIdOf(edited, target.node_id);
  if (sourceNode === null || targetNode === null) return [];
  return [{ operation: "connect", stream: edited.streamAsset, source: linkEndOfThePin(sourceNode, source), target: linkEndOfThePin(targetNode, target) }];
}

/** One end of a wire a person drew: a pin by its node's name, or one member of a bundle pin. */
export interface WiredPinEnd {
  node_id: string;
  pin: string;
  member: string | null;
}

/** The link end `connect` takes for `end` on the node `node`, by its id: the port, and the member it names. */
function linkEndOfThePin(node: string, end: WiredPinEnd): StreamGraphActionLinkEnd {
  return { node, port: end.pin, ...(end.member === null ? {} : { member: end.member }) };
}

/** The first port of `ports` that can take or give a pin of `pinType`: one of that very type, or one of no exact type; any port when the type is unknown. */
function firstPortOfTheType(ports: readonly Pick<StreamGraphPort, "name" | "pin_type">[], pinType: PinType | null): string | null {
  return (pinType === null ? ports[0] : (ports.find((port) => port.pin_type === undefined || isTheSamePinType(port.pin_type, pinType)) ?? null))?.name ?? null;
}

/** The inputs of `nodeType` a wire can end at: each its description marks as taking one, a setting among them, and each it marks neither way. */
export function inputsAWireReaches(nodeType: Pick<NodeTypeDescription, "inputs">): readonly NodeTypeInputDescribed[] {
  return nodeType.inputs.filter(doesTheDescribedInputTakeAWire);
}

/** A pin a wire was dragged off and let go of over the canvas. */
export interface LooseWire extends WiredPinEnd {
  side: "input" | "output";
}

/** A node of `nodeType` placed with its card at `position`, and, from a loose wire, linked to the wire's pin by `wired.port`, the port of the placed node the runtime answered the wire fits. */
export function nodePlacedEdits(edited: EditedStreamGraph, nodeType: string, position: StreamGraphCanvasPosition, wired: { looseWire: LooseWire; port: string } | null): StreamGraphAction[] {
  const placed: StreamGraphAction = {
    operation: "add_node",
    stream: edited.streamAsset,
    type: nodeType,
    studio: { position: toTheCanvasPixel(position) },
    as: NODE_PLACED_IN_THIS_TRANSACTION,
  };
  const wiredNode = wired === null ? null : nodeIdOf(edited, wired.looseWire.node_id);
  if (wired === null || wiredNode === null) return [placed];
  const wiredEnd = linkEndOfThePin(wiredNode, wired.looseWire);
  const placedEnd = { node: NODE_PLACED_IN_THIS_TRANSACTION, port: wired.port };
  return [placed, { operation: "connect", stream: edited.streamAsset, ...(wired.looseWire.side === "output" ? { source: wiredEnd, target: placedEnd } : { source: placedEnd, target: wiredEnd }) }];
}

/** The selected links, nodes and notes taken out: a link of a removed node goes with it, so only the others are disconnected. */
export function deletedEdits(edited: EditedStreamGraph, deleted: { node_ids: readonly string[]; link_ids: readonly string[]; note_ids: readonly string[] }): StreamGraphAction[] {
  const removedNodeNames = new Set(deleted.node_ids);
  const disconnected: StreamGraphAction[] = edited.graph.links
    .filter((link) => deleted.link_ids.includes(linkIdAsTheCanvasKeysIt(link)) && !removedNodeNames.has(link.source.node) && !removedNodeNames.has(link.target.node))
    .flatMap((link) => {
      const source = linkEndByNodeId(edited, link.source);
      const target = linkEndByNodeId(edited, link.target);
      return source === null || target === null ? [] : [{ operation: "disconnect", stream: edited.streamAsset, source, target } satisfies StreamGraphAction];
    });
  const removedNodes: StreamGraphAction[] = edited.graph.nodes.filter((node) => removedNodeNames.has(node.name)).map((node) => ({ operation: "remove_node", stream: edited.streamAsset, node: node.id }));
  const removedNotes: StreamGraphAction[] = deleted.note_ids.map((note) => ({ operation: "remove_note", stream: edited.streamAsset, note }));
  return [...disconnected, ...removedNodes, ...removedNotes];
}

/** The link from `from_node`'s `from_port` to `to_node`'s `to_port`, its nodes by name, disconnected; nothing when the graph holds no node of either name. */
export function linkDisconnectedEdits(edited: EditedStreamGraph, link: { from_node: string; from_port: string; to_node: string; to_port: string }): StreamGraphAction[] {
  const sourceNode = nodeIdOf(edited, link.from_node);
  const targetNode = nodeIdOf(edited, link.to_node);
  if (sourceNode === null || targetNode === null) return [];
  return [{ operation: "disconnect", stream: edited.streamAsset, source: { node: sourceNode, port: link.from_port }, target: { node: targetNode, port: link.to_port } }];
}

/** A link end of the graph, its node by name, as an action names it: its node by id, its port, and the member it names; `null` for a node the graph holds no id for. */
function linkEndByNodeId(edited: EditedStreamGraph, end: StreamGraph["links"][number]["source"]): StreamGraphActionLinkEnd | null {
  const node = nodeIdOf(edited, end.node);
  return node === null ? null : linkEndOfThePin(node, { node_id: end.node, pin: end.port, member: end.member ?? null });
}

/** A link's id as the canvas keys it: the runtime's id, or its ends, each member it names after its port, while the runtime gives it none. */
export function linkIdAsTheCanvasKeysIt(link: StreamGraph["links"][number]): string {
  const endWords = (end: StreamGraph["links"][number]["source"]) => [end.node, end.port, ...(end.member === undefined || end.member === null ? [] : [end.member])].join(".");
  return link.id === "" ? `${endWords(link.source)}->${endWords(link.target)}` : link.id;
}

/**
 * `nodeName`'s node spliced into the link `linkId`: the link's source feeds its first input of the source's pin type that takes a wire, as
 * the runtime marks it in the graph or in its node type's description in `describedByType`, its first output of that type feeds
 * the link's target, and the link goes; nothing when it has no such ports.
 */
export function cardLetGoOverALinkEdits(edited: EditedStreamGraph, describedByType: ReadonlyMap<string, Pick<NodeTypeDescription, "inputs">>, nodeName: string, linkId: string): StreamGraphAction[] {
  const node = edited.graph.nodes.find((graphNode) => graphNode.name === nodeName);
  const link = edited.graph.links.find((graphLink) => linkIdAsTheCanvasKeysIt(graphLink) === linkId);
  if (node === undefined || link === undefined) return [];
  const sourcePort = edited.graph.nodes.find((graphNode) => graphNode.name === link.source.node)?.ports.outputs.find((port) => port.name === link.source.port);
  const linkPinType = sourcePort?.pin_type ?? null;
  const describedInputs = describedByType.get(node.type)?.inputs ?? [];
  const inputsTakingAWire = node.ports.inputs.filter((port) => doesTheInputPortTakeAWire(port, describedInputs.find((input) => input.name === port.name)));
  const input = firstPortOfTheType(inputsTakingAWire, linkPinType);
  const output = firstPortOfTheType(node.ports.outputs, linkPinType);
  const linkSource = linkEndByNodeId(edited, link.source);
  const linkTarget = linkEndByNodeId(edited, link.target);
  if (input === null || output === null || linkSource === null || linkTarget === null) return [];
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
  const frame = (edited.graph.groups ?? []).find((graphGroup) => graphGroup.id === group);
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
  return (edited.graph.groups ?? []).some((graphGroup) => graphGroup.id === group) ? [{ operation: "remove_group", stream: edited.streamAsset, group }] : [];
}

/** A bundle pin `pin` on `side` of the node `nodeName`'s card shown as a row for each of its members, or folded back into its own row: its node's studio fields as they are, with the bundle pins `studio.metadata.open_bundles` keeps open, the key left out once none is. */
export function bundleOpenedEdits(edited: EditedStreamGraph, nodeName: string, side: "input" | "output", pin: string, open: boolean): StreamGraphAction[] {
  const node = edited.graph.nodes.find((graphNode) => graphNode.name === nodeName);
  if (node === undefined) return [];
  const studio = studioToBuildOn(edited, node);
  const openBefore = openBundlesOfTheMetadata(studio.metadata);
  const openAfter = openBundlesWith(openBefore, side, pin, open);
  if (JSON.stringify(openAfter) === JSON.stringify(openBefore)) return [];
  const isAnyOpen = openAfter.inputs.length > 0 || openAfter.outputs.length > 0;
  const { [OPEN_BUNDLES_METADATA_KEY]: _openBefore, ...metadataBesides } = studio.metadata;
  const metadata = isAnyOpen ? { ...metadataBesides, [OPEN_BUNDLES_METADATA_KEY]: { inputs: [...openAfter.inputs], outputs: [...openAfter.outputs] } } : metadataBesides;
  return [{ operation: "set_studio_fields", stream: edited.streamAsset, node: node.id, studio: studioObjectOf({ ...studio, metadata }) }];
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
export function nameOfTheNewSubgraph(graph: Pick<StreamGraph, "nodes">): string {
  const takenNames = new Set(graph.nodes.map((node) => node.name));
  let name = "subgraph";
  for (let suffix = 2; takenNames.has(name); suffix += 1) name = `subgraph-${suffix}`;
  return name;
}

/** The selected cards collapsed into one new subgraph named `subgraphName`, which the runtime saves as a stream of the project and places where they were, wired as they were. */
export function selectionCollapsedEdits(edited: EditedStreamGraph, nodeNames: readonly string[], subgraphName: string): StreamGraphAction[] {
  const nodes = nodeNames.flatMap((nodeName) => {
    const nodeId = edited.nodeIdByName.get(nodeName);
    return nodeId === undefined ? [] : [nodeId];
  });
  return nodes.length === 0 ? [] : [{ operation: "collapse_selection_into_subgraph", stream: edited.streamAsset, nodes, name: subgraphName }];
}

/** A subgraph unlocked: its nodes, or a copy of the placed stream's, become plain nodes of the stream, wired as they were. */
export function subgraphUnlockedEdits(edited: EditedStreamGraph, subgraphName: string): StreamGraphAction[] {
  const fragment = edited.nodeIdByName.get(subgraphName);
  return fragment === undefined ? [] : [{ operation: "unlock_subgraph", stream: edited.streamAsset, fragment }];
}

/** The name a newly placed generator's subgraph takes: the generator function's name as the runtime casts it, with the next free `-2`, `-3` … so it never refreshes a subgraph the graph holds already. */
export function nameOfTheNewGeneratorSubgraph(graph: Pick<StreamGraph, "nodes">, generator: string): string {
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
  if (subgraph === undefined || fragmentOfTheNode(subgraph) === null || fragmentKindOfTheNode(subgraph) !== "generated") return [];
  return [{ operation: "import_graph_generator", stream: edited.streamAsset, generator: subgraph.type, name: subgraph.name, config: jsonObjectMembersOf(subgraph.config) }];
}

/** `actions` sent inside the subgraph `level` names, the path of subgraph node UUIDs from the stream's own level inward; why not when one of them is an edit the runtime makes only on the stream's own level. */
export function streamGraphActionsAtTheLevel(actions: readonly StreamGraphAction[], level: readonly string[]): StreamGraphAction[] | { because: string } {
  if (level.length === 0) return [...actions];
  const actionsAtTheLevel: StreamGraphAction[] = [];
  for (const action of actions) {
    switch (action.operation) {
      case "import_graph_generator":
      case "use_dependency_stream":
        return { because: "The runtime places a subgraph from code or from another stream only on the stream's own level." };
      case "add_note":
      case "set_note_fields":
      case "remove_note":
        return { because: "The runtime keeps a note only on the stream's own level, not inside a subgraph." };
      default:
        actionsAtTheLevel.push({ ...action, level: [...level] });
    }
  }
  return actionsAtTheLevel;
}
