// The contract between the Studio and a control: a custom element that edits or shows one input.
// The host sets `pin` once, then `state` and `value`, then connects the element, and never reads a
// property back, so a control may implement each as a setter alone. The control fires `input`
// while a gesture moves and `change` once as it ends, each carrying the value in its detail.

import type { BuiltInPinTypeName, PinAnnotations, PinType, PinValues } from "../pin_types.js";
import type { NodeUiElementHost } from "./node_ui_element_host.js";

/** Whether a person may change the input: they may, they may not, or a wire feeds it and the host sets no value. */
export type InputControlState = "editable" | "read_only" | "driven_by_wire";

/** Where a control is drawn: on the node, in Properties, or in Perform. */
export type NodeUiSurface = "node" | "properties" | "perform";

/** `input` while a gesture moves; `change` once as it ends. A toggle or a menu fires only `change`. */
export type InputControlEventName = "input" | "change";

/** The value an input of this type stores: its generated value type, or `null` for a type only a wire carries. */
export type StoredPinValue<TypeName extends string> = TypeName extends keyof PinValues ? PinValues[TypeName] : null;

/** The pin type a type name stands for: a built-in type's own form, or a named type that the class `TypeName` declares. */
export type PinTypeOfTheName<TypeName extends string> = TypeName extends BuiltInPinTypeName
  ? Extract<PinType, { type: TypeName }>
  : Extract<PinType, { type: "named" }> & { named_pin_type: TypeName };

/** One input as its node type declares it, with its pin type resolved to the type `TypeName` names. */
export interface InputPinDeclaration<TypeName extends string> {
  readonly input_name: string;
  readonly label: string;
  readonly pin_type: PinTypeOfTheName<TypeName>;
  readonly annotations: PinAnnotations;
  readonly may_be_unset: boolean;
}

/** What stays fixed for one control: the pin's declaration, where it is drawn, and what it may ask the Studio. */
export interface ControlledPin<TypeName extends string> {
  readonly declaration: InputPinDeclaration<TypeName>;
  readonly surface: NodeUiSurface;
  readonly studio: NodeUiElementHost;
}

/** A custom element that edits or shows one input of the pin type `TypeName`. */
export interface InputControlElement<TypeName extends string> extends HTMLElement {
  pin: ControlledPin<TypeName>;
  value: StoredPinValue<TypeName>;
  state: InputControlState;
}

/** The class a control's script default-exports; the Studio mints its tag and defines it. */
export type InputControlElementClass<TypeName extends string> = new () => InputControlElement<TypeName>;

/** The detail of an event a control fires through `fireInputControlEvent`. */
export interface InputControlEventDetail<TypeName extends string> {
  readonly value: StoredPinValue<TypeName>;
}

/**
 * Fires `eventName` on `control` as an event whose detail carries `value`. It does not bubble, so
 * a control that holds another control never passes the inner one's value off as its own.
 */
export function fireInputControlEvent<TypeName extends string>(control: InputControlElement<TypeName>, eventName: InputControlEventName, value: StoredPinValue<TypeName>): void {
  const detail: InputControlEventDetail<TypeName> = { value };
  control.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: false, composed: false }));
}

/**
 * The value an `input` or `change` heard on a control carries, or `null` for an event that carries
 * none: a native event from a field inside the control reaches the host as well, and the host acts
 * only on what the control fired.
 */
export function valueTheInputControlEventCarries(event: Event): { readonly value: unknown } | null {
  if (event.type !== "input" && event.type !== "change") return null;
  const detail: unknown = "detail" in event ? event.detail : undefined;
  return typeof detail === "object" && detail !== null && "value" in detail ? { value: detail.value } : null;
}
