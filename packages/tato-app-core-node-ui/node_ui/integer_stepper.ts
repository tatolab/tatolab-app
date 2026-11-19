// The default control of an Integer input: a stepper, its whole number in a field between − and +
// buttons. A drag changes the number live and a release commits it; typed words, an arrow key and
// each press of a button are each one commit, as `number_field.ts` draws it.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { NumberField } from "./number_field.ts";

/** A stepper for an Integer input. */
export default class IntegerStepper extends HTMLElement implements InputControlElement<"integer"> {
  readonly #field: NumberField;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#field = new NumberField(shadow, { whole_numbers: true, step_buttons: true, report: (eventName, value) => fireInputControlEvent(this, eventName, value) });
  }

  set pin({ declaration }: ControlledPin<"integer">) {
    this.#field.takeTheDeclaration(declaration.annotations, declaration.label);
  }

  set value(value: number) {
    this.#field.showTheNumber(value);
  }

  set state(state: InputControlState) {
    this.#field.setEditable(state === "editable");
  }

  disconnectedCallback(): void {
    this.#field.interrupt();
  }
}
