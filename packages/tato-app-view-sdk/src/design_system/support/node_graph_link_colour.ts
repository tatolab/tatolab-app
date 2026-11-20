import { pinTypeKey, type PinTypeKey } from "../../pin_model/pin_type_words";
import type { NodeGraphCanvasLink, NodeGraphCanvasNode } from "./node_graph_canvas_contract";

/** The type key a link is coloured by: its source output pin's, or the member's it starts at, `untyped` where that pin has no exact type or is not drawn. */
export function pinTypeKeyOfTheLink(graphLink: Pick<NodeGraphCanvasLink, "source_node_id" | "source_pin" | "source_member">, nodeById: ReadonlyMap<string, Pick<NodeGraphCanvasNode, "outputs">>): PinTypeKey {
  const sourcePin = nodeById.get(graphLink.source_node_id)?.outputs.find((pin) => pin.name === graphLink.source_pin);
  const source = graphLink.source_member === null ? sourcePin : sourcePin?.bundle?.members.find((member) => member.member === graphLink.source_member);
  return pinTypeKey(source?.pin ?? null);
}
