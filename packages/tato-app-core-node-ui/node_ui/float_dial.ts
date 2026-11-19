// The `dial` control of a Float input: a knob turned across the input's range, on its step,
// with the number and its unit beside it, as `number_dial.ts` draws it.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { NumberDial } from "./number_dial.ts";

/** A dial for a Float input. */
export default class FloatDial extends HTMLElement implements InputControlElement<"float"> {
  readonly #dial: NumberDial;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#dial = new NumberDial(shadow, { whole_numbers: false, report: (eventName, value) => fireInputControlEvent(this, eventName, value) });
  }

  set pin({ declaration }: ControlledPin<"float">) {
    this.#dial.takeTheDeclaration(declaration.annotations, declaration.label);
  }

  set value(value: number) {
    this.#dial.showTheNumber(value);
  }

  set state(state: InputControlState) {
    this.#dial.setEditable(state === "editable");
  }

  disconnectedCallback(): void {
    this.#dial.interrupt();
  }
}
