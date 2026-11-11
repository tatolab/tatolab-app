import type { JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { ViewAskDone } from "@tatolab/tato-app-view-sdk";

/** What became of the latest value a control wrote: taken, or refused in the runtime's own words. */
export type GraphInputWriteOutcome = { kind: "written" } | { kind: "refused"; because: string };

/** Writes one control's values one at a time, the latest value moved while a write is in flight next, skipping a value the same as the one last handed to it. */
export class GraphInputLatestValueWriter {
  private isWriting = false;
  private valueWaiting: { value: JsonValue } | null = null;
  private wordsOfTheValueLastHanded: string | null = null;

  constructor(
    private readonly writeTheValue: (value: JsonValue) => Promise<ViewAskDone>,
    private readonly onTheLatestWriteEnded: (outcome: GraphInputWriteOutcome) => void,
  ) {}

  /** Write `value` now, or once the write in flight ends, in place of any value still waiting; a value the same as the last one handed is written once. */
  write(value: JsonValue): void {
    const valueWords = JSON.stringify(value);
    if (valueWords === this.wordsOfTheValueLastHanded) return;
    this.wordsOfTheValueLastHanded = valueWords;
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
    if (answer.kind === "refused") this.wordsOfTheValueLastHanded = null;
    this.onTheLatestWriteEnded(answer.kind === "done" ? { kind: "written" } : { kind: "refused", because: answer.because });
  }
}
