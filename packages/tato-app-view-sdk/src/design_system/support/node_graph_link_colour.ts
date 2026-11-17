import { pinTypeKey, type PinTypeKey } from "../../pin_model/pin_type_words";
import type { NodeGraphCanvasLink, NodeGraphCanvasNode } from "./node_graph_canvas_contract";

/** The type key a link is coloured by: its source output pin's, `untyped` where that pin has no exact type or is not drawn. */
export function pinTypeKeyOfTheLink(graphLink: Pick<NodeGraphCanvasLink, "source_node_id" | "source_pin">, nodeById: ReadonlyMap<string, Pick<NodeGraphCanvasNode, "outputs">>): PinTypeKey {
  return pinTypeKey(nodeById.get(graphLink.source_node_id)?.outputs.find((pin) => pin.name === graphLink.source_pin)?.pin ?? null);
}
