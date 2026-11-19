// A node's pins as every surface lays them out: one row per pin, outputs first, then its settings,
// then its other inputs, each carrying the pin's exact type and flow where the runtime serves them.

import type { PinAnnotations } from "../pin_type_readings.js";
import type { NodeTypeInputDescribed, NodeTypePortDescribed, SettingReadTime, StreamGraphPortPin } from "../studio_readings.js";
import type { PortFamily } from "../port_families.js";
import type { InputWiring } from "./input_wiring.js";
import type { NodeInputLink } from "./node_input_link.js";
import type { InputAddress } from "./node_inputs.js";

/** One pin of a node: its name, its exact type and flow (`null` for a pin with none), what its node type says and annotates of it, and what it states about its stream. */
export interface NodePin {
  readonly name: string;
  readonly pin: StreamGraphPortPin | null;
  /** The family the runtime still serves beside the type; only the canvas's own wiring check reads it, until the runtime judges a link. */
  readonly family: PortFamily | null;
  /** The port's description as its node type declares it; `null` for none. */
  readonly description: string | null;
  /** What its node type's annotations state of its value, such as its range and the control that edits it; empty where it states none. */
  readonly annotations: PinAnnotations;
  readonly stream_facts_words: readonly string[];
  /** Where a person sets an unwired input, the key its row reads the value by: where the value it holds is kept, or where an unlinked Trigger is fired; `null` on an output, on an input that takes no stored value and is no Trigger, on one a link feeds, and outside a stream's graph. */
  readonly value_address: InputAddress | null;
  /** On a setting, an input that takes a value and no wire, when its node reads it; `null` on every other pin. */
  readonly setting: NodeSetting | null;
  /** On an input that takes a wire, what it reads through it; `null` on every other pin, and where Studio reads no wire: outside a stream's graph and inside a subgraph. */
  readonly wire: NodePinWire | null;
  /** On an input a link feeds in a stream's graph, what the runtime marks on that link; `null` on every other pin, and on a link it marks neither way. */
  readonly link: NodeInputLink | null;
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

/** The setting `input` is as its node type describes it, `null` for an input that takes a wire; a setting that states no read point is read at setup, as the runtime reads a config field. */
export function settingOfTheDescribedInput(input: Pick<NodeTypeInputDescribed, "mode" | "read">): NodeSetting | null {
  return input.mode === "setting_only" ? { read: input.read ?? "at_setup" } : null;
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

/** The exact type and flow a node type declares for a port, as a card placed now would show them: a type it states exactly, or none while another pin or a setting decides it. */
export function exactPinOfTheDeclaredPort(declared: Pick<NodeTypePortDescribed, "pin_type" | "flow">): StreamGraphPortPin | null {
  return declared.pin_type?.kind === "is" && declared.flow !== undefined ? { pin_type: declared.pin_type.pin_type, flow: declared.flow } : null;
}
