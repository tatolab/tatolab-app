// Which inputs a surface draws a control for, and what that control is told of its input. An input
// takes a control while it holds a value of its own, unwired, in a stream's graph, and its type is
// exact; an untyped input takes none, and neither does a String holding a project asset's UUID, which
// only Properties' own asset field picks. A setting its node reads as it is set up sends nothing
// while its control moves, since each value it takes rebuilds the node: it commits on release alone.
// An input of a type only a wire carries, such as a Texture, holds no value: it takes a control only
// where its node type's annotation names one, such as a preview, which shows what its wire carries.

import type { BuiltInPinTypeName, PinAnnotations, PinValues } from "../pin_types.js";
import type { InputPinDeclaration } from "../node_ui/input_control_element.js";
import { jsonTextOf, type StreamGraphPortPin } from "../studio_readings.js";
import type { InputWiring } from "./input_wiring.js";
import type { InputAddress } from "./node_inputs.js";
import { doesAChangeRebuildTheNode, type NodePin } from "./node_pins.js";

/**
 * An input a control draws: where it is, which for an input that holds a value is where its value is kept, its declaration as
 * the control reads it, whether a change of it rebuilds its node, and, on an input of a type only a wire carries, what it reads
 * through its wire; `null` on an input a person edits.
 */
export interface ControlledInput {
  readonly address: InputAddress;
  readonly declaration: InputPinDeclaration<BuiltInPinTypeName>;
  readonly rebuilds_its_node: boolean;
  readonly driven_by: InputWiring | null;
}

/** What a surface knows of one input: its name, its exact type and flow (`null` for none), what its node type annotates of its value, where its value is kept (`null` while it holds none of its own), when its node reads it where it is a setting, and what it reads through its wire. */
export interface InputAControlMayDraw {
  readonly name: string;
  readonly pin: StreamGraphPortPin | null;
  readonly annotations: PinAnnotations;
  readonly value_address: InputAddress | null;
  readonly setting: NodePin["setting"];
  readonly wire: NodePin["wire"];
}

/** A built-in type only a wire carries: one that stores no value and is no Trigger, which a person fires. */
type PinTypeOnlyAWireCarries = Exclude<BuiltInPinTypeName, keyof PinValues | "trigger" | "named">;

const PIN_TYPES_ONLY_A_WIRE_CARRIES: ReadonlySet<BuiltInPinTypeName> = new Set(["texture", "audio", "encoded_video", "encoded_audio", "tensor"] satisfies PinTypeOnlyAWireCarries[]);

/** The declaration a control reads of `input`, whose exact type is `pin`. */
function declarationOfTheInput(input: InputAControlMayDraw, pin: StreamGraphPortPin): ControlledInput["declaration"] {
  return { input_name: input.name, label: input.name, pin_type: pin.pin_type, annotations: input.annotations, may_be_unset: false };
}

/**
 * The input a control draws for `input`, or `null` where it takes none: one with no exact type, a String holding a project
 * asset's UUID, an input a link feeds that holds a value, and one of a type only a wire carries, which holds none whatever the
 * runtime reads of it, that its node type's annotation names no control for, or that Studio reads no wire into. The control reads the annotations its node type states;
 * an input that may be unset is not told apart.
 */
export function takesAControl(input: InputAControlMayDraw): ControlledInput | null {
  if (input.pin === null) return null;
  if (PIN_TYPES_ONLY_A_WIRE_CARRIES.has(input.pin.pin_type.type)) {
    const control = input.annotations.control ?? null;
    if (control === null || input.wire === null) return null;
    return { address: input.wire.into, declaration: declarationOfTheInput(input, input.pin), rebuilds_its_node: false, driven_by: input.wire.wiring };
  }
  if (input.value_address === null) return null;
  if (input.pin.pin_type.type === "string" && input.annotations.project_asset !== undefined && input.annotations.project_asset !== null) return null;
  return { address: input.value_address, declaration: declarationOfTheInput(input, input.pin), rebuilds_its_node: doesAChangeRebuildTheNode(input), driven_by: null };
}

/** Whether `before` and `after` are the same input under the same declaration, wired the same, so a control drawn for one stays for the other. */
export function areTheSameControlledInput(before: ControlledInput, after: ControlledInput): boolean {
  return jsonTextOf([before.address, before.declaration, before.rebuilds_its_node, before.driven_by]) === jsonTextOf([after.address, after.declaration, after.rebuilds_its_node, after.driven_by]);
}
