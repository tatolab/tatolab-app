// Where each wire of the canvas runs: around the cards and notes between its two pins, leaving its output to the right
// and entering its input from the left, in straight runs with turns, wires that share a gap spread side by side.
//
// Each wire is a cheapest path through a grid of lines laid along the clear edges of the rectangles near it and the
// middles of the gaps between them, a turn costing as much as a stretch of wire and a run beside a wire already routed
// costing more than open canvas, so wires keep to their own gaps where there is room.

import { Effect } from "effect";

/** A point on the canvas. */
export interface NodeGraphPoint {
  x: number;
  y: number;
}

/** A rectangle wires keep clear of, a card or a note: its top-left corner and its size. */
export interface NodeGraphWireObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A wire to route: from the socket of an output pin, which it leaves to the right, to the socket of an input pin, which it enters from the left. */
export interface NodeGraphWireEnds {
  wire_id: string;
  from: NodeGraphPoint;
  to: NodeGraphPoint;
}

/** A wire's route: its corners in order, from its output's socket to its input's socket, each run straight across or straight down. */
export type NodeGraphWireRoute = readonly NodeGraphPoint[];

/** How far a wire keeps from a card or note it passes. */
export const NODE_GRAPH_WIRE_CLEARANCE = 14;
/** How far a wire runs straight out of its output, and straight into its input, before it turns. */
const PIN_STRAIGHT_RUN = 20;
/** What a turn costs, as a length of wire. */
const TURN_COST = 40;
/** How much more a length of wire costs for each wire already routed along it. */
const CROWDING_COST = 2;
/** How much more a length of wire costs inside a card's or note's clearance. */
const CLEARANCE_COST = 4;
/** How near two lines are when a wire on one runs as good as on top of a wire on the other. */
const NEAR_LINE_DISTANCE = 8;
/** How far past the rectangle around a wire's two ends its first search looks; each search that finds no way doubles it. */
const FIRST_SEARCH_MARGIN = 160;
const SEARCHES_BEFORE_THE_WHOLE_CANVAS = 3;
/** How many wires are routed before the routing gives the window a frame, about a few milliseconds of work. */
const WIRES_ROUTED_BETWEEN_YIELDS = 24;
/** The widest gap between two wires spread across one channel. */
const SPREAD_WIRE_GAP = 6;
/** The radius a wire's corners are rounded to, less where a run is too short for it. */
export const NODE_GRAPH_WIRE_CORNER_RADIUS = 16;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Which way a wire heads along a run, numbered so the opposite way is two on. */
const Heading = { Right: 0, Down: 1, Left: 2, Up: 3 } as const;
type Heading = (typeof Heading)[keyof typeof Heading];
const HEADINGS: readonly Heading[] = [Heading.Right, Heading.Down, Heading.Left, Heading.Up];

/** How a step between two grid points goes: through a card, through a rectangle's clearance, or across open canvas. */
const StepKind = { Blocked: 0, ThroughClearance: 1, Open: 2 } as const;
type StepKind = (typeof StepKind)[keyof typeof StepKind];
const STEP_KINDS: readonly StepKind[] = [StepKind.Blocked, StepKind.ThroughClearance, StepKind.Open];

const STEP_X = [1, 0, -1, 0] as const;
const STEP_Y = [0, 1, 0, -1] as const;

const boxOf = (obstacle: NodeGraphWireObstacle, clearance: number): Box => ({
  left: obstacle.x - clearance,
  top: obstacle.y - clearance,
  right: obstacle.x + obstacle.width + clearance,
  bottom: obstacle.y + obstacle.height + clearance,
});

const isStrictlyInside = (box: Box, x: number, y: number) => x > box.left && x < box.right && y > box.top && y < box.bottom;

const overlaps = (first: Box, second: Box) => first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;

/** `values` once each, in order. */
function distinctInOrder(values: readonly number[]): number[] {
  return [...new Set(values)].sort((first, second) => first - second);
}

