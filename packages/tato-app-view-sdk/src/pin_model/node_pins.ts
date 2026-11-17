// A node's pins as every surface lays them out: one row per pin, outputs first and then inputs, each
// carrying the pin's exact type and flow where the runtime serves them.

import type { NodeCatalogPortPin, StreamGraphPortPin } from "../studio_readings.js";
import type { PortFamily } from "../port_families.js";
import type { InputAddress } from "./node_inputs.js";

/** One pin of a node: its name, its exact type and flow (`null` for a pin with none), what its node type says of it, and what it states about its stream. */
export interface NodePin {
  readonly name: string;
  readonly pin: StreamGraphPortPin | null;
  /** The family the runtime still serves beside the type; only the canvas's own wiring check reads it, until the runtime judges a link. */
  readonly family: PortFamily | null;
  /** The port's description as its node type declares it; `null` for none. */
  readonly description: string | null;
  readonly stream_facts_words: readonly string[];
  /** Where the value an input holds while unwired is kept, the key its row reads the value by; `null` on an output, on an input that takes no stored value or that a link feeds, and outside a stream's graph. */
  readonly value_address: InputAddress | null;
}

/** One row of a node's card: the side of the card its socket sits on, and its pin, or what stands for it, as its name in the layout. */
export interface NodePinRow<Pin = NodePin> {
  readonly side: "input" | "output";
  readonly node_pin: Pin;
}

/** A node's rows in the order a card draws them: its outputs first, then its inputs. */
export function nodePinRows<Pin>(inputs: readonly Pin[], outputs: readonly Pin[]): readonly NodePinRow<Pin>[] {
  return [...outputs.map((node_pin): NodePinRow<Pin> => ({ side: "output", node_pin })), ...inputs.map((node_pin): NodePinRow<Pin> => ({ side: "input", node_pin }))];
}

/** The exact type and flow a node type declares for a port, as a card placed now would show them: a type it states exactly, or none while another pin or a setting decides it. */
export function exactPinOfTheDeclaredPort(declared: NodeCatalogPortPin | null): StreamGraphPortPin | null {
  return declared !== null && declared.pin_type.kind === "is" ? { pin_type: declared.pin_type.pin_type, flow: declared.flow } : null;
}
