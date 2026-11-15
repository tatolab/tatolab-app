import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { NodeGraphPortPicking } from "./node_graph_canvas_contract";

/** The picking of a card's port for a wire the canvas holds: the card asking which of its ports, Escape ending the pick, and the pick of a card. */
export function useNodeGraphPortPicking(portPicking: NodeGraphPortPicking | null, canvasElement: RefObject<HTMLDivElement | null>) {
  const [nodeAskingWhichPort, setNodeAskingWhichPort] = useState<string | null>(null);
  const portPickingOfTheCards = useMemo(
    () =>
      portPicking === null
        ? null
        : {
            portsThatCanJoinByNodeId: portPicking.portsThatCanJoinByNodeId,
            nodeAskingWhichPort,
            onPortChosen: (nodeId: string, port: string) => {
              setNodeAskingWhichPort(null);
              portPicking.onPicked(nodeId, port);
            },
            onAskWhichClosed: () => setNodeAskingWhichPort(null),
          },
    [portPicking, nodeAskingWhichPort],
  );
  useEffect(() => {
    if (portPicking === null) {
      setNodeAskingWhichPort(null);
      return;
    }
    const ownerDocument = canvasElement.current?.ownerDocument ?? document;
    const endThePickOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || nodeAskingWhichPort !== null) return;
      event.preventDefault();
      portPicking.onEnded();
    };
    ownerDocument.addEventListener("keydown", endThePickOnEscape);
    return () => ownerDocument.removeEventListener("keydown", endThePickOnEscape);
  }, [portPicking, nodeAskingWhichPort, canvasElement]);
  const pickTheCard = (nodeId: string) => {
    const portsThatCanJoin = portPicking?.portsThatCanJoinByNodeId.get(nodeId);
    if (portPicking === null || portsThatCanJoin === undefined) return;
    const [onlyPort] = portsThatCanJoin;
    if (portsThatCanJoin.length === 1 && onlyPort !== undefined) portPicking.onPicked(nodeId, onlyPort);
    else setNodeAskingWhichPort(nodeId);
  };
  const closeTheAskWhichPort = useCallback(() => setNodeAskingWhichPort(null), []);
  return { portPickingOfTheCards, closeTheAskWhichPort, pickTheCard };
}
