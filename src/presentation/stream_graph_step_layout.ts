// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { StreamGraphCanvas, StreamGraphStepCard } from "./stream_graph_canvas_presentation";

/** A step card's width on the canvas. */
export const STREAM_GRAPH_STEP_CARD_WIDTH = 248;
/** Must match the card's head row. */
export const STREAM_GRAPH_STEP_CARD_HEAD_HEIGHT = 32;
/** The 16:9 preview inside a card, across its width less its 1 px borders and 8 px sides. */
export const STREAM_GRAPH_STEP_CARD_PREVIEW_HEIGHT = Math.round(((STREAM_GRAPH_STEP_CARD_WIDTH - 2 - 16) * 9) / 16);
/** The preview's 8 px under it. */
const STEP_CARD_PREVIEW_BOTTOM_GAP = 8;
/** Must match a port row's height. */
export const STREAM_GRAPH_PORT_ROW_HEIGHT = 24;
/** Must match the padding under the port rows. */
const STEP_CARD_PORTS_BOTTOM_PADDING = 4;
/** Must match the foot's height, its hairline included. */
const STEP_CARD_FOOT_HEIGHT = 24;
const STEP_CARD_BORDER_WIDTH = 1;
const STEP_COLUMN_GAP = 96;
const STEP_ROW_GAP = 40;
const CROSSING_REDUCTION_SWEEPS = 4;

/** Where a card's top-left corner sits on the canvas. */
export interface StreamGraphStepPosition {
  x: number;
  y: number;
}

function previewBlockHeight(step: Pick<StreamGraphStepCard, "cardPreview">, arePreviewsShown: boolean): number {
  return arePreviewsShown && step.cardPreview !== null ? STREAM_GRAPH_STEP_CARD_PREVIEW_HEIGHT + STEP_CARD_PREVIEW_BOTTOM_GAP : 0;
}

/** A step card's height: its head, its preview when previews show and it has one, a row per port, and its foot. */
export function streamGraphStepCardHeight(step: Pick<StreamGraphStepCard, "cardPreview" | "inputPorts" | "outputPorts">, arePreviewsShown: boolean): number {
  const portCount = step.inputPorts.length + step.outputPorts.length;
  return (
    STEP_CARD_BORDER_WIDTH * 2 +
    STREAM_GRAPH_STEP_CARD_HEAD_HEIGHT +
    previewBlockHeight(step, arePreviewsShown) +
    portCount * STREAM_GRAPH_PORT_ROW_HEIGHT +
    STEP_CARD_PORTS_BOTTOM_PADDING +
    STEP_CARD_FOOT_HEIGHT
  );
}

/** How far below a card's top the centre of its port row at `rowIndex` sits, inputs first. */
export function streamGraphPortRowCentreOffset(step: Pick<StreamGraphStepCard, "cardPreview">, rowIndex: number, arePreviewsShown: boolean): number {
  return (
    STEP_CARD_BORDER_WIDTH +
    STREAM_GRAPH_STEP_CARD_HEAD_HEIGHT +
    previewBlockHeight(step, arePreviewsShown) +
    rowIndex * STREAM_GRAPH_PORT_ROW_HEIGHT +
    STREAM_GRAPH_PORT_ROW_HEIGHT / 2
  );
}

/** Each step's column: one past its furthest upstream step, so every link runs left to right. */
function assignColumns(stepNames: string[], upstreamNamesByStep: Map<string, string[]>): Map<string, number> {
  const columnByStep = new Map<string, number>();
  const stepsBeingPlaced = new Set<string>();
  const columnOf = (stepName: string): number => {
    const placedColumn = columnByStep.get(stepName);
    if (placedColumn !== undefined) return placedColumn;
    // A link back into a step still being placed closes a cycle; it does not push the step right.
    if (stepsBeingPlaced.has(stepName)) return -1;
    stepsBeingPlaced.add(stepName);
    let column = 0;
    for (const upstreamName of upstreamNamesByStep.get(stepName) ?? []) column = Math.max(column, columnOf(upstreamName) + 1);
    stepsBeingPlaced.delete(stepName);
    columnByStep.set(stepName, column);
    return column;
  };
  for (const stepName of stepNames) columnOf(stepName);
  return columnByStep;
}

