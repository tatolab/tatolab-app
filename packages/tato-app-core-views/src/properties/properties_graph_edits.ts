// What Properties sends the runtime for each edit of the graph, and what it shows of a node's links. A
// value set on an input or a setting goes through the frame's store of input values, never from here.

import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_type_readings";
import { familyOfThePort, type JsonValue, type NodeTypeDescription, type StreamGraph, type StreamGraphAction, type StreamGraphLink, type StreamGraphNode, type StreamGraphPort } from "@tatolab/tato-app-view-sdk/studio_readings";
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

/** A node's id cut to its first and last four characters, as the panel's heading shows it. */
export function nodeIdInShort(nodeId: string): string {
  return nodeId.length > 10 ? `${nodeId.slice(0, 4)}…${nodeId.slice(-4)}` : nodeId;
}

/** One end of a link of the node's port, at the node on its other side. */
export interface LinkedEndOfAPort {
  link: StreamGraphLink;
  node: StreamGraphNode;
  port: string;
}

/** The link ends joined to the node's `portName`: each output feeding an input, or each input an output feeds. */
export function linkedEndsOfThePort(graph: Pick<StreamGraph, "nodes" | "links">, node: StreamGraphNode, direction: "input" | "output", portName: string): LinkedEndOfAPort[] {
  return graph.links.flatMap((link) => {
    const isThisPort = direction === "input" ? link.target.node === node.name && link.target.port === portName : link.source.node === node.name && link.source.port === portName;
    if (!isThisPort) return [];
    const otherName = direction === "input" ? link.source.node : link.target.node;
    const otherNode = graph.nodes.find((candidate) => candidate.name === otherName);
    return otherNode === undefined ? [] : [{ link, node: otherNode, port: direction === "input" ? link.source.port : link.target.port }];
  });
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

/** The settings of `node` it can take as inputs and does not yet: each its node type, as `described` describes it, lists as one `set_exposed_config_fields` takes. */
export function configFieldsToExposeAsGraphInputs(node: Pick<StreamGraphNode, "exposed_config_fields">, described: Pick<NodeTypeDescription, "exposable_config_fields"> | undefined): ReadonlySet<string> {
  const exposed = new Set(node.exposed_config_fields ?? []);
  return new Set((described?.exposable_config_fields ?? []).filter((setting) => !exposed.has(setting)));
}

/** A setting to expose as a Graph Input: its name, and what its node type annotates of its value, the range a Graph Input feeding it moves within among it. */
export interface ConfigFieldToExpose {
  name: string;
  annotations: Pick<PinAnnotations, "range">;
}

/**
 * One transaction that has `node` take `setting` as an input and feeds it from a new Graph Input of the stream, named
 * `<node>_<setting>`, which Perform's Controls then list: a Channels input, as the runtime types every exposed config
 * field, moving within the setting's minimum and maximum where its node type annotates both.
 */
export function exposeTheConfigFieldAsAGraphInput(stream: string, node: Pick<StreamGraphNode, "id" | "name" | "exposed_config_fields">, setting: ConfigFieldToExpose): StreamGraphAction[] {
  const graphInputName = `${node.name}_${setting.name}`;
  const graphInputConfig: JsonObject = { port: graphInputName, family: "channels" };
  const minimum = setting.annotations.range?.minimum;
  const maximum = setting.annotations.range?.maximum;
  if (typeof minimum === "number" && typeof maximum === "number") graphInputConfig["range"] = [minimum, maximum];
  return [
    { operation: "set_exposed_config_fields", stream, node: node.id, exposed_config_fields: [...(node.exposed_config_fields ?? []), setting.name] },
    { operation: "add_node", stream, type: GRAPH_INPUT_NODE_TYPE, name: graphInputName, config: graphInputConfig, as: "graph_input" },
    { operation: "connect", stream, source: { node: "graph_input", port: "value" }, target: { node: node.id, port: setting.name } },
  ];
}

/** What a promotion reads of the input it promotes, and of the level of the graph it is at. */
export interface InputToPromote {
  node: Pick<StreamGraphNode, "id" | "name">;
  input: Pick<StreamGraphPort, "name" | "family">;
  /** The value the input shows now, which a value set live since the graph was read has changed in no reading. */
  valueShown: JsonValue | null;
  /** Whether the node is on the stream's own level, where a Graph Input is written by a client and carries a default. */
  isOnTheStreamsOwnLevel: boolean;
  /** The names the nodes of that level go by, which the Graph Input's name is kept apart from. */
  nodeNamesTaken: ReadonlySet<string>;
}

/**
 * One transaction that feeds an input from a new Graph Input of its level, named `<node>_<input>`, or with the first
 * free number after it, so a promotion never takes a name a node already goes by. The Graph Input declares the input's
 * family where it names one, otherwise the link gives it its own; on a stream's own level, a Channels input's number
 * value becomes the Graph Input's default, so promoting it changes nothing the node reads.
 */
export function promoteToGraphInput(stream: string, { node, input, valueShown, isOnTheStreamsOwnLevel, nodeNamesTaken }: InputToPromote): StreamGraphAction[] {
  const nameWanted = `${node.name}_${input.name}`;
  let graphInputName = nameWanted;
  for (let number = 2; nodeNamesTaken.has(graphInputName); number += 1) graphInputName = `${nameWanted}_${number}`;
  const graphInputConfig: JsonObject = { port: graphInputName };
  const family = familyOfThePort(input);
  if (family !== null) graphInputConfig["family"] = family;
  if (isOnTheStreamsOwnLevel && family === "channels" && typeof valueShown === "number") graphInputConfig["default"] = valueShown;
  return [
    { operation: "add_node", stream, type: GRAPH_INPUT_NODE_TYPE, name: graphInputName, config: graphInputConfig, as: "graph_input" },
    { operation: "connect", stream, source: { node: "graph_input", port: "value" }, target: { node: node.id, port: input.name } },
  ];
}

/** The edit that takes out the link from `drivenBy`, a node's output, into `node`'s input `input`. */
export function linkDrivingTheInputTakenOut(stream: string, drivenBy: { node: Pick<StreamGraphNode, "id">; port: string }, node: Pick<StreamGraphNode, "id">, input: string): StreamGraphAction[] {
  return [{ operation: "disconnect", stream, source: { node: drivenBy.node.id, port: drivenBy.port }, target: { node: node.id, port: input } }];
}
