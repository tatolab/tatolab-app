// Which inputs a surface draws a control for, and what that control is told of its input. An input
// takes a control while it holds a value of its own, unwired, in a stream's graph, and its type is
// exact; an untyped input takes none, and neither does a String holding a project asset's UUID, which
// only Properties' own asset field picks, or one naming an audio capture device, which only its own
// device menu picks. A setting its node reads as it is set up sends nothing
// while its control moves, since each value it takes rebuilds the node: it commits on release alone.
// An input of a type only a wire carries, such as a Texture, holds no value: it takes a control only
// where its node type's annotation names one, such as a preview, which shows what its wire carries.
// An input of a named type holds none either, and takes the control the module declaring its type
// registers, which shows what its wire carries; the table answers whether that module registers one,
// and where none does, the row draws no control.
// A node body draws whichever of its node's inputs it states, each input whose type is exact, wired or not.

import type { BuiltInPinTypeName, PinAnnotations, PinType, PinValues } from "../pin_types.js";
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

/** The control a String input's annotation names when it holds the id of an audio capture device, as the runtime's `list_audio_capture_devices` lists it. */
export const AUDIO_CAPTURE_DEVICE_CONTROL = "audio_capture_device";

/** Whether an input of `pinType` annotated with `annotations` holds the id of an audio capture device: a String whose annotation names that control. */
export function isAnAudioCaptureDeviceInput(pinType: PinType, annotations: PinAnnotations): boolean {
  return pinType.type === "string" && annotations.control === AUDIO_CAPTURE_DEVICE_CONTROL;
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
 * asset's UUID or naming an audio capture device, an input a link feeds that holds a value, one of a type only a wire carries, which holds none whatever the
 * runtime reads of it, that its node type's annotation names no control for, and one of a named type or a type only a wire
 * carries that Studio reads no wire into. The control reads the annotations its node type states; an input that may be unset
 * is not told apart.
 */
export function takesAControl(input: InputAControlMayDraw): ControlledInput | null {
  if (input.pin === null) return null;
  const pinTypeName = input.pin.pin_type.type;
  if (pinTypeName === "named" || PIN_TYPES_ONLY_A_WIRE_CARRIES.has(pinTypeName)) {
    const takesOne = pinTypeName === "named" || (input.annotations.control ?? null) !== null;
    if (!takesOne || input.wire === null) return null;
    return { address: input.wire.into, declaration: declarationOfTheInput(input, input.pin), rebuilds_its_node: false, driven_by: input.wire.wiring };
  }
  if (input.value_address === null) return null;
  if (input.pin.pin_type.type === "string" && input.annotations.project_asset !== undefined && input.annotations.project_asset !== null) return null;
  if (isAnAudioCaptureDeviceInput(input.pin.pin_type, input.annotations)) return null;
  return { address: input.value_address, declaration: declarationOfTheInput(input, input.pin), rebuilds_its_node: doesAChangeRebuildTheNode(input), driven_by: null };
}

/** Whether `before` and `after` are the same input under the same declaration, wired the same, so a control drawn for one stays for the other. */
export function areTheSameControlledInput(before: ControlledInput, after: ControlledInput): boolean {
  return jsonTextOf([before.address, before.declaration, before.rebuilds_its_node, before.driven_by]) === jsonTextOf([after.address, after.declaration, after.rebuilds_its_node, after.driven_by]);
}

/**
 * One input as a node body is told of it: its declaration, where a person sets it (`null` for one a link feeds or that holds no
 * value of its own), whether a change of it rebuilds its node, and what it reads through its wire, `null` where it reads none.
 */
export interface InputOfANodeBody {
  readonly declaration: ControlledInput["declaration"];
  readonly value_address: InputAddress | null;
  readonly rebuilds_its_node: boolean;
  readonly wiring: InputWiring | null;
}

/** The node a body draws: its node type, the project its stream is in, and each of its inputs whose type is exact, which is each one a body may draw. */
export interface NodeOfABody {
  readonly node_type: string;
  readonly project_folder: string;
  readonly inputs: readonly InputOfANodeBody[];
}

/**
 * The node of `nodeType` whose inputs are `inputs`, as a body draws it, each input whose type is exact, wired or not; `null` outside
 * a stream's graph, where no input of it is addressed, so no body draws it.
 */
export function nodeOfABody(nodeType: string, inputs: readonly InputAControlMayDraw[]): NodeOfABody | null {
  const projectFolder = inputs.map((input) => (input.value_address ?? input.wire?.into ?? null)?.graph.project_folder).find((folder) => folder !== undefined);
  if (projectFolder === undefined) return null;
  return {
    node_type: nodeType,
    project_folder: projectFolder,
    inputs: inputs.flatMap((input) =>
      input.pin === null
        ? []
        : [{ declaration: declarationOfTheInput(input, input.pin), value_address: input.value_address, rebuilds_its_node: doesAChangeRebuildTheNode(input), wiring: input.wire?.wiring ?? null }],
    ),
  };
}

/** Whether `before` and `after` are the same node to a body, so a body drawn for one stays for the other and is only told its inputs again. */
export function areTheSameNodeOfABody(before: NodeOfABody, after: NodeOfABody): boolean {
  return before === after || jsonTextOf(before) === jsonTextOf(after);
}
