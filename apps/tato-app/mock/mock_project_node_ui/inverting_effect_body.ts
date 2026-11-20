// The body of the mock project's Inverting Effect: a wide fader for its `amount`, with the amount in
// words above it, which a drag changes live and a release commits.

import { fireNodeBodyEvent, type DrawnNode, type NodeBodyElement, type NodeBodyInputs } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** A fader and its words, drawn above the card's rows. */
export default class InvertingEffectBody extends HTMLElement implements NodeBodyElement<typeof InvertingEffectBody.inputTypes> {
  static readonly inputTypes = { amount: "float" } as const;
  readonly #fader = document.createElement("input");
  readonly #words = document.createElement("p");

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#fader.type = "range";
    this.#fader.min = "0";
    this.#fader.max = "1";
    this.#fader.step = "0.01";
    this.#fader.style.width = "100%";
    this.#words.style.margin = "0";
    shadow.append(this.#words, this.#fader);
    this.#fader.addEventListener("input", () => {
      this.#show(this.#fader.valueAsNumber);
      fireNodeBodyEvent(this, "input", "amount", this.#fader.valueAsNumber);
    });
    this.#fader.addEventListener("change", () => fireNodeBodyEvent(this, "change", "amount", this.#fader.valueAsNumber));
  }

  set node(node: DrawnNode<typeof InvertingEffectBody.inputTypes>) {
    this.#fader.ariaLabel = node.declarations.amount.label;
  }

  set inputs(inputs: NodeBodyInputs<typeof InvertingEffectBody.inputTypes>) {
    const { amount } = inputs;
    this.#fader.disabled = amount.state !== "editable";
    if (amount.value !== null) {
      this.#fader.valueAsNumber = amount.value;
      this.#show(amount.value);
    }
  }

  #show(amount: number): void {
    this.#words.textContent = `Inverted ${Math.round(amount * 100)}%`;
  }
}
