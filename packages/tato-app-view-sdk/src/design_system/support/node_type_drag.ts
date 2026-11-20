// A node type carried by a drag, from a list of node types to a stream graph's canvas, which
// places a node of it where the drag is let go. Each view is a frame of its own on the window's
// origin, so the drag carries the type as data under a media type of its own.

/** The media type a drag carries a node type under, as `<module>:<qualname>`. */
const NODE_TYPE_DRAG_MEDIA_TYPE = "application/x-tatolab-node-type";

/** Put `nodeType` on the drag `dataTransfer` starts, to be copied as a placed node where it is let go. */
export function putTheNodeTypeOnTheDrag(dataTransfer: DataTransfer, nodeType: string): void {
  dataTransfer.setData(NODE_TYPE_DRAG_MEDIA_TYPE, nodeType);
  dataTransfer.effectAllowed = "copy";
}

/** Whether the drag `dataTransfer` carries a node type; readable while it is held over, before it is let go. */
export function theDragCarriesANodeType(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(NODE_TYPE_DRAG_MEDIA_TYPE);
}

/** The node type the drag `dataTransfer` carries, once let go; `null` for a drag carrying none. */
export function theNodeTypeTheDragCarries(dataTransfer: DataTransfer): string | null {
  const nodeType = dataTransfer.getData(NODE_TYPE_DRAG_MEDIA_TYPE);
  return nodeType === "" ? null : nodeType;
}
