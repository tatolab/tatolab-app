// Where each node of a graph sits when the graph carries no positions of its own: left to right in
// columns, each node one column past the furthest node feeding it, each column ordered to untangle
// crossings and packed so a node's first input lines up with the outputs that feed it.

/** A node card's header, over its pin rows. */
export const NODE_GRAPH_CARD_HEADER_HEIGHT = 26;
/** One row of pins: an input on the left and an output on the right. */
export const NODE_GRAPH_PIN_ROW_HEIGHT = 20;
/** The space above the first pin row and below the last. */
export const NODE_GRAPH_CARD_PIN_ROWS_PADDING = 6;
/** The band under a failed card's pin rows that holds why it failed, two lines at most. */
export const NODE_GRAPH_CARD_FAILURE_WORDS_HEIGHT = 44;
const NODE_GRAPH_COLUMN_GAP = 72;
const NODE_GRAPH_ROW_GAP = 28;
const CROSSING_REDUCTION_SWEEPS = 4;

/** What the layout reads of one node: its id, how many pins each side, whether its card shows why it failed, and its card's width as drawn. */
export interface NodeGraphLayoutNode {
  node_id: string;
  input_pin_names: readonly string[];
  output_pin_names: readonly string[];
  shows_failure_words: boolean;
  card_width: number;
}

/** What the layout reads of one link. */
export interface NodeGraphLayoutLink {
  source_node_id: string;
  source_pin: string;
  target_node_id: string;
  target_pin: string;
}

/** Where a card's top-left corner sits. */
export interface NodeGraphPosition {
  x: number;
  y: number;
}

/** A card's height: its header, then a row per pin on its busier side, then why it failed when it shows that. */
export function nodeGraphCardHeight(node: Pick<NodeGraphLayoutNode, "input_pin_names" | "output_pin_names" | "shows_failure_words">): number {
  const pinRowCount = Math.max(node.input_pin_names.length, node.output_pin_names.length);
  return (
    NODE_GRAPH_CARD_HEADER_HEIGHT +
    NODE_GRAPH_CARD_PIN_ROWS_PADDING * 2 +
    pinRowCount * NODE_GRAPH_PIN_ROW_HEIGHT +
    (node.shows_failure_words ? NODE_GRAPH_CARD_FAILURE_WORDS_HEIGHT : 0)
  );
}

/** How far below a card's top the centre of its pin row `rowIndex` sits. */
export function nodeGraphPinRowCentreOffset(rowIndex: number): number {
  return NODE_GRAPH_CARD_HEADER_HEIGHT + NODE_GRAPH_CARD_PIN_ROWS_PADDING + rowIndex * NODE_GRAPH_PIN_ROW_HEIGHT + NODE_GRAPH_PIN_ROW_HEIGHT / 2;
}

/** Each node's column: one past its furthest upstream node, so every link runs left to right. */
function assignColumns(nodeIds: readonly string[], upstreamIdsByNode: Map<string, string[]>): Map<string, number> {
  const columnByNode = new Map<string, number>();
  const nodesBeingPlaced = new Set<string>();
  const columnOf = (nodeId: string): number => {
    const placedColumn = columnByNode.get(nodeId);
    if (placedColumn !== undefined) return placedColumn;
    // A link back into a node still being placed closes a cycle; it does not push the node right.
    if (nodesBeingPlaced.has(nodeId)) return -1;
    nodesBeingPlaced.add(nodeId);
    let column = 0;
    for (const upstreamId of upstreamIdsByNode.get(nodeId) ?? []) column = Math.max(column, columnOf(upstreamId) + 1);
    nodesBeingPlaced.delete(nodeId);
    columnByNode.set(nodeId, column);
    return column;
  };
  for (const nodeId of nodeIds) columnOf(nodeId);
  return columnByNode;
}

function averageRow(neighbourIds: readonly string[], rowByNode: Map<string, number>): number | null {
  const neighbourRows = neighbourIds.map((neighbourId) => rowByNode.get(neighbourId)).filter((row): row is number => row !== undefined);
  if (neighbourRows.length === 0) return null;
  return neighbourRows.reduce((sum, row) => sum + row, 0) / neighbourRows.length;
}

