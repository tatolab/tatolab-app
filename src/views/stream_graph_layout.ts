import type {
  StreamGraphExposedPort,
  StreamGraphLink,
  StreamGraphSummary,
} from "../backend/tatolab_backend_contract";

export const GRAPH_NODE_HEIGHT = 30;
export const GRAPH_NODE_HORIZONTAL_PADDING = 12;
export const GRAPH_NODE_STATE_DOT_RADIUS = 3;
export const GRAPH_NODE_DOT_TO_NAME_GAP = 8;
/** Must match `.stream-graph-node-name`'s font size in stream_graph.css: pills are sized from it. */
const GRAPH_NODE_NAME_FONT_SIZE = 11;
export const GRAPH_EXPOSED_PORT_MARK_WIDTH = 18;
const NARROWEST_GRAPH_COLUMN_GAP = 24;
const USUAL_GRAPH_COLUMN_GAP = 44;
const WIDEST_GRAPH_COLUMN_GAP = 64;
const GRAPH_ROW_GAP = 12;
const GRAPH_PADDING = 18;
/** JetBrains Mono advances every glyph 600 units of its 1000-unit em. */
const MONOSPACE_ADVANCE_PER_FONT_SIZE = 0.6;
const CROSSING_REDUCTION_SWEEPS = 4;

/** A node placed in its column, with the pill's top-left corner and width. */
export interface StreamGraphLayoutNode {
  name: string;
  processorClassImportPath: string | null;
  state: string | null;
  /** False for a link's source in another stream on this machine. */
  isInThisStream: boolean;
  exposedPorts: StreamGraphExposedPort[];
  column: number;
  x: number;
  y: number;
  width: number;
}