/** The middle of each gap between neighbouring `edges`, where a wire runs clear of both sides. */
function middlesBetween(edges: readonly number[]): number[] {
  const sorted = distinctInOrder(edges);
  return sorted.slice(1).map((edge, index) => (edge + (sorted[index] ?? edge)) / 2);
}

/** A run of routed wire along the line at `at`, from `low` to `high`. */
interface RoutedRun {
  at: number;
  low: number;
  high: number;
}

/** The runs of wire routed so far, filed by the band of lines they lie on, by which a later wire pays to run beside them. */
class RoutedRuns {
  private readonly acrossByBand = new Map<number, RoutedRun[]>();
  private readonly downByBand = new Map<number, RoutedRun[]>();

  add(route: NodeGraphWireRoute): void {
    route.slice(1).forEach((end, index) => {
      const start = route[index];
      if (start === undefined) return;
      if (start.y === end.y) this.file(this.acrossByBand, { at: start.y, low: Math.min(start.x, end.x), high: Math.max(start.x, end.x) });
      else this.file(this.downByBand, { at: start.x, low: Math.min(start.y, end.y), high: Math.max(start.y, end.y) });
    });
  }

  /** How many routed runs lie along the stretch from `from` to `to` on the line at `at`, or on a line too near it to tell apart. */
  countAlong(isAcross: boolean, at: number, from: number, to: number): number {
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    const runsByBand = isAcross ? this.acrossByBand : this.downByBand;
    const band = Math.floor(at / NEAR_LINE_DISTANCE);
    let count = 0;
    for (const nearBand of [band - 1, band, band + 1]) {
      for (const run of runsByBand.get(nearBand) ?? []) {
        if (Math.abs(run.at - at) < NEAR_LINE_DISTANCE && run.low < high && low < run.high) count++;
      }
    }
    return count;
  }

  private file(runsByBand: Map<number, RoutedRun[]>, run: RoutedRun): void {
    const band = Math.floor(run.at / NEAR_LINE_DISTANCE);
    const runs = runsByBand.get(band) ?? [];
    runs.push(run);
    runsByBand.set(band, runs);
  }
}

/** A binary heap of search states, cheapest first. */
class CheapestFirst {
  private readonly costs: number[] = [];
  private readonly states: number[] = [];

  get isEmpty(): boolean {
    return this.states.length === 0;
  }

  push(cost: number, state: number): void {
    this.costs.push(cost);
    this.states.push(state);
    let child = this.states.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if ((this.costs[parent] ?? 0) <= (this.costs[child] ?? 0)) break;
      this.swap(parent, child);
      child = parent;
    }
  }

  pop(): number {
    const cheapest = this.states[0] ?? -1;
    const lastCost = this.costs.pop() ?? 0;
    const lastState = this.states.pop() ?? -1;
    if (this.states.length > 0) {
      this.costs[0] = lastCost;
      this.states[0] = lastState;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < this.states.length && (this.costs[left] ?? 0) < (this.costs[smallest] ?? 0)) smallest = left;
        if (right < this.states.length && (this.costs[right] ?? 0) < (this.costs[smallest] ?? 0)) smallest = right;
        if (smallest === parent) break;
        this.swap(parent, smallest);
        parent = smallest;
      }
    }
    return cheapest;
  }

  private swap(first: number, second: number): void {
    [this.costs[first], this.costs[second]] = [this.costs[second] ?? 0, this.costs[first] ?? 0];
    [this.states[first], this.states[second]] = [this.states[second] ?? 0, this.states[first] ?? 0];
  }
}

/** Where a wire turns out of its output and into its input. */
function turningPoints(wire: NodeGraphWireEnds): { leaves: NodeGraphPoint; arrives: NodeGraphPoint } {
  return { leaves: { x: wire.from.x + PIN_STRAIGHT_RUN, y: wire.from.y }, arrives: { x: wire.to.x - PIN_STRAIGHT_RUN, y: wire.to.y } };
}

