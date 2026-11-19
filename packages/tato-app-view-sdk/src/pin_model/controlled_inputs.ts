// Which inputs a surface draws a control for, and what that control is told of its input. An input
// takes a control while it holds a value of its own, unwired, in a stream's graph, and its type is
// exact; an untyped input takes none, and neither does a String holding a project asset's UUID, which
// only Properties' own asset field picks. A setting its node reads as it is set up sends nothing
// while its control moves, since each value it takes rebuilds the node: it commits on release alone.

import type { BuiltInPinTypeName, PinAnnotations } from "../pin_types.js";
import type { InputPinDeclaration } from "../node_ui/input_control_element.js";
import { jsonTextOf, type StreamGraphPortPin } from "../studio_readings.js";
import type { InputAddress } from "./node_inputs.js";
import { doesAChangeRebuildTheNode, type NodePin } from "./node_pins.js";

/** An input a control edits: where its value is kept, its declaration as the control reads it, and whether a change of it rebuilds its node. */
export interface ControlledInput {
  readonly address: InputAddress;
  readonly declaration: InputPinDeclaration<BuiltInPinTypeName>;
  readonly rebuilds_its_node: boolean;
}

/** What a surface knows of one input: its name, its exact type and flow (`null` for none), what its node type annotates of its value, where its value is kept (`null` while it holds none of its own), and when its node reads it where it is a setting. */
export interface InputAControlMayDraw {
  readonly name: string;
  readonly pin: StreamGraphPortPin | null;
  readonly annotations: PinAnnotations;
  readonly value_address: InputAddress | null;
  readonly setting: NodePin["setting"];
}

/**
 * The input a control draws for `input`, or `null` where it takes none: an input a link feeds, one that holds no value, one
 * with no exact type, or a String holding a project asset's UUID. The control reads the annotations its node type states; an
 * input that may be unset is not told apart.
 */
export function takesAControl(input: InputAControlMayDraw): ControlledInput | null {
  if (input.value_address === null || input.pin === null) return null;
  if (input.pin.pin_type.type === "string" && input.annotations.project_asset !== undefined && input.annotations.project_asset !== null) return null;
  return {
    address: input.value_address,
    declaration: { input_name: input.name, label: input.name, pin_type: input.pin.pin_type, annotations: input.annotations, may_be_unset: false },
    rebuilds_its_node: doesAChangeRebuildTheNode(input),
  };
}

/** Whether `before` and `after` are the same input under the same declaration, so a control drawn for one stays for the other. */
export function areTheSameControlledInput(before: ControlledInput, after: ControlledInput): boolean {
  return jsonTextOf([before.address, before.declaration, before.rebuilds_its_node]) === jsonTextOf([after.address, after.declaration, after.rebuilds_its_node]);
}
