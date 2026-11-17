// What a node UI element may ask the Studio. It grows only when a first-party element needs more.

import type { ControlledPin, InputControlElement } from "./input_control_element.js";

/** The Studio, as a control or a node body reaches it through its `pin`. */
export interface NodeUiElementHost {
  /** The control the table picks for `pin`, defined and ready to connect; a control that holds another asks for it here. */
  inputControlFor<TypeName extends string>(pin: ControlledPin<TypeName>): Promise<InputControlElement<TypeName>>;
}
