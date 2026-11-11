/** What of React Flow's store decides whether any of the graph lies outside the canvas element. */
export type NodeGraphPlacesInTheView = {
  transform: readonly [number, number, number];
  width: number;
  height: number;
  nodeLookup: {
    values(): Iterable<{
      hidden?: boolean;
      internals: { positionAbsolute: { x: number; y: number } };
      measured: { width?: number; height?: number };
    }>;
  };
};

/** Whether a card, note or frame lies even partly outside the canvas element, the only time the map shows something the view does not; while the whole graph is in view the map would only cover a pin. */
export function isPartOfTheGraphOutsideTheView(placesInTheView: NodeGraphPlacesInTheView): boolean {
  const [panX, panY, zoom] = placesInTheView.transform;
  for (const flowNode of placesInTheView.nodeLookup.values()) {
    if (flowNode.hidden === true) continue;
    const left = flowNode.internals.positionAbsolute.x * zoom + panX;
    const top = flowNode.internals.positionAbsolute.y * zoom + panY;
    const right = left + (flowNode.measured.width ?? 0) * zoom;
    const bottom = top + (flowNode.measured.height ?? 0) * zoom;
    if (left < 0 || top < 0 || right > placesInTheView.width || bottom > placesInTheView.height) return true;
  }
  return false;
}
