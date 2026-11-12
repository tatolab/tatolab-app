// What Properties sends the runtime for each edit, and what it shows of a node's links. `set_node_config` replaces
// a node's whole config, so every config edit sends the whole config with the one field changed or removed.

import type { JsonValue, StreamGraphAction, StreamGraphDeclaredPort, StreamGraphLink, StreamGraphNode, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeGraphPinFamilyWords } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import { nodeTitle } from "../shared/node_words";
import { portsThatCouldJoin } from "../shared/ports_that_can_join";
import { GRAPH_INPUT_NODE_TYPE } from "../controls/graph_inputs_of_the_stream";
import { recordsOfAListField, type ConfigFormField, type JsonObject } from "./config_form_fields";

/** A value read from what the person typed into a field, or why it is not one the field takes. */
export type ValueTyped = { kind: "value"; value: JsonValue } | { kind: "not_a_value"; because: string };

/** The value `words` typed into `field` stand for under its control. */
export function configValueFromTheWordsTyped(field: Pick<ConfigFormField, "control" | "is_nullable">, words: string): ValueTyped {
  const trimmed = words.trim();
  if (trimmed === "" && field.is_nullable) return { kind: "value", value: null };
  switch (field.control.kind) {
    case "number": {
      const number = Number(trimmed);
      if (trimmed === "") return { kind: "not_a_value", because: "A number is needed." };
      if (!Number.isFinite(number)) return { kind: "not_a_value", because: `${trimmed} is not a number.` };
      if (field.control.is_whole_number && !Number.isInteger(number)) return { kind: "not_a_value", because: `${words} is not a whole number.` };
      return { kind: "value", value: number };
    }
    case "json":
    case "list_of_records":
      return jsonValueTyped(words);
    case "text":
    case "choice":
    case "project_asset":
    case "toggle":
      return { kind: "value", value: words };
  }
}

/** `words` as JSON, or why they are not. */
function jsonValueTyped(words: string): ValueTyped {
  try {
    const parsed: JsonValue = JSON.parse(words);
    return { kind: "value", value: parsed };
  } catch {
    return { kind: "not_a_value", because: `${words} is not JSON.` };
  }
}

/** The value `words` typed into an unlinked input stand for: JSON where they read as JSON, else the words as text. */
export function pinValueFromTheWordsTyped(words: string): JsonValue {
  const typed = jsonValueTyped(words);
  return typed.kind === "value" ? typed.value : words;
}

/** A `set_node_config` action, which replaces the node's whole config. */
export type SetNodeConfigAction = Extract<StreamGraphAction, { operation: "set_node_config" }>;

/** `configEditedFrom` with `key` set to `value`, as `set_node_config` takes the node's whole config. */
export function setTheConfigField(stream: string, nodeId: string, configEditedFrom: Record<string, JsonValue>, key: string, value: JsonValue): SetNodeConfigAction {
  return { operation: "set_node_config", stream, node: nodeId, config: { ...configEditedFrom, [key]: value } };
}

/** `configEditedFrom` without `key`, so the field reads its type's default again. */
export function resetTheConfigField(stream: string, nodeId: string, configEditedFrom: Record<string, JsonValue>, key: string): SetNodeConfigAction {
  const { [key]: _removed, ...configWithoutTheKey } = configEditedFrom;
  return { operation: "set_node_config", stream, node: nodeId, config: configWithoutTheKey };
}

/** A node's id cut to its first and last four characters, as the panel's heading shows it. */
export function nodeIdInShort(nodeId: string): string {
  return nodeId.length > 10 ? `${nodeId.slice(0, 4)}…${nodeId.slice(-4)}` : nodeId;
}

/** What a port's Connect menu lists, as "Outputs in Main that carry Image". */
export function portsToConnectNote(direction: "input" | "output", streamName: string, familyWords: string): string {
  return direction === "input" ? `Outputs in ${streamName} that carry ${familyWords}` : `Inputs in ${streamName} that take ${familyWords}`;
}

/** One end of a link of the node's port, at the node on its other side. */
export interface LinkedEndOfAPort {
  link: StreamGraphLink;
  node: StreamGraphNode;
  port: string;
}

/** The link ends joined to the node's `portName`: each output feeding an input, or each input an output feeds. */
export function linkedEndsOfThePort(graph: Pick<StreamGraphSummary, "nodes" | "links">, node: StreamGraphNode, direction: "input" | "output", portName: string): LinkedEndOfAPort[] {
  return graph.links.flatMap((link) => {
    const isThisPort = direction === "input" ? link.target_node === node.name && link.target_port === portName : link.source_node === node.name && link.source_port === portName;
    if (!isThisPort) return [];
    const otherName = direction === "input" ? link.source_node : link.target_node;
    const otherNode = graph.nodes.find((candidate) => candidate.name === otherName);
    return otherNode === undefined ? [] : [{ link, node: otherNode, port: direction === "input" ? link.source_port : link.target_port }];
  });
}

