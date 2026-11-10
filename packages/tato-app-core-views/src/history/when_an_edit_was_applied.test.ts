import { expect, test } from "vitest";
import { dayTheEditWasApplied, howLongAgoTheEditWasApplied } from "./when_an_edit_was_applied";

const NOW_MS = new Date(2026, 10, 10, 15, 30).getTime();
const minutesBefore = (minutes: number) => new Date(NOW_MS - minutes * 60_000).toISOString();

test("an edit reads how long ago it was applied, and under which day", () => {
  expect([0.5, 4, 59, 61, 600].map((minutes) => howLongAgoTheEditWasApplied(minutesBefore(minutes), NOW_MS))).toEqual(["just now", "4 min ago", "59 min ago", "1 h ago", "10 h ago"]);
  expect(dayTheEditWasApplied(minutesBefore(60), NOW_MS)).toBe("Today");
  expect(dayTheEditWasApplied(minutesBefore(24 * 60), NOW_MS)).toBe("Yesterday");
  expect(howLongAgoTheEditWasApplied("not a time", NOW_MS)).toBe("not a time");
});