/** The cheapest route from `leaves` to `arrives` through the grid laid over `area`, or `null` when the rectangles in it leave no way. */
function searchTheArea(area: Box, boxes: readonly Box[], cards: readonly Box[], leaves: NodeGraphPoint, arrives: NodeGraphPoint, routedRuns: RoutedRuns): NodeGraphPoint[] | null {
  const boxesInTheArea = boxes.filter((box) => overlaps(box, area));
  const cardsInTheArea = cards.filter((card) => overlaps(card, area));
  const clip = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  const xEdges = boxesInTheArea.flatMap((box) => [clip(box.left, area.left, area.right), clip(box.right, area.left, area.right)]);
  const yEdges = boxesInTheArea.flatMap((box) => [clip(box.top, area.top, area.bottom), clip(box.bottom, area.top, area.bottom)]);
  // A wire turning back on itself needs a line just past each turning point to turn on, not only the area's edge.
  const xs = distinctInOrder([area.left, area.right, leaves.x, leaves.x + PIN_STRAIGHT_RUN, arrives.x, arrives.x - PIN_STRAIGHT_RUN, ...xEdges, ...middlesBetween(xEdges)]).filter((x) => x >= area.left && x <= area.right);
  const ys = distinctInOrder([area.top, area.bottom, leaves.y, arrives.y, ...yEdges, ...middlesBetween(yEdges)]);
  const columnCount = xs.length;
  const rowCount = ys.length;
  const startColumn = xs.indexOf(leaves.x);
  const startRow = ys.indexOf(leaves.y);
  const goalColumn = xs.indexOf(arrives.x);
  const goalRow = ys.indexOf(arrives.y);
  const cellOf = (column: number, row: number) => row * columnCount + column;
  const isInsideAny = (within: readonly Box[], x: number, y: number) => within.some((box) => isStrictlyInside(box, x, y));
  // How each step to the next grid point across or down goes: through a card, never; through a rectangle's clearance,
  // at a cost, so a wire keeps its distance where there is room and still squeezes out of a pin set close to a neighbour.
  const stepThrough = (x: number, y: number, nextX: number, nextY: number): StepKind =>
    isInsideAny(cardsInTheArea, (x + nextX) / 2, (y + nextY) / 2) || isInsideAny(cardsInTheArea, nextX, nextY) || isInsideAny(cardsInTheArea, x, y)
      ? StepKind.Blocked
      : isInsideAny(boxesInTheArea, (x + nextX) / 2, (y + nextY) / 2)
        ? StepKind.ThroughClearance
        : StepKind.Open;
  const stepAcross = new Uint8Array(columnCount * rowCount);
  const stepDown = new Uint8Array(columnCount * rowCount);
  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column < columnCount; column++) {
      const x = xs[column] ?? 0;
      const y = ys[row] ?? 0;
      if (column + 1 < columnCount) stepAcross[cellOf(column, row)] = stepThrough(x, y, xs[column + 1] ?? 0, y);
      if (row + 1 < rowCount) stepDown[cellOf(column, row)] = stepThrough(x, y, x, ys[row + 1] ?? 0);
    }
  }
  const stepKind = (column: number, row: number, nextColumn: number, nextRow: number): StepKind =>
    STEP_KINDS[(row === nextRow ? stepAcross[cellOf(Math.min(column, nextColumn), row)] : stepDown[cellOf(column, Math.min(row, nextRow))]) ?? StepKind.Blocked] ?? StepKind.Blocked;

  const stateCount = xs.length * ys.length * 4;
  const costSoFar = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(stateCount).fill(-1);
  const stateOf = (column: number, row: number, heading: Heading) => cellOf(column, row) * 4 + heading;
  const distanceLeft = (column: number, row: number) => Math.abs((xs[column] ?? 0) - arrives.x) + Math.abs((ys[row] ?? 0) - arrives.y);
  const queue = new CheapestFirst();
  const start = stateOf(startColumn, startRow, Heading.Right);
  costSoFar[start] = 0;
  queue.push(distanceLeft(startColumn, startRow), start);
  const goal = stateOf(goalColumn, goalRow, Heading.Right);
  while (!queue.isEmpty) {
    const state = queue.pop();
    if (state === goal) break;
    const heading = HEADINGS[state & 3] ?? Heading.Right;
    const cell = state >> 2;
    const column = cell % columnCount;
    const row = (cell - column) / columnCount;
    for (const nextHeading of HEADINGS) {
      if (nextHeading === ((heading + 2) & 3)) continue;
      const nextColumn = column + STEP_X[nextHeading];
      const nextRow = row + STEP_Y[nextHeading];
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= columnCount || nextRow >= rowCount) continue;
      const kind = stepKind(column, row, nextColumn, nextRow);
      if (kind === StepKind.Blocked) continue;
      const isAcross = nextHeading === Heading.Right || nextHeading === Heading.Left;
      const length = Math.abs((xs[nextColumn] ?? 0) - (xs[column] ?? 0)) + Math.abs((ys[nextRow] ?? 0) - (ys[row] ?? 0));
      const crowding = isAcross ? routedRuns.countAlong(true, ys[row] ?? 0, xs[column] ?? 0, xs[nextColumn] ?? 0) : routedRuns.countAlong(false, xs[column] ?? 0, ys[row] ?? 0, ys[nextRow] ?? 0);
      const cost = (costSoFar[state] ?? 0) + length * (1 + CROWDING_COST * crowding + (kind === StepKind.ThroughClearance ? CLEARANCE_COST : 0)) + (nextHeading === heading ? 0 : TURN_COST);
      const nextState = stateOf(nextColumn, nextRow, nextHeading);
      if (cost >= (costSoFar[nextState] ?? 0)) continue;
      costSoFar[nextState] = cost;
      cameFrom[nextState] = state;
      queue.push(cost + distanceLeft(nextColumn, nextRow), nextState);
    }
  }
  if (cameFrom[goal] === -1 && goal !== start) return null;
  const corners: NodeGraphPoint[] = [];
  for (let state = goal; state !== -1; state = cameFrom[state] ?? -1) {
    const cell = state >> 2;
    const column = cell % columnCount;
    corners.push({ x: xs[column] ?? 0, y: ys[(cell - column) / columnCount] ?? 0 });
  }
  return corners.reverse();
}

