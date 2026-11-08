import { expect, test } from "vitest";
import { layOutNodeGraph, nodeGraphCardHeight } from "./node_graph_layout";

const card = (node_id: string, input_pin_names: string[], output_pin_names: string[]) => ({ node_id, input_pin_names, output_pin_names, shows_failure_words: false, card_width: 180 });

test("a_card_is_as_tall_as_its_busier_side", () => {
  expect(nodeGraphCardHeight({ input_pin_names: ["a"], output_pin_names: ["b", "c"], shows_failure_words: false })).toBe(26 + 12 + 40);
});

test("a_card_showing_why_it_failed_is_taller_by_the_band_that_holds_the_words", () => {
  expect(nodeGraphCardHeight({ input_pin_names: ["a"], output_pin_names: [], shows_failure_words: true })).toBe(26 + 12 + 20 + 44);
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
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeGreaterThanOrEqual(nodeGraphCardHeight({ input_pin_names: [], output_pin_names: ["x"], shows_failure_words: false }));
});