function averageRow(neighbourNames: string[], rowByStep: Map<string, number>): number | null {
  const neighbourRows = neighbourNames.map((neighbourName) => rowByStep.get(neighbourName)).filter((row): row is number => row !== undefined);
  if (neighbourRows.length === 0) return null;
  return neighbourRows.reduce((sum, row) => sum + row, 0) / neighbourRows.length;
}

/** Orders each column by its neighbours' average row, sweeping both ways to untangle crossings. */
function orderColumnsToReduceCrossings(columns: string[][], upstreamNamesByStep: Map<string, string[]>, downstreamNamesByStep: Map<string, string[]>): void {
  const rowByStep = new Map<string, number>();
  const recordRows = (column: string[]) => column.forEach((stepName, row) => rowByStep.set(stepName, row));
  columns.forEach(recordRows);
  const reorderColumn = (column: string[], neighboursOf: (stepName: string) => string[]) => {
    const keyed = column.map((stepName, currentRow) => ({ stepName, sortKey: averageRow(neighboursOf(stepName), rowByStep) ?? currentRow }));
    keyed.sort((first, second) => first.sortKey - second.sortKey);
    column.splice(0, column.length, ...keyed.map((entry) => entry.stepName));
    recordRows(column);
  };
  for (let sweep = 0; sweep < CROSSING_REDUCTION_SWEEPS; sweep++) {
    if (sweep % 2 === 0) {
      for (let columnIndex = 1; columnIndex < columns.length; columnIndex++) reorderColumn(columns[columnIndex], (stepName) => upstreamNamesByStep.get(stepName) ?? []);
    } else {
      for (let columnIndex = columns.length - 2; columnIndex >= 0; columnIndex--) reorderColumn(columns[columnIndex], (stepName) => downstreamNamesByStep.get(stepName) ?? []);
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
  return run.cardHeights.reduce((sum, height) => sum + height, 0) + (run.cardHeights.length - 1) * STEP_ROW_GAP;
}

/** The top that spreads a run's push evenly: each member as far above its wanted top as the others are below theirs. */
function balancedRunTop(run: PackedCardRun): number {
  let offsetWithinRun = 0;
  let sumOfWantedRunTops = 0;
  run.cardHeights.forEach((height, index) => {
    sumOfWantedRunTops += run.wantedTops[index] - offsetWithinRun;
    offsetWithinRun += height + STEP_ROW_GAP;
  });
  return sumOfWantedRunTops / run.cardHeights.length;
}

/** Tops for a column's cards, in order, each as near its wanted top as the row gap allows, so a fan-out sits symmetric about its source port. */
function packColumn(cardHeights: number[], wantedTops: number[]): number[] {
  const runs: PackedCardRun[] = [];
  cardHeights.forEach((height, index) => {
    let run: PackedCardRun = { cardHeights: [height], wantedTops: [wantedTops[index]], top: wantedTops[index] };
    for (;;) {
      const previousRun = runs.at(-1);
      if (!previousRun || previousRun.top + runHeight(previousRun) + STEP_ROW_GAP <= run.top) break;
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
      top += height + STEP_ROW_GAP;
    }
  }
  return tops;
}

/**
 * Each step card's place on the canvas, left to right in columns, from (0, 0). A card sits so its first input lines up
 * with the ports that feed it, so a chain runs straight and a fan-out sits symmetric about its source port.
 */
export function layOutStreamGraphSteps(canvas: StreamGraphCanvas, arePreviewsShown: boolean): Map<string, StreamGraphStepPosition> {
  const stepNames = canvas.steps.map((step) => step.name);
  const stepByName = new Map(canvas.steps.map((step) => [step.name, step]));
  const upstreamNamesByStep = new Map<string, string[]>();
  const downstreamNamesByStep = new Map<string, string[]>();
  const firstLinkIndexIntoStep = new Map<string, number>();
  canvas.links.forEach((link, linkIndex) => {
    upstreamNamesByStep.set(link.targetStepName, [...(upstreamNamesByStep.get(link.targetStepName) ?? []), link.sourceStepName]);
    downstreamNamesByStep.set(link.sourceStepName, [...(downstreamNamesByStep.get(link.sourceStepName) ?? []), link.targetStepName]);
    if (!firstLinkIndexIntoStep.has(link.targetStepName)) firstLinkIndexIntoStep.set(link.targetStepName, linkIndex);
  });

  const columnByStep = assignColumns(stepNames, upstreamNamesByStep);
  const columnCount = Math.max(0, ...columnByStep.values()) + 1;
  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  // Steps fed by the same port keep the order their links list them in.
  const stepsInLinkOrder = [...stepNames].sort(
    (first, second) => (firstLinkIndexIntoStep.get(first) ?? Number.POSITIVE_INFINITY) - (firstLinkIndexIntoStep.get(second) ?? Number.POSITIVE_INFINITY),
  );
  for (const stepName of stepsInLinkOrder) columns[columnByStep.get(stepName) ?? 0].push(stepName);
  orderColumnsToReduceCrossings(columns, upstreamNamesByStep, downstreamNamesByStep);

  const positionByStep = new Map<string, StreamGraphStepPosition>();
  const outputPortCentreY = (stepName: string, portName: string): number | null => {
    const step = stepByName.get(stepName);
    const position = positionByStep.get(stepName);
    if (step === undefined || position === undefined) return null;
    const outputIndex = step.outputPorts.findIndex((port) => port.name === portName);
    return outputIndex === -1 ? null : position.y + streamGraphPortRowCentreOffset(step, step.inputPorts.length + outputIndex, arePreviewsShown);
  };
  columns.forEach((column, columnIndex) => {
    const columnSteps = column.flatMap((stepName) => stepByName.get(stepName) ?? []);
    const cardHeights = columnSteps.map((step) => streamGraphStepCardHeight(step, arePreviewsShown));
    let wantedTops: number[];
    if (columnIndex === 0) {
      let top = -(cardHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, cardHeights.length - 1) * STEP_ROW_GAP) / 2;
      wantedTops = cardHeights.map((height) => {
        const cardTop = top;
        top += height + STEP_ROW_GAP;
        return cardTop;
      });
    } else {
      wantedTops = columnSteps.map((step) => {
        const feedingPortYs = canvas.links
          .filter((link) => link.targetStepName === step.name)
          .map((link) => outputPortCentreY(link.sourceStepName, link.sourcePortName))
          .filter((portY): portY is number => portY !== null);
        if (feedingPortYs.length === 0) return Number.NaN;
        return feedingPortYs.reduce((sum, portY) => sum + portY, 0) / feedingPortYs.length - streamGraphPortRowCentreOffset(step, 0, arePreviewsShown);
      });
      // A step fed only from a later column, closing a cycle, goes under the step before it.
      wantedTops = wantedTops.map((wantedTop, index) => (Number.isNaN(wantedTop) ? (index === 0 ? 0 : wantedTops[index - 1]) : wantedTop));
    }
    const placementOrder = columnSteps.map((_, index) => index).sort((first, second) => wantedTops[first] - wantedTops[second]);
    const packedTops = packColumn(
      placementOrder.map((index) => cardHeights[index]),
      placementOrder.map((index) => wantedTops[index]),
    );
    placementOrder.forEach((stepIndex, placementIndex) => {
      const step = columnSteps[stepIndex];
      if (step !== undefined) positionByStep.set(step.name, { x: columnIndex * (STREAM_GRAPH_STEP_CARD_WIDTH + STEP_COLUMN_GAP), y: packedTops[placementIndex] });
    });
  });

  const topmostY = Math.min(0, ...[...positionByStep.values()].map((position) => position.y));
  return new Map([...positionByStep].map(([stepName, position]) => [stepName, { x: position.x, y: Math.round(position.y - topmostY) }]));
}

/** The steps in flow order, column by column, top to bottom, as the canvas lays them out with previews shown. */
export function stepNamesInFlowOrder(canvas: StreamGraphCanvas): string[] {
  const positionByStep = layOutStreamGraphSteps(canvas, true);
  return [...positionByStep].sort(([, first], [, second]) => first.x - second.x || first.y - second.y).map(([stepName]) => stepName);
}

/** What the layout depends on: the steps, their ports and preview, and the links; a new key lays the canvas out again. */
export function streamGraphLayoutKey(canvas: StreamGraphCanvas, arePreviewsShown: boolean): string {
  return JSON.stringify([
    arePreviewsShown,
    canvas.steps.map((step) => [step.name, step.inputPorts.length, step.outputPorts.length, step.cardPreview !== null]),
    canvas.links.map((link) => [link.sourceStepName, link.sourcePortName, link.targetStepName, link.targetPortName]),
  ]);
}