/** `points` without repeats or the points partway along a straight run. */
function cornersOnly(points: readonly NodeGraphPoint[]): NodeGraphPoint[] {
  const corners: NodeGraphPoint[] = [];
  for (const point of points) {
    const last = corners.at(-1);
    if (last !== undefined && last.x === point.x && last.y === point.y) continue;
    const beforeLast = corners.at(-2);
    if (last !== undefined && beforeLast !== undefined && ((beforeLast.x === last.x && last.x === point.x) || (beforeLast.y === last.y && last.y === point.y))) {
      corners[corners.length - 1] = point;
      continue;
    }
    corners.push(point);
  }
  return corners;
}

/** One wire's route, searching wider until a way is found, or `null` when its pin is covered or no way exists. */
function routeOneWire(wire: NodeGraphWireEnds, boxes: readonly Box[], cards: readonly Box[], wholeCanvas: Box, routedRuns: RoutedRuns): NodeGraphWireRoute | null {
  const { leaves, arrives } = turningPoints(wire);
  if (cards.some((card) => isStrictlyInside(card, leaves.x, leaves.y) || isStrictlyInside(card, arrives.x, arrives.y))) return null;
  const aroundTheEnds: Box = { left: Math.min(leaves.x, arrives.x), top: Math.min(leaves.y, arrives.y), right: Math.max(leaves.x, arrives.x), bottom: Math.max(leaves.y, arrives.y) };
  for (let search = 0; search <= SEARCHES_BEFORE_THE_WHOLE_CANVAS; search++) {
    const margin = FIRST_SEARCH_MARGIN * 2 ** search;
    const area: Box =
      search === SEARCHES_BEFORE_THE_WHOLE_CANVAS
        ? wholeCanvas
        : { left: aroundTheEnds.left - margin, top: aroundTheEnds.top - margin, right: aroundTheEnds.right + margin, bottom: aroundTheEnds.bottom + margin };
    const corners = searchTheArea(area, boxes, cards, leaves, arrives, routedRuns);
    if (corners !== null) return cornersOnly([wire.from, ...corners, wire.to]);
  }
  return null;
}

