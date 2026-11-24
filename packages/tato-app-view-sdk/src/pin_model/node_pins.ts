// A node's pins as every surface lays them out: one row per pin, outputs first, then its settings,
// then its other inputs, each carrying the pin's exact type and flow where the runtime serves them.

import type { PinAnnotations } from "../pin_type_readings.js";
import { jsonObjectMembersOf, type JsonValue, type NodeTypeInputDescribed, type NodeTypePortDescribed, type SettingReadTime, type StreamGraphPort, type StreamGraphPortPin } from "../studio_readings.js";
import type { InputWiring } from "./input_wiring.js";
import type { NodeInputLink } from "./node_input_link.js";
import type { InputAddress } from "./node_inputs.js";

/** One pin of a node, or one member of a bundle pin: its port's name and the member's (`null` for the whole port), its exact type and flow (`null` for a pin with none), what its node type says and annotates of it, and what it states about its stream. */
export interface NodePin {
  readonly name: string;
  /** The member of the bundle `name` carries that this row is; `null` on a whole port. */
  readonly member: string | null;
  readonly pin: StreamGraphPortPin | null;
  /** The port's description as its node type declares it; `null` for none. */
  readonly description: string | null;
  /** What its node type's annotations state of its value, such as its range and the control that edits it; empty where it states none. */
  readonly annotations: PinAnnotations;
  readonly stream_facts_words: readonly string[];
  /** Where a person sets an unwired input, the key its row reads the value by: where the value it holds is kept, or where an unlinked Trigger is fired; `null` on an output, on an input that takes no stored value and is no Trigger, on one a link feeds, and outside a stream's graph. */
  readonly value_address: InputAddress | null;
  /** On a setting, when its node reads it: as it is set up or on each run; `null` on every other pin. */
  readonly setting: NodeSetting | null;
  /** Whether a link may end at it, as the runtime marks the input, so its card draws it a socket; `true` on an output, which a link starts at. */
  readonly takes_a_wire: boolean;
  /** On an input that takes a wire, what it reads through it; `null` on every other pin, and where Studio reads no wire: outside a stream's graph and inside a subgraph. */
  readonly wire: NodePinWire | null;
  /** On an input a link feeds in a stream's graph, what the runtime marks on that link; `null` on every other pin, and on a link it marks neither way. */
  readonly link: NodeInputLink | null;
  /** On a pin carrying a bundle, a row for each of its members, in the order the bundle declares them, and whether its card shows them; `null` on every other pin and on a member. */
  readonly bundle: NodePinBundle | null;
  /** The slot of its node type's pin group the pin is in, as the runtime serves it; `null` on a pin of no group and on a member. */
  readonly slot: NodePinSlot | null;
}

/**
 * The slot of a pin group a pin is in: the group's name, the slot's index from 0, the pin's name in the slot, and how the group
 * holds its slots. A group that follows its wires holds one empty slot after the last a link reaches, which the runtime keeps
 * last; a group whose count is set holds as many as its input named after the group says.
 */
export interface NodePinSlot {
  readonly group: string;
  readonly slot: number;
  readonly pin: string;
  readonly slots: "follow_their_wires" | "set_by_the_input_of_the_groups_name";
  /** Whether the slot is the empty one a group that follows its wires holds last, which a wire dropped on it fills. */
  readonly is_the_empty_slot: boolean;
}

/** A bundle pin's members, each a row of its own, and whether its card shows them, as its node keeps that under `studio.metadata.open_bundles`. */
export interface NodePinBundle {
  readonly members: readonly NodePin[];
  readonly is_open: boolean;
}

/** The words a row is labelled with: its member's name on a member, its name in its slot on a pin of a pin group, its port's on any other pin. */
export function nodePinLabel(pin: Pick<NodePin, "name" | "member"> & { readonly slot?: NodePinSlot | null }): string {
  return pin.member ?? pin.slot?.pin ?? pin.name;
}

/** The words a pin goes by where no card groups its slot's rows, as Properties lists it: `layers 2 › picture` for the pin `picture` of slot 2 of `layers`, its port's name on a pin of no group. */
export function nodePinWordsBesideItsSlot(pin: Pick<NodePin, "name" | "slot">): string {
  return pin.slot === null ? pin.name : `${pinGroupSlotWords(pin.slot)} › ${pin.slot.pin}`;
}

/** The words a pin group's slot goes by, counted from 1 as a person counts: `layers 2` for the slot at index 1 of `layers`. */
export function pinGroupSlotWords(slot: Pick<NodePinSlot, "group" | "slot">): string {
  return `${slot.group} ${slot.slot + 1}`;
}

/** What an input reads through its wire: the input, where it is in its stream's graph, and the output wired into it, or why it reads none. */
export interface NodePinWire {
  readonly into: InputAddress;
  readonly wiring: InputWiring;
}

/** When a node reads a setting: once as it is set up, so a change rebuilds the node, or on each run. */
export interface NodeSetting {
  readonly read: SettingReadTime;
}

/** The setting `input` is as its node type describes it, `null` for an input that is none; a setting that states no read point is read at setup, as the runtime reads a config field. */
export function settingOfTheDescribedInput(input: Pick<NodeTypeInputDescribed, "mode" | "read">): NodeSetting | null {
  return input.mode === "setting_only" ? { read: input.read ?? "at_setup" } : null;
}

