// The default control of a Boolean input: a switch. A click, Space or Enter flips it, and each flip
// is one `change` and one undo step; a switch has no move to show live, so it fires no `input`.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** A switch for a Boolean input. */
export default class BooleanSwitch extends HTMLElement implements InputControlElement<"boolean"> {
  readonly #switch = document.createElement("button");
  #isOn = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#switch.type = "button";
    this.#switch.className = "switch";
    this.#switch.setAttribute("role", "switch");
    const thumb = document.createElement("span");
    thumb.className = "switch-thumb";
    this.#switch.append(thumb);
    shadow.append(this.#switch);
    this.#switch.addEventListener("click", () => this.#flipped());
    this.#show();
  }

  set pin({ declaration }: ControlledPin<"boolean">) {
    this.#switch.setAttribute("aria-label", declaration.label);
  }

  set value(value: boolean) {
    this.#isOn = value;
    this.#show();
  }

  set state(state: InputControlState) {
    this.#switch.disabled = state !== "editable";
  }

  #flipped(): void {
    this.#isOn = !this.#isOn;
    this.#show();
    fireInputControlEvent(this, "change", this.#isOn);
  }

  #show(): void {
    this.#switch.setAttribute("aria-checked", String(this.#isOn));
  }
}
