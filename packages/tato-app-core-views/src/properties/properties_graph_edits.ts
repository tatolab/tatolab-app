// What Properties sends the runtime for each edit of the graph, and what it shows of a node's links. A
// value set on an input or a setting goes through the frame's store of input values, never from here.

import { BUILT_IN_PIN_TYPES } from "@tatolab/tato-app-view-sdk/built_in_pin_types";
import type { BuiltInPinTypeName, PinAnnotations, PinType } from "@tatolab/tato-app-view-sdk/pin_type_readings";
import type { PinAnnotationName, PinTypeDescription } from "@tatolab/tato-app-view-sdk/pin_types";
import { isAJsonValue, type JsonValue, type StreamGraph, type StreamGraphAction, type StreamGraphLink, type StreamGraphNode, type StreamGraphPort } from "@tatolab/tato-app-view-sdk/studio_readings";
import { GRAPH_INPUT_NODE_TYPE, GRAPH_INPUT_VALUE_INPUT } from "../controls/graph_inputs_of_the_stream";
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

/** What a promotion reads of the input it promotes, and of the level of the graph it is at. */
export interface InputToPromote {
  node: Pick<StreamGraphNode, "id" | "name">;
  input: Pick<StreamGraphPort, "name" | "pin_type" | "annotations">;
  /** The value the input shows now, which a value set live since the graph was read has changed in no reading. */
  valueShown: JsonValue | null;
  /** Whether the node is on the stream's own level, where a Graph Input is written by a client and carries a default. */
  isOnTheStreamsOwnLevel: boolean;
  /** The names the nodes of that level go by, which the Graph Input's name is kept apart from. */
  nodeNamesTaken: ReadonlySet<string>;
}

/** The built-in types that store a value yet travel as no single value a Graph Input sends: a List and a bundle, each the sum of what it holds. */
const PIN_TYPES_A_GRAPH_INPUT_SENDS_NONE_OF: ReadonlySet<BuiltInPinTypeName> = new Set(["list_of", "bundle"]);

/**
 * The built-in types a Graph Input chooses for an input it is promoted from: each that stores a value and that a stream's port
 * carries, as the contract's table of built-in types states it. A type that stores none, such as a Trigger or a Texture, or that
 * travels as no single value, such as a List, is promoted to no Graph Input.
 */
const PIN_TYPES_A_GRAPH_INPUT_CHOOSES: ReadonlyMap<BuiltInPinTypeName, PinTypeDescription> = new Map(
  BUILT_IN_PIN_TYPES.filter((builtInPinType) => builtInPinType.value_component !== undefined && builtInPinType.flows.includes("stream") && !PIN_TYPES_A_GRAPH_INPUT_SENDS_NONE_OF.has(builtInPinType.name)).map((builtInPinType) => [
    builtInPinType.name,
    builtInPinType,
  ]),
);

/** The pin type a Graph Input fed into `input` chooses, with its row of the contract's table: `input`'s own, where it is one of `PIN_TYPES_A_GRAPH_INPUT_CHOOSES`, and no String naming a project asset, which only Properties' asset field picks; `null` for none. */
function pinTypeAGraphInputChooses(input: Pick<StreamGraphPort, "pin_type" | "annotations">): { pin_type: PinType & JsonValue; described: PinTypeDescription } | null {
  const pinType = input.pin_type;
  const described = pinType === undefined ? undefined : PIN_TYPES_A_GRAPH_INPUT_CHOOSES.get(pinType.type);
  if (pinType === undefined || described === undefined || !isAJsonValue(pinType)) return null;
  const namesAProjectAsset = input.annotations?.project_asset !== undefined && input.annotations.project_asset !== null;
  return namesAProjectAsset ? null : { pin_type: pinType, described };
}

/** Whether an input of `pin` can be promoted to a Graph Input: one of a type a Graph Input chooses. */
export function canAGraphInputFeedThePin(pin: Pick<StreamGraphPort, "pin_type" | "annotations">): boolean {
  return pinTypeAGraphInputChooses(pin) !== null;
}