/** A run of one route that can slide sideways without bending the runs out of its pins. */
interface SlidingRun {
  wire_id: string;
  index: number;
  is_down: boolean;
  at: number;
  low: number;
  high: number;
}

/** The runs of `routes` that can slide sideways: not the runs out of and into the pins, nor a run across that ends at one of them. */
function slidingRuns(routes: ReadonlyMap<string, NodeGraphPoint[]>): SlidingRun[] {
  return [...routes].flatMap(([wireId, route]) =>
    route.slice(1, -2).flatMap((start, offset): SlidingRun[] => {
      const index = offset + 1;
      const end = route[index + 1];
      if (end === undefined) return [];
      if (start.x === end.x) return [{ wire_id: wireId, index, is_down: true, at: start.x, low: Math.min(start.y, end.y), high: Math.max(start.y, end.y) }];
      if (index < 2 || index + 1 > route.length - 3) return [];
      return [{ wire_id: wireId, index, is_down: false, at: start.y, low: Math.min(start.x, end.x), high: Math.max(start.x, end.x) }];
    }),
  );
}

/** Spreads the runs that share a line and overlap, side by side within the wires' clearance, in the order their wires come in from. */
function spreadSharedRuns(routes: Map<string, NodeGraphPoint[]>): void {
  const runsByLine = new Map<string, SlidingRun[]>();
  for (const run of slidingRuns(routes)) {
    const line = `${run.is_down ? "down" : "across"}:${run.at}`;
    runsByLine.set(line, [...(runsByLine.get(line) ?? []), run]);
  }
  for (const runs of runsByLine.values()) {
    runs.sort((first, second) => first.low - second.low || first.high - second.high);
    const overlappingGroups: SlidingRun[][] = [];
    for (const run of runs) {
      const group = overlappingGroups.at(-1);
      if (group !== undefined && group.some((other) => other.low < run.high && run.low < other.high)) group.push(run);
      else overlappingGroups.push([run]);
    }
    for (const group of overlappingGroups) {
      if (group.length < 2) continue;
      const comesFrom = (run: SlidingRun) => {
        const before = routes.get(run.wire_id)?.[run.index - 1];
        return before === undefined ? 0 : run.is_down ? before.y : before.x;
      };
      group.sort((first, second) => comesFrom(first) - comesFrom(second) || first.wire_id.localeCompare(second.wire_id));
      const gap = Math.min(SPREAD_WIRE_GAP, (2 * (NODE_GRAPH_WIRE_CLEARANCE - 2)) / (group.length - 1));
      group.forEach((run, place) => {
        const route = routes.get(run.wire_id);
        if (route === undefined) return;
        const shift = (place - (group.length - 1) / 2) * gap;
        for (const index of [run.index, run.index + 1]) {
          const point = route[index];
          if (point !== undefined) route[index] = run.is_down ? { x: point.x + shift, y: point.y } : { x: point.x, y: point.y + shift };
        }
      });
    }
  }
}

