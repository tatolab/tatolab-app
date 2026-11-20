import { cn } from "cn";
import { memo, useContext, useLayoutEffect, useRef, useState } from "react";
import { areTheSameNodeOfABody, type NodeOfABody } from "../pin_model/controlled_inputs";
import type { NodeBodyBinding, NodeBodyShown } from "../pin_services/node_body_binding";
import { InputControlBinderContext } from "./input_control_mount";

/** Stops a key at the body, so a focused body owns the keyboard and no shortcut of the canvas around it acts on the key. */
function keptByTheBody(keyEvent: KeyboardEvent): void {
  keyEvent.stopPropagation();
}

interface NodeBodyMountProps {
  node: NodeOfABody;
  readOnly: boolean;
}

/**
 * The slot a card's node body is drawn in, above its rows, bound through the frame's binder in a layout effect; it is hidden while
 * the body loads and where the node type registers none or its body does not pass its checks, so the card shows its rows alone. It
 * carries `nodrag nopan`, so a drag inside the body moves neither the card nor the canvas.
 */
export const NodeBodyMount = memo(function NodeBodyMount({ node, readOnly }: NodeBodyMountProps) {
  const binder = useContext(InputControlBinderContext);
  const [shown, setShown] = useState<NodeBodyShown>("pending");
  const hostElement = useRef<HTMLDivElement>(null);
  const binding = useRef<NodeBodyBinding | null>(null);
  const latest = useRef({ node, readOnly });
  useLayoutEffect(() => {
    latest.current = { node, readOnly };
  });
  useLayoutEffect(() => {
    const host = hostElement.current;
    if (binder === null || host === null) return;
    host.addEventListener("keydown", keptByTheBody);
    const bound = binder.bindNodeBody(host, latest.current.node, latest.current.readOnly, setShown);
    binding.current = bound;
    return () => {
      binding.current = null;
      bound.unbind();
      host.removeEventListener("keydown", keptByTheBody);
    };
  }, [binder]);
  useLayoutEffect(() => {
    binding.current?.update(node, readOnly);
  }, [node, readOnly]);
  const isHidden = binder === null || shown === "pending" || shown === "no_body";
  return <div ref={hostElement} className={cn("node-graph-card-body nodrag nopan px-2 pt-1.5", isHidden && "hidden")} data-node-graph-card-body={node.node_type} data-node-body-shows={shown} />;
}, haveTheSameNodeAndPlace);

/** Whether a body is told the same node at the same place, so a new reading's equal node draws it again for nothing. */
function haveTheSameNodeAndPlace(before: NodeBodyMountProps, after: NodeBodyMountProps): boolean {
  return before.readOnly === after.readOnly && areTheSameNodeOfABody(before.node, after.node);
}
