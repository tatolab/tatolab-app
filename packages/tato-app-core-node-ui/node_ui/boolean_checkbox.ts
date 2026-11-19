// The `checkbox` control of a Boolean input: a box ticked while the value is true. A click or Space
// ticks or clears it, and each is one `change` and one undo step; a checkbox has no move to show
// live, so it fires no `input`.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** A checkbox for a Boolean input. */
export default class BooleanCheckbox extends HTMLElement implements InputControlElement<"boolean"> {
  readonly #box = document.createElement("input");

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#box.type = "checkbox";
    this.#box.className = "checkbox";
    shadow.append(this.#box);
    this.#box.addEventListener("change", () => fireInputControlEvent(this, "change", this.#box.checked));
  }

  set pin({ declaration }: ControlledPin<"boolean">) {
    this.#box.setAttribute("aria-label", declaration.label);
  }

  set value(value: boolean) {
    this.#box.checked = value;
  }

  set state(state: InputControlState) {
    this.#box.disabled = state !== "editable";
  }
}
