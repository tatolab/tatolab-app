// The browser mock's `transact`: graph actions applied to the mock streams' graphs whole or not at all, a node named
// by its id or an earlier `add_node`'s `as`, answered as the runtime answers (`GraphTransactionToolResult`). History
// keeps each operation as the runtime does: its stream by asset UUID, with `from` and `to`, the inverse swapping them.
// The mock judges no edit: it applies each one as asked, a node added with the ports the recorded node catalog
// lists, a link made between any two ports. What the runtime decides, a refusal among it, is a recording a scenario
// replays before the edit reaches here. An edit naming what the mock's graphs do not hold, which no window sends, or
// an action the mock does not model, is a defect of whoever sent it, thrown as `MockGraphEditNotApplicable`.
//
// A placed stream's nodes are held inside each `tatolab.project:StreamFragment` node placing it, every placement kept
// alike: an edit at its level is made on one and copied to the others, recorded on the placed stream's asset, and the
// links onto a port it renames or removes are carried at every placement. History names a node inside by the id its
// first placement draws it under, where the runtime names it by the placed stream's own.

import { mockGraphNodeIdOf, mockUuidOf, type MockGraphNode, type MockStreamGraph } from "./mock_stream_fixtures";
import { studioAsTheRuntimeRendersIt } from "./mock_stream_graph_document";
import { echoTheInputValueSet } from "./mock_value_echo";
import { exactPinOfTheDeclaredPort } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import { NODE_STUDIO_FIELDS_NONE_SET } from "@tatolab/tato-app-view-sdk/studio_readings";
import { PORT_FAMILIES, type JsonValue, type NodeCatalogEntry, type NodeCatalogPort, type PortFamily, type ProjectGraphTransaction, type StreamGraphDeclaredPort, type StreamGraphAction, type StreamGraphActionLinkEnd, type StreamGraphGroup, type StreamGraphLink, type StreamGraphNodeStudioFields, type StreamGraphNote } from "../src/shared/tatolab_backend_contract";

/** A mock stream a graph action can name: its id, and the graph the mock holds for it. */
export interface MockStreamGraphTarget {
  stream_id: string;
  graph: MockStreamGraph;
}

/** One level of a mock stream's graph: the stream's own, or the inside of a subgraph, which holds no notes. */
interface MockGraphLevel {
  nodes: MockGraphNode[];
  links: StreamGraphLink[];
  groups?: StreamGraphGroup[];
  notes?: StreamGraphNote[];
}

/** What a mock transaction did, with each operation and its inverse as history records them. */
export interface MockGraphTransactionApplied {
  transaction: Omit<ProjectGraphTransaction, "mode" | "transaction" | "commit">;
  history_operations: JsonValue[];
  inverse_operations: JsonValue[];
}

/** An edit the mock cannot apply, naming what its graphs do not hold: a defect of the caller, never an answer the window reads. */
/** What one mock runtime adds a node from: the node catalog it lists, and the ports of each node an edit removed, by its id, so an undo or redo adding back a node of a type the catalog does not list gives it the ports it had, as the runtime's document keeps them. */
export interface MockGraphEditGrounds {
  nodeCatalog: readonly NodeCatalogEntry[];
  portsOfTheNodesRemoved: Map<string, Pick<MockGraphNode, "input_ports" | "output_ports">>;
}

export class MockGraphEditNotApplicable extends Error {
  override readonly name = "MockGraphEditNotApplicable";
}

/** The studio fields of a `studio` object an action gives, as the runtime keeps them: every key it does not know under `metadata`. */
function studioFieldsOfTheAction(studio: Record<string, JsonValue>, node: string): StreamGraphNodeStudioFields {
  const { contract: _contract, position, group, comment, colour, collapsed, metadata, ...unknownKeys } = studio;
  if (position !== undefined && !isACanvasPair(position)) throw new MockGraphEditNotApplicable(`node ${node}'s studio.position is not [x, y]`);
  if (metadata !== undefined && (metadata === null || typeof metadata !== "object" || Array.isArray(metadata))) throw new MockGraphEditNotApplicable(`node ${node}'s studio.metadata is not an object`);
  return {
    position: position ?? null,
    group: typeof group === "string" ? group : null,
    comment: typeof comment === "string" ? comment : null,
    colour: typeof colour === "string" ? colour : null,
    collapsed: typeof collapsed === "boolean" ? collapsed : null,
    metadata: { ...(metadata ?? {}), ...unknownKeys },
  };
}

const GRAPH_INPUT_NODE_TYPE = "tatolab.stream:GraphInput";
const GRAPH_OUTPUT_NODE_TYPE = "tatolab.stream:GraphOutput";
const STREAM_FRAGMENT_NODE_TYPE = "tatolab.project:StreamFragment";
const SET_VARIABLE_NODE_TYPE = "tatolab.stream:SetVariable";

const GET_VARIABLE_NODE_TYPE = "tatolab.stream:GetVariable";

/** The non-empty string each node of `nodeType` among `nodes` holds at `nameKey`, in the order `nodes` lists them. */
function namesTheNodesOfTheTypeHold(nodes: readonly MockGraphNode[], nodeType: string, nameKey: string): string[] {
  return nodes.flatMap((node) => {
    const name = node.config[nameKey];
    return node.type === nodeType && typeof name === "string" && name !== "" ? [name] : [];
  });
}

