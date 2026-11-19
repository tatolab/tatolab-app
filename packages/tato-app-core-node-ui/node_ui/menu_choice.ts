// The default control of a Menu input: the design system's menu of the type's options. Choosing an
// option other than the one held is one `change` carrying its name, spelled as declared; a menu has
// no move to show live, so it fires no `input`.
// The menu is the design system's React part, which the Studio supplies by name. It is drawn from a
// root in the control's own children, which its shadow root shows through a slot so the design
// system's stylesheet applies; the root is made as the control is connected and unmounted as it is
// taken off.

import { PropertyChoiceField } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/** The menu of a Menu input's options. */
export default class MenuChoice extends HTMLElement implements InputControlElement<"menu"> {
  readonly #partElement = document.createElement("div");
  #partRoot: Root | null = null;
  #fieldId = "";
  #label = "";
  #optionNames: readonly string[] = [];
  #chosen = "";
  #editable = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const slot = document.createElement("slot");
    slot.className = "slot-of-the-part";
    shadow.append(slot);
  }

  set pin({ declaration }: ControlledPin<"menu">) {
    this.#fieldId = `menu-choice-${declaration.input_name}-${crypto.randomUUID()}`;
    this.#optionNames = declaration.pin_type.option_names;
    this.#label = declaration.label;
    this.#drawThePart();
  }

  set value(optionName: string) {
    this.#chosen = optionName;
    this.#drawThePart();
  }

  set state(state: InputControlState) {
    this.#editable = state === "editable";
    this.#drawThePart();
  }

  connectedCallback(): void {
    if (this.#partElement.parentNode !== this) this.append(this.#partElement);
    this.#partRoot ??= createRoot(this.#partElement);
    this.#drawThePart();
  }

  disconnectedCallback(): void {
    const partRoot = this.#partRoot;
    this.#partRoot = null;
    partRoot?.unmount();
  }

  #optionChosen(optionName: string): void {
    if (!this.#editable || optionName === this.#chosen) return;
    this.#chosen = optionName;
    this.#drawThePart();
    fireInputControlEvent(this, "change", optionName);
  }

  #drawThePart(): void {
    this.#partRoot?.render(
      createElement(PropertyChoiceField, {
        fieldId: this.#fieldId,
        words: this.#chosen,
        label: this.#label,
        choices: this.#editable ? this.#optionNames.map((optionName) => ({ words: optionName, onChosen: () => this.#optionChosen(optionName) })) : undefined,
      }),
    );
  }
}
