// A condition the app checks every round and logs only on the round it starts holding, so a
// failure that persists is logged once rather than every round.

/** Whether a condition held the last time it was checked. */
export class ConditionOnsetLatch {
  private conditionHeldLastTime = false;

  /**
   * Record whether the condition holds now, answering whether this is the check it started holding on:
   * true the first time it holds, and again only after a check it did not.
   */
  conditionJustStartedHolding(conditionHoldsNow: boolean): boolean {
    const conditionHeldLastTime = this.conditionHeldLastTime;
    this.conditionHeldLastTime = conditionHoldsNow;
    return conditionHoldsNow && !conditionHeldLastTime;
  }
}
