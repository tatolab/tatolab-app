import { expect, test } from "vitest";
import { PACKETS_UNITS_KEPT_FOR_NS, packetsFactsOf, packetsUnitsSeenWith, recordRowsOf, type PacketsUnitSeen } from "./port_viewer_message_readings";

const FRAME_NS = 33_333_333;

function unitsOfAnEncoderAt30FramesPerSecond(unitCount: number): PacketsUnitSeen[] {
  let unitsSeen: PacketsUnitSeen[] = [];
  for (let unit = 0; unit < unitCount; unit += 1) {
    const startsGroup = unit % 30 === 0;
    unitsSeen = packetsUnitsSeenWith(unitsSeen, { family: "packets", codec: "avc1.64001f", byte_length: startsGroup ? 40_000 : 4_000, starts_group: startsGroup, timestamp_ns: unit * FRAME_NS });
  }
  return unitsSeen;
}

test("packets_facts_measure_the_last_seconds_bitrate_and_the_time_between_the_last_two_keyframes", () => {
  const facts = packetsFactsOf(unitsOfAnEncoderAt30FramesPerSecond(61));

  expect(facts.keyframe_interval_ns).toBe(30 * FRAME_NS);
  expect(facts.keyframes).toBe(3);
  expect(facts.bits_per_second).toBeCloseTo(((29 * 4_000 + 40_000) * 8) / (30 * FRAME_NS * 1e-9), -2);
});

test("units_older_than_the_span_kept_are_dropped_and_a_stamp_that_went_back_starts_the_span_again", () => {
  const unitsSeen = unitsOfAnEncoderAt30FramesPerSecond(300);
  expect((unitsSeen.at(-1)?.timestamp_ns ?? 0) - (unitsSeen[0]?.timestamp_ns ?? 0)).toBeLessThanOrEqual(PACKETS_UNITS_KEPT_FOR_NS);

  const restarted = packetsUnitsSeenWith(unitsSeen, { family: "packets", codec: "avc1.64001f", byte_length: 40_000, starts_group: true, timestamp_ns: 0 });
  expect(restarted).toEqual([{ timestamp_ns: 0, byte_length: 40_000, starts_group: true }]);
  expect(packetsFactsOf([])).toEqual({ bits_per_second: null, keyframe_interval_ns: null, keyframes: 0 });
});

test("a_records_fields_read_as_rows_with_a_nested_maps_fields_under_their_dotted_path", () => {
  expect(recordRowsOf({ label: "face", score: 0.875, box: { x: 4, y: 8 }, tags: ["front", "lit"], seen: null })).toEqual([
    ["label", "face"],
    ["score", "0.875"],
    ["box.x", "4"],
    ["box.y", "8"],
    ["tags", '["front","lit"]'],
    ["seen", "null"],
  ]);
  expect(recordRowsOf(7)).toEqual([["value", "7"]]);
});
