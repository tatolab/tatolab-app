// A node's pins as every surface lays them out: one row per pin, outputs first and then inputs, each
// carrying the pin's exact type and flow where the runtime serves them.

import type { NodeCatalogPortPin } from "../studio_readings.js";
import type { PortFamily } from "../port_families.js";
import type { PinOfAPort } from "./pin_types.js";

/** One pin of a node: its name, its exact type and flow (`null` for a pin with none), what its node type says of it, and what it states about its stream. */
export interface NodePin {
  readonly name: string;
  readonly pin: PinOfAPort | null;
  /** The family the runtime still serves beside the type; only the canvas's own wiring check reads it, until the runtime judges a link. */
  readonly family: PortFamily | null;
  /** The port's description as its node type declares it; `null` for none. */
  readonly description: string | null;
  readonly stream_facts_words: readonly string[];
}

/** One row of a node's card: the side of the card its socket sits on, and its pin. */
export interface NodePinRow {
  readonly side: "input" | "output";
  readonly pin: NodePin;
}

/** A node's rows in the order a card draws them: its outputs first, then its inputs. */
export function nodePinRows(inputs: readonly NodePin[], outputs: readonly NodePin[]): readonly NodePinRow[] {
  return [...outputs.map((pin): NodePinRow => ({ side: "output", pin })), ...inputs.map((pin): NodePinRow => ({ side: "input", pin }))];
}

/** The exact type and flow a node type declares for a port, as a card placed now would show them: a type it states exactly, or none while another pin or a setting decides it. */
export function exactPinOfTheDeclaredPort(declared: NodeCatalogPortPin | null): PinOfAPort | null {
  return declared !== null && declared.pin_type.kind === "is" ? { pin_type: declared.pin_type.pin_type, flow: declared.flow } : null;
}
