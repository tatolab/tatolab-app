// Which inputs a surface draws a control for, and what that control is told of its input. An input
// takes a control while it holds a value of its own, unwired, in a stream's graph, and its type is
// exact; an untyped input takes none.

import type { BuiltInPinTypeName, PinAnnotations } from "../pin_types.js";
import type { InputPinDeclaration } from "../node_ui/input_control_element.js";
import type { StreamGraphPortPin } from "../studio_readings.js";
import type { InputAddress } from "./node_inputs.js";

/** An input a control edits: where its value is kept, and its declaration as the control reads it. */
export interface ControlledInput {
  readonly address: InputAddress;
  readonly declaration: InputPinDeclaration<BuiltInPinTypeName>;
}

/** What a surface knows of one input: its name, its exact type and flow (`null` for none), what its node type annotates of its value, and where its value is kept (`null` while it holds none of its own). */
export interface InputAControlMayDraw {
  readonly name: string;
  readonly pin: StreamGraphPortPin | null;
  readonly annotations: PinAnnotations;
  readonly value_address: InputAddress | null;
}

/**
 * The input a control draws for `input`, or `null` where it takes none: an input a link feeds, one that holds no value, or
 * one with no exact type. The control reads the annotations its node type states; an input that may be unset is not told
 * apart.
 */
export function takesAControl(input: InputAControlMayDraw): ControlledInput | null {
  if (input.value_address === null || input.pin === null) return null;
  return {
    address: input.value_address,
    declaration: { input_name: input.name, label: input.name, pin_type: input.pin.pin_type, annotations: input.annotations, may_be_unset: false },
  };
}

/** Whether `before` and `after` are the same input under the same declaration, so a control drawn for one stays for the other. */
export function areTheSameControlledInput(before: ControlledInput, after: ControlledInput): boolean {
  return JSON.stringify([before.address, before.declaration]) === JSON.stringify([after.address, after.declaration]);
}
