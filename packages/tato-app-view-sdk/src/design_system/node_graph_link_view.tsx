import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { cn } from "cn";
import type { NodeGraphLinkFlowEdge } from "./support/node_graph_flow_elements";

/** A link on the canvas, drawn in the colour of the pin it starts from and in its look. */
export function NodeGraphLinkView({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<NodeGraphLinkFlowEdge>) {
  const [linkPath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  });
  if (data === undefined) return null;
  const { look, description } = data.graphLink;
  return (
    <g
      data-node-graph-link={data.graphLink.link_id}
      data-look={look}
      data-pin-type={data.pin_type_key}
      data-selected={selected || undefined}
    >
      <title>{description}</title>
      <BaseEdge
        id={id}
        path={linkPath}
        interactionWidth={14}
        className={cn("node-graph-link", `node-graph-link-${look}`, selected === true && "node-graph-link-selected")}
      />
    </g>
  );
}
