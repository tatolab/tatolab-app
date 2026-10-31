import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import type { StreamActionDescription } from "../shared/tatolab_backend_contract";
import { RepeatingBackendPoll } from "./repeating_backend_poll";

/** How often a followed stream action is read again: as often as the app reads the runtime's status. */
export const STREAM_ACTION_FOLLOWING_INTERVAL_MILLISECONDS = 2_000;

/** How many reads of a followed action may fail in a row, a runtime restart among them, before it is no longer followed. */
export const MOST_FAILED_STREAM_ACTION_READS_IN_A_ROW = 5;

/** One read of a followed action: where it has got to, or why it is no longer followed, in the runtime's words or Tatolab's. */
export type StreamActionFollowingRead = { kind: "described"; description: StreamActionDescription } | { kind: "no_longer_followed"; words: string };

/**
 * Reads one queued stream action each round until stopped, handing each read to `onRead` with the action it is of. A read
 * the runtime does not answer is tried again next round, until `MOST_FAILED_STREAM_ACTION_READS_IN_A_ROW` fail in a row.
 */
export class StreamActionFollowing {
  private followedAction: string | null = null;
  private failedReadsInARow = 0;
  private readonly followedActionPoll: RepeatingBackendPoll;

  constructor(
    private readonly backend: Pick<TatolabBackend, "describeStreamAction">,
    private readonly onRead: (action: string, read: StreamActionFollowingRead) => void,
    intervalMilliseconds: number = STREAM_ACTION_FOLLOWING_INTERVAL_MILLISECONDS,
  ) {
    this.followedActionPoll = new RepeatingBackendPoll(() => this.readTheFollowedAction(), intervalMilliseconds);
  }

  /** Follow `action` from now on, in place of any action followed before. */
  follow(action: string): void {
    this.followedActionPoll.stop();
    this.followedAction = action;
    this.failedReadsInARow = 0;
    this.followedActionPoll.start();
  }

  /** Stop following, dropping any read of the action followed until now. */
  stop(): void {
    this.followedAction = null;
    this.followedActionPoll.stop();
  }

  private readTheFollowedAction(): Promise<void> {
    const action = this.followedAction;
    if (action === null) return Promise.resolve();
    return this.backend.describeStreamAction(action).then(
      (followed) => {
        if (this.followedAction !== action) return;
        this.failedReadsInARow = 0;
        this.onRead(action, followed.kind === "described" ? followed : { kind: "no_longer_followed", words: followed.words });
      },
      (rejection: unknown) => {
        if (this.followedAction !== action) return;
        this.failedReadsInARow += 1;
        if (this.failedReadsInARow < MOST_FAILED_STREAM_ACTION_READS_IN_A_ROW) return;
        this.onRead(action, { kind: "no_longer_followed", words: `Tatolab could not read the load: ${describeBackendRejection(rejection)}` });
      },
    );
  }
}
