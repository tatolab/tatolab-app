// The runtime's stream actions followed over one `/control/ws` WebSocket, so the status is read
// again the moment a load, a run, a stop or any other action moves on, rather than at the status
// poll's next round. `subscribe_stream_action_changes` follows every action; each
// `stream_action_changed`, `missed` among them, asks for the status again, and so does the
// subscription itself, as an action may have moved before it began. A connection that cannot open,
// cannot subscribe or closes is followed again after a wait.

import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

/** The parts of a `/control/ws` connection the stream actions are followed over, so a test can stand in for one. */
export interface StreamActionChangesConnection {
  /** The runtime's `subscribe_stream_action_changes`; refused in its words. */
  subscribeToTheStreamActionChanges(): Promise<Result<void, string>>;
  /** Call `whenAStreamActionChanged` on each `stream_action_changed` the runtime sends on this connection. */
  onStreamActionChanged(whenAStreamActionChanged: () => void): void;
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void;
  close(): void;
}

/** What following the stream actions reaches: the runtime, a timer, the status, and the app's log. */
export interface StreamActionChangesFollowedForTheStatusSources {
  openTheStreamActionChangesConnection(): Promise<Result<StreamActionChangesConnection, LocalApiRequestFailure>>;
  /** Call `then` once, `afterMs` from now. */
  waitThen(afterMs: number, then: () => void): void;
  /** Read the status again now, as a stream action moved on. */
  readTheStatusAgain(): void;
  tatolabAppLog: TatolabAppLog;
}

/** How long the stream actions wait, after their connection could not open, could not subscribe or closed, before they are followed again. */
export const STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER_MS = 2_500;

/** `controlWebSocketConnection` as the connection the stream actions are followed over. */
export function streamActionChangesConnectionOver(controlWebSocketConnection: TatolabRuntimeControlWebSocketConnection): StreamActionChangesConnection {
  return {
    subscribeToTheStreamActionChanges: async () => {
      const subscribed = await controlWebSocketConnection.callControlOperation("subscribe_stream_action_changes", {});
      if (!subscribed.ok) return failedWith(subscribed.failure.failureDescription);
      return subscribed.value.kind === "refused_by_the_operation" ? failedWith(subscribed.value.words) : succeeded(undefined);
    },
    onStreamActionChanged: (whenAStreamActionChanged) => {
      controlWebSocketConnection.onNotification("stream_action_changed", () => whenAStreamActionChanged());
    },
    onClosed: (whenTheConnectionCloses) => controlWebSocketConnection.onClosed(whenTheConnectionCloses),
    close: () => controlWebSocketConnection.close(),
  };
}

/** The runtime's stream actions, followed from `follow` until `stop` so the status is read again as each one moves on. */
export class StreamActionChangesFollowedForTheStatus {
  private streamActionChangesConnection: StreamActionChangesConnection | null = null;
  private isFollowing = false;
  private isAwaitingAFollowAgain = false;

  constructor(private readonly sources: StreamActionChangesFollowedForTheStatusSources) {}

  /** Start following the stream actions; a second call starts nothing. */
  follow(): void {
    if (this.isFollowing) return;
    this.isFollowing = true;
    void this.openAndSubscribe();
  }

  /** Stop following and close the connection, as the app quits. */
  stop(): void {
    this.isFollowing = false;
    const streamActionChangesConnection = this.streamActionChangesConnection;
    this.streamActionChangesConnection = null;
    streamActionChangesConnection?.close();
  }

  private async openAndSubscribe(): Promise<void> {
    const opened = await this.sources.openTheStreamActionChangesConnection();
    if (!this.isFollowing) {
      if (opened.ok) opened.value.close();
      return;
    }
    if (!opened.ok) {
      this.followAgainAfterAWait(opened.failure.failureDescription);
      return;
    }
    const streamActionChangesConnection = opened.value;
    this.streamActionChangesConnection = streamActionChangesConnection;
    streamActionChangesConnection.onStreamActionChanged(() => {
      if (this.streamActionChangesConnection === streamActionChangesConnection) this.sources.readTheStatusAgain();
    });
    streamActionChangesConnection.onClosed((whyItClosed) => {
      if (this.streamActionChangesConnection !== streamActionChangesConnection) return;
      this.streamActionChangesConnection = null;
      this.followAgainAfterAWait(whyItClosed);
    });
    const subscribed = await streamActionChangesConnection.subscribeToTheStreamActionChanges();
    if (this.streamActionChangesConnection !== streamActionChangesConnection) return;
    if (!subscribed.ok) {
      this.streamActionChangesConnection = null;
      streamActionChangesConnection.close();
      this.followAgainAfterAWait(subscribed.failure);
      return;
    }
    this.sources.readTheStatusAgain();
  }

  private followAgainAfterAWait(whyItIsNotFollowed: string): void {
    if (!this.isFollowing || this.isAwaitingAFollowAgain) return;
    this.isAwaitingAFollowAgain = true;
    this.sources.tatolabAppLog.info("will follow the stream actions again", { because: whyItIsNotFollowed });
    this.sources.waitThen(STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER_MS, () => {
      this.isAwaitingAFollowAgain = false;
      if (this.isFollowing && this.streamActionChangesConnection === null) void this.openAndSubscribe();
    });
  }
}