/** Orders each column by its neighbours' average row, sweeping both ways to untangle crossings. */
function orderColumnsToReduceCrossings(columns: string[][], upstreamIdsByNode: Map<string, string[]>, downstreamIdsByNode: Map<string, string[]>): void {
  const rowByNode = new Map<string, number>();
  const recordRows = (column: string[]) => column.forEach((nodeId, row) => rowByNode.set(nodeId, row));
  columns.forEach(recordRows);
  const reorderColumn = (column: string[], neighboursOf: (nodeId: string) => string[]) => {
    const keyed = column.map((nodeId, currentRow) => ({ nodeId, sortKey: averageRow(neighboursOf(nodeId), rowByNode) ?? currentRow }));
    keyed.sort((first, second) => first.sortKey - second.sortKey);
    column.splice(0, column.length, ...keyed.map((entry) => entry.nodeId));
    recordRows(column);
  };
  for (let sweep = 0; sweep < CROSSING_REDUCTION_SWEEPS; sweep++) {
    if (sweep % 2 === 0) {
      for (let columnIndex = 1; columnIndex < columns.length; columnIndex++) reorderColumn(columns[columnIndex] ?? [], (nodeId) => upstreamIdsByNode.get(nodeId) ?? []);
    } else {
      for (let columnIndex = columns.length - 2; columnIndex >= 0; columnIndex--) reorderColumn(columns[columnIndex] ?? [], (nodeId) => downstreamIdsByNode.get(nodeId) ?? []);
    }
  }
}

/** A run of cards packed together at the row gap, placed where its members' wanted tops balance out. */
interface PackedCardRun {
  cardHeights: number[];
  wantedTops: number[];
  top: number;
}

function runHeight(run: PackedCardRun): number {
  return run.cardHeights.reduce((sum, height) => sum + height, 0) + (run.cardHeights.length - 1) * NODE_GRAPH_ROW_GAP;
}

/** The top that spreads a run's push evenly: each member as far above its wanted top as the others are below theirs. */
function balancedRunTop(run: PackedCardRun): number {
  let offsetWithinRun = 0;
  let sumOfWantedRunTops = 0;
  run.cardHeights.forEach((height, index) => {
    sumOfWantedRunTops += (run.wantedTops[index] ?? 0) - offsetWithinRun;
    offsetWithinRun += height + NODE_GRAPH_ROW_GAP;
  });
  return sumOfWantedRunTops / run.cardHeights.length;
}

/** Tops for a column's cards, in order, each as near its wanted top as the row gap allows. */
function packColumn(cardHeights: number[], wantedTops: number[]): number[] {
  const runs: PackedCardRun[] = [];
  cardHeights.forEach((height, index) => {
    let run: PackedCardRun = { cardHeights: [height], wantedTops: [wantedTops[index] ?? 0], top: wantedTops[index] ?? 0 };
    for (;;) {
      const previousRun = runs.at(-1);
      if (!previousRun || previousRun.top + runHeight(previousRun) + NODE_GRAPH_ROW_GAP <= run.top) break;
      runs.pop();
      run = { cardHeights: [...previousRun.cardHeights, ...run.cardHeights], wantedTops: [...previousRun.wantedTops, ...run.wantedTops], top: 0 };
      run.top = balancedRunTop(run);
    }
    runs.push(run);
  });
  const tops: number[] = [];
  for (const run of runs) {
    let top = run.top;
    for (const height of run.cardHeights) {
      tops.push(top);
      top += height + NODE_GRAPH_ROW_GAP;
    }
  }
  return tops;
}

