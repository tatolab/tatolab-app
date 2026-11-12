import { expect, test } from "vitest";
import { viewWatchedReadingSchema } from "./view_wire_messages";

test("a header row 0 tall, as the asset picker's, reaches a view as a frame with no header row; a negative height is refused", () => {
  expect(viewWatchedReadingSchema.safeParse({ subject: "header_row", reading: { leading_inset_px: 0, height_px: 0 } }).success).toBe(true);
  expect(viewWatchedReadingSchema.safeParse({ subject: "header_row", reading: { leading_inset_px: 0, height_px: -1 } }).success).toBe(false);
});
