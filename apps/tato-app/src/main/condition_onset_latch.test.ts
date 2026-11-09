import { expect, test } from "vitest";
import { ConditionOnsetLatch } from "./condition_onset_latch.js";

test("a_condition_starts_holding_on_its_first_check_and_again_only_after_it_stopped", () => {
  const conditionOnsetLatch = new ConditionOnsetLatch();

  const onsets = [true, true, false, false, true, true].map((conditionHoldsNow) =>
    conditionOnsetLatch.conditionJustStartedHolding(conditionHoldsNow),
  );

  expect(onsets).toEqual([true, false, false, false, true, false]);
});
