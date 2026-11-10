import { expect, test } from "vitest";
import { isTheSamePlaceLeft, settingsWithTheStreamLeft, STREAMS_WHOSE_PLACE_LEFT_IS_KEPT, whereTheStreamWasLeft } from "./stream_graph_where_left";

const MAIN_LEFT = { viewport: { x: -120, y: 40, zoom: 1.25 }, selected_node: "invertingeffect" };

test("keeps where each stream was left beside the others, and reads back only a record of the right shape", () => {
  const withMain = settingsWithTheStreamLeft({ where_each_stream_was_left: {} }, "pattern-main", MAIN_LEFT);
  const withBoth = settingsWithTheStreamLeft(withMain, "pattern-recorder", { viewport: { x: 0, y: 0, zoom: 0.5 }, selected_node: null });
  expect(whereTheStreamWasLeft(withBoth, "pattern-main")).toEqual(MAIN_LEFT);
  expect(whereTheStreamWasLeft(withBoth, "pattern-recorder")).toEqual({ viewport: { x: 0, y: 0, zoom: 0.5 }, selected_node: null });
  expect(whereTheStreamWasLeft(withBoth, "pattern-two")).toBeNull();
  expect(whereTheStreamWasLeft(null, "pattern-main")).toBeNull();
  expect(whereTheStreamWasLeft({ where_each_stream_was_left: { "pattern-main": { viewport: { x: 0, y: 0, zoom: 0 }, selected_node: null } } }, "pattern-main")).toBeNull();
});

test("keeps a selection left before the canvas was framed, with no viewport yet", () => {
  const selectedOnly = settingsWithTheStreamLeft(null, "pattern-main", { viewport: null, selected_node: "invertingeffect" });
  expect(whereTheStreamWasLeft(selectedOnly, "pattern-main")).toEqual({ viewport: null, selected_node: "invertingeffect" });
});

test("keeps the newest records up to the limit, dropping the stream left longest ago, and tells two records that say the same apart from two that don't", () => {
  let settings = settingsWithTheStreamLeft(null, "stream-0", MAIN_LEFT);
  for (let streamNumber = 1; streamNumber <= STREAMS_WHOSE_PLACE_LEFT_IS_KEPT; streamNumber += 1) settings = settingsWithTheStreamLeft(settings, `stream-${streamNumber}`, MAIN_LEFT);
  expect(whereTheStreamWasLeft(settings, "stream-0")).toBeNull();
  expect(whereTheStreamWasLeft(settings, "stream-1")).toEqual(MAIN_LEFT);
  expect(whereTheStreamWasLeft(settings, `stream-${STREAMS_WHOSE_PLACE_LEFT_IS_KEPT}`)).toEqual(MAIN_LEFT);
  expect(isTheSamePlaceLeft(MAIN_LEFT, { ...MAIN_LEFT, viewport: { ...MAIN_LEFT.viewport } })).toBe(true);
  expect(isTheSamePlaceLeft(MAIN_LEFT, { ...MAIN_LEFT, viewport: null })).toBe(false);
  expect(isTheSamePlaceLeft(MAIN_LEFT, { ...MAIN_LEFT, selected_node: null })).toBe(false);
});
