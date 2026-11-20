// Where each node of a graph sits when the graph carries no positions of its own, or when it is tidied up: left to
// right in columns, each node one column past the furthest node feeding it, each column ordered to untangle crossings
// and packed so a node's first input lines up with the outputs that feed it.

import { nodePinRows } from "../../pin_model/node_pins";

/** A node card's header, over its pin rows. */
export const NODE_GRAPH_CARD_HEADER_HEIGHT = 26;
/** One pin's row, the card's full width: an output's socket at the right edge, an input's at the left. A control taller than one row grows its row past this, which a card's measured height counts. */
export const NODE_GRAPH_PIN_ROW_HEIGHT = 24;
/** The space above the first pin row and below the last. */
export const NODE_GRAPH_CARD_PIN_ROWS_PADDING = 6;
/** The band under a failed card's pin rows that holds why it failed, two lines at most. */
export const NODE_GRAPH_CARD_FAILURE_WORDS_HEIGHT = 44;
const NODE_GRAPH_COLUMN_GAP = 72;
const NODE_GRAPH_ROW_GAP = 28;
const CROSSING_REDUCTION_SWEEPS = 4;

/** What the layout reads of one node: its id, the key of each row each side draws, as `nodePinRowKey` writes it, whether its card shows why it failed or is collapsed to its header, and its card's width and height as drawn, its height `null` until measured. */
export interface NodeGraphLayoutNode {
  node_id: string;
  input_pin_names: readonly string[];
  output_pin_names: readonly string[];
  shows_failure_words: boolean;
  is_collapsed: boolean;
  card_width: number;
  card_height: number | null;
}

/** What the layout reads of one link: the key of the row it starts at and of the row it ends at. */
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

/** A card's height: its header, then a row per pin, then why it failed when it shows that; a collapsed card is its header alone. */
export function nodeGraphCardHeight(node: Pick<NodeGraphLayoutNode, "input_pin_names" | "output_pin_names" | "shows_failure_words" | "is_collapsed">): number {
  if (node.is_collapsed) return NODE_GRAPH_CARD_HEADER_HEIGHT;
  const pinRowCount = node.input_pin_names.length + node.output_pin_names.length;
  return (
    NODE_GRAPH_CARD_HEADER_HEIGHT +
    NODE_GRAPH_CARD_PIN_ROWS_PADDING * 2 +
    pinRowCount * NODE_GRAPH_PIN_ROW_HEIGHT +
    (node.shows_failure_words ? NODE_GRAPH_CARD_FAILURE_WORDS_HEIGHT : 0)
  );
}

/** How far below a card's top the centre of its pin row `rowIndex` sits. */
function nodeGraphPinRowCentreOffset(rowIndex: number): number {
  return NODE_GRAPH_CARD_HEADER_HEIGHT + NODE_GRAPH_CARD_PIN_ROWS_PADDING + rowIndex * NODE_GRAPH_PIN_ROW_HEIGHT + NODE_GRAPH_PIN_ROW_HEIGHT / 2;
}

