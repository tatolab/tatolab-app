import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { cn } from "cn";
import { useContext } from "react";
import { NodeGraphWireRoutesContext, type NodeGraphLinkFlowEdge } from "./support/node_graph_flow_elements";
import { nodeGraphWirePath, type NodeGraphWireRoute } from "./support/node_graph_wire_routing";

/** Whether `route` runs between the two ends React Flow draws the link at now, so it is not a route laid before a card moved. */
function runsBetween(route: NodeGraphWireRoute, sourceX: number, sourceY: number, targetX: number, targetY: number): boolean {
  const first = route[0];
  const last = route.at(-1);
  const isAt = (point: { x: number; y: number } | undefined, x: number, y: number) => point !== undefined && Math.abs(point.x - x) < 0.5 && Math.abs(point.y - y) < 0.5;
  return isAt(first, sourceX, sourceY) && isAt(last, targetX, targetY);
}

/**
 * A link on the canvas, drawn in the colour of the pin it starts from and in its look, amber while the runtime warns of
 * it. It runs along its route around the cards in its way, or as a curve while it has none, as when a card it joins is
 * dragged or a card covers one of its pins.
 */
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
  const route = useContext(NodeGraphWireRoutesContext).get(id);
  if (data === undefined) return null;
  const isRouted = route !== undefined && runsBetween(route, sourceX, sourceY, targetX, targetY);
  const linkPath = isRouted
    ? nodeGraphWirePath(route)
    : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.4 })[0];
  const { look, description, warning_words: warningWords } = data.graphLink;
  return (
    <g
      data-node-graph-link={data.graphLink.link_id}
      data-look={look}
      data-pin-type={data.pin_type_key}
      data-routed={isRouted || undefined}
      data-selected={selected || undefined}
      data-warned={warningWords.length > 0 || undefined}
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