/** `[lowest, highest]` of `range` where it states both ends, `null` where it leaves either open. */
function rangeOfBothEnds(range: PinAnnotations["range"]): [number, number] | null {
  const minimum = range?.minimum;
  const maximum = range?.maximum;
  return typeof minimum === "number" && typeof maximum === "number" ? [minimum, maximum] : null;
}

/**
 * The settings of a Graph Input of the type `described` describes that state `annotations` of its `value`, each by the annotation's
 * name: a range of both ends as `[lowest, highest]`, a step, a unit, a meaning and a control, each only where the type takes it, as
 * the runtime refuses one it does not.
 */
function graphInputSettingsOfTheAnnotations(annotations: PinAnnotations, described: PinTypeDescription): [string, JsonValue][] {
  const takes = new Set<PinAnnotationName>(described.annotations);
  const settings: [string, JsonValue][] = [];
  const range = rangeOfBothEnds(annotations.range);
  if (takes.has("range") && range !== null) settings.push(["range", range]);
  if (takes.has("step") && typeof annotations.step === "number") settings.push(["step", annotations.step]);
  for (const key of ["unit", "meaning", "control"] as const) {
    const annotated = annotations[key];
    if (takes.has(key) && typeof annotated === "string") settings.push([key, annotated]);
  }
  return settings;
}

/** The label the Graph Input a promotion adds goes by in its own transaction. */
const GRAPH_INPUT_PROMOTED_TO = "graph_input";

/**
 * One transaction that feeds an input from a new Graph Input of its level, named `<node>_<input>`, or with the first free
 * number after it, so a promotion never takes a name a node already goes by. The Graph Input's settings are set as its input
 * values: its port, and the input's pin type. On a stream's own level it also states the input's annotations its type takes,
 * so its `value` takes the control the input's author named, and saves the value the input shows as its `value`, so
 * promoting it changes nothing the node reads. The input is one `canAGraphInputFeedThePin` takes.
 */
export function promoteToGraphInput(stream: string, { node, input, valueShown, isOnTheStreamsOwnLevel, nodeNamesTaken }: InputToPromote): StreamGraphAction[] {
  const nameWanted = `${node.name}_${input.name}`;
  let graphInputName = nameWanted;
  for (let number = 2; nodeNamesTaken.has(graphInputName); number += 1) graphInputName = `${nameWanted}_${number}`;
  const chosen = pinTypeAGraphInputChooses(input);
  const settings: [string, JsonValue][] = [["port", graphInputName]];
  if (chosen !== null) {
    settings.push(["pin_type", chosen.pin_type]);
    if (isOnTheStreamsOwnLevel) settings.push(...graphInputSettingsOfTheAnnotations(input.annotations ?? {}, chosen.described));
    if (isOnTheStreamsOwnLevel && valueShown !== null) settings.push([GRAPH_INPUT_VALUE_INPUT, valueShown]);
  }
  return [
    { operation: "add_node", stream, type: GRAPH_INPUT_NODE_TYPE, name: graphInputName, as: GRAPH_INPUT_PROMOTED_TO },
    ...settings.map(([setting, value]): StreamGraphAction => ({ operation: "set_node_input_value", stream, node: GRAPH_INPUT_PROMOTED_TO, input: setting, value })),
    { operation: "connect", stream, source: { node: GRAPH_INPUT_PROMOTED_TO, port: GRAPH_INPUT_VALUE_INPUT }, target: { node: node.id, port: input.name } },
  ];
}

/** The edit that takes out the link from `drivenBy`, a node's output, into `node`'s input `input`. */
export function linkDrivingTheInputTakenOut(stream: string, drivenBy: { node: Pick<StreamGraphNode, "id">; port: string }, node: Pick<StreamGraphNode, "id">, input: string): StreamGraphAction[] {
  return [{ operation: "disconnect", stream, source: { node: drivenBy.node.id, port: drivenBy.port }, target: { node: node.id, port: input } }];
}