/** Each node's card position from (0, 0), left to right in columns as wide as their widest card; a link to a node not in `nodes` is ignored. */
export function layOutNodeGraph(nodes: readonly NodeGraphLayoutNode[], links: readonly NodeGraphLayoutLink[]): Map<string, NodeGraphPosition> {
  const nodeById = new Map(nodes.map((node) => [node.node_id, node]));
  const linksWithinTheGraph = links.filter((link) => nodeById.has(link.source_node_id) && nodeById.has(link.target_node_id));
  const upstreamIdsByNode = new Map<string, string[]>();
  const downstreamIdsByNode = new Map<string, string[]>();
  const firstLinkIndexIntoNode = new Map<string, number>();
  linksWithinTheGraph.forEach((link, linkIndex) => {
    upstreamIdsByNode.set(link.target_node_id, [...(upstreamIdsByNode.get(link.target_node_id) ?? []), link.source_node_id]);
    downstreamIdsByNode.set(link.source_node_id, [...(downstreamIdsByNode.get(link.source_node_id) ?? []), link.target_node_id]);
    if (!firstLinkIndexIntoNode.has(link.target_node_id)) firstLinkIndexIntoNode.set(link.target_node_id, linkIndex);
  });

  const nodeIds = nodes.map((node) => node.node_id);
  const columnByNode = assignColumns(nodeIds, upstreamIdsByNode);
  const columnCount = Math.max(0, ...columnByNode.values()) + 1;
  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  // Nodes fed by the same output keep the order their links list them in.
  const nodesInLinkOrder = [...nodeIds].sort(
    (first, second) => (firstLinkIndexIntoNode.get(first) ?? Number.POSITIVE_INFINITY) - (firstLinkIndexIntoNode.get(second) ?? Number.POSITIVE_INFINITY),
  );
  for (const nodeId of nodesInLinkOrder) columns[columnByNode.get(nodeId) ?? 0]?.push(nodeId);
  orderColumnsToReduceCrossings(columns, upstreamIdsByNode, downstreamIdsByNode);

  const positionByNode = new Map<string, NodeGraphPosition>();
  const outputPinCentreY = (nodeId: string, pinName: string): number | null => {
    const node = nodeById.get(nodeId);
    const position = positionByNode.get(nodeId);
    if (node === undefined || position === undefined) return null;
    const outputIndex = node.output_pin_names.indexOf(pinName);
    return outputIndex === -1 ? null : position.y + nodeGraphPinRowCentreOffset(outputIndex);
  };
  const inputPinOffset = (node: NodeGraphLayoutNode, pinName: string): number => nodeGraphPinRowCentreOffset(Math.max(0, node.input_pin_names.indexOf(pinName)));
  let columnLeft = 0;
  columns.forEach((column, columnIndex) => {
    const columnNodes = column.flatMap((nodeId) => nodeById.get(nodeId) ?? []);
    const cardHeights = columnNodes.map(nodeGraphCardHeight);
    let wantedTops: number[];
    if (columnIndex === 0) {
      let top = -(cardHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, cardHeights.length - 1) * NODE_GRAPH_ROW_GAP) / 2;
      wantedTops = cardHeights.map((height) => {
        const cardTop = top;
        top += height + NODE_GRAPH_ROW_GAP;
        return cardTop;
      });
    } else {
      wantedTops = columnNodes.map((node) => {
        const feedingTops = linksWithinTheGraph
          .filter((link) => link.target_node_id === node.node_id)
          .map((link) => {
            const sourceY = outputPinCentreY(link.source_node_id, link.source_pin);
            return sourceY === null ? null : sourceY - inputPinOffset(node, link.target_pin);
          })
          .filter((wantedTop): wantedTop is number => wantedTop !== null);
        if (feedingTops.length === 0) return Number.NaN;
        return feedingTops.reduce((sum, wantedTop) => sum + wantedTop, 0) / feedingTops.length;
      });
      // A node fed only from a later column, closing a cycle, goes under the node before it.
      wantedTops = wantedTops.map((wantedTop, index) => (Number.isNaN(wantedTop) ? (index === 0 ? 0 : (wantedTops[index - 1] ?? 0)) : wantedTop));
    }
    const placementOrder = columnNodes.map((_, index) => index).sort((first, second) => (wantedTops[first] ?? 0) - (wantedTops[second] ?? 0));
    const packedTops = packColumn(
      placementOrder.map((index) => cardHeights[index] ?? 0),
      placementOrder.map((index) => wantedTops[index] ?? 0),
    );
    placementOrder.forEach((nodeIndex, placementIndex) => {
      const node = columnNodes[nodeIndex];
      if (node !== undefined) positionByNode.set(node.node_id, { x: columnLeft, y: packedTops[placementIndex] ?? 0 });
    });
    columnLeft += Math.max(0, ...columnNodes.map((node) => node.card_width)) + NODE_GRAPH_COLUMN_GAP;
  });

  const topmostY = Math.min(0, ...[...positionByNode.values()].map((position) => position.y));
  return new Map([...positionByNode].map(([nodeId, position]) => [nodeId, { x: position.x, y: Math.round(position.y - topmostY) }]));
}