/** Whether a link may end at `input`, as its node type's description marks it, which the runtime does on every input it describes. */
export function doesTheDescribedInputTakeAWire(input: Pick<NodeTypeInputDescribed, "takes_a_wire">): boolean {
  return input.takes_a_wire ?? true;
}

/**
 * Whether a link may end at the input `port`, as the runtime marks it: on the port in `graph`, else on `describedInput`, its input
 * in its node type's description; a port neither marks takes one, which only a port of a subgraph's own node, which no node type
 * describes, can be.
 */
export function doesTheInputPortTakeAWire(port: Pick<StreamGraphPort, "takes_a_wire">, describedInput: Pick<NodeTypeInputDescribed, "takes_a_wire"> | undefined): boolean {
  return port.takes_a_wire ?? (describedInput === undefined || doesTheDescribedInputTakeAWire(describedInput));
}

/** Whether a change of `pin` rebuilds its node: a setting its node reads as it is set up. */
export function doesAChangeRebuildTheNode(pin: Pick<NodePin, "setting">): boolean {
  return pin.setting?.read === "at_setup";
}

/** One row of a node's card: the side of the card its socket sits on, and its pin, or what stands for it, as its name in the layout. */
export interface NodePinRow<Pin = NodePin> {
  readonly side: "input" | "output";
  readonly node_pin: Pin;
}

/** A node's rows in the order a card draws them: its outputs first, then its inputs, which a node's inputs list with its settings first. */
export function nodePinRows<Pin>(inputs: readonly Pin[], outputs: readonly Pin[]): readonly NodePinRow<Pin>[] {
  return [...outputs.map((node_pin): NodePinRow<Pin> => ({ side: "output", node_pin })), ...inputs.map((node_pin): NodePinRow<Pin> => ({ side: "input", node_pin }))];
}

/** The rows a card draws of `pins`, one side's: each pin, an open bundle followed by a row for each of its members. */
export function nodePinsShown(pins: readonly NodePin[]): readonly NodePin[] {
  return pins.flatMap((pin) => [pin, ...(pin.bundle?.is_open === true ? pin.bundle.members : [])]);
}

/** The key a card's row of `pin` goes by among its side's rows: its port's name, followed by `/` and its member's on a member, which no port's name holds. */
export function nodePinRowKey(pin: Pick<NodePin, "name" | "member">): string {
  return pin.member === null ? pin.name : `${pin.name}/${pin.member}`;
}

/** The port and member a row's key `rowKey` names, as `nodePinRowKey` wrote it. */
export function pinEndOfTheRowKey(rowKey: string): Pick<NodePin, "name" | "member"> {
  const memberAt = rowKey.indexOf("/");
  return memberAt === -1 ? { name: rowKey, member: null } : { name: rowKey.slice(0, memberAt), member: rowKey.slice(memberAt + 1) };
}

/** The key of the row of `pins`, one side's of a card, that a link ending at member `member` of the port `name` is drawn to: the member's while its bundle is open, the port's otherwise, and the port's for a link to the whole port. */
export function rowKeyOfTheLinkEnd(pins: readonly Pick<NodePin, "name" | "bundle">[], name: string, member: string | null): string {
  const isTheMemberShown = member !== null && pins.find((pin) => pin.name === name)?.bundle?.is_open === true;
  return nodePinRowKey({ name, member: isTheMemberShown ? member : null });
}

/** The pins a node's metadata keeps open, by side, as `studio.metadata.open_bundles` holds them: each side's bundle pins by name. */
export interface OpenBundles {
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
}

/** The key a node's `studio.metadata` keeps its open bundle pins under. */
export const OPEN_BUNDLES_METADATA_KEY = "open_bundles";

/** The bundle pins `metadata`, a node's `studio.metadata`, keeps open; none where it keeps no such list, or one of another shape. */
export function openBundlesOfTheMetadata(metadata: { readonly [key: string]: JsonValue }): OpenBundles {
  const kept = jsonObjectMembersOf(metadata[OPEN_BUNDLES_METADATA_KEY]);
  const namesUnder = (key: string): readonly string[] => {
    const names = kept[key];
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
  };
  return { inputs: namesUnder("inputs"), outputs: namesUnder("outputs") };
}

/** `open` with the bundle pin `name` on `side` opened or closed, each side's names sorted, so one state is written one way. */
export function openBundlesWith(open: OpenBundles, side: "input" | "output", name: string, isOpen: boolean): OpenBundles {
  const key = side === "input" ? "inputs" : "outputs";
  const names = new Set(open[key]);
  if (isOpen) names.add(name);
  else names.delete(name);
  return { ...open, [key]: [...names].sort() };
}

/** The exact type and flow a node type declares for a port, as a card placed now would show them: a type it states exactly, or none while another pin or a setting decides it. */
export function exactPinOfTheDeclaredPort(declared: Pick<NodeTypePortDescribed, "pin_type" | "flow">): StreamGraphPortPin | null {
  return declared.pin_type?.kind === "is" && declared.flow !== undefined ? { pin_type: declared.pin_type.pin_type, flow: declared.flow } : null;
}
