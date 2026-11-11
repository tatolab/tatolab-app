import type { JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { ViewAskDone } from "@tatolab/tato-app-view-sdk";

/** What became of the latest value a control wrote: taken, or refused in the runtime's own words. */
export type GraphInputWriteOutcome = { kind: "written"; value: JsonValue } | { kind: "refused"; value: JsonValue; because: string };

/**
 * Writes the values one control moves through, one write at a time: a value moved while a write is
 * in flight waits, and only the latest waiting value is written next, so a slider dragged faster
 * than the runtime answers ends on where it stopped and never queues every step it passed.
 */
export class GraphInputLatestValueWriter {
  private isWriting = false;
  private valueWaiting: { value: JsonValue } | null = null;

  constructor(
    private readonly writeTheValue: (value: JsonValue) => Promise<ViewAskDone>,
    private readonly onTheLatestWriteEnded: (outcome: GraphInputWriteOutcome) => void,
  ) {}

  /** Write `value` now, or once the write in flight ends, in place of any value still waiting. */
  write(value: JsonValue): void {
    if (this.isWriting) {
      this.valueWaiting = { value };
      return;
    }
    this.isWriting = true;
    void this.writeThenTheValueWaiting(value);
  }

  private async writeThenTheValueWaiting(value: JsonValue): Promise<void> {
    const answer = await this.writeTheValue(value);
    const waiting = this.valueWaiting;
    this.valueWaiting = null;
    if (waiting !== null) {
      void this.writeThenTheValueWaiting(waiting.value);
      return;
    }
    this.isWriting = false;
    this.onTheLatestWriteEnded(answer.kind === "done" ? { kind: "written", value } : { kind: "refused", value, because: answer.because });
  }
}
