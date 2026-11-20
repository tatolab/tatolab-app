import { useStore, type ReactFlowState } from "@xyflow/react";
import { Effect, Fiber } from "effect";
import { useEffect, useState } from "react";
import { layNodeGraphWireRoutes, type NodeGraphWireEnds, type NodeGraphWireObstacle, type NodeGraphWireRoute } from "./node_graph_wire_routing";

/** What the routes are laid around: every card and note standing still, and every wire between two of them, its ends where React Flow draws them. */
interface WireRoutingScene {
  obstacles: readonly NodeGraphWireObstacle[];
  wires: readonly NodeGraphWireEnds[];
}

/** The scene as React Flow holds it now. A dragged card is left out, with its wires, so the routes hold still while it moves and are laid again once it is let go. */
function wireRoutingSceneOf(state: ReactFlowState): WireRoutingScene {
  const obstacles: NodeGraphWireObstacle[] = [];
  const standingIds = new Set<string>();
  for (const [id, flowNode] of state.nodeLookup) {
    const { width, height } = flowNode.measured;
    if (flowNode.type === "node_graph_frame" || flowNode.dragging === true || width === undefined || height === undefined) continue;
    const { x, y } = flowNode.internals.positionAbsolute;
    obstacles.push({ x, y, width, height });
    standingIds.add(id);
  }
  const wires: NodeGraphWireEnds[] = [];
  for (const edge of state.edges) {
    if (!standingIds.has(edge.source) || !standingIds.has(edge.target)) continue;
    const source = state.nodeLookup.get(edge.source);
    const target = state.nodeLookup.get(edge.target);
    const sourceSocket = source?.internals.handleBounds?.source?.find((handle) => handle.id === edge.sourceHandle);
    const targetSocket = target?.internals.handleBounds?.target?.find((handle) => handle.id === edge.targetHandle);
    if (source === undefined || target === undefined || sourceSocket === undefined || targetSocket === undefined) continue;
    // Where React Flow puts the end of a link on a socket at a card's right or left edge.
    wires.push({
      wire_id: edge.id,
      from: { x: source.internals.positionAbsolute.x + sourceSocket.x + sourceSocket.width, y: source.internals.positionAbsolute.y + sourceSocket.y + sourceSocket.height / 2 },
      to: { x: target.internals.positionAbsolute.x + targetSocket.x, y: target.internals.positionAbsolute.y + targetSocket.y + targetSocket.height / 2 },
    });
  }
  return { obstacles, wires };
}

const sameObstacle = (first: NodeGraphWireObstacle, second: NodeGraphWireObstacle | undefined) =>
  second !== undefined && first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height;

const sameWire = (first: NodeGraphWireEnds, second: NodeGraphWireEnds | undefined) =>
  second !== undefined && first.wire_id === second.wire_id && first.from.x === second.from.x && first.from.y === second.from.y && first.to.x === second.to.x && first.to.y === second.to.y;

/** Whether two scenes lay the same routes, so a pan, a zoom or a selection lays none again. */
function sameWireRoutingScene(first: WireRoutingScene, second: WireRoutingScene): boolean {
  return (
    first.obstacles.length === second.obstacles.length &&
    first.wires.length === second.wires.length &&
    first.obstacles.every((obstacle, index) => sameObstacle(obstacle, second.obstacles[index])) &&
    first.wires.every((wire, index) => sameWire(wire, second.wires[index]))
  );
}

/**
 * Each wire's route around the canvas's cards and notes, by link id, laid again in the background whenever a card, a
 * note or a wire's end moves. The routes laid before stay meanwhile; a link draws one only while its ends are still
 * where the route meets them.
 */
export function useNodeGraphWireRoutes(): ReadonlyMap<string, NodeGraphWireRoute> {
  const scene = useStore(wireRoutingSceneOf, sameWireRoutingScene);
  const [routes, setRoutes] = useState<ReadonlyMap<string, NodeGraphWireRoute>>(new Map());
  useEffect(() => {
    const laying = Effect.runFork(Effect.tap(layNodeGraphWireRoutes(scene.obstacles, scene.wires), (laid) => Effect.sync(() => setRoutes(laid))));
    return () => {
      Effect.runFork(Fiber.interrupt(laying));
    };
  }, [scene]);
  return routes;
}
