// The body of each stage of the mock's large graph, which the canvas measurements mount 300 of: one
// line of words, drawing no input.

import type { DrawnNode, NodeBodyElement, NodeBodyInputs } from "@tatolab/tato-app-view-sdk/node_ui";

/** One line naming the stage's node type. */
export default class LargeGraphStageBody extends HTMLElement implements NodeBodyElement<typeof LargeGraphStageBody.inputTypes> {
  static readonly inputTypes = {} as const;

  set node(node: DrawnNode<typeof LargeGraphStageBody.inputTypes>) {
    this.textContent = node.node_type;
  }

  set inputs(_inputs: NodeBodyInputs<typeof LargeGraphStageBody.inputTypes>) {}
}
