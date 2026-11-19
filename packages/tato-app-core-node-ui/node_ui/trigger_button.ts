// The default control of a Trigger input: a button. A Trigger carries an event and holds no value, so
// each press, by a click, Space or Enter, is one `change` carrying none, which the host sends as one
// fire of the input and records nowhere.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** A button that fires a Trigger input. */
export default class TriggerButton extends HTMLElement implements InputControlElement<"trigger"> {
  readonly #button = document.createElement("button");

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#button.type = "button";
    this.#button.className = "trigger";
    this.#button.textContent = "Fire";
    shadow.append(this.#button);
    this.#button.addEventListener("click", () => fireInputControlEvent(this, "change", null));
  }

  set pin({ declaration }: ControlledPin<"trigger">) {
    this.#button.setAttribute("aria-label", `Fire ${declaration.label}`);
    this.#button.title = `Fire ${declaration.label} once`;
  }

  /** A Trigger holds no value, so there is none to show. */
  set value(_value: null) {}

  set state(state: InputControlState) {
    this.#button.disabled = state !== "editable";
  }
}
