// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { StreamGraphLink, StreamGraphSummary } from "../backend/tatolab_backend_contract";
import { presentGraphNodeState } from "../presentation/stream_graph_presentation";
import {
  nodeClassName,
  portsOfGraphNodes,
  presentNodeKind,
  type GraphNodeOutputPort,
} from "../presentation/stream_overview_presentation";

/** Must match `.graph-node`'s border in stream_graph.css. */
export const GRAPH_NODE_BORDER_WIDTH = 1;
/** Must match `.graph-node-head`'s height, its hairline included. */
export const GRAPH_NODE_HEAD_HEIGHT = 48;
/** Must match `.graph-node-ports`' vertical padding. */
export const GRAPH_NODE_PORTS_PADDING = 4;
/** Must match `.graph-node-port`'s height. */
export const GRAPH_PORT_ROW_HEIGHT = 22;
/** A foot under the ports: 15 px of text and 8 px below it. */
export const GRAPH_NODE_FOOT_HEIGHT = 23;
/** A foot straight under the head also takes 6 px above it. */
export const GRAPH_NODE_FOOT_WITHOUT_PORTS_HEIGHT = 29;
const GRAPH_NODE_HORIZONTAL_PADDING = 12;
const NARROWEST_GRAPH_NODE_WIDTH = 216;
const WIDEST_GRAPH_NODE_WIDTH = 288;
const NODE_NAME_FONT_SIZE = 12.5;
const NODE_CLASS_FONT_SIZE = 11;
const PORT_FONT_SIZE = 11.5;
const EXPOSURE_WORD_FONT_SIZE = 11;
const CLASS_TO_KIND_GAP = 8;
const EXPOSURE_WORD_TO_PORT_GAP = 6;
/** The eye a readable output's row shows before its exposure word with the Watch flag on: 13 px and a 6 px gap. */
const WATCH_ICON_WITH_GAP_WIDTH = 19;
/** Geist Mono advances every glyph 600 units of its 1000-unit em. */
const MONOSPACE_ADVANCE_PER_FONT_SIZE = 0.6;
/** A generous average advance of Inter's lowercase letters. */
const INTER_ADVANCE_PER_FONT_SIZE = 0.56;
const NARROWEST_GRAPH_COLUMN_GAP = 32;
const USUAL_GRAPH_COLUMN_GAP = 44;
const WIDEST_GRAPH_COLUMN_GAP = 72;
/** The canvas keeps this much clear at each side when the column gaps are fitted to it. */
export const GRAPH_HORIZONTAL_FIT_PADDING = 28;
const GRAPH_ROW_GAP = 18;
const CROSSING_REDUCTION_SWEEPS = 4;
const SMALLEST_LINK_REACH = 26;
const ARROWHEAD_LENGTH = 6;
const ARROWHEAD_HALF_WIDTH = 4;
/** The stroke stops short of the arrowhead's tip so its round cap does not poke through. */
const LINK_STROKE_END_INSET = 5;

