// The default control of a Vector input: a number field for each of its components, `x` and `y`,
// with `z` and `w` for a Vector of three or four, as `number_parts.ts` draws them.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { VectorComponentCount, VectorPinValue } from "@tatolab/tato-app-view-sdk/pin_types";
import { NumberParts } from "./number_parts.ts";

/** The components a Vector of each size holds, in the order they are shown. */
const COMPONENTS_OF_EACH_SIZE: Readonly<Record<VectorComponentCount, readonly (keyof VectorPinValue)[]>> = {
  two: ["x", "y"],
  three: ["x", "y", "z"],
  four: ["x", "y", "z", "w"],
};

/** A Vector's components as a value of its size. */
function vectorOf(components: readonly (keyof VectorPinValue)[], numbers: readonly number[]): VectorPinValue {
  const vector: VectorPinValue = { x: numbers[0] ?? 0, y: numbers[1] ?? 0 };
  components.forEach((component, index) => {
    vector[component] = numbers[index] ?? 0;
  });
  return vector;
}

/** A number field for each component of a Vector input. */
export default class VectorFields extends HTMLElement implements InputControlElement<"vector"> {
  readonly #shadow: ShadowRoot;
  #components: readonly (keyof VectorPinValue)[] = COMPONENTS_OF_EACH_SIZE.two;
  #parts: NumberParts | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    this.#shadow.adoptedStyleSheets = [controlStyles];
  }

  set pin({ declaration }: ControlledPin<"vector">) {
    if (this.#parts !== null) return;
    const components = COMPONENTS_OF_EACH_SIZE[declaration.pin_type.component_count];
    this.#components = components;
    this.#parts = new NumberParts(
      this.#shadow,
      "line",
      components.map((component) => ({ shown_name: component, spoken_name: component })),
      (eventName, numbers) => fireInputControlEvent(this, eventName, vectorOf(components, numbers)),
    );
    this.#parts.takeTheDeclaration(declaration.annotations, declaration.label);
  }

  set value(value: VectorPinValue) {
    this.#parts?.showTheNumbers(this.#components.map((component) => value[component] ?? 0));
  }

  set state(state: InputControlState) {
    this.#parts?.setEditable(state === "editable");
  }

  disconnectedCallback(): void {
    this.#parts?.interrupt();
  }
}
