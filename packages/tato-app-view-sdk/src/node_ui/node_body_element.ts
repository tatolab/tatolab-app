// The contract between the Studio and a node body: a custom element that draws the body of every node
// of one node type, above the card's rows. Its class states, once, the type of each input it draws as
// `inputTypes`, which types its `node` and `inputs` and which the host compares with the node's own
// inputs as it attaches the element. The host sets `node` once, then `inputs` on each change, and never
// reads a property back. The body fires `input` while a gesture on one input moves and `change` once as
// it ends, through `fireNodeBodyEvent`, which names the input.

import type { PinType } from "../pin_types.js";
import type { InputControlEventName, InputControlState, InputPinDeclaration, NodeUiSurface, StoredPinValue } from "./input_control_element.js";
import type { NodeUiElementHost } from "./node_ui_element_host.js";

/** The type of each input a body draws, by the input's name: a built-in type's name, or the class path of a named type. */
export type NodeBodyInputTypes = Readonly<Record<string, string>>;

/** What stays fixed for one body: its node's type, the declaration of each input it draws, where it is drawn, and what it may ask the Studio. */
export interface DrawnNode<InputTypes extends NodeBodyInputTypes> {
  readonly node_type: string;
  readonly declarations: { readonly [Input in keyof InputTypes & string]: InputPinDeclaration<InputTypes[Input]> };
  readonly surface: NodeUiSurface;
  readonly studio: NodeUiElementHost;
}

/** One input as a body is told of it: a value a person may change or not, `null` while the input shows none; or driven by its wire, which sets no value. */
export type NodeBodyInput<TypeName extends string> =
  | { readonly state: Exclude<InputControlState, "driven_by_wire">; readonly value: StoredPinValue<TypeName> | null }
  | { readonly state: "driven_by_wire"; readonly value: null };

/** Each input a body draws, as it is now. */
export type NodeBodyInputs<InputTypes extends NodeBodyInputTypes> = { readonly [Input in keyof InputTypes & string]: NodeBodyInput<InputTypes[Input]> };

/** A custom element that draws the body of a node whose inputs include `InputTypes`. */
export interface NodeBodyElement<InputTypes extends NodeBodyInputTypes> extends HTMLElement {
  node: DrawnNode<InputTypes>;
  inputs: NodeBodyInputs<InputTypes>;
}

/** The class a body's script default-exports; the Studio mints its tag, defines it, and reads `inputTypes` as it attaches one. */
export interface NodeBodyElementClass<InputTypes extends NodeBodyInputTypes> {
  new (): NodeBodyElement<InputTypes>;
  readonly inputTypes: InputTypes;
}

/** The detail of an event a body fires through `fireNodeBodyEvent`: the input it changes and the value. */
export interface NodeBodyEventDetail<InputTypes extends NodeBodyInputTypes, Input extends keyof InputTypes & string> {
  readonly input: Input;
  readonly value: StoredPinValue<InputTypes[Input]>;
}

/**
 * Fires `eventName` on `body` for its input `input`, the detail carrying `value`, which must be of that input's type. It does
 * not bubble, so a body that holds a control never passes the control's value off as its own.
 */
export function fireNodeBodyEvent<InputTypes extends NodeBodyInputTypes, Input extends keyof InputTypes & string>(
  body: NodeBodyElement<InputTypes>,
  eventName: InputControlEventName,
  input: Input,
  value: StoredPinValue<InputTypes[Input]>,
): void {
  const detail: NodeBodyEventDetail<InputTypes, Input> = { input, value };
  body.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: false, composed: false }));
}

/** The input and value an `input` or `change` heard on a body carries, or `null` for an event that carries none, as a native one from a field inside it. */
export function inputAndValueTheNodeBodyEventCarries(event: Event): { readonly input: string; readonly value: unknown } | null {
  if (event.type !== "input" && event.type !== "change") return null;
  const detail: unknown = "detail" in event ? event.detail : undefined;
  if (typeof detail !== "object" || detail === null || !("input" in detail) || !("value" in detail) || typeof detail.input !== "string") return null;
  return { input: detail.input, value: detail.value };
}

/** The name `inputTypes` would give `pinType`: its built-in name, or a named type's class path. */
function typeNameOfThePinType(pinType: PinType): string {
  return pinType.type === "named" ? pinType.named_pin_type : pinType.type;
}

/** The input types a body class states, or why they cannot be read: its static `inputTypes` must map each input's name to a type name. */
export function inputTypesTheBodyClassStates(bodyClass: unknown): { readonly kind: "stated"; readonly input_types: NodeBodyInputTypes } | { readonly kind: "not_stated"; readonly because: string } {
  const inputTypes: unknown = typeof bodyClass === "function" && "inputTypes" in bodyClass ? bodyClass.inputTypes : undefined;
  if (typeof inputTypes !== "object" || inputTypes === null) return { kind: "not_stated", because: "its class states no static inputTypes." };
  const entries = Object.entries(inputTypes);
  const notAName = entries.find(([, typeName]) => typeof typeName !== "string");
  if (notAName !== undefined) return { kind: "not_stated", because: `its inputTypes give ${notAName[0]} no type name.` };
  return { kind: "stated", input_types: Object.fromEntries(entries.map(([input, typeName]) => [input, String(typeName)])) };
}

/**
 * Why a body whose class states `inputTypes` cannot draw a node of `nodeType` whose inputs are `declarations`, naming both, or
 * `null` when each input it states is one of the node's, of the same type. The node may have inputs the body does not draw.
 */
export function whyTheBodyDoesNotFitTheNode(inputTypes: NodeBodyInputTypes, nodeType: string, declarations: ReadonlyMap<string, { readonly pin_type: PinType }>): string | null {
  const misfits = Object.entries(inputTypes).flatMap(([input, typeName]) => {
    const declaration = declarations.get(input);
    if (declaration === undefined) return [`${input} as ${typeName}, which it has no typed input named`];
    const nodesTypeName = typeNameOfThePinType(declaration.pin_type);
    return nodesTypeName === typeName ? [] : [`${input} as ${typeName}, where its ${input} is ${nodesTypeName}`];
  });
  return misfits.length === 0 ? null : `The body draws ${misfits.join("; ")}, so it does not draw a node of ${nodeType}.`;
}