/** `prefix` and the first number from 1 whose name, compared without case, no node of `nodeType` among `nodes` holds at `nameKey`. */
function firstNameNoNodeOfTheTypeHolds(nodes: readonly MockGraphNode[], nodeType: string, nameKey: string, prefix: string): string {
  const taken = new Set(namesTheNodesOfTheTypeHold(nodes, nodeType, nameKey).map((name) => name.toLowerCase()));
  let number = 1;
  while (taken.has(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

/**
 * `config` holding the name a node of `nodeType` added among `nodes` takes when `config` names none, as the runtime's
 * `add_node` gives it: a `GraphInput` the next free `input1`, a `GraphOutput` the next free `output1`, a `SetVariable` the
 * next free `var1`, and a `GetVariable` the variable of the level's last `SetVariable`.
 */
export function configHoldingTheDefaultNameOfAGraphPortOrVariable(nodeType: string, config: Record<string, JsonValue>, nodes: readonly MockGraphNode[]): Record<string, JsonValue> {
  const defaultName = ((): { key: string; name: string } | null => {
    switch (nodeType) {
      case GRAPH_INPUT_NODE_TYPE:
        return { key: "port", name: firstNameNoNodeOfTheTypeHolds(nodes, GRAPH_INPUT_NODE_TYPE, "port", "input") };
      case GRAPH_OUTPUT_NODE_TYPE:
        return { key: "port", name: firstNameNoNodeOfTheTypeHolds(nodes, GRAPH_OUTPUT_NODE_TYPE, "port", "output") };
      case SET_VARIABLE_NODE_TYPE:
        return { key: "variable", name: firstNameNoNodeOfTheTypeHolds(nodes, SET_VARIABLE_NODE_TYPE, "variable", "var") };
      case GET_VARIABLE_NODE_TYPE: {
        const variableOfTheLastSetter = namesTheNodesOfTheTypeHold(nodes, SET_VARIABLE_NODE_TYPE, "variable").at(-1);
        return variableOfTheLastSetter === undefined ? null : { key: "variable", name: variableOfTheLastSetter };
      }
      default:
        return null;
    }
  })();
  if (defaultName === null) return config;
  const named = config[defaultName.key];
  return named === undefined || named === null || named === "" ? { ...config, [defaultName.key]: defaultName.name } : config;
}

/** The stream a project's Stream Fragment node places, by asset UUID, and the import it is a stream of, `null` for one of the project's own; `null` for any other node. */
function streamTheNodePlaces(node: MockGraphNode): { asset: string; from: JsonValue | null } | null {
  if (node.type !== STREAM_FRAGMENT_NODE_TYPE) return null;
  const heldStream = node.config["stream"];
  if (!isAJsonObject(heldStream) || typeof heldStream["asset"] !== "string") return null;
  return { asset: heldStream["asset"], from: heldStream["from"] ?? null };
}

/** The asset of the project's own stream `node` places; `null` for an import's stream or any other node. */
function ownStreamTheNodePlaces(node: MockGraphNode): string | null {
  const placed = streamTheNodePlaces(node);
  return placed !== null && placed.from === null ? placed.asset : null;
}

/** Why `subgraph`, the node `subgraphId` names at a level, has no inside an edit can reach, the defect thrown at an edit sent there; `null` when it places one of the project's own streams. */
function whyTheNodeHasNoInsideToEdit(subgraph: MockGraphNode | undefined, subgraphId: string): string | null {
  if (subgraph === undefined) return `no node ${subgraphId} in the stream's graph`;
  const placed = streamTheNodePlaces(subgraph);
  if (placed !== null && subgraph.fragment !== undefined) {
    return placed.from === null ? null : `node ${subgraphId} \`${subgraph.name}\` places a stream of the import ${JSON.stringify(placed.from)}, which is edited by opening the import's folder as a project of its own`;
  }
  if (subgraph.fragment !== undefined) return `node ${subgraphId} \`${subgraph.name}\` holds what the graph generator \`${subgraph.type}\` builds, which a refresh replaces; unlock it with unlock_subgraph to edit inside it`;
  return `node ${subgraphId} \`${subgraph.name}\` is no subgraph, so it has no inside to edit`;
}

/** The one port `value` a Graph Input declares as its output and a Graph Output as its input, of the family its config names, as the runtime builds an interface node no registry lists. */
function portsOfTheInterfaceNode(type: typeof GRAPH_INPUT_NODE_TYPE | typeof GRAPH_OUTPUT_NODE_TYPE, family: PortFamily | null): Pick<MockGraphNode, "input_ports" | "output_ports"> {
  const valuePort: StreamGraphDeclaredPort = { name: "value", family, stream_facts: null, values_checked: null, pin: null, value_read: null };
  return type === GRAPH_INPUT_NODE_TYPE ? { input_ports: [], output_ports: [valuePort] } : { input_ports: [valuePort], output_ports: [] };
}

/** The port a Graph Input or Output node inside a subgraph stands for: its config's `port`, else its name; `null` for any other node. */
function portTheInterfaceNodeStandsFor(node: MockGraphNode): { direction: "input" | "output"; port: string; family: PortFamily | null } | null {
  if (node.type !== GRAPH_INPUT_NODE_TYPE && node.type !== GRAPH_OUTPUT_NODE_TYPE) return null;
  const port = typeof node.config["port"] === "string" ? node.config["port"] : node.name;
  const family = node.type === GRAPH_INPUT_NODE_TYPE ? (node.output_ports[0]?.family ?? null) : (node.input_ports[0]?.family ?? null);
  return { direction: node.type === GRAPH_INPUT_NODE_TYPE ? "input" : "output", port, family };
}

/** Every node placing the project's own stream `placedStream` at any level of `level`, the graph of `holdingStream`, with the level and the stream that hold it. */
function eachPlacementOf(placedStream: string, level: MockGraphLevel, holdingStream: string): { placing: MockGraphNode; holdingLevel: MockGraphLevel; holdingStream: string }[] {
  return level.nodes.flatMap((node) => [
    ...(ownStreamTheNodePlaces(node) === placedStream ? [{ placing: node, holdingLevel: level, holdingStream }] : []),
    ...(node.fragment === undefined ? [] : eachPlacementOf(placedStream, node.fragment, ownStreamTheNodePlaces(node) ?? holdingStream)),
  ]);
}

/** The ports the Graph Input and Output nodes of `level` stand for, by the id each node is drawn under. */
function portsOfTheInterfaceNodes(level: MockGraphLevel, nodeIdOf: (node: MockGraphNode) => string): Map<string, NonNullable<ReturnType<typeof portTheInterfaceNodeStandsFor>>> {
  return new Map(level.nodes.flatMap((node) => {
    const stoodFor = portTheInterfaceNodeStandsFor(node);
    return stoodFor === null ? [] : [[nodeIdOf(node), stoodFor] as const];
  }));
}

/** The first placement of `placedStream` in `graphsByStreamAsset`: the stream asset whose graph holds it and the path of node ids from that stream's own level to it. */
function firstPlacementOf(placedStream: string, targetsByStreamAsset: ReadonlyMap<string, MockStreamGraphTarget>): { streamAsset: string; level: string[] } | null {
  const pathTo = (streamId: string, level: MockGraphLevel): string[] | null => {
    for (const node of level.nodes) {
      const nodeId = mockGraphNodeIdOf(streamId, node);
      if (ownStreamTheNodePlaces(node) === placedStream && node.fragment !== undefined) return [nodeId];
      const inside = node.fragment === undefined ? null : pathTo(streamId, node.fragment);
      if (inside !== null) return [nodeId, ...inside];
    }
    return null;
  };
  for (const [streamAsset, target] of targetsByStreamAsset) {
    const level = pathTo(target.stream_id, target.graph);
    if (level !== null) return { streamAsset, level };
  }
  return null;
}

/** The stream asset holding each placement of `placedStream` in `targetsByStreamAsset`'s graphs, and what its first placement holds, as a placed stream's graph document does; `null` when nothing places it. */
export function thePlacementsOfTheStream(placedStream: string, targetsByStreamAsset: ReadonlyMap<string, MockStreamGraphTarget>): { holdingStreams: string[]; document: JsonValue } | null {
  const placements = [...targetsByStreamAsset].flatMap(([streamAsset, target]) => eachPlacementOf(placedStream, target.graph, streamAsset));
  const firstFragment = placements[0]?.placing.fragment;
  if (firstFragment === undefined) return null;
  return { holdingStreams: placements.map((placement) => placement.holdingStream), document: placedStreamDocumentOf(firstFragment) };
}

function placedStreamDocumentOf(level: MockGraphLevel): JsonValue {
  return JSON.parse(JSON.stringify({ nodes: level.nodes, links: level.links, groups: level.groups ?? [] }));
}

/** The history operations that change no mock graph of their own: a placed stream's document, which the mock holds inside its placements, and the links an edit inside carries, which the mock carries again when it applies that edit. */
export function isAHistoryOperationTheMockMakesAgainFromTheEditInside(historyOperation: JsonValue): boolean {
  return isAJsonObject(historyOperation) && ["create_stream_document", "delete_stream_document", "carry_the_links_onto_the_ports_of_a_placed_stream"].includes(String(historyOperation["operation"]));
}

/** A port of a node added from `port`, its catalog port: its name, family and pin type as the catalog lists them, stating no stream facts and reading no value yet. */
function graphPortOfTheCatalogPort(port: Pick<NodeCatalogPort, "name" | "family" | "pin">): StreamGraphDeclaredPort {
  return { name: port.name, family: port.family, stream_facts: null, values_checked: port.family === "records" ? false : null, pin: exactPinOfTheDeclaredPort(port.pin), value_read: null };
}

function shortNameOfTheType(nodeType: string): string {
  return (nodeType.split(":").at(-1) ?? nodeType).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

let mockLinksMade = 0;
/** How many groups and notes the mock has made, so each one's UUID is new, as the runtime's always is. */
let mockGroupsAndNotesMade = 0;
/** How many streams a collapse has saved, so each one's asset UUID is new. */
let mockPlacedStreamsSaved = 0;

/** Whether `value` is a JSON object, not a list or `null`. */
export const isAJsonObject = (value: JsonValue | undefined): value is { [key: string]: JsonValue } => typeof value === "object" && value !== null && !Array.isArray(value);
const isACanvasPair = (value: JsonValue | undefined): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number");

/** The graph action that applies `historyOperation`, an operation as history records it, to the mock graphs; `null` for one that names no graph. */
export function graphActionApplyingTheHistoryOperation(historyOperation: JsonValue): StreamGraphAction | null {
  if (typeof historyOperation !== "object" || historyOperation === null || Array.isArray(historyOperation)) return null;
  const { operation, stream, node } = historyOperation;
  if (typeof stream !== "string") return null;
  const to = historyOperation["to"] ?? null;
  switch (operation) {
    case "set_node_config":
      return typeof node === "string" && typeof to === "object" && to !== null && !Array.isArray(to) ? { operation, stream, node, config: to } : null;
    case "set_node_input_value":
    case "set_pin_value": {
      const input = historyOperation["input"];
      return typeof node === "string" && typeof input === "string" ? { operation, stream, node, input, value: to } : null;
    }
    case "rename_node":
      return typeof node === "string" && typeof to === "string" ? { operation, stream, node, name: to } : null;
    case "remove_node":
      return typeof node === "string" ? { operation, stream, node } : null;
    case "add_node": {
      const added = historyOperation["node"];
      if (typeof added !== "object" || added === null || Array.isArray(added)) return null;
      const { type, name, config, pins, studio, id } = added;
      if (typeof type !== "string" || typeof name !== "string" || typeof id !== "string") return null;
      return { operation, stream, type, name, as: id, ...(isAJsonObject(config) ? { config } : {}), ...(isAJsonObject(pins) ? { pins } : {}), ...(isAJsonObject(studio) ? { studio } : {}) };
    }
    case "set_studio_fields":
      return typeof node === "string" && isAJsonObject(to) ? { operation, stream, node, studio: to } : null;
    case "set_exposed_config_fields":
      return typeof node === "string" && Array.isArray(to) ? { operation, stream, node, exposed_config_fields: to.flatMap((field) => (typeof field === "string" ? [field] : [])) } : null;
    case "set_group_fields": {
      const group = historyOperation["group"];
      if (typeof group !== "string" || !isAJsonObject(to)) return null;
      const { title, description, colour } = to;
      return { operation, stream, group, ...(typeof title === "string" ? { title } : {}), ...(typeof description === "string" ? { description } : description === null ? { description: "" } : {}), ...(typeof colour === "string" ? { colour } : {}) };
    }
    case "add_group":
    case "remove_group": {
      const group = historyOperation["group"];
      if (!isAJsonObject(group) || typeof group["id"] !== "string" || typeof group["title"] !== "string") return null;
      if (operation === "remove_group") return { operation, stream, group: group["id"] };
      const { title, description, colour, nodes } = group;
      const memberIds = Array.isArray(nodes) ? nodes.flatMap((member) => (typeof member === "string" ? [member] : [])) : [];
      return { operation, stream, title, nodes: memberIds, ...(typeof description === "string" ? { description } : description === null ? { description: "" } : {}), ...(typeof colour === "string" ? { colour } : {}) };
    }
    case "set_note_fields": {
      const note = historyOperation["note"];
      if (typeof note !== "string" || !isAJsonObject(to)) return null;
      const { text, position, size } = to;
      return { operation, stream, note, ...(typeof text === "string" ? { text } : {}), ...(isACanvasPair(position) ? { position } : {}), ...(isACanvasPair(size) ? { size } : {}) };
    }
    case "add_note":
    case "remove_note": {
      const note = historyOperation["note"];
      if (!isAJsonObject(note) || typeof note["id"] !== "string") return null;
      if (operation === "remove_note") return { operation, stream, note: note["id"] };
      const { text, position, size } = note;
      return typeof text === "string" && isACanvasPair(position) && isACanvasPair(size) ? { operation, stream, text, position, size } : null;
    }
    case "fold_into_fragment":
    case "unfold_fragment": {
      const { fragment, name, nodes } = historyOperation;
      if (typeof fragment !== "string" || typeof name !== "string" || !Array.isArray(nodes)) return null;
      if (operation === "unfold_fragment") return { operation: "unlock_subgraph", stream, fragment };
      return { operation: "collapse_selection_into_subgraph", stream, name, nodes: nodes.flatMap((member) => (typeof member === "string" ? [member] : [])) };
    }
    case "connect":
    case "disconnect": {
      const link = historyOperation["link"];
      if (typeof link !== "object" || link === null || Array.isArray(link)) return null;
      const end = (value: JsonValue | undefined): StreamGraphActionLinkEnd | null =>
        typeof value === "object" && value !== null && !Array.isArray(value) && typeof value["node"] === "string" && typeof value["port"] === "string" ? { node: value["node"], port: value["port"] } : null;
      const source = end(link["source"]);
      const target = end(link["target"]);
      return source !== null && target !== null ? { operation, stream, source, target } : null;
    }
    default:
      return null;
  }
}

/**
 * Apply `operations` to `targetsByStreamAsset`'s graphs as one transaction: each graph is changed only once every
 * operation has applied to a copy of it. Applied by an undo or a redo, an `add_node`'s `as` is the id the node had, which
 * it takes again. An `add_group` or `add_note` takes the id its operation in `historyOperationsReplayed` recorded, so the
 * running graph a commit changes after the saved one gets the same ids. An operation naming a placed stream's asset, as
 * history does, is made at that stream's first placement. A node is added with the ports `nodeCatalog` lists for its type.
 */
export function applyMockGraphTransaction(
  targetsByStreamAsset: ReadonlyMap<string, MockStreamGraphTarget>,
  { nodeCatalog, portsOfTheNodesRemoved }: MockGraphEditGrounds,
  operations: readonly StreamGraphAction[],
  applying: "a_transaction" | "a_live_transaction" | "undo_or_redo" = "a_transaction",
  historyOperationsReplayed: readonly JsonValue[] = [],
): MockGraphTransactionApplied {
  const workingGraphs = new Map([...targetsByStreamAsset].map(([streamAsset, target]) => [streamAsset, structuredClone(target.graph)]));
  const nodeIdsByLabel = new Map<string, string>();
  const applied: Omit<ProjectGraphTransaction, "mode" | "transaction" | "commit"> = { operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] };
  const historyOperations: JsonValue[] = [];
  const inverseOperations: JsonValue[] = [];
  for (const [operationIndex, operation] of operations.entries()) {
    const placementNamed = targetsByStreamAsset.has(operation.stream) ? null : firstPlacementOf(operation.stream, targetsByStreamAsset);
    const streamAsset = placementNamed?.streamAsset ?? operation.stream;
    const target = targetsByStreamAsset.get(streamAsset);
    const streamGraph = workingGraphs.get(streamAsset);
    if (target === undefined || streamGraph === undefined) {
      throw new MockGraphEditNotApplicable(`no loaded stream of the mock is the stream asset ${operation.stream}`);
    }
    const nodeIdOf = (graphNode: MockGraphNode) => mockGraphNodeIdOf(target.stream_id, graphNode);
    const level = [...(placementNamed?.level ?? []), ...("level" in operation ? (operation.level ?? []) : [])];
    let graph: MockGraphLevel = streamGraph;
    let streamOfTheLevel = streamAsset;
    for (const subgraphId of level) {
      const subgraph = graph.nodes.find((candidate) => nodeIdOf(candidate) === subgraphId);
      const whyNoInside = whyTheNodeHasNoInsideToEdit(subgraph, subgraphId);
      const placedStream = subgraph === undefined ? null : ownStreamTheNodePlaces(subgraph);
      if (whyNoInside !== null || subgraph?.fragment === undefined || placedStream === null) {
        throw new MockGraphEditNotApplicable(whyNoInside ?? `node ${subgraphId} names no stream`);
      }
      graph = subgraph.fragment;
      streamOfTheLevel = placedStream;
    }
    const isAtAPlacedStreamsLevel = level.length > 0;
    const portsOfTheLevelBeforeTheEdit = portsOfTheInterfaceNodes(graph, nodeIdOf);
    const nodeNamed = (node: string) => {
      const nodeId = nodeIdsByLabel.get(node) ?? node;
      const graphNode = graph.nodes.find((candidate) => nodeIdOf(candidate) === nodeId);
      if (graphNode === undefined) throw new MockGraphEditNotApplicable(`no node ${node} in the stream's graph`);
      return graphNode;
    };
    const linkEndNamed = (end: StreamGraphActionLinkEnd) => {
      const graphNode = nodeNamed(end.node);
      return { graphNode, end: { node: nodeIdOf(graphNode), port: end.port } };
    };
    const theReplayedFoldsPlacedStream = (): string | null => {
      const replayed = historyOperationsReplayed.filter((historyOperation) => !isAHistoryOperationTheMockMakesAgainFromTheEditInside(historyOperation))[operationIndex];
      return isAJsonObject(replayed) && replayed["operation"] === "fold_into_fragment" && typeof replayed["placed_stream"] === "string" ? replayed["placed_stream"] : null;
    };
    const idTheReplayedOperationKept = (field: "group" | "note"): string | null => {
      const replayed = historyOperationsReplayed.filter((historyOperation) => !isAHistoryOperationTheMockMakesAgainFromTheEditInside(historyOperation))[operationIndex];
      const kept = isAJsonObject(replayed) ? replayed[field] : undefined;
      return isAJsonObject(kept) && typeof kept["id"] === "string" ? kept["id"] : null;
    };
    const recordInHistory = (historyOperation: { [key: string]: JsonValue }, inverseOperation: { [key: string]: JsonValue }) => {
      historyOperations.push({ stream: streamOfTheLevel, ...historyOperation });
      inverseOperations.unshift({ stream: streamOfTheLevel, ...inverseOperation });
      applied.operations.push({ ...historyOperation, stream: target.stream_id });
    };
    switch (operation.operation) {
      case "set_node_config": {
        const node = nodeNamed(operation.node);
        const from = structuredClone(node.config);
        node.config = structuredClone(operation.config);
        recordInHistory({ operation: "set_node_config", node: nodeIdOf(node), from, to: operation.config }, { operation: "set_node_config", node: nodeIdOf(node), from: operation.config, to: from });
        break;
      }
      case "set_pin_value": {
        const node = nodeNamed(operation.node);
        if (!node.input_ports.some((port) => port.name === operation.input)) {
          throw new MockGraphEditNotApplicable(`node ${operation.node} has no input \`${operation.input}\``);
        }
        const to = operation.value ?? null;
        const from = echoTheInputValueSet(node, operation.input, to, applying);
        recordInHistory({ operation: "set_pin_value", node: nodeIdOf(node), input: operation.input, from, to }, { operation: "set_pin_value", node: nodeIdOf(node), input: operation.input, from: to, to: from });
        break;
      }
      case "set_node_input_value": {
        const node = nodeNamed(operation.node);
        const port = node.input_ports.find((candidate) => candidate.name === operation.input);
        if (port === undefined || port.value_read === null) {
          throw new MockGraphEditNotApplicable(`node ${operation.node} has no input \`${operation.input}\` that holds a value`);
        }
        const to = operation.value ?? null;
        const from = echoTheInputValueSet(node, operation.input, to, applying);
        if (applying === "a_live_transaction") break;
        recordInHistory({ operation: "set_node_input_value", node: nodeIdOf(node), input: operation.input, from, to }, { operation: "set_node_input_value", node: nodeIdOf(node), input: operation.input, from: to, to: from });
        break;
      }
      case "rename_node": {
        const node = nodeNamed(operation.node);
        const nodeId = nodeIdOf(node);
        const name = operation.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        if (graph.nodes.some((other) => other !== node && other.name === name)) {
          throw new MockGraphEditNotApplicable(`node \`${name}\` in this graph already has the name \`${operation.name}\` casts to`);
        }
        const from = node.name;
        for (const link of graph.links) {
          if (link.source_node === node.name) link.source_node = name;
          if (link.target_node === node.name) link.target_node = name;
        }
        node.id_kept_through_renames = nodeId;
        node.name = name;
        recordInHistory({ operation: "rename_node", node: nodeId, from, to: name }, { operation: "rename_node", node: nodeId, from: name, to: from });
        break;
      }
      case "add_node": {
        const interfaceType = operation.type === GRAPH_INPUT_NODE_TYPE || operation.type === GRAPH_OUTPUT_NODE_TYPE ? operation.type : null;
        const catalogEntry = nodeCatalog.find((entry) => entry.type === operation.type);
        const portsItHadBeforeItsRemoval = applying === "undo_or_redo" && operation.as !== undefined ? portsOfTheNodesRemoved.get(operation.as) : undefined;
        if (interfaceType === null && catalogEntry === undefined && portsItHadBeforeItsRemoval === undefined) throw new MockGraphEditNotApplicable(`the recorded node catalog lists no node type \`${operation.type}\``);
        const shortName = operation.name ?? shortNameOfTheType(operation.type);
        const takenNames = new Set(graph.nodes.map((node) => node.name));
        let name = shortName;
        for (let suffix = 2; operation.name === undefined && takenNames.has(name); suffix += 1) name = `${shortName}-${suffix}`;
        if (takenNames.has(name)) throw new MockGraphEditNotApplicable(`node \`${name}\` in this graph already has that name`);
        const config = configHoldingTheDefaultNameOfAGraphPortOrVariable(operation.type, structuredClone(operation.config ?? {}), graph.nodes);
        const pins = structuredClone(operation.pins ?? {});
        const declaredFamily = config["family"];
        const addedNode: MockGraphNode = {
          name,
          type: operation.type,
          state: interfaceType === null ? "Running" : null,
          config,
          pins,
          ...(interfaceType !== null
            ? portsOfTheInterfaceNode(interfaceType, PORT_FAMILIES.find((family) => family === declaredFamily) ?? null)
            : catalogEntry !== undefined
              ? { input_ports: catalogEntry.inputs.filter((input) => input.input_mode?.mode !== "setting_only").map(graphPortOfTheCatalogPort), output_ports: catalogEntry.outputs.map(graphPortOfTheCatalogPort) }
              : structuredClone(portsItHadBeforeItsRemoval ?? { input_ports: [], output_ports: [] })),
        };
        if (operation.studio !== undefined) addedNode.studio = studioFieldsOfTheAction(operation.studio, operation.as ?? name);
        if (applying === "undo_or_redo" && operation.as !== undefined) addedNode.id_kept_through_renames = operation.as;
        graph.nodes.push(addedNode);
        const nodeId = nodeIdOf(addedNode);
        if (operation.as !== undefined) nodeIdsByLabel.set(operation.as, nodeId);
        applied.added_nodes.push({ stream: target.stream_id, node: nodeId, name, as: operation.as ?? null });
        const studio: { studio?: JsonValue } = addedNode.studio === undefined ? {} : { studio: studioAsTheRuntimeRendersIt(addedNode.studio) };
        recordInHistory({ operation: "add_node", node: { id: nodeId, name, type: operation.type, config, pins, ...studio } }, { operation: "remove_node", node: nodeId });
        break;
      }
      case "set_exposed_config_fields": {
        const node = nodeNamed(operation.node);
        const from = node.exposed_config_fields ?? [];
        const catalogInputs = nodeCatalog.find((entry) => entry.type === node.type)?.inputs ?? [];
        node.input_ports = [
          ...node.input_ports.filter((port) => !from.includes(port.name)),
          ...operation.exposed_config_fields.map((field) => graphPortOfTheCatalogPort(catalogInputs.find((input) => input.name === field) ?? { name: field, family: null, pin: null })),
        ];
        node.exposed_config_fields = [...operation.exposed_config_fields];
        recordInHistory(
          { operation: "set_exposed_config_fields", node: nodeIdOf(node), from, to: operation.exposed_config_fields },
          { operation: "set_exposed_config_fields", node: nodeIdOf(node), from: operation.exposed_config_fields, to: from },
        );
        break;
      }
      case "remove_node": {
        const node = nodeNamed(operation.node);
        const nodeId = nodeIdOf(node);
        const linksOfTheNode = graph.links.filter((link) => link.source_node === node.name || link.target_node === node.name);
        graph.nodes.splice(graph.nodes.indexOf(node), 1);
        graph.links = graph.links.filter((link) => !linksOfTheNode.includes(link));
        portsOfTheNodesRemoved.set(nodeId, structuredClone({ input_ports: node.input_ports, output_ports: node.output_ports }));
        const studio: { studio?: JsonValue } = node.studio === undefined ? {} : { studio: studioAsTheRuntimeRendersIt(node.studio) };
        recordInHistory({ operation: "remove_node", node: nodeId }, { operation: "add_node", node: { id: nodeId, name: node.name, type: node.type, config: node.config, pins: node.pins ?? {}, ...studio } });
        for (const link of linksOfTheNode) {
          const endOf = (nodeName: string, port: string) => {
            const linked = nodeName === node.name ? node : graph.nodes.find((candidate) => candidate.name === nodeName);
            return { node: linked === undefined ? nodeName : nodeIdOf(linked), port };
          };
          inverseOperations.splice(1, 0, { stream: streamOfTheLevel, operation: "connect", link: { source: endOf(link.source_node, link.source_port), target: endOf(link.target_node, link.target_port) } });
        }
        break;
      }
      case "connect": {
        const source = linkEndNamed(operation.source);
        const targetEnd = linkEndNamed(operation.target);
        const hasThePorts = source.graphNode.output_ports.some((port) => port.name === operation.source.port) && targetEnd.graphNode.input_ports.some((port) => port.name === operation.target.port);
        if (!hasThePorts) throw new MockGraphEditNotApplicable(`no port ${source.graphNode.name}.${operation.source.port} to ${targetEnd.graphNode.name}.${operation.target.port}`);
        mockLinksMade += 1;
        graph.links.push({ id: `Lmock${mockLinksMade.toString(36).padStart(21, "0")}`, source_node: source.graphNode.name, source_port: operation.source.port, target_node: targetEnd.graphNode.name, target_port: operation.target.port, state: "wired", live: true });
        const link = { source: source.end, target: targetEnd.end };
        applied.connected_links.push({ stream: target.stream_id, ...link, state: "wired", error_reason: null });
        recordInHistory({ operation: "connect", link }, { operation: "disconnect", link });
        break;
      }
      case "disconnect": {
        const source = linkEndNamed(operation.source);
        const targetEnd = linkEndNamed(operation.target);
        const linkCount = graph.links.length;
        graph.links = graph.links.filter(
          (link) =>
            !(link.source_node === source.graphNode.name && link.source_port === operation.source.port && link.target_node === targetEnd.graphNode.name && link.target_port === operation.target.port),
        );
        if (graph.links.length === linkCount) throw new MockGraphEditNotApplicable("no such link in the stream's graph");
        const link = { source: source.end, target: targetEnd.end };
        recordInHistory({ operation: "disconnect", link }, { operation: "connect", link });
        break;
      }
      case "set_studio_fields": {
        const node = nodeNamed(operation.node);
        const from = studioAsTheRuntimeRendersIt(node.studio ?? NODE_STUDIO_FIELDS_NONE_SET);
        node.studio = studioFieldsOfTheAction(operation.studio, operation.node);
        const to = studioAsTheRuntimeRendersIt(node.studio);
        recordInHistory({ operation: "set_studio_fields", node: nodeIdOf(node), from, to }, { operation: "set_studio_fields", node: nodeIdOf(node), from: to, to: from });
        break;
      }
      case "add_group": {
        const members = operation.nodes.map(nodeNamed);
        const groups = (graph.groups ??= []);
        mockGroupsAndNotesMade += 1;
        const group = idTheReplayedOperationKept("group") ?? mockUuidOf(`group\n${target.stream_id}\n${mockGroupsAndNotesMade}\n${operation.title}`);
        const added = { id: group, title: operation.title, description: operation.description ?? null, colour: operation.colour ?? null };
        groups.push(added);
        for (const member of members) member.studio = { ...(member.studio ?? NODE_STUDIO_FIELDS_NONE_SET), group };
        const memberIds = members.map(nodeIdOf);
        applied.added_groups.push({ stream: target.stream_id, group, title: operation.title });
        recordInHistory({ operation: "add_group", group: { ...added, nodes: memberIds } }, { operation: "remove_group", group: { ...added, nodes: memberIds } });
        break;
      }
      case "set_group_fields": {
        const group = graph.groups?.find((candidate) => candidate.id === operation.group);
        if (group === undefined) throw new MockGraphEditNotApplicable(`no group ${operation.group} in the stream's graph`);
        const from = { title: group.title, description: group.description, colour: group.colour };
        if (operation.title !== undefined) group.title = operation.title;
        if (operation.description !== undefined) group.description = operation.description;
        if (operation.colour !== undefined) group.colour = operation.colour;
        const to = { title: group.title, description: group.description, colour: group.colour };
        recordInHistory({ operation: "set_group_fields", group: group.id, from, to }, { operation: "set_group_fields", group: group.id, from: to, to: from });
        break;
      }
      case "remove_group": {
        const group = graph.groups?.find((candidate) => candidate.id === operation.group);
        if (group === undefined || graph.groups === undefined) throw new MockGraphEditNotApplicable(`no group ${operation.group} in the stream's graph`);
        graph.groups.splice(graph.groups.indexOf(group), 1);
        const members = graph.nodes.filter((node) => node.studio?.group === group.id);
        for (const member of members) member.studio = { ...(member.studio ?? NODE_STUDIO_FIELDS_NONE_SET), group: null };
        const removed = { ...group, nodes: members.map(nodeIdOf) };
        recordInHistory({ operation: "remove_group", group: removed }, { operation: "add_group", group: removed });
        break;
      }
      case "add_note": {
        const notes = (graph.notes ??= []);
        mockGroupsAndNotesMade += 1;
        const note = { id: idTheReplayedOperationKept("note") ?? mockUuidOf(`note\n${target.stream_id}\n${mockGroupsAndNotesMade}\n${operation.text}\n${operation.position.join(",")}`), text: operation.text, position: operation.position, size: operation.size };
        notes.push(note);
        applied.added_notes.push({ stream: target.stream_id, note: note.id });
        recordInHistory({ operation: "add_note", note }, { operation: "remove_note", note });
        break;
      }
      case "set_note_fields": {
        const note = graph.notes?.find((candidate) => candidate.id === operation.note);
        if (note === undefined) throw new MockGraphEditNotApplicable(`no note ${operation.note} in the stream's graph`);
        const from = { text: note.text, position: note.position, size: note.size };
        if (operation.text !== undefined) note.text = operation.text;
        if (operation.position !== undefined) note.position = operation.position;
        if (operation.size !== undefined) note.size = operation.size;
        const to = { text: note.text, position: note.position, size: note.size };
        recordInHistory({ operation: "set_note_fields", note: note.id, from, to }, { operation: "set_note_fields", note: note.id, from: to, to: from });
        break;
      }
      case "remove_note": {
        const note = graph.notes?.find((candidate) => candidate.id === operation.note);
        if (note === undefined || graph.notes === undefined) throw new MockGraphEditNotApplicable(`no note ${operation.note} in the stream's graph`);
        graph.notes.splice(graph.notes.indexOf(note), 1);
        recordInHistory({ operation: "remove_note", note: { ...note } }, { operation: "add_note", note: { ...note } });
        break;
      }
      case "collapse_selection_into_subgraph": {
        const members = operation.nodes.map(nodeNamed);
        const name = operation.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        if (graph.nodes.some((node) => !members.includes(node) && node.name === name)) throw new MockGraphEditNotApplicable(`node \`${name}\` in this graph already has that name`);
        const memberNames = new Set(members.map((member) => member.name));
        const familyOfTheOutput = (nodeName: string, port: string) => graph.nodes.find((node) => node.name === nodeName)?.output_ports.find((output) => output.name === port)?.family ?? null;
        const interfaceNode = (interfaceName: string, type: typeof GRAPH_INPUT_NODE_TYPE | typeof GRAPH_OUTPUT_NODE_TYPE, family: PortFamily | null): MockGraphNode => ({
          name: interfaceName,
          type,
          state: null,
          config: family === null ? { port: interfaceName } : { port: interfaceName, family },
          ...portsOfTheInterfaceNode(type, family),
        });
        const insideNodes: MockGraphNode[] = members.map((member) => (member.studio === undefined ? member : { ...member, studio: { ...member.studio, group: null } }));
        const insideLinks: typeof graph.links = [];
        const outsideLinks: typeof graph.links = [];
        mockPlacedStreamsSaved += 1;
        const placedStream = theReplayedFoldsPlacedStream() ?? mockUuidOf(`placed stream\n${target.stream_id}\n${mockPlacedStreamsSaved}\n${name}`);
        const subgraph: MockGraphNode = { name, type: STREAM_FRAGMENT_NODE_TYPE, state: null, config: { stream: { asset: placedStream } }, input_ports: [], output_ports: [] };
        for (const link of graph.links) {
          const isSourceInside = memberNames.has(link.source_node);
          const isTargetInside = memberNames.has(link.target_node);
          if (isSourceInside && isTargetInside) insideLinks.push(link);
          else if (isTargetInside) {
            const interfaceName = `${link.target_node}-${link.target_port}`;
            const family = familyOfTheOutput(link.source_node, link.source_port);
            if (!insideNodes.some((node) => node.name === interfaceName)) {
              insideNodes.push(interfaceNode(interfaceName, "tatolab.stream:GraphInput", family));
              subgraph.input_ports.push({ name: interfaceName, family, stream_facts: null, values_checked: null, pin: null, value_read: null });
            }
            insideLinks.push({ ...link, id: `${link.id}-in`, source_node: interfaceName, source_port: "value" });
            outsideLinks.push({ ...link, target_node: name, target_port: interfaceName });
          } else if (isSourceInside) {
            const interfaceName = `${link.source_node}-${link.source_port}`;
            const family = familyOfTheOutput(link.source_node, link.source_port);
            if (!insideNodes.some((node) => node.name === interfaceName)) {
              insideNodes.push(interfaceNode(interfaceName, "tatolab.stream:GraphOutput", family));
              subgraph.output_ports.push({ name: interfaceName, family, stream_facts: null, values_checked: null, pin: null, value_read: null });
              insideLinks.push({ ...link, id: `${link.id}-out`, target_node: interfaceName, target_port: "value" });
            }
            outsideLinks.push({ ...link, source_node: name, source_port: interfaceName });
          } else outsideLinks.push(link);
        }
        subgraph.fragment = { kind: "placed_stream", nodes: insideNodes, links: insideLinks, groups: [] };
        const firstMember = members[0];
        if (firstMember?.studio?.position !== undefined && firstMember.studio.position !== null) subgraph.studio = { ...NODE_STUDIO_FIELDS_NONE_SET, position: firstMember.studio.position };
        graph.nodes = [...graph.nodes.filter((node) => !members.includes(node)), subgraph];
        graph.links = outsideLinks;
        const memberIds = members.map(nodeIdOf);
        const fragment = nodeIdOf(subgraph);
        applied.added_nodes.push({ stream: target.stream_id, node: fragment, name, as: operation.as ?? null });
        const savedStreamDocument = { stream: placedStream, path: `streams/${name}.graph.json`, document: placedStreamDocumentOf(subgraph.fragment) };
        historyOperations.push({ operation: "create_stream_document", ...savedStreamDocument });
        inverseOperations.unshift({ operation: "delete_stream_document", ...savedStreamDocument });
        recordInHistory({ operation: "fold_into_fragment", fragment, name, nodes: memberIds, placed_stream: placedStream }, { operation: "unfold_fragment", fragment, name, nodes: memberIds, placed_stream: placedStream });
        break;
      }
      case "import_graph_generator": {
        const subgraph = graph.nodes.find((node) => node.name === operation.name && node.type === operation.generator && node.fragment?.kind === "generated");
        if (subgraph === undefined) throw new MockGraphEditNotApplicable(`the mock runs no graph generator; it refreshes only a fragment of \`${operation.generator}\` the graph holds`);
        const from = structuredClone(subgraph.config);
        subgraph.config = structuredClone(operation.config ?? subgraph.config);
        const fragment = nodeIdOf(subgraph);
        recordInHistory({ operation: "refresh_fragment", node: fragment, from: { type: subgraph.type, config: from }, to: { type: subgraph.type, config: subgraph.config } }, { operation: "refresh_fragment", node: fragment, from: { type: subgraph.type, config: subgraph.config }, to: { type: subgraph.type, config: from } });
        break;
      }
      case "unlock_subgraph": {
        const subgraph = nodeNamed(operation.fragment);
        if (subgraph.fragment === undefined) throw new MockGraphEditNotApplicable(`node ${operation.fragment} is not a fragment`);
        const isAnInterfaceNode = (node: MockGraphNode) => node.type === "tatolab.stream:GraphInput" || node.type === "tatolab.stream:GraphOutput";
        const interfaceNames = new Set(subgraph.fragment.nodes.filter(isAnInterfaceNode).map((node) => node.name));
        const plainNodes = subgraph.fragment.nodes.filter((node) => !isAnInterfaceNode(node));
        const interfaceNodeOfThePort = (direction: "input" | "output", port: string) =>
          subgraph.fragment?.nodes.find((node) => {
            const stoodFor = portTheInterfaceNodeStandsFor(node);
            return stoodFor?.direction === direction && stoodFor.port === port;
          })?.name;
        const links: typeof graph.links = [];
        for (const link of graph.links) {
          if (link.target_node === subgraph.name) {
            const interfaceNode = interfaceNodeOfThePort("input", link.target_port);
            for (const inside of subgraph.fragment.links.filter((candidate) => candidate.source_node === interfaceNode)) links.push({ ...link, target_node: inside.target_node, target_port: inside.target_port });
          } else if (link.source_node === subgraph.name) {
            const interfaceNode = interfaceNodeOfThePort("output", link.source_port);
            const inside = subgraph.fragment.links.find((candidate) => candidate.target_node === interfaceNode);
            if (inside !== undefined) links.push({ ...link, source_node: inside.source_node, source_port: inside.source_port });
          } else links.push(link);
        }
        links.push(...subgraph.fragment.links.filter((link) => !interfaceNames.has(link.source_node) && !interfaceNames.has(link.target_node)));
        const fragment = nodeIdOf(subgraph);
        graph.nodes = [...graph.nodes.filter((node) => node !== subgraph), ...plainNodes];
        graph.links = links;
        const memberIds = plainNodes.map(nodeIdOf);
        recordInHistory({ operation: "unfold_fragment", fragment, name: subgraph.name, nodes: memberIds }, { operation: "fold_into_fragment", fragment, name: subgraph.name, nodes: memberIds });
        break;
      }
      default:
        throw new MockGraphEditNotApplicable(`the mock does not apply \`${operation.operation}\``);
    }
    if (isAtAPlacedStreamsLevel) {
      const portsOfTheLevelAfterTheEdit = portsOfTheInterfaceNodes(graph, nodeIdOf);
      const portNamedAfterTheEdit = (direction: "input" | "output", portBefore: string): string | null => {
        const interfaceNode = [...portsOfTheLevelBeforeTheEdit].find(([, stoodFor]) => stoodFor.direction === direction && stoodFor.port === portBefore)?.[0];
        return interfaceNode === undefined ? portBefore : (portsOfTheLevelAfterTheEdit.get(interfaceNode)?.port ?? null);
      };
      const portsOf = (direction: "input" | "output") =>
        [...portsOfTheLevelAfterTheEdit.values()].filter((stoodFor) => stoodFor.direction === direction).map((stoodFor) => ({ name: stoodFor.port, family: stoodFor.family, stream_facts: null, values_checked: null, pin: null, value_read: null }));
      const carriedByHoldingStream = new Map<string, { port_links_taken_out: JsonValue[]; port_links_put_back: JsonValue[] }>();
      for (const [workingStreamAsset, workingGraph] of workingGraphs) {
        for (const { placing, holdingLevel, holdingStream } of eachPlacementOf(streamOfTheLevel, workingGraph, workingStreamAsset)) {
          if (placing.fragment !== graph) placing.fragment = { kind: "placed_stream", ...structuredClone({ nodes: graph.nodes, links: graph.links, groups: graph.groups ?? [] }) };
          placing.input_ports = portsOf("input");
          placing.output_ports = portsOf("output");
          const carried = carriedByHoldingStream.get(holdingStream) ?? { port_links_taken_out: [], port_links_put_back: [] };
          const linksKept: StreamGraphLink[] = [];
          for (const [position, link] of holdingLevel.links.entries()) {
            const portAfter =
              link.target_node === placing.name ? portNamedAfterTheEdit("input", link.target_port) : link.source_node === placing.name ? portNamedAfterTheEdit("output", link.source_port) : undefined;
            if (portAfter === undefined || portAfter === (link.target_node === placing.name ? link.target_port : link.source_port)) {
              linksKept.push(link);
              continue;
            }
            carried.port_links_taken_out.push({ position, value: { ...link } });
            if (portAfter === null) continue;
            const linkCarried = link.target_node === placing.name ? { ...link, target_port: portAfter } : { ...link, source_port: portAfter };
            carried.port_links_put_back.push({ position: linksKept.length, value: { ...linkCarried } });
            linksKept.push(linkCarried);
          }
          holdingLevel.links = linksKept;
          carriedByHoldingStream.set(holdingStream, carried);
        }
      }
      for (const [holdingStream, carried] of carriedByHoldingStream) {
        if (carried.port_links_taken_out.length === 0) continue;
        const carry = { operation: "carry_the_links_onto_the_ports_of_a_placed_stream", placed_stream: streamOfTheLevel };
        historyOperations.push({ stream: holdingStream, ...carry, ...carried });
        inverseOperations.unshift({ stream: holdingStream, ...carry, port_links_taken_out: carried.port_links_put_back, port_links_put_back: carried.port_links_taken_out });
      }
    }
  }
  for (const [streamAsset, workingGraph] of workingGraphs) {
    const target = targetsByStreamAsset.get(streamAsset);
    if (target !== undefined) Object.assign(target.graph, workingGraph);
  }
  return { transaction: applied, history_operations: historyOperations, inverse_operations: inverseOperations };
}