/** The row a card draws its pin `pinName` of `side` on, in the card's own row order; -1 for a pin it has none of. */
export function nodeGraphPinRowIndex(node: Pick<NodeGraphLayoutNode, "input_pin_names" | "output_pin_names">, side: "input" | "output", pinName: string): number {
  return nodePinRows(node.input_pin_names, node.output_pin_names).findIndex((row) => row.side === side && row.node_pin === pinName);
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

/**
 * What the layout places in a column: a node's card, or a lane a link skipping the column runs through, which keeps a
 * clear way for its wire. It reads how tall and wide each is and how far below its top the row a link meets sits.
 */
interface LayoutEntry {
  id: string;
  width: number;
  height: number;
  inputRowOffset: (pin: string) => number;
  outputRowOffset: (pin: string) => number | null;
}

/** How tall a lane is: the wire it keeps a way for, which the row gap keeps clear on either side. */
const NODE_GRAPH_LANE_HEIGHT = 8;
const LANE_PIN = "lane";

function cardEntry(node: NodeGraphLayoutNode): LayoutEntry {
  return {
    id: node.node_id,
    width: node.card_width,
    height: node.card_height ?? nodeGraphCardHeight(node),
    inputRowOffset: (pin) => nodeGraphPinRowCentreOffset(Math.max(0, nodeGraphPinRowIndex(node, "input", pin))),
    outputRowOffset: (pin) => {
      const outputRow = nodeGraphPinRowIndex(node, "output", pin);
      return outputRow === -1 ? null : nodeGraphPinRowCentreOffset(outputRow);
    },
  };
}

const laneEntry = (id: string): LayoutEntry => ({ id, width: 0, height: NODE_GRAPH_LANE_HEIGHT, inputRowOffset: () => NODE_GRAPH_LANE_HEIGHT / 2, outputRowOffset: () => NODE_GRAPH_LANE_HEIGHT / 2 });

/** A node nothing feeds moves right to the column before the first node it feeds, so it sits beside what it feeds rather than at the far left. */
function pullTheSourcesRight(columnByNode: Map<string, number>, upstreamIdsByNode: Map<string, string[]>, downstreamIdsByNode: Map<string, string[]>): void {
  for (const [nodeId, column] of columnByNode) {
    const downstreamColumns = (downstreamIdsByNode.get(nodeId) ?? []).map((downstreamId) => columnByNode.get(downstreamId) ?? column + 1);
    if ((upstreamIdsByNode.get(nodeId) ?? []).length > 0 || downstreamColumns.length === 0) continue;
    columnByNode.set(nodeId, Math.max(column, Math.min(...downstreamColumns) - 1));
  }
}

/** `links` with each one that skips columns run through a lane in every column it skips, and the lanes, each in its column. */
function linksThroughLanes(links: readonly NodeGraphLayoutLink[], columnByNode: Map<string, number>): { links: NodeGraphLayoutLink[]; lanes: { id: string; column: number }[] } {
  const lanes: { id: string; column: number }[] = [];
  const linksRun = links.flatMap((link, linkIndex): NodeGraphLayoutLink[] => {
    const sourceColumn = columnByNode.get(link.source_node_id) ?? 0;
    const targetColumn = columnByNode.get(link.target_node_id) ?? 0;
    if (targetColumn - sourceColumn <= 1) return [link];
    const laneIds = Array.from({ length: targetColumn - sourceColumn - 1 }, (_, offset) => {
      const id = `\u0000lane:${linkIndex}:${offset}`;
      lanes.push({ id, column: sourceColumn + 1 + offset });
      return id;
    });
    const stops = [{ node: link.source_node_id, pin: link.source_pin }, ...laneIds.map((id) => ({ node: id, pin: LANE_PIN })), { node: link.target_node_id, pin: link.target_pin }];
    return stops.slice(1).map((stop, index) => ({ source_node_id: stops[index]?.node ?? "", source_pin: stops[index]?.pin ?? "", target_node_id: stop.node, target_pin: stop.pin }));
  });
  return { links: linksRun, lanes };
}

/** Each link's ends as upstream and downstream neighbours, and the first link into each node. */
function neighboursOf(links: readonly NodeGraphLayoutLink[]) {
  const upstreamIdsByNode = new Map<string, string[]>();
  const downstreamIdsByNode = new Map<string, string[]>();
  const firstLinkIndexIntoNode = new Map<string, number>();
  links.forEach((link, linkIndex) => {
    upstreamIdsByNode.set(link.target_node_id, [...(upstreamIdsByNode.get(link.target_node_id) ?? []), link.source_node_id]);
    downstreamIdsByNode.set(link.source_node_id, [...(downstreamIdsByNode.get(link.source_node_id) ?? []), link.target_node_id]);
    if (!firstLinkIndexIntoNode.has(link.target_node_id)) firstLinkIndexIntoNode.set(link.target_node_id, linkIndex);
  });
  return { upstreamIdsByNode, downstreamIdsByNode, firstLinkIndexIntoNode };
}

/**
 * Each node's card position from (0, 0), left to right in columns as wide as their widest card; a link to a node not in
 * `nodes` is ignored. A node nothing feeds sits in the column before the first node it feeds, and a link that skips
 * columns keeps a lane clear through each one, so its wire runs straight past the cards there.
 */
export function layOutNodeGraph(nodes: readonly NodeGraphLayoutNode[], links: readonly NodeGraphLayoutLink[]): Map<string, NodeGraphPosition> {
  const nodeById = new Map(nodes.map((node) => [node.node_id, node]));
  const linksWithinTheGraph = links.filter((link) => nodeById.has(link.source_node_id) && nodeById.has(link.target_node_id));
  const nodeIds = nodes.map((node) => node.node_id);
  const betweenNodes = neighboursOf(linksWithinTheGraph);
  const columnByNode = assignColumns(nodeIds, betweenNodes.upstreamIdsByNode);
  pullTheSourcesRight(columnByNode, betweenNodes.upstreamIdsByNode, betweenNodes.downstreamIdsByNode);
  const { links: linksRun, lanes } = linksThroughLanes(linksWithinTheGraph, columnByNode);
  for (const lane of lanes) columnByNode.set(lane.id, lane.column);
  const entryById = new Map<string, LayoutEntry>([...nodes.map((node): [string, LayoutEntry] => [node.node_id, cardEntry(node)]), ...lanes.map((lane): [string, LayoutEntry] => [lane.id, laneEntry(lane.id)])]);
  const { upstreamIdsByNode, downstreamIdsByNode, firstLinkIndexIntoNode } = neighboursOf(linksRun);

  const columnCount = Math.max(0, ...columnByNode.values()) + 1;
  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  // Nodes fed by the same output keep the order their links list them in.
  const entriesInLinkOrder = [...nodeIds, ...lanes.map((lane) => lane.id)].sort(
    (first, second) => (firstLinkIndexIntoNode.get(first) ?? Number.POSITIVE_INFINITY) - (firstLinkIndexIntoNode.get(second) ?? Number.POSITIVE_INFINITY),
  );
  for (const entryId of entriesInLinkOrder) columns[columnByNode.get(entryId) ?? 0]?.push(entryId);
  orderColumnsToReduceCrossings(columns, upstreamIdsByNode, downstreamIdsByNode);

  const positionById = new Map<string, NodeGraphPosition>();
  const outputRowCentreY = (entryId: string, pin: string): number | null => {
    const entry = entryById.get(entryId);
    const position = positionById.get(entryId);
    const offset = entry?.outputRowOffset(pin) ?? null;
    return position === undefined || offset === null ? null : position.y + offset;
  };
  /** Places a column's entries in the order of their wanted tops, each as near its wanted top as the row gap allows. */
  const placeTheColumn = (columnEntries: readonly LayoutEntry[], wantedTops: readonly number[], left: number) => {
    const placementOrder = columnEntries.map((_, index) => index).sort((first, second) => (wantedTops[first] ?? 0) - (wantedTops[second] ?? 0));
    const packedTops = packColumn(
      placementOrder.map((index) => columnEntries[index]?.height ?? 0),
      placementOrder.map((index) => wantedTops[index] ?? 0),
    );
    placementOrder.forEach((entryIndex, placementIndex) => {
      const entry = columnEntries[entryIndex];
      if (entry !== undefined) positionById.set(entry.id, { x: left, y: packedTops[placementIndex] ?? 0 });
    });
  };
  const columnLefts: number[] = [];
  let columnLeft = 0;
  columns.forEach((column, columnIndex) => {
    const columnEntries = column.flatMap((entryId) => entryById.get(entryId) ?? []);
    const heights = columnEntries.map((entry) => entry.height);
    let wantedTops: number[];
    if (columnIndex === 0) {
      let top = -(heights.reduce((sum, height) => sum + height, 0) + Math.max(0, heights.length - 1) * NODE_GRAPH_ROW_GAP) / 2;
      wantedTops = heights.map((height) => {
        const entryTop = top;
        top += height + NODE_GRAPH_ROW_GAP;
        return entryTop;
      });
    } else {
      wantedTops = columnEntries.map((entry) => {
        const feedingTops = linksRun
          .filter((link) => link.target_node_id === entry.id)
          .map((link) => {
            const sourceY = outputRowCentreY(link.source_node_id, link.source_pin);
            return sourceY === null ? null : sourceY - entry.inputRowOffset(link.target_pin);
          })
          .filter((wantedTop): wantedTop is number => wantedTop !== null);
        if (feedingTops.length === 0) return Number.NaN;
        return feedingTops.reduce((sum, wantedTop) => sum + wantedTop, 0) / feedingTops.length;
      });
      // A node fed only from a later column, closing a cycle, or nothing it feeds placed yet, goes under the entry before it.
      wantedTops = wantedTops.map((wantedTop, index) => (Number.isNaN(wantedTop) ? (index === 0 ? 0 : (wantedTops[index - 1] ?? 0)) : wantedTop));
    }
    placeTheColumn(columnEntries, wantedTops, columnLeft);
    columnLefts.push(columnLeft);
    columnLeft += Math.max(0, ...columnEntries.map((entry) => entry.width)) + NODE_GRAPH_COLUMN_GAP;
  });
  // Placed left to right, a node nothing feeds had nothing to line up with; now that what it feeds is placed, it lines
  // up with the input rows it feeds, right to left so a source feeding another source follows it.
  for (let columnIndex = columns.length - 1; columnIndex >= 0; columnIndex--) {
    const columnEntries = (columns[columnIndex] ?? []).flatMap((entryId) => entryById.get(entryId) ?? []);
    const isASource = (entry: LayoutEntry) => (upstreamIdsByNode.get(entry.id) ?? []).length === 0 && (downstreamIdsByNode.get(entry.id) ?? []).length > 0;
    if (columnIndex === 0 || !columnEntries.some(isASource)) continue;
    const wantedTops = columnEntries.map((entry) => {
      const placedTop = positionById.get(entry.id)?.y ?? 0;
      if (!isASource(entry)) return placedTop;
      const fedTops = linksRun
        .filter((link) => link.source_node_id === entry.id)
        .flatMap((link) => {
          const targetTop = positionById.get(link.target_node_id)?.y;
          const outputOffset = entry.outputRowOffset(link.source_pin);
          const target = entryById.get(link.target_node_id);
          return targetTop === undefined || outputOffset === null || target === undefined ? [] : [targetTop + target.inputRowOffset(link.target_pin) - outputOffset];
        });
      return fedTops.length === 0 ? placedTop : fedTops.reduce((sum, top) => sum + top, 0) / fedTops.length;
    });
    placeTheColumn(columnEntries, wantedTops, columnLefts[columnIndex] ?? 0);
  }

  const cardPositions = nodeIds.flatMap((nodeId): [string, NodeGraphPosition][] => {
    const position = positionById.get(nodeId);
    return position === undefined ? [] : [[nodeId, position]];
  });
  const topmostY = Math.min(0, ...cardPositions.map(([, position]) => position.y));
  return new Map(cardPositions.map(([nodeId, position]) => [nodeId, { x: position.x, y: Math.round(position.y - topmostY) }]));
}
