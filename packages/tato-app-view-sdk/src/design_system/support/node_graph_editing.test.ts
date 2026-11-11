import { expect, test } from "vitest";
import { canPinsOfTheseFamiliesBeWired, frameACardIsLetGoIn, frameRectangleAroundCards, linkUnderACard, NODE_GRAPH_CLEAR_PLACE_GAP, NODE_GRAPH_FRAME_PADDING, NODE_GRAPH_FRAME_TITLE_ROOM, placeClearBelowTheCards } from "./node_graph_editing";

test("pins_of_one_family_wire_pins_of_two_families_do_not_and_an_unknown_family_is_left_to_the_runtime", () => {
  expect(canPinsOfTheseFamiliesBeWired("image", "image")).toBe(true);
  expect(canPinsOfTheseFamiliesBeWired("image", "array")).toBe(false);
  expect(canPinsOfTheseFamiliesBeWired(null, "array")).toBe(true);
  expect(canPinsOfTheseFamiliesBeWired("channels", null)).toBe(true);
});

test("a_frame_wraps_its_cards_padded_with_room_above_for_its_title_and_a_frame_of_no_card_is_not_drawn", () => {
  expect(
    frameRectangleAroundCards([
      { position: { x: 100, y: 50 }, width: 180, height: 60 },
      { position: { x: 400, y: 200 }, width: 200, height: 80 },
    ]),
  ).toEqual({
    x: 100 - NODE_GRAPH_FRAME_PADDING,
    y: 50 - NODE_GRAPH_FRAME_PADDING - NODE_GRAPH_FRAME_TITLE_ROOM,
    width: 500 + NODE_GRAPH_FRAME_PADDING * 2,
    height: 230 + NODE_GRAPH_FRAME_PADDING * 2 + NODE_GRAPH_FRAME_TITLE_ROOM,
  });
  expect(frameRectangleAroundCards([])).toBeNull();
});

test("a_card_dropped_over_a_links_midpoint_lands_on_that_link_and_the_nearest_of_several_wins", () => {
  const card = { position: { x: 0, y: 0 }, width: 200, height: 100 };

  expect(
    linkUnderACard(card, [
      { link_id: "outside", midpoint: { x: 300, y: 50 } },
      { link_id: "corner", midpoint: { x: 5, y: 5 } },
      { link_id: "centre", midpoint: { x: 98, y: 52 } },
    ]),
  ).toBe("centre");
  expect(linkUnderACard(card, [{ link_id: "outside", midpoint: { x: 300, y: 50 } }])).toBeNull();
});

test("something_placed_from_a_tool_lands_under_the_lowest_card_level_with_the_leftmost_and_where_asked_on_an_empty_canvas", () => {
  expect(
    placeClearBelowTheCards(
      [
        { position: { x: 100, y: 50 }, width: 180, height: 60 },
        { position: { x: 400, y: 200 }, width: 200, height: 80 },
      ],
      { x: 0, y: 0 },
    ),
  ).toEqual({ x: 100, y: 280 + NODE_GRAPH_CLEAR_PLACE_GAP });
  expect(placeClearBelowTheCards([], { x: 7, y: 9 })).toEqual({ x: 7, y: 9 });
});

test("a_dragged_card_joins_the_frame_its_centre_lands_in_leaves_its_own_when_let_go_outside_and_keeps_a_frame_dragged_whole", () => {
  const card = (x: number, y: number) => ({ position: { x, y }, width: 100, height: 60 });
  const inputs = { frame_id: "inputs", rectangle: { x: 0, y: 0, width: 400, height: 300 } };
  const outputs = { frame_id: "outputs", rectangle: { x: 600, y: 0, width: 400, height: 300 } };
  const insideInputs = { frame_id: "inside", rectangle: { x: 100, y: 100, width: 200, height: 150 } };

  expect(frameACardIsLetGoIn(card(650, 50), null, [inputs, outputs])).toBe("outputs");
  expect(frameACardIsLetGoIn(card(450, 50), null, [inputs, outputs])).toBeNull();
  expect(frameACardIsLetGoIn(card(150, 120), null, [inputs, insideInputs])).toBe("inside");

  expect(frameACardIsLetGoIn(card(50, 50), "inputs", [inputs, outputs])).toBe("inputs");
  expect(frameACardIsLetGoIn(card(450, 50), "inputs", [inputs, outputs])).toBeNull();
  expect(frameACardIsLetGoIn(card(650, 50), "inputs", [inputs, outputs])).toBe("outputs");
  expect(frameACardIsLetGoIn(card(150, 120), "inputs", [inputs, insideInputs])).toBe("inputs");

  expect(frameACardIsLetGoIn(card(650, 50), "inputs", [{ frame_id: "inputs", rectangle: null }, outputs])).toBe("inputs");
});
