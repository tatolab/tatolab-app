import { useCallback } from "react";
import type { Connection, FinalConnectionState } from "@xyflow/react";
import { canPinsOfTheseFamiliesBeWired } from "./node_graph_editing";
import type { PortFamily } from "../../port_families";
import type { NodeGraphCanvasEditing, NodeGraphCanvasNode, NodeGraphCanvasPoint } from "./node_graph_canvas_contract";
import type { NodeGraphLinkFlowEdge } from "./node_graph_flow_elements";

/** A pin's name and side from the handle id React Flow reports. */
function pinOfAHandleId(handleId: string | null | undefined): { side: "input" | "output"; pin: string } | null {
  if (handleId === null || handleId === undefined) return null;
  if (handleId.startsWith("input:")) return { side: "input", pin: handleId.slice("input:".length) };
  if (handleId.startsWith("output:")) return { side: "output", pin: handleId.slice("output:".length) };
  return null;
}

/** The wiring of a card's pins by a drag on the canvas: whether a connection can be wired, its wiring, and a wire let go over the canvas. */
export function useNodeGraphWiring(nodeById: ReadonlyMap<string, NodeGraphCanvasNode>, editing: NodeGraphCanvasEditing | null, canvasPointOf: (clientPoint: { x: number; y: number }) => NodeGraphCanvasPoint) {
  const pinFamilyOf = useCallback(
    (nodeId: string, side: "input" | "output", pinName: string): PortFamily | null => {
      const graphNode = nodeById.get(nodeId);
      return (side === "input" ? graphNode?.inputs : graphNode?.outputs)?.find((pin) => pin.name === pinName)?.family ?? null;
    },
    [nodeById],
  );
  const canTheConnectionBeWired = useCallback(
    (connection: Connection | NodeGraphLinkFlowEdge) => {
      const source = pinOfAHandleId(connection.sourceHandle);
      const target = pinOfAHandleId(connection.targetHandle);
      if (source?.side !== "output" || target?.side !== "input") return false;
      return canPinsOfTheseFamiliesBeWired(pinFamilyOf(connection.source, "output", source.pin), pinFamilyOf(connection.target, "input", target.pin));
    },
    [pinFamilyOf],
  );
  const wireThePins = useCallback(
    (connection: Connection) => {
      const source = pinOfAHandleId(connection.sourceHandle);
      const target = pinOfAHandleId(connection.targetHandle);
      if (editing === null || source === null || target === null) return;
      editing.onPinsWired({ node_id: connection.source, pin: source.pin }, { node_id: connection.target, pin: target.pin });
    },
    [editing],
  );
  const followTheWireLetGo = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (editing === null || connectionState.isValid === true || connectionState.toNode !== null || connectionState.fromHandle === null) return;
      const pin = pinOfAHandleId(connectionState.fromHandle.id);
      if (pin === null) return;
      const clientPoint = "changedTouches" in event ? event.changedTouches[0] : event;
      if (clientPoint === undefined) return;
      editing.onWireLetGoOverTheCanvas(
        { node_id: connectionState.fromHandle.nodeId, pin: pin.pin, side: pin.side, family: pinFamilyOf(connectionState.fromHandle.nodeId, pin.side, pin.pin) },
        canvasPointOf({ x: clientPoint.clientX, y: clientPoint.clientY }),
      );
    },
    [editing, pinFamilyOf, canvasPointOf],
  );
  return { canTheConnectionBeWired, wireThePins, followTheWireLetGo };
}