/** A node placed in its column: its box's top-left corner and size, and what its head and ports show. */
export interface StreamGraphLayoutNode {
  name: string;
  type: string | null;
  className: string | null;
  kindWord: "Built-in" | "Python" | null;
  state: string | null;
  /** False for a link's source in another stream on this machine. */
  isInThisStream: boolean;
  inputs: string[];
  outputs: GraphNodeOutputPort[];
  hasFoot: boolean;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A link drawn from its source's output port row to its target's input port row, ending in an arrowhead. */
export interface StreamGraphLayoutLink {
  link: StreamGraphLink;
  pathData: string;
  arrowPathData: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** A whole graph laid out from (0, 0), and the size of the drawing it needs. */
export interface StreamGraphLayout {
  nodes: StreamGraphLayoutNode[];
  links: StreamGraphLayoutLink[];
  width: number;
  height: number;
}

function monospaceWidth(text: string, fontSize: number): number {
  return text.length * fontSize * MONOSPACE_ADVANCE_PER_FONT_SIZE;
}

function systemFontWidth(text: string, fontSize: number): number {
  return text.length * fontSize * INTER_ADVANCE_PER_FONT_SIZE;
}

/** Whether an output port shows its exposure word: private, public or newer, never internal, the default. */
export function showsExposureWord(output: GraphNodeOutputPort): boolean {
  return output.exposureLevel !== null && output.exposureLevel !== "internal";
}

/** What the canvas draws beyond the graph data, which the boxes must make room for. */
export interface StreamGraphLayoutOptions {
  /** With the Watch flag on, a readable output's row can show an eye before its exposure word. */
  reservesWatchIconOnReadableOutputs?: boolean;
}

function measureNodeWidth(
  nodeName: string,
  classLine: string,
  kindWord: string | null,
  inputs: string[],
  outputs: GraphNodeOutputPort[],
  options: StreamGraphLayoutOptions,
): number {
  const nameWidth = monospaceWidth(nodeName, NODE_NAME_FONT_SIZE);
  const classLineWidth =
    monospaceWidth(classLine, NODE_CLASS_FONT_SIZE) +
    (kindWord === null ? 0 : CLASS_TO_KIND_GAP + systemFontWidth(kindWord, NODE_CLASS_FONT_SIZE));
  const portRowWidths = [
    ...inputs.map((input) => monospaceWidth(input, PORT_FONT_SIZE)),
    ...outputs.map(
      (output) =>
        monospaceWidth(output.port, PORT_FONT_SIZE) +
        (showsExposureWord(output)
          ? EXPOSURE_WORD_TO_PORT_GAP +
            systemFontWidth(output.exposureLevel ?? "", EXPOSURE_WORD_FONT_SIZE) +
            (options.reservesWatchIconOnReadableOutputs ? WATCH_ICON_WITH_GAP_WIDTH : 0)
          : 0),
    ),
  ];
  const measured = Math.max(nameWidth, classLineWidth, ...portRowWidths) + GRAPH_NODE_HORIZONTAL_PADDING * 2;
  return Math.ceil(Math.min(WIDEST_GRAPH_NODE_WIDTH, Math.max(NARROWEST_GRAPH_NODE_WIDTH, measured)));
}

/** A node's height: its head, a row per port, and a foot when its state needs a word. */
export function measureNodeHeight(portCount: number, hasFoot: boolean): number {
  const portsHeight = portCount === 0 ? 0 : GRAPH_NODE_PORTS_PADDING * 2 + portCount * GRAPH_PORT_ROW_HEIGHT;
  const footHeight = !hasFoot ? 0 : portCount === 0 ? GRAPH_NODE_FOOT_WITHOUT_PORTS_HEIGHT : GRAPH_NODE_FOOT_HEIGHT;
  return GRAPH_NODE_BORDER_WIDTH * 2 + GRAPH_NODE_HEAD_HEIGHT + portsHeight + footHeight;
}

/** How far below a node's top the centre of its port row at `rowIndex` sits, inputs first. */
export function portRowCentreOffset(rowIndex: number): number {
  return (
    GRAPH_NODE_BORDER_WIDTH + GRAPH_NODE_HEAD_HEIGHT + GRAPH_NODE_PORTS_PADDING + rowIndex * GRAPH_PORT_ROW_HEIGHT + GRAPH_PORT_ROW_HEIGHT / 2
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

/** The gap between columns that fills `availableWidth`, within the narrowest and widest gaps. */
function chooseColumnGap(availableWidth: number | null, columnWidths: number[]): number {
  if (availableWidth === null || columnWidths.length < 2) return USUAL_GRAPH_COLUMN_GAP;
  const widthLeftForGaps =
    availableWidth - GRAPH_HORIZONTAL_FIT_PADDING * 2 - columnWidths.reduce((sum, width) => sum + width, 0);
  const fillingGap = widthLeftForGaps / (columnWidths.length - 1);
  return Math.floor(Math.min(WIDEST_GRAPH_COLUMN_GAP, Math.max(NARROWEST_GRAPH_COLUMN_GAP, fillingGap)));
}

/** A run of nodes packed together at the row gap, placed where its members' wanted tops balance out. */
interface PackedNodeRun {
  nodeHeights: number[];
  wantedTops: number[];
  top: number;
}

function runHeight(run: PackedNodeRun): number {
  return run.nodeHeights.reduce((sum, height) => sum + height, 0) + (run.nodeHeights.length - 1) * GRAPH_ROW_GAP;
}

/** The top that spreads a run's push evenly: each member as far above its wanted top as the others are below theirs. */
function balancedRunTop(run: PackedNodeRun): number {
  let offsetWithinRun = 0;
  let sumOfWantedRunTops = 0;
  run.nodeHeights.forEach((height, index) => {
    sumOfWantedRunTops += run.wantedTops[index] - offsetWithinRun;
    offsetWithinRun += height + GRAPH_ROW_GAP;
  });
  return sumOfWantedRunTops / run.nodeHeights.length;
}

/**
 * Tops for a column's nodes, in order, each as near its wanted top as the row gap allows: a node pushed down by the
 * one above shifts the pair up by half the push, so a fan-out sits symmetric about its source port.
 */
function packColumn(nodeHeights: number[], wantedTops: number[]): number[] {
  const runs: PackedNodeRun[] = [];
  nodeHeights.forEach((height, index) => {
    let run: PackedNodeRun = { nodeHeights: [height], wantedTops: [wantedTops[index]], top: wantedTops[index] };
    for (;;) {
      const previousRun = runs.at(-1);
      if (!previousRun || previousRun.top + runHeight(previousRun) + GRAPH_ROW_GAP <= run.top) break;
      runs.pop();
      run = {
        nodeHeights: [...previousRun.nodeHeights, ...run.nodeHeights],
        wantedTops: [...previousRun.wantedTops, ...run.wantedTops],
        top: 0,
      };
      run.top = balancedRunTop(run);
    }
    runs.push(run);
  });
  const tops: number[] = [];
  for (const run of runs) {
    let top = run.top;
    for (const height of run.nodeHeights) {
      tops.push(top);
      top += height + GRAPH_ROW_GAP;
    }
  }
  return tops;
}

function linkPathData(startX: number, startY: number, endX: number, endY: number): string {
  const reach = Math.max(SMALLEST_LINK_REACH, (endX - startX) / 2);
  return `M${startX} ${startY} C${startX + reach} ${startY} ${endX - reach} ${endY} ${endX - LINK_STROKE_END_INSET} ${endY}`;
}

function arrowPathData(endX: number, endY: number): string {
  return `M${endX - ARROWHEAD_LENGTH} ${endY - ARROWHEAD_HALF_WIDTH} L${endX} ${endY} L${endX - ARROWHEAD_LENGTH} ${endY + ARROWHEAD_HALF_WIDTH} Z`;
}

/**
 * Lays a stream's graph out left to right in columns of node boxes with their port rows, column gaps fitted to
 * `availableWidth` when it is known. A node sits so its first input lines up with the ports that feed it, so a chain
 * runs straight and a fan-out sits symmetric about its source port.
 */
export function layOutStreamGraph(
  graphSummary: StreamGraphSummary,
  availableWidth: number | null,
  options: StreamGraphLayoutOptions = {},
): StreamGraphLayout {
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
  const firstLinkIndexIntoNode = new Map<string, number>();
  graphSummary.links.forEach((link, linkIndex) => {
    upstreamNamesByNode.set(link.target_node, [...(upstreamNamesByNode.get(link.target_node) ?? []), link.source_node]);
    downstreamNamesByNode.set(link.source_node, [...(downstreamNamesByNode.get(link.source_node) ?? []), link.target_node]);
    if (!firstLinkIndexIntoNode.has(link.target_node)) firstLinkIndexIntoNode.set(link.target_node, linkIndex);
  });

  const columnByNode = assignColumns(everyNodeName, upstreamNamesByNode);
  const columnCount = Math.max(0, ...columnByNode.values()) + 1;
  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  // Nodes fed by the same port keep the order their links list them in.
  const nodesInLinkOrder = [...everyNodeName].sort(
    (first, second) =>
      (firstLinkIndexIntoNode.get(first) ?? Number.POSITIVE_INFINITY) -
      (firstLinkIndexIntoNode.get(second) ?? Number.POSITIVE_INFINITY),
  );
  for (const nodeName of nodesInLinkOrder) columns[columnByNode.get(nodeName) ?? 0].push(nodeName);
  orderColumnsToReduceCrossings(columns, upstreamNamesByNode, downstreamNamesByNode);

  const summaryNodeByName = new Map(graphSummary.nodes.map((node) => [node.name, node]));
  const portsByNode = portsOfGraphNodes(graphSummary);
  const unplacedNodes = new Map<string, Omit<StreamGraphLayoutNode, "x" | "y">>();
  for (const nodeName of everyNodeName) {
    const summaryNode = summaryNodeByName.get(nodeName);
    const isInThisStream = summaryNode !== undefined;
    const ports = portsByNode.get(nodeName) ?? { inputs: [], outputs: [] };
    const className = summaryNode ? nodeClassName(summaryNode.type) : null;
    const kindWord = summaryNode ? presentNodeKind(summaryNode.type) : null;
    const hasFoot = presentGraphNodeState(summaryNode?.state ?? null, isInThisStream).footText !== null;
    unplacedNodes.set(nodeName, {
      name: nodeName,
      type: summaryNode?.type ?? null,
      className,
      kindWord,
      state: summaryNode?.state ?? null,
      isInThisStream,
      inputs: ports.inputs,
      outputs: ports.outputs,
      hasFoot,
      column: columnByNode.get(nodeName) ?? 0,
      width: measureNodeWidth(nodeName, className ?? "In another stream", kindWord, ports.inputs, ports.outputs, options),
      height: measureNodeHeight(ports.inputs.length + ports.outputs.length, hasFoot),
    });
  }

  const columnWidths = columns.map((column) => Math.max(0, ...column.map((nodeName) => unplacedNodes.get(nodeName)?.width ?? 0)));
  const columnGap = chooseColumnGap(availableWidth, columnWidths);

  const layoutNodeByName = new Map<string, StreamGraphLayoutNode>();
  const outputPortCentreY = (layoutNode: StreamGraphLayoutNode, port: string): number | null => {
    const outputIndex = layoutNode.outputs.findIndex((output) => output.port === port);
    return outputIndex === -1 ? null : layoutNode.y + portRowCentreOffset(layoutNode.inputs.length + outputIndex);
  };
  let columnLeft = 0;
  columns.forEach((column, columnIndex) => {
    const columnNodes = column.map((nodeName) => unplacedNodes.get(nodeName)!);
    let wantedTops: number[];
    if (columnIndex === 0) {
      const stackHeight =
        columnNodes.reduce((sum, node) => sum + node.height, 0) + Math.max(0, columnNodes.length - 1) * GRAPH_ROW_GAP;
      let top = -stackHeight / 2;
      wantedTops = columnNodes.map((node) => {
        const nodeTop = top;
        top += node.height + GRAPH_ROW_GAP;
        return nodeTop;
      });
    } else {
      wantedTops = columnNodes.map((node) => {
        const feedingPortYs = graphSummary.links
          .filter((link) => link.target_node === node.name)
          .map((link) => {
            const sourceNode = layoutNodeByName.get(link.source_node);
            return sourceNode ? outputPortCentreY(sourceNode, link.source_port) : null;
          })
          .filter((portY): portY is number => portY !== null);
        if (feedingPortYs.length === 0) return Number.NaN;
        const meanFeedingY = feedingPortYs.reduce((sum, portY) => sum + portY, 0) / feedingPortYs.length;
        return meanFeedingY - portRowCentreOffset(0);
      });
      // A node fed only from a later column, closing a cycle, goes under the node before it.
      wantedTops = wantedTops.map((wantedTop, index) => (Number.isNaN(wantedTop) ? (index === 0 ? 0 : wantedTops[index - 1]) : wantedTop));
    }
    const placementOrder = columnNodes.map((_, index) => index).sort((first, second) => wantedTops[first] - wantedTops[second]);
    const packedTops = packColumn(
      placementOrder.map((index) => columnNodes[index].height),
      placementOrder.map((index) => wantedTops[index]),
    );
    placementOrder.forEach((nodeIndex, placementIndex) => {
      const node = columnNodes[nodeIndex];
      layoutNodeByName.set(node.name, { ...node, x: columnLeft, y: packedTops[placementIndex] });
    });
    columnLeft += columnWidths[columnIndex] + columnGap;
  });

  const placedNodes = everyNodeName.map((nodeName) => layoutNodeByName.get(nodeName)!);
  const topmostY = Math.min(0, ...placedNodes.map((node) => node.y));
  const shiftedNodes = placedNodes.map((node) => ({ ...node, y: node.y - topmostY }));
  const shiftedNodeByName = new Map(shiftedNodes.map((node) => [node.name, node]));

  const layoutLinks: StreamGraphLayoutLink[] = [];
  for (const link of graphSummary.links) {
    const sourceNode = shiftedNodeByName.get(link.source_node);
    const targetNode = shiftedNodeByName.get(link.target_node);
    if (!sourceNode || !targetNode) continue;
    const startX = sourceNode.x + sourceNode.width;
    const startY = outputPortCentreY(sourceNode, link.source_port) ?? sourceNode.y + sourceNode.height / 2;
    const inputIndex = targetNode.inputs.indexOf(link.target_port);
    const endX = targetNode.x;
    const endY = targetNode.y + (inputIndex === -1 ? targetNode.height / 2 : portRowCentreOffset(inputIndex));
    layoutLinks.push({
      link,
      pathData: linkPathData(startX, startY, endX, endY),
      arrowPathData: arrowPathData(endX, endY),
      startX,
      startY,
      endX,
      endY,
    });
  }

  const contentWidth = columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columnCount - 1) * columnGap;
  const contentHeight = Math.max(0, ...shiftedNodes.map((node) => node.y + node.height));
  return { nodes: shiftedNodes, links: layoutLinks, width: Math.ceil(contentWidth), height: Math.ceil(contentHeight) };
}

/** The laid-out nodes in flow order: column by column, top to bottom. */
export function graphNodesInFlowOrder(layout: StreamGraphLayout): StreamGraphLayoutNode[] {
  return [...layout.nodes].sort((first, second) => first.column - second.column || first.y - second.y);
}
