// A control for one input, which shows the value the Studio sets in words. Write the pin type it is
// registered for in `PinTypeName`, as its `tatolab_node_ui.json` entry names it, then draw it as
// it should look: the Studio sets `pin` once, then `state` and `value`, and reads none of them
// back. Fire `input` while a gesture moves and `change` once as it ends, each with
// `fireInputControlEvent`.

import type { ControlledPin, InputControlElement, InputControlState, StoredPinValue } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** The pin type this control is registered for. */
type PinTypeName = "PIN_TYPE_NAME";

/** A control that shows its input's value in words. */
export default class InputValueInWords extends HTMLElement implements InputControlElement<PinTypeName> {
  readonly #words = document.createElement("output");

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [controlStyles];
    shadow.append(this.#words);
  }

  set pin({ declaration }: ControlledPin<PinTypeName>) {
    this.#words.setAttribute("aria-label", declaration.label);
  }

  set value(value: StoredPinValue<PinTypeName>) {
    this.#words.value = JSON.stringify(value);
  }

  set state(state: InputControlState) {
    this.#words.dataset["state"] = state;
  }
}