/** The graph action that removes `linkedEnd`'s link from or to the node's `portName`. */
export function disconnectTheLink(stream: string, node: StreamGraphNode, direction: "input" | "output", portName: string, linkedEnd: LinkedEndOfAPort): StreamGraphAction {
  const thisEnd = { node: node.id, port: portName };
  const otherEnd = { node: linkedEnd.node.id, port: linkedEnd.port };
  return direction === "input" ? { operation: "disconnect", stream, source: otherEnd, target: thisEnd } : { operation: "disconnect", stream, source: thisEnd, target: otherEnd };
}

/** A port of another node of the stream that a target picker offers, the graph actions that join it, or why it cannot be joined. */
export interface PortToConnect {
  nodeTitle: string;
  port: string;
  cannotBecause: string | null;
  /** The other node's id and port, which name the choice apart where two nodes' titles read the same. */
  choiceKey: string;
  /** One transaction: the link it replaces disconnected first, where the picker had one. */
  connecting: StreamGraphAction[];
}

/**
 * Each port of the stream's other nodes the node's `port` could join, those of its family first: an input lists the
 * outputs, an output the inputs not linked yet. One of another family is listed with why it cannot be joined. A picker
 * `replacing` a link lists every port but the one it is linked with, and choosing one moves the link there.
 */
export function portsToConnect(
  stream: string,
  graph: Pick<StreamGraphSummary, "nodes" | "links">,
  node: StreamGraphNode,
  direction: "input" | "output",
  port: StreamGraphDeclaredPort,
  replacing: LinkedEndOfAPort | null,
): PortToConnect[] {
  const disconnecting = replacing === null ? [] : [disconnectTheLink(stream, node, direction, port.name, replacing)];
  const candidates = portsThatCouldJoin(graph, node, direction, port).flatMap(({ node: otherNode, port: otherPort, isOfTheFamily }): (PortToConnect & { isOfTheFamily: boolean })[] => {
    const thisEnd = { node: node.id, port: port.name };
    const otherEnd = { node: otherNode.id, port: otherPort.name };
    const connecting: StreamGraphAction = direction === "input" ? { operation: "connect", stream, source: otherEnd, target: thisEnd } : { operation: "connect", stream, source: thisEnd, target: otherEnd };
    return [
      {
        nodeTitle: nodeTitle(otherNode.name, otherNode.type),
        port: otherPort.name,
        cannotBecause: isOfTheFamily ? null : `${otherPort.family === null ? "Unknown" : nodeGraphPinFamilyWords(otherPort.family)}, can't connect`,
        choiceKey: `${otherNode.id}:${otherPort.name}`,
        connecting: [...disconnecting, connecting],
        isOfTheFamily,
      },
    ];
  });
  return [...candidates.filter((candidate) => candidate.isOfTheFamily), ...candidates.filter((candidate) => !candidate.isOfTheFamily)].map(({ isOfTheFamily: _isOfTheFamily, ...portToConnect }) => portToConnect);
}

/** The transaction that joins the node's `port` to the port the person picked in the Stream graph, replacing the picker's link where it had one, or why it cannot join. */
export function connectingThePortPicked(
  stream: string,
  graph: Pick<StreamGraphSummary, "nodes" | "links">,
  node: StreamGraphNode,
  direction: "input" | "output",
  port: StreamGraphDeclaredPort,
  replacing: LinkedEndOfAPort | null,
  picked: { node: string; port: string },
): { kind: "connecting"; connecting: StreamGraphAction[] } | { kind: "cannot_join"; because: string } {
  const choice = portsToConnect(stream, graph, node, direction, port, replacing).find((portToConnect) => portToConnect.choiceKey === `${picked.node}:${picked.port}`);
  if (choice === undefined) return { kind: "cannot_join", because: `The port picked can't join ${port.name}: it is this link's own end, already linked, or no longer in the stream.` };
  if (choice.cannotBecause !== null) return { kind: "cannot_join", because: `${choice.nodeTitle} › ${choice.port} can't join ${port.name}: ${choice.cannotBecause}.` };
  return { kind: "connecting", connecting: choice.connecting };
}

/** Why the port cannot take another target picker: an input takes one link, so a linked one moves its link in its picker instead; `null` where it can. */
export function whyThePortTakesNoOtherTarget(direction: "input" | "output", linkedEndCount: number, blankPickerCount: number): string | null {
  if (direction === "input" && linkedEndCount + blankPickerCount > 0) return "An input takes one link. Choose another output in its picker.";
  return null;
}

