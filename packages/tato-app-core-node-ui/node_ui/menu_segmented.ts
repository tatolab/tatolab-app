// The `segmented` control of a Menu input: the design system's segmented control, a segment for each
// of the type's options. Choosing a segment other than the one held is one `change` carrying its
// name, spelled as declared; it has no move to show live, so it fires no `input`. While the input is
// not editable each segment says why it cannot be chosen.
// The control is the design system's React part, which the Studio supplies by name. It is drawn from
// a root in the control's own children, which its shadow root shows through a slot so the design
// system's stylesheet applies; the root is made as the control is connected and unmounted as it is
// taken off.

import { SegmentedChoiceControl } from "@tatolab/tato-app-view-sdk/design_system/segmented_choice_control";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/** Why a segment cannot be chosen in each state but `editable`. */
const WHY_NO_SEGMENT_IS_CHOSEN: Readonly<Record<Exclude<InputControlState, "editable">, string>> = {
  read_only: "This input cannot be changed here.",
  driven_by_wire: "A wire sets this input.",
};

/** The segments of a Menu input's options. */
export default class MenuSegmented extends HTMLElement implements InputControlElement<"menu"> {
  readonly #partElement = document.createElement("div");
  #partRoot: Root | null = null;
  #label = "";
  #optionNames: readonly string[] = [];
  #chosen = "";
  #state: InputControlState = "read_only";

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const slot = document.createElement("slot");
    slot.className = "slot-of-the-part";
    shadow.append(slot);
  }

  set pin({ declaration }: ControlledPin<"menu">) {
    this.#optionNames = declaration.pin_type.option_names;
    this.#label = declaration.label;
    this.#drawThePart();
  }

  set value(optionName: string) {
    this.#chosen = optionName;
    this.#drawThePart();
  }

  set state(state: InputControlState) {
    this.#state = state;
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
    if (this.#state !== "editable" || optionName === this.#chosen) return;
    this.#chosen = optionName;
    this.#drawThePart();
    fireInputControlEvent(this, "change", optionName);
  }

  #drawThePart(): void {
    const unavailableBecause = this.#state === "editable" ? undefined : WHY_NO_SEGMENT_IS_CHOSEN[this.#state];
    this.#partRoot?.render(
      createElement(SegmentedChoiceControl, {
        label: this.#label,
        choices: this.#optionNames.map((optionName) => ({ choice: optionName, label: optionName, ...(unavailableBecause === undefined ? {} : { unavailableBecause }) })),
        chosen: this.#chosen,
        onChosen: (optionName: string) => this.#optionChosen(optionName),
      }),
    );
  }
}