/**
 * Each wire's route around `obstacles`, by wire id; a wire whose pin a card covers, or that has no way through, has none.
 * It yields after every few wires, so a big graph is routed across several frames and an interruption, as when a card
 * moves again before the routes are laid, stops it there.
 */
export function layNodeGraphWireRoutes(obstacles: readonly NodeGraphWireObstacle[], wires: readonly NodeGraphWireEnds[]): Effect.Effect<ReadonlyMap<string, NodeGraphWireRoute>> {
  return Effect.gen(function* () {
    const cards = obstacles.map((obstacle) => boxOf(obstacle, 0));
    const boxes = obstacles.map((obstacle) => boxOf(obstacle, NODE_GRAPH_WIRE_CLEARANCE));
    const turns = wires.flatMap((wire) => Object.values(turningPoints(wire)));
    const wholeCanvas: Box = {
      left: Math.min(...boxes.map((box) => box.left), ...turns.map((point) => point.x)) - FIRST_SEARCH_MARGIN,
      top: Math.min(...boxes.map((box) => box.top), ...turns.map((point) => point.y)) - FIRST_SEARCH_MARGIN,
      right: Math.max(...boxes.map((box) => box.right), ...turns.map((point) => point.x)) + FIRST_SEARCH_MARGIN,
      bottom: Math.max(...boxes.map((box) => box.bottom), ...turns.map((point) => point.y)) + FIRST_SEARCH_MARGIN,
    };
    const reach = (wire: NodeGraphWireEnds) => Math.abs(wire.to.x - wire.from.x) + Math.abs(wire.to.y - wire.from.y);
    // Short wires take the near gaps first; long ones go around them.
    const shortestFirst = [...wires].sort((first, second) => reach(first) - reach(second) || first.wire_id.localeCompare(second.wire_id));
    const routedRuns = new RoutedRuns();
    const routes = new Map<string, NodeGraphPoint[]>();
    for (const [index, wire] of shortestFirst.entries()) {
      if (index > 0 && index % WIRES_ROUTED_BETWEEN_YIELDS === 0) yield* Effect.sleep(0);
      const route = routeOneWire(wire, boxes, cards, wholeCanvas, routedRuns);
      if (route === null) continue;
      routedRuns.add(route);
      routes.set(wire.wire_id, [...route]);
    }
    spreadSharedRuns(routes);
    return routes;
  });
}

/** An SVG path along `route`, its corners rounded to `cornerRadius` or as far as the runs either side leave room for. */
export function nodeGraphWirePath(route: NodeGraphWireRoute, cornerRadius: number = NODE_GRAPH_WIRE_CORNER_RADIUS): string {
  const [first, ...rest] = route;
  if (first === undefined) return "";
  const commands = [`M ${first.x} ${first.y}`];
  rest.forEach((corner, offset) => {
    const before = route[offset];
    const after = route[offset + 2];
    if (before === undefined || after === undefined) {
      commands.push(`L ${corner.x} ${corner.y}`);
      return;
    }
    const lengthIn = Math.hypot(corner.x - before.x, corner.y - before.y);
    const lengthOut = Math.hypot(after.x - corner.x, after.y - corner.y);
    if (lengthIn === 0 || lengthOut === 0) {
      commands.push(`L ${corner.x} ${corner.y}`);
      return;
    }
    const radius = Math.min(cornerRadius, lengthIn / 2, lengthOut / 2);
    const turnIn = { x: corner.x - ((corner.x - before.x) / lengthIn) * radius, y: corner.y - ((corner.y - before.y) / lengthIn) * radius };
    const turnOut = { x: corner.x + ((after.x - corner.x) / lengthOut) * radius, y: corner.y + ((after.y - corner.y) / lengthOut) * radius };
    commands.push(`L ${turnIn.x} ${turnIn.y}`, `Q ${corner.x} ${corner.y} ${turnOut.x} ${turnOut.y}`);
  });
  return commands.join(" ");
}