/** A link drawn as a curve from its source pill's right edge to its target pill's left edge. */
export interface StreamGraphLayoutLink {
  link: StreamGraphLink;
  pathData: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** A whole graph laid out, and the size of the drawing it needs. */
export interface StreamGraphLayout {
  nodes: StreamGraphLayoutNode[];
  links: StreamGraphLayoutLink[];
  width: number;
  height: number;
}

function measureNodeWidth(nodeName: string, hasExposedPorts: boolean): number {
  const nameWidth = nodeName.length * GRAPH_NODE_NAME_FONT_SIZE * MONOSPACE_ADVANCE_PER_FONT_SIZE;
  return Math.ceil(
    GRAPH_NODE_HORIZONTAL_PADDING * 2 +
      GRAPH_NODE_STATE_DOT_RADIUS * 2 +
      GRAPH_NODE_DOT_TO_NAME_GAP +
      nameWidth +
      (hasExposedPorts ? GRAPH_EXPOSED_PORT_MARK_WIDTH : 0),
  );
}

/** Each node's column: one past its furthest upstream node, so every link runs left to right. */
function assignColumns(nodeNames: string[], upstreamNamesByNode: Map<string, string[]>): Map<string, number> {
  const columnByNode = new Map<string, number>();
  const nodesBeingPlaced = new Set<string>();
  const columnOf = (nodeName: string): number => {
    const placedColumn = columnByNode.get(nodeName);
    if (placedColumn !== undefined) return placedColumn;
    // A link back into a node still being placed closes a cycle; it does not push the node right.
    if (nodesBeingPlaced.has(nodeName)) return -1;
    nodesBeingPlaced.add(nodeName);
    let column = 0;
    for (const upstreamName of upstreamNamesByNode.get(nodeName) ?? []) {
      column = Math.max(column, columnOf(upstreamName) + 1);
    }
    nodesBeingPlaced.delete(nodeName);
    columnByNode.set(nodeName, column);
    return column;
  };
  for (const nodeName of nodeNames) columnOf(nodeName);
  return columnByNode;
}

function averagePosition(neighbourNames: string[], rowByNode: Map<string, number>): number | null {
  const neighbourRows = neighbourNames
    .map((neighbourName) => rowByNode.get(neighbourName))
    .filter((row): row is number => row !== undefined);
  if (neighbourRows.length === 0) return null;
  return neighbourRows.reduce((sum, row) => sum + row, 0) / neighbourRows.length;
}

/** Orders each column by its neighbours' average row, sweeping both ways to untangle crossings. */
function orderColumnsToReduceCrossings(
  columns: string[][],
  upstreamNamesByNode: Map<string, string[]>,
  downstreamNamesByNode: Map<string, string[]>,
): void {
  const rowByNode = new Map<string, number>();
  const recordRows = (column: string[]) => column.forEach((nodeName, row) => rowByNode.set(nodeName, row));
  columns.forEach(recordRows);
  const reorderColumn = (column: string[], neighboursOf: (nodeName: string) => string[]) => {
    const keyed = column.map((nodeName, currentRow) => ({
      nodeName,
      sortKey: averagePosition(neighboursOf(nodeName), rowByNode) ?? currentRow,
    }));
    keyed.sort((first, second) => first.sortKey - second.sortKey);
    column.splice(0, column.length, ...keyed.map((entry) => entry.nodeName));
    recordRows(column);
  };
  for (let sweep = 0; sweep < CROSSING_REDUCTION_SWEEPS; sweep++) {
    if (sweep % 2 === 0) {
      for (let columnIndex = 1; columnIndex < columns.length; columnIndex++) {
        reorderColumn(columns[columnIndex], (nodeName) => upstreamNamesByNode.get(nodeName) ?? []);
      }
    } else {
      for (let columnIndex = columns.length - 2; columnIndex >= 0; columnIndex--) {
        reorderColumn(columns[columnIndex], (nodeName) => downstreamNamesByNode.get(nodeName) ?? []);
      }
    }
  }
}

function linkPathData(startX: number, startY: number, endX: number, endY: number): string {
  const horizontalReach = Math.max(28, Math.abs(endX - startX) * 0.5);
  return `M${startX} ${startY} C${startX + horizontalReach} ${startY} ${endX - horizontalReach} ${endY} ${endX} ${endY}`;
}

/** The gap between columns that fills `availableWidth`, within the narrowest and widest gaps. */
function chooseColumnGap(availableWidth: number | null, columnWidths: number[]): number {
  if (availableWidth === null || columnWidths.length < 2) return USUAL_GRAPH_COLUMN_GAP;
  const widthLeftForGaps = availableWidth - GRAPH_PADDING * 2 - columnWidths.reduce((sum, width) => sum + width, 0);
  const fillingGap = widthLeftForGaps / (columnWidths.length - 1);
  return Math.floor(Math.min(WIDEST_GRAPH_COLUMN_GAP, Math.max(NARROWEST_GRAPH_COLUMN_GAP, fillingGap)));
}

/**
 * Lays a stream's graph out left to right in columns, sized for the node pills the graph view draws, with the
 * column gaps fitted to `availableWidth` when it is known.
 */
export function layOutStreamGraph(graphSummary: StreamGraphSummary, availableWidth: number | null): StreamGraphLayout {
  const nodeNames = graphSummary.nodes.map((node) => node.name);
  const knownNodeNames = new Set(nodeNames);
  const nodesOutsideThisStream: string[] = [];
  for (const link of graphSummary.links) {
    for (const endpointName of [link.source_node, link.target_node]) {
      if (knownNodeNames.has(endpointName)) continue;
      knownNodeNames.add(endpointName);
      nodesOutsideThisStream.push(endpointName);
    }
  }
  const everyNodeName = [...nodeNames, ...nodesOutsideThisStream];

  const upstreamNamesByNode = new Map<string, string[]>();
  const downstreamNamesByNode = new Map<string, string[]>();
  for (const link of graphSummary.links) {
    upstreamNamesByNode.set(link.target_node, [...(upstreamNamesByNode.get(link.target_node) ?? []), link.source_node]);
    downstreamNamesByNode.set(link.source_node, [
      ...(downstreamNamesByNode.get(link.source_node) ?? []),
      link.target_node,
    ]);
  }

  const columnByNode = assignColumns(everyNodeName, upstreamNamesByNode);
  const columnCount = Math.max(0, ...columnByNode.values()) + 1;
  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  for (const nodeName of everyNodeName) columns[columnByNode.get(nodeName) ?? 0].push(nodeName);
  orderColumnsToReduceCrossings(columns, upstreamNamesByNode, downstreamNamesByNode);

  const summaryNodeByName = new Map(graphSummary.nodes.map((node) => [node.name, node]));
  const exposedPortsByNode = new Map<string, StreamGraphExposedPort[]>();
  for (const exposedPort of graphSummary.exposed) {
    exposedPortsByNode.set(exposedPort.node, [...(exposedPortsByNode.get(exposedPort.node) ?? []), exposedPort]);
  }
  const widthByNode = new Map(
    everyNodeName.map((nodeName) => [nodeName, measureNodeWidth(nodeName, exposedPortsByNode.has(nodeName))]),
  );
  const columnWidths = columns.map((column) => Math.max(0, ...column.map((nodeName) => widthByNode.get(nodeName) ?? 0)));
  const columnHeights = columns.map(
    (column) => column.length * GRAPH_NODE_HEIGHT + Math.max(0, column.length - 1) * GRAPH_ROW_GAP,
  );
  const innerHeight = Math.max(GRAPH_NODE_HEIGHT, ...columnHeights);
  const columnGap = chooseColumnGap(availableWidth, columnWidths);

  const layoutNodes: StreamGraphLayoutNode[] = [];
  const layoutNodeByName = new Map<string, StreamGraphLayoutNode>();
  let columnLeft = GRAPH_PADDING;
  columns.forEach((column, columnIndex) => {
    const columnTop = GRAPH_PADDING + (innerHeight - columnHeights[columnIndex]) / 2;
    column.forEach((nodeName, rowIndex) => {
      const summaryNode = summaryNodeByName.get(nodeName);
      const nodeWidth = widthByNode.get(nodeName) ?? 0;
      const layoutNode: StreamGraphLayoutNode = {
        name: nodeName,
        processorClassImportPath: summaryNode?.type ?? null,
        state: summaryNode?.state ?? null,
        isInThisStream: summaryNode !== undefined,
        exposedPorts: exposedPortsByNode.get(nodeName) ?? [],
        column: columnIndex,
        x: columnLeft + (columnWidths[columnIndex] - nodeWidth) / 2,
        y: columnTop + rowIndex * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP),
        width: nodeWidth,
      };
      layoutNodes.push(layoutNode);
      layoutNodeByName.set(nodeName, layoutNode);
    });
    columnLeft += columnWidths[columnIndex] + columnGap;
  });

  const layoutLinks: StreamGraphLayoutLink[] = [];
  for (const link of graphSummary.links) {
    const sourceNode = layoutNodeByName.get(link.source_node);
    const targetNode = layoutNodeByName.get(link.target_node);
    if (!sourceNode || !targetNode) continue;
    const startX = sourceNode.x + sourceNode.width;
    const startY = sourceNode.y + GRAPH_NODE_HEIGHT / 2;
    const endX = targetNode.x;
    const endY = targetNode.y + GRAPH_NODE_HEIGHT / 2;
    layoutLinks.push({ link, pathData: linkPathData(startX, startY, endX, endY), startX, startY, endX, endY });
  }

  const contentWidth = columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columnCount - 1) * columnGap;
  return {
    nodes: layoutNodes,
    links: layoutLinks,
    width: Math.ceil(contentWidth + GRAPH_PADDING * 2),
    height: Math.ceil(innerHeight + GRAPH_PADDING * 2),
  };
}
