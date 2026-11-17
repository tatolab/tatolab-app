import { expect, test } from "vitest";
import { layOutNodeGraph, nodeGraphCardHeight, nodeGraphPinRowIndex } from "./node_graph_layout";

const card = (node_id: string, input_pin_names: string[], output_pin_names: string[]) => ({ node_id, input_pin_names, output_pin_names, shows_failure_words: false, is_collapsed: false, card_width: 180 });

test("a_card_is_as_tall_as_a_row_per_pin", () => {
  expect(nodeGraphCardHeight({ input_pin_names: ["a"], output_pin_names: ["b", "c"], shows_failure_words: false, is_collapsed: false })).toBe(26 + 12 + 3 * 24);
});

test("a_card_showing_why_it_failed_is_taller_by_the_band_that_holds_the_words", () => {
  expect(nodeGraphCardHeight({ input_pin_names: ["a"], output_pin_names: [], shows_failure_words: true, is_collapsed: false })).toBe(26 + 12 + 24 + 44);
});

test("each_node_sits_one_column_past_the_furthest_node_feeding_it", () => {
  const positions = layOutNodeGraph(
    [card("display", ["video"], []), card("invert", ["video"], ["video"]), card("camera", [], ["video"])],
    [
      { source_node_id: "camera", source_pin: "video", target_node_id: "invert", target_pin: "video" },
      { source_node_id: "invert", source_pin: "video", target_node_id: "display", target_pin: "video" },
      { source_node_id: "camera", source_pin: "video", target_node_id: "display", target_pin: "video" },
      { source_node_id: "camera", source_pin: "video", target_node_id: "absent", target_pin: "video" },
    ],
  );
  const columnX = ["camera", "invert", "display"].map((nodeId) => positions.get(nodeId)?.x);
  expect(columnX[0]).toBeLessThan(columnX[1] ?? 0);
  expect(columnX[1]).toBeLessThan(columnX[2] ?? 0);
  expect(positions.has("absent")).toBe(false);
});

test("unlinked_nodes_share_the_first_column_without_overlapping", () => {
  const positions = layOutNodeGraph([card("a", [], ["x"]), card("b", [], ["x"])], []);
  const first = positions.get("a");
  const second = positions.get("b");
  expect(first?.x).toBe(second?.x);
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeGreaterThanOrEqual(nodeGraphCardHeight({ input_pin_names: [], output_pin_names: ["x"], shows_failure_words: false, is_collapsed: false }));
});

test("a_pins_row_is_counted_as_the_card_draws_it_outputs_first_then_inputs", () => {
  const meter = { input_pin_names: ["video", "gain"], output_pin_names: ["level", "peak"] };
  expect(["level", "peak"].map((pin) => nodeGraphPinRowIndex(meter, "output", pin))).toEqual([0, 1]);
  expect(["video", "gain"].map((pin) => nodeGraphPinRowIndex(meter, "input", pin))).toEqual([2, 3]);
  expect(nodeGraphPinRowIndex(meter, "input", "level")).toBe(-1);
});

test("a_fed_card_sits_so_the_input_row_it_is_fed_on_lines_up_with_the_feeding_output_row", () => {
  const positions = layOutNodeGraph(
    [card("source", [], ["video"]), card("mixer", ["a", "b"], ["out"])],
    [{ source_node_id: "source", source_pin: "video", target_node_id: "mixer", target_pin: "b" }],
  );
  const sourceRowCentre = (positions.get("source")?.y ?? 0) + 26 + 6 + 0 * 24 + 12;
  const mixerRowCentre = (positions.get("mixer")?.y ?? 0) + 26 + 6 + 2 * 24 + 12;
  expect(mixerRowCentre).toBe(sourceRowCentre);
});
