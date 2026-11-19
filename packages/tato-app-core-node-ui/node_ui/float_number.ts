// The default control of a Float input: its number in a field, which a drag changes live and typed
// words, the arrow keys or a release commit, as `number_field.ts` draws it.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { NumberField } from "./number_field.ts";

/** A number field for a Float input. */
export default class FloatNumber extends HTMLElement implements InputControlElement<"float"> {
  readonly #field: NumberField;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#field = new NumberField(shadow, { whole_numbers: false, step_buttons: false, report: (eventName, value) => fireInputControlEvent(this, eventName, value) });
  }

  set pin({ declaration }: ControlledPin<"float">) {
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
