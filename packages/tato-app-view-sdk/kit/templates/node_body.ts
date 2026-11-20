// The body of every node of one node type, drawn above the card's rows. Write the node type it is
// registered for in `NODE_TYPE`, as its `tatolab_node_ui.json` entry names it, and the type of each
// input it draws in `inputTypes`, by the input's name, as `{ level: "float" }`. Then draw it as it
// should look: the Studio sets `node` once, then `inputs` on each change, and reads neither back.
// Fire `input` while a gesture on one input moves and `change` once as it ends, each with
// `fireNodeBodyEvent`.

import type { DrawnNode, NodeBodyElement, NodeBodyInputs } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** The node type this body is registered for. */
const NODE_TYPE = "NODE_TYPE_NAME";

/** A body that names its node's type, and draws none of its inputs until `inputTypes` names them. */
export default class NodeTypeInWords extends HTMLElement implements NodeBodyElement<typeof NodeTypeInWords.inputTypes> {
  static readonly inputTypes = {} as const;
  readonly #words = document.createElement("output");

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#words.value = NODE_TYPE;
    shadow.append(this.#words);
  }

  set node({ surface }: DrawnNode<typeof NodeTypeInWords.inputTypes>) {
    this.#words.dataset["surface"] = surface;
  }

  set inputs(inputs: NodeBodyInputs<typeof NodeTypeInWords.inputTypes>) {
    this.#words.dataset["inputs"] = String(Object.keys(inputs).length);
  }
}
