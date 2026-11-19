// The `slider` control of a Float input, and the control of a Float input that states a range: a
// track between the input's range, on its step, with the number and its unit beside it, as
// `number_slider.ts` draws it.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { NumberSlider } from "./number_slider.ts";

/** A slider for a Float input. */
export default class FloatSlider extends HTMLElement implements InputControlElement<"float"> {
  readonly #slider: NumberSlider;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#slider = new NumberSlider(shadow, { whole_numbers: false, report: (eventName, value) => fireInputControlEvent(this, eventName, value) });
  }

  set pin({ declaration }: ControlledPin<"float">) {
    this.#slider.takeTheDeclaration(declaration.annotations, declaration.label);
  }

  set value(value: number) {
    this.#slider.showTheNumber(value);
  }

  set state(state: InputControlState) {
    this.#slider.setEditable(state === "editable");
  }

  disconnectedCallback(): void {
    this.#slider.interrupt();
  }
}
