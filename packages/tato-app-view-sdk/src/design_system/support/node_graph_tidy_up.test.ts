import { expect, test } from "vitest";
import { nodeGraphCardHeight, type NodeGraphLayoutLink, type NodeGraphPosition } from "./node_graph_layout";
import { tidyUpNodeGraph, type NodeGraphTidyCard } from "./node_graph_tidy_up";

const HEIGHT = nodeGraphCardHeight({ input_pin_names: ["in"], output_pin_names: ["out"], shows_failure_words: false, is_collapsed: false });

/** A card 180 wide with one input and one output, at (`x`, `y`) now, in `frame_id`. */
const card = (node_id: string, x: number, y: number, frame_id: string | null = null): NodeGraphTidyCard => ({
  layout: { node_id, input_pin_names: ["in"], output_pin_names: ["out"], shows_failure_words: false, is_collapsed: false, card_width: 180, card_height: HEIGHT },
  position: { x, y },
  frame_id,
});

const wire = (from: string, to: string): NodeGraphLayoutLink => ({ source_node_id: from, source_pin: "out", target_node_id: to, target_pin: "in" });

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const boxOf = (position: NodeGraphPosition | undefined, width = 180, height = HEIGHT): Box => ({ left: position?.x ?? 0, top: position?.y ?? 0, right: (position?.x ?? 0) + width, bottom: (position?.y ?? 0) + height });

const overlap = (first: Box, second: Box) => first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;

const around = (boxes: readonly Box[]): Box => ({
  left: Math.min(...boxes.map((box) => box.left)),
  top: Math.min(...boxes.map((box) => box.top)),
  right: Math.max(...boxes.map((box) => box.right)),
  bottom: Math.max(...boxes.map((box) => box.bottom)),
});

test("tidy_up_lays_a_chain_left_to_right_from_where_the_cards_start", () => {
  const places = tidyUpNodeGraph([card("c", 40, 500), card("a", 300, 100), card("b", 900, 900)], [wire("a", "b"), wire("b", "c")], []);
  const [a, b, c] = ["a", "b", "c"].map((nodeId) => places.cards.get(nodeId));
  expect(a?.x).toBeLessThan(b?.x ?? 0);
  expect(b?.x).toBeLessThan(c?.x ?? 0);
  expect(a?.x).toBe(40);
  expect(Math.min(a?.y ?? 0, b?.y ?? 0, c?.y ?? 0)).toBe(100);
  // A card's output row sits one row above its input row, so each wire runs straight when the card it feeds sits one row higher.
  expect((a?.y ?? 0) - (b?.y ?? 0)).toBe(24);
  expect((b?.y ?? 0) - (c?.y ?? 0)).toBe(24);
});

test("a_frames_cards_stay_together_and_frames_are_stacked_in_the_order_wires_run_without_overlapping", () => {
  const cards = [card("mix", 0, 0, "output"), card("speaker", 300, 0, "output"), card("mic", 600, 600, "input"), card("gate", 900, 600, "input"), card("loose", 200, 300)];
  const places = tidyUpNodeGraph(cards, [wire("mic", "gate"), wire("gate", "mix"), wire("mix", "speaker"), wire("speaker", "loose")], []);
  const frameBox = (frameId: string | null) => around(cards.filter((tidied) => tidied.frame_id === frameId).map((tidied) => boxOf(places.cards.get(tidied.layout.node_id))));
  const input = frameBox("input");
  const output = frameBox("output");
  const loose = frameBox(null);
  expect(input.bottom).toBeLessThan(output.top);
  expect(output.bottom).toBeLessThan(loose.top);
  for (const box of [input, output]) expect(overlap({ ...box, left: box.left - 24, right: box.right + 24, top: box.top - 68, bottom: box.bottom + 24 }, loose)).toBe(false);
});

test("no_two_tidied_cards_overlap", () => {
  const cards = Array.from({ length: 12 }, (_, index) => card(`n${index}`, (index * 37) % 200, (index * 53) % 150, index % 3 === 0 ? "f" : null));
  const links = cards.slice(1).map((tidied, index) => wire(`n${Math.floor(index / 2)}`, tidied.layout.node_id));
  const places = tidyUpNodeGraph(cards, links, []);
  const boxes = cards.map((tidied) => boxOf(places.cards.get(tidied.layout.node_id)));
  for (const [index, box] of boxes.entries()) for (const other of boxes.slice(index + 1)) expect(overlap(box, other)).toBe(false);
});

test("a_note_inside_a_frame_goes_under_its_cards_and_one_beside_the_graph_stays_on_its_side", () => {
  const cards = [card("a", 0, 0, "f"), card("b", 300, 0, "f")];
  const inside = { note_id: "inside", position: { x: 100, y: 20 }, size: { width: 160, height: 60 } };
  const right = { note_id: "right", position: { x: 1200, y: 0 }, size: { width: 160, height: 60 } };
  const places = tidyUpNodeGraph(cards, [wire("a", "b")], [inside, right]);
  const cardsBox = around(cards.map((tidied) => boxOf(places.cards.get(tidied.layout.node_id))));
  expect(places.notes.get("inside")?.y).toBeGreaterThan(cardsBox.bottom);
  expect(places.notes.get("right")?.x).toBeGreaterThan(cardsBox.right);
});

test("nothing_to_tidy_moves_nothing", () => {
  expect(tidyUpNodeGraph([], [], [{ note_id: "n", position: { x: 0, y: 0 }, size: { width: 10, height: 10 } }])).toEqual({ cards: new Map(), notes: new Map() });
});
