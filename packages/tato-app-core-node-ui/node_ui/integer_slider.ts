// The `slider` control of an Integer input, and the control of an Integer input that states a range: a
// track between the input's range, on its whole-number step, with the number and its unit beside it,
// as `number_slider.ts` draws it.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { NumberSlider } from "./number_slider.ts";

/** A slider for an Integer input. */
export default class IntegerSlider extends HTMLElement implements InputControlElement<"integer"> {
  readonly #slider: NumberSlider;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#slider = new NumberSlider(shadow, { whole_numbers: true, report: (eventName, value) => fireInputControlEvent(this, eventName, value) });
  }

  set pin({ declaration }: ControlledPin<"integer">) {
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