/** Whether two JSON values hold the same values, whatever order an object's keys come in. */
function holdTheSameJsonValues(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, itemIndex) => holdTheSameJsonValues(item, right[itemIndex]));
  }
  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    const leftKeys = Object.keys(left);
    return leftKeys.length === Object.keys(right).length && leftKeys.every((key) => Object.hasOwn(right, key) && holdTheSameJsonValues(left[key], right[key]));
  }
  return left === right;
}

/** `record` without the value at `key`, or the whole record when `key` is `null`. */
function recordWithoutTheKey(record: JsonObject, key: string | null): JsonObject {
  if (key === null) return record;
  const { [key]: _valueAtTheKey, ...recordWithoutIt } = record;
  return recordWithoutIt;
}

/**
 * The list edited from's records when its record at `index` is still `recordTheRowShows`, apart from `keyBeingSet`, whose
 * value a drag in progress changes; `null` when the list has moved on, so the edit would land on another entry.
 */
function theRecordStillShown(listEditedFrom: JsonValue, index: number, recordTheRowShows: JsonObject, keyBeingSet: string | null): JsonObject[] | null {
  const records = recordsOfAListField(listEditedFrom);
  const recordEditedFrom = records[index];
  return recordEditedFrom !== undefined && holdTheSameJsonValues(recordWithoutTheKey(recordEditedFrom, keyBeingSet), recordWithoutTheKey(recordTheRowShows, keyBeingSet)) ? records : null;
}

/** `listEditedFrom` with the record at `index` holding `value` at `key`, or without `key` when `value` is `undefined`; `null` when that record, apart from `key`, is no longer `recordTheRowShows`. */
export function listWithTheRecordFieldSet(listEditedFrom: JsonValue, index: number, recordTheRowShows: JsonObject, key: string, value: JsonValue | undefined): JsonObject[] | null {
  const records = theRecordStillShown(listEditedFrom, index, recordTheRowShows, key);
  return (
    records?.map((record, recordIndex) => {
      if (recordIndex !== index) return record;
      const recordWithoutTheValue = recordWithoutTheKey(record, key);
      return value === undefined ? recordWithoutTheValue : { ...recordWithoutTheValue, [key]: value };
    }) ?? null
  );
}

/** `listEditedFrom` with `newItem` added at its end. */
export function listWithARecordAdded(listEditedFrom: JsonValue, newItem: JsonObject): JsonObject[] {
  return [...recordsOfAListField(listEditedFrom), newItem];
}

/** `listEditedFrom` without the record at `index`, the records after it moving up one; `null` when that record is no longer `recordTheRowShows`. */
export function listWithoutTheRecord(listEditedFrom: JsonValue, index: number, recordTheRowShows: JsonObject): JsonObject[] | null {
  return theRecordStillShown(listEditedFrom, index, recordTheRowShows, null)?.filter((_record, recordIndex) => recordIndex !== index) ?? null;
}

/** Why an edit of a list entry was not sent: the list changed under it. */
export const LIST_ENTRY_MOVED_ON_REFUSAL = "This entry changed before the edit was sent, so nothing was changed. Try again on the entry as it shows now.";

/** The config fields of `node` it can take as inputs and does not yet: each number or on-off field of its form. */
export function configFieldsToExposeAsGraphInputs(node: Pick<StreamGraphNode, "exposed_config_fields">, fields: readonly ConfigFormField[]): ConfigFormField[] {
  return fields.filter((field) => (field.control.kind === "number" || field.control.kind === "toggle") && !node.exposed_config_fields.includes(field.key));
}

/**
 * One transaction that has `node` take `field` as an input and feeds it from a new Graph Input of the stream, named
 * `<node>_<field>`, which Perform's Controls then list: a Channels input, as the runtime types every exposed config
 * field, moving within the field's minimum and maximum where its schema states both.
 */
export function exposeTheConfigFieldAsAGraphInput(stream: string, node: Pick<StreamGraphNode, "id" | "name" | "exposed_config_fields">, field: Pick<ConfigFormField, "key" | "control">): StreamGraphAction[] {
  const graphInputName = `${node.name}_${field.key}`;
  const graphInputConfig: JsonObject = { port: graphInputName, family: "channels" };
  if (field.control.kind === "number" && field.control.minimum !== null && field.control.maximum !== null) graphInputConfig["range"] = [field.control.minimum, field.control.maximum];
  return [
    { operation: "set_exposed_config_fields", stream, node: node.id, exposed_config_fields: [...node.exposed_config_fields, field.key] },
    { operation: "add_node", stream, type: GRAPH_INPUT_NODE_TYPE, name: graphInputName, config: graphInputConfig, as: "graph_input" },
    { operation: "connect", stream, source: { node: "graph_input", port: "value" }, target: { node: node.id, port: field.key } },
  ];
}
