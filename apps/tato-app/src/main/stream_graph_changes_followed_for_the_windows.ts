// The graph changes of every stream a window follows, pushed by the runtime over one `/control/ws`
// WebSocket: `subscribe_stream_graph_changes` names each stream once, and each
// `stream_graph_changed` of a followed stream, `missed` among them, is told to every window
// following it so it reads that graph again. The runtime refuses to subscribe a stream it does not
// hold loaded, so that stream is subscribed again after a wait; once subscribed, the runtime follows
// it across reloads itself. A connection that closes is opened again after a wait, and each stream
// told it changed once it is subscribed again.

import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { ControlNotifications, TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

/** The parts of a `/control/ws` connection the stream graphs are followed over, so a test can stand in for one. */
export interface StreamGraphChangesConnection {
  /** The runtime's `subscribe_stream_graph_changes` of `streams`; refused, in its words, for a stream it does not hold loaded. */
  subscribeToTheStreamGraphChanges(streams: string[]): Promise<Result<void, string>>;
  /** Call `listener` with each `stream_graph_changed` the runtime sends on this connection. */
  onStreamGraphChanged(listener: (change: ControlNotifications["stream_graph_changed"]) => void): void;
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void;
  isOpen(): boolean;
  close(): void;
}

/** A window that follows stream graphs: where each change of one it follows goes. */
export interface WindowFollowingStreamGraphs {
  sendTheWindowTheStreamGraphChanged(stream: string): void;
}

/** What following the stream graphs reaches: the runtime, a timer, and the app's log. */
export interface StreamGraphChangesFollowedForTheWindowsSources {
  openTheStreamGraphChangesConnection(): Promise<Result<StreamGraphChangesConnection, LocalApiRequestFailure>>;
  /** Call `then` once, `afterMs` from now. */
  waitThen(afterMs: number, then: () => void): void;
  tatolabAppLog: TatolabAppLog;
}

/** How long a stream the runtime would not subscribe, or whose connection closed, waits before it is subscribed again. */
export const STREAM_GRAPH_SUBSCRIBED_AGAIN_AFTER_MS = 2_500;

/** `controlWebSocketConnection` as the connection the stream graphs are followed over. */
export function streamGraphChangesConnectionOver(controlWebSocketConnection: TatolabRuntimeControlWebSocketConnection): StreamGraphChangesConnection {
  return {
    subscribeToTheStreamGraphChanges: async (streams) => {
      const subscribed = await controlWebSocketConnection.callControlOperation("subscribe_stream_graph_changes", { streams });
      if (!subscribed.ok) return failedWith(subscribed.failure.failureDescription);
      return subscribed.value.kind === "refused_by_the_operation" ? failedWith(subscribed.value.words) : succeeded(undefined);
    },
    onStreamGraphChanged: (listener) => {
      controlWebSocketConnection.onNotification("stream_graph_changed", listener);
    },
    onClosed: (whenTheConnectionCloses) => controlWebSocketConnection.onClosed(whenTheConnectionCloses),
    isOpen: () => controlWebSocketConnection.isOpen(),
    close: () => controlWebSocketConnection.close(),
  };
}

/** Every stream graph the app's windows follow, over one connection held open while any window follows one. */
export class StreamGraphChangesFollowedForTheWindows {
  private readonly windowsFollowingByStream = new Map<string, Set<WindowFollowingStreamGraphs>>();
  private readonly streamsSubscribed = new Set<string>();
  private readonly streamsBeingSubscribed = new Set<string>();
  private readonly streamsAwaitingASubscribe = new Set<string>();
  private streamGraphChangesConnection: StreamGraphChangesConnection | null = null;
  private streamGraphChangesConnectionOpening: Promise<Result<StreamGraphChangesConnection, string>> | null = null;

  constructor(private readonly sources: StreamGraphChangesFollowedForTheWindowsSources) {}

  /** Tell `windowFollowing` of each change of `stream`'s graph from now on. */
  followTheStreamGraph(stream: string, windowFollowing: WindowFollowingStreamGraphs): void {
    const windowsFollowing = this.windowsFollowingByStream.get(stream) ?? new Set<WindowFollowingStreamGraphs>();
    windowsFollowing.add(windowFollowing);
    this.windowsFollowingByStream.set(stream, windowsFollowing);
    void this.subscribe(stream);
  }

  /** Stop telling `windowFollowing` of `stream`'s graph; the connection closes once no window follows any stream. */
  stopFollowingTheStreamGraph(stream: string, windowFollowing: WindowFollowingStreamGraphs): void {
    const windowsFollowing = this.windowsFollowingByStream.get(stream);
    if (windowsFollowing === undefined) return;
    windowsFollowing.delete(windowFollowing);
    if (windowsFollowing.size === 0) this.windowsFollowingByStream.delete(stream);
    this.closeTheConnectionOnceNoWindowFollows();
  }

  /** Stop telling `windowFollowing` of any stream's graph, as it closes. */
  stopFollowingEveryStreamGraphOf(windowFollowing: WindowFollowingStreamGraphs): void {
    for (const stream of [...this.windowsFollowingByStream.keys()]) this.stopFollowingTheStreamGraph(stream, windowFollowing);
  }

  /** Stop following every stream graph and close the connection, as the app quits. */
  stopFollowingEveryStreamGraph(): void {
    this.windowsFollowingByStream.clear();
    this.closeTheConnectionOnceNoWindowFollows();
  }

  private closeTheConnectionOnceNoWindowFollows(): void {
    if (this.windowsFollowingByStream.size > 0) return;
    const streamGraphChangesConnection = this.streamGraphChangesConnection;
    this.streamGraphChangesConnection = null;
    this.streamsSubscribed.clear();
    streamGraphChangesConnection?.close();
  }

  private async subscribe(stream: string): Promise<void> {
    if (this.streamsSubscribed.has(stream) || this.streamsBeingSubscribed.has(stream) || this.streamsAwaitingASubscribe.has(stream)) return;
    this.streamsBeingSubscribed.add(stream);
    const opened = await this.theStreamGraphChangesConnection();
    if (!opened.ok) {
      this.streamsBeingSubscribed.delete(stream);
      this.subscribeAgainAfterAWait(stream, opened.failure);
      return;
    }
    const subscribed = await opened.value.subscribeToTheStreamGraphChanges([stream]);
    this.streamsBeingSubscribed.delete(stream);
    if (this.streamGraphChangesConnection !== opened.value || !this.windowsFollowingByStream.has(stream)) return;
    if (!subscribed.ok) {
      this.subscribeAgainAfterAWait(stream, subscribed.failure);
      return;
    }
    this.streamsSubscribed.add(stream);
    this.tellTheWindowsTheStreamGraphChanged(stream);
  }

  private subscribeAgainAfterAWait(stream: string, whyItWasNotSubscribed: string): void {
    if (!this.windowsFollowingByStream.has(stream) || this.streamsAwaitingASubscribe.has(stream)) return;
    this.sources.tatolabAppLog.info("will follow a stream's graph again", { stream, because: whyItWasNotSubscribed });
    this.streamsAwaitingASubscribe.add(stream);
    this.sources.waitThen(STREAM_GRAPH_SUBSCRIBED_AGAIN_AFTER_MS, () => {
      this.streamsAwaitingASubscribe.delete(stream);
      if (this.windowsFollowingByStream.has(stream)) void this.subscribe(stream);
    });
  }

  private theStreamGraphChangesConnection(): Promise<Result<StreamGraphChangesConnection, string>> {
    if (this.streamGraphChangesConnection !== null && this.streamGraphChangesConnection.isOpen()) return Promise.resolve(succeeded(this.streamGraphChangesConnection));
    if (this.streamGraphChangesConnectionOpening !== null) return this.streamGraphChangesConnectionOpening;
    const opening = this.openTheStreamGraphChangesConnection().finally(() => {
      if (this.streamGraphChangesConnectionOpening === opening) this.streamGraphChangesConnectionOpening = null;
    });
    this.streamGraphChangesConnectionOpening = opening;
    return opening;
  }

  private async openTheStreamGraphChangesConnection(): Promise<Result<StreamGraphChangesConnection, string>> {
    const opened = await this.sources.openTheStreamGraphChangesConnection();
    if (!opened.ok) return failedWith(opened.failure.failureDescription);
    const streamGraphChangesConnection = opened.value;
    if (this.windowsFollowingByStream.size === 0) {
      streamGraphChangesConnection.close();
      return failedWith("no window follows a stream's graph any longer");
    }
    this.streamGraphChangesConnection = streamGraphChangesConnection;
    streamGraphChangesConnection.onStreamGraphChanged((change) => {
      if (this.streamGraphChangesConnection === streamGraphChangesConnection) this.tellTheWindowsTheStreamGraphChanged(change.stream);
    });
    streamGraphChangesConnection.onClosed((whyItClosed) => this.subscribeEveryStreamAgainAfter(streamGraphChangesConnection, whyItClosed));
    return succeeded(streamGraphChangesConnection);
  }

  private subscribeEveryStreamAgainAfter(closedConnection: StreamGraphChangesConnection, whyItClosed: string): void {
    if (this.streamGraphChangesConnection !== closedConnection) return;
    this.streamGraphChangesConnection = null;
    this.streamsSubscribed.clear();
    for (const stream of this.windowsFollowingByStream.keys()) this.subscribeAgainAfterAWait(stream, whyItClosed);
  }

  private tellTheWindowsTheStreamGraphChanged(stream: string): void {
    for (const windowFollowing of [...(this.windowsFollowingByStream.get(stream) ?? [])]) windowFollowing.sendTheWindowTheStreamGraphChanged(stream);
  }
}
