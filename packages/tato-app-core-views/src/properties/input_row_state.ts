// What Properties' row of one input draws, decided from the input as every surface reads it, the
// links that feed it at its level, and whether the graph there can be edited.

import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { NodePin } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import type { InputValueComesFrom } from "@tatolab/tato-app-view-sdk/studio_readings";
import { canAGraphInputFeedThePin, type LinkedEndOfAPort } from "./properties_graph_edits";

/**
 * An input row's state: fed by the links it names, each of which it offers a way to and a disconnect of; fed from a wire the
 * level does not hold, which it names only as wired; holding a value of its own at an address; or taking no value and fed
 * by nothing. An unwired row offers a promotion to a Graph Input where `can_be_promoted`.
 */
export type InputRowState =
  | { readonly kind: "wired"; readonly driven_by: readonly LinkedEndOfAPort[]; readonly can_be_disconnected: boolean }
  | { readonly kind: "wired_from_outside_the_level" }
  | { readonly kind: "holds_a_value"; readonly address: InputAddress; readonly can_be_promoted: boolean }
  | { readonly kind: "not_connected"; readonly can_be_promoted: boolean };

/** What an input row is decided from. */
export interface InputOfARow {
  readonly input: Pick<NodePin, "pin" | "value_address" | "setting" | "takes_a_wire">;
  /** Where the runtime reads the input's value from; `null` where it reads none. */
  readonly value_comes_from: InputValueComesFrom | null;
  /** The links at the input's level that feed it. */
  readonly driven_by: readonly LinkedEndOfAPort[];
  readonly is_editable: boolean;
}

/**
 * The state of the row of `input`. A link at its level wins, since the runtime's reading of a wired input can lag the link;
 * a promotion is offered on an input of a type a Graph Input chooses, since a client sets no value of any other, never on a
 * setting, which takes no wire, and never on an input the runtime marks as taking no wire, which no Graph Input's link can end at.
 */
export function inputRowStateOf({ input, value_comes_from, driven_by, is_editable }: InputOfARow): InputRowState {
  if (driven_by.length > 0) return { kind: "wired", driven_by, can_be_disconnected: is_editable };
  const canBePromoted = is_editable && input.setting === null && input.takes_a_wire && input.pin !== null && canAGraphInputFeedThePin({ pin_type: input.pin.pin_type });
  if (input.value_address !== null) return { kind: "holds_a_value", address: input.value_address, can_be_promoted: canBePromoted };
  if (value_comes_from === "wire") return { kind: "wired_from_outside_the_level" };
  return { kind: "not_connected", can_be_promoted: canBePromoted };
}
