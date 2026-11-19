import { useCallback, useRef, useState } from "react";
import type { Connection, FinalConnectionState, OnConnectStartParams } from "@xyflow/react";
import { nodeGraphPinKey, type NodeGraphCanvasDraggedPin, type NodeGraphCanvasEditing, type NodeGraphCanvasPoint, type NodeGraphWireFits } from "./node_graph_canvas_contract";
import type { NodeGraphLinkFlowEdge } from "./node_graph_flow_elements";

/** A pin's name and side from the handle id React Flow reports. */
function pinOfAHandleId(handleId: string | null | undefined): { side: "input" | "output"; pin: string } | null {
  if (handleId === null || handleId === undefined) return null;
  if (handleId.startsWith("input:")) return { side: "input", pin: handleId.slice("input:".length) };
  if (handleId.startsWith("output:")) return { side: "output", pin: handleId.slice("output:".length) };
  return null;
}

/**
 * The wiring of a card's pins by a drag on the canvas: how the wire being dragged fits each pin, as the editing's answer gives
 * it, whether a connection can be wired, its wiring, and a wire let go over the canvas. The fits change twice a drag at most,
 * when the answer arrives and when the wire is let go, so the sockets that show them are drawn again only then.
 */
export function useNodeGraphWiring(editing: NodeGraphCanvasEditing | null, canvasPointOf: (clientPoint: { x: number; y: number }) => NodeGraphCanvasPoint) {
  const [wireFits, setWireFits] = useState<NodeGraphWireFits | null>(null);
  const pinDraggedOff = useRef<NodeGraphCanvasDraggedPin | null>(null);
  const askHowTheWireFits = useCallback(
    (_event: MouseEvent | TouchEvent, { nodeId, handleId }: OnConnectStartParams) => {
      const pin = pinOfAHandleId(handleId);
      const draggedOff = editing === null || nodeId === null || pin === null ? null : { node_id: nodeId, ...pin };
      pinDraggedOff.current = draggedOff;
      if (editing === null || draggedOff === null) return;
      void editing.fitsOfAWireFrom(draggedOff).then((fits) => {
        if (pinDraggedOff.current === draggedOff) setWireFits(fits);
      });
    },
    [editing],
  );
  const canTheConnectionBeWired = useCallback(
    (connection: Connection | NodeGraphLinkFlowEdge) => {
      const source = pinOfAHandleId(connection.sourceHandle);
      const target = pinOfAHandleId(connection.targetHandle);
      if (source?.side !== "output" || target?.side !== "input") return false;
      const draggedOff = pinDraggedOff.current;
      const farEnd = draggedOff?.side === "input" ? { node_id: connection.source, ...source } : { node_id: connection.target, ...target };
      return wireFits?.get(nodeGraphPinKey(farEnd.node_id, farEnd.side, farEnd.pin))?.outcome !== "refused";
    },
    [wireFits],
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
      pinDraggedOff.current = null;
      setWireFits(null);
      if (editing === null || connectionState.isValid === true || connectionState.toNode !== null || connectionState.fromHandle === null) return;
      const pin = pinOfAHandleId(connectionState.fromHandle.id);
      if (pin === null) return;
      const clientPoint = "changedTouches" in event ? event.changedTouches[0] : event;
      if (clientPoint === undefined) return;
      editing.onWireLetGoOverTheCanvas(
        { node_id: connectionState.fromHandle.nodeId, ...pin },
        canvasPointOf({ x: clientPoint.clientX, y: clientPoint.clientY }),
      );
    },
    [editing, canvasPointOf],
  );
  return { wireFits, askHowTheWireFits, canTheConnectionBeWired, wireThePins, followTheWireLetGo };
}
