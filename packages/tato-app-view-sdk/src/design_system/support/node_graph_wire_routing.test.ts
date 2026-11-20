import { Effect } from "effect";
import { expect, test } from "vitest";
import { NODE_GRAPH_WIRE_CLEARANCE, layNodeGraphWireRoutes, nodeGraphWirePath, type NodeGraphWireEnds, type NodeGraphWireObstacle, type NodeGraphWireRoute } from "./node_graph_wire_routing";

/** A card 180 wide and 80 tall with its top-left corner at (`x`, `y`). */
const card = (x: number, y: number): NodeGraphWireObstacle => ({ x, y, width: 180, height: 80 });

/** The point of the card at (`x`, `y`) where an output pin's socket sits, on its right edge. */
const outputOf = (x: number, y: number) => ({ x: x + 180, y: y + 40 });

/** The point of the card at (`x`, `y`) where an input pin's socket sits, on its left edge. */
const inputOf = (x: number, y: number) => ({ x, y: y + 40 });

/** Whether any run of `route` passes through the inside of `obstacle`. */
function passesThrough(route: NodeGraphWireRoute, obstacle: NodeGraphWireObstacle): boolean {
  return route.slice(1).some((end, index) => {
    const start = route[index];
    if (start === undefined) return false;
    const steps = 50;
    return Array.from({ length: steps + 1 }, (_, step) => step / steps).some((share) => {
      const x = start.x + (end.x - start.x) * share;
      const y = start.y + (end.y - start.y) * share;
      return x > obstacle.x && x < obstacle.x + obstacle.width && y > obstacle.y && y < obstacle.y + obstacle.height;
    });
  });
}

/** The routes `layNodeGraphWireRoutes` lays, run to the end. */
const routeNodeGraphWires = (obstacles: readonly NodeGraphWireObstacle[], wires: readonly NodeGraphWireEnds[]) => Effect.runPromise(layNodeGraphWireRoutes(obstacles, wires));

const runsAreStraight = (route: NodeGraphWireRoute) => route.slice(1).every((end, index) => end.x === route[index]?.x || end.y === route[index]?.y);

test("a_wire_with_nothing_in_its_way_runs_straight_across", async () => {
  const routes = await routeNodeGraphWires([card(0, 0), card(400, 0)], [{ wire_id: "w", from: outputOf(0, 0), to: inputOf(400, 0) }]);
  expect(routes.get("w")).toEqual([outputOf(0, 0), inputOf(400, 0)]);
});

test("a_wire_goes_around_a_card_between_its_pins_in_straight_runs", async () => {
  const blocker = card(260, 0);
  const routes = await routeNodeGraphWires([card(0, 0), blocker, card(600, 0)], [{ wire_id: "w", from: outputOf(0, 0), to: inputOf(600, 0) }]);
  const route = routes.get("w") ?? [];
  expect(route.length).toBeGreaterThan(2);
  expect(runsAreStraight(route)).toBe(true);
  expect(passesThrough(route, blocker)).toBe(false);
  expect(route[0]).toEqual(outputOf(0, 0));
  expect(route.at(-1)).toEqual(inputOf(600, 0));
});

test("a_wire_leaves_its_output_to_the_right_and_enters_its_input_from_the_left", async () => {
  const routes = await routeNodeGraphWires([card(0, 0), card(400, 300)], [{ wire_id: "w", from: outputOf(0, 0), to: inputOf(400, 300) }]);
  const route = routes.get("w") ?? [];
  expect(route[1]?.y).toBe(outputOf(0, 0).y);
  expect(route[1]?.x).toBeGreaterThan(outputOf(0, 0).x);
  expect(route.at(-2)?.y).toBe(inputOf(400, 300).y);
  expect(route.at(-2)?.x).toBeLessThan(inputOf(400, 300).x);
});

test("a_wire_looping_back_to_a_card_on_its_left_goes_around_both_cards", async () => {
  const upstream = card(0, 0);
  const downstream = card(300, 0);
  const routes = await routeNodeGraphWires([upstream, downstream], [{ wire_id: "loop", from: outputOf(300, 0), to: inputOf(0, 0) }]);
  const route = routes.get("loop") ?? [];
  expect(runsAreStraight(route)).toBe(true);
  expect(passesThrough(route, upstream)).toBe(false);
  expect(passesThrough(route, downstream)).toBe(false);
});

test("wires_sharing_a_gap_run_side_by_side_within_their_clearance", async () => {
  const blocker = card(260, 100);
  const routes = await routeNodeGraphWires(
    [card(0, 0), card(0, 200), blocker, card(600, 0), card(600, 200)],
    [
      { wire_id: "upper", from: outputOf(0, 0), to: inputOf(600, 200) },
      { wire_id: "lower", from: outputOf(0, 200), to: inputOf(600, 0) },
    ],
  );
  const upper = routes.get("upper") ?? [];
  const lower = routes.get("lower") ?? [];
  const sharedPoints = upper.slice(1, -1).filter((point) => lower.slice(1, -1).some((other) => other.x === point.x && other.y === point.y));
  expect(sharedPoints).toEqual([]);
  expect(passesThrough(upper, blocker)).toBe(false);
  expect(passesThrough(lower, blocker)).toBe(false);
});

test("a_wire_whose_pin_another_card_covers_has_no_route", async () => {
  const routes = await routeNodeGraphWires([card(0, 0), card(150, 0), card(500, 0)], [{ wire_id: "covered", from: outputOf(0, 0), to: inputOf(500, 0) }]);
  expect(routes.has("covered")).toBe(false);
});

test("a_turning_point_inside_a_near_cards_clearance_still_routes", async () => {
  const near = card(0, 80 + NODE_GRAPH_WIRE_CLEARANCE - 6);
  const routes = await routeNodeGraphWires([card(0, 0), near, card(500, 200)], [{ wire_id: "w", from: outputOf(0, 0), to: inputOf(500, 200) }]);
  const route = routes.get("w") ?? [];
  expect(route.length).toBeGreaterThan(0);
  expect(passesThrough(route, near)).toBe(false);
});

test("a_routes_corners_are_rounded_no_wider_than_half_its_shortest_run", async () => {
  expect(
    nodeGraphWirePath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 10 },
      { x: 200, y: 10 },
    ]),
  ).toBe("M 0 0 L 95 0 Q 100 0 100 5 L 100 5 Q 100 10 105 10 L 200 10");
});

test("a_graph_with_more_wires_than_one_slice_routes_every_wire", async () => {
  const columns = [0, 300, 600, 900];
  const rows = Array.from({ length: 20 }, (_, row) => row * 120);
  const obstacles = columns.flatMap((x) => rows.map((y) => card(x, y)));
  const wires = columns.slice(0, -1).flatMap((x, column) => rows.map((y, row) => ({ wire_id: `${column}:${row}`, from: outputOf(x, y), to: inputOf(columns[column + 1] ?? 0, rows[(row + 1) % rows.length] ?? 0) })));
  const routes = await routeNodeGraphWires(obstacles, wires);
  expect(routes.size).toBe(wires.length);
  for (const route of routes.values()) expect(obstacles.some((obstacle) => passesThrough(route, obstacle))).toBe(false);
});
