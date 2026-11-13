// The graph changes of every stream a window follows, pushed by the runtime as
// `stream_graph_changed`. The runtime refuses to subscribe a stream it does not hold loaded, so that
// stream is subscribed again after a wait; once subscribed, the runtime follows it across reloads
// itself.

import { ControlPushesFollowedForTheWindows, type ControlPushesConnection, type ControlPushesFollowedForTheWindowsSources } from "./control_pushes_followed_for_the_windows.js";
import { failedWith, succeeded } from "./result.js";
import type { TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

/** A window that follows stream graphs: where each change of one it follows goes. */
export interface WindowFollowingStreamGraphs {
  sendTheWindowTheStreamGraphChanged(stream: string): void;
}

/** Every stream graph the app's windows follow, each by its stream id. */
export type StreamGraphChangesFollowedForTheWindows = ControlPushesFollowedForTheWindows<WindowFollowingStreamGraphs, null>;

/** `controlWebSocketConnection` as the connection stream graphs are followed over: `subscribe_stream_graph_changes`, and each `stream_graph_changed`. */
export function streamGraphChangesConnectionOver(controlWebSocketConnection: TatolabRuntimeControlWebSocketConnection): ControlPushesConnection<null> {
  return {
    subscribeToThePushesOf: async (stream) => {
      const subscribed = await controlWebSocketConnection.callControlOperation("subscribe_stream_graph_changes", { streams: [stream] });
      if (!subscribed.ok) return failedWith(subscribed.failure.failureDescription);
      return subscribed.value.kind === "refused_by_the_operation" ? failedWith(subscribed.value.words) : succeeded(undefined);
    },
    onPushed: (listener) => {
      controlWebSocketConnection.onNotification("stream_graph_changed", (change) => listener(change.stream, null));
    },
    onClosed: (whenTheConnectionCloses) => controlWebSocketConnection.onClosed(whenTheConnectionCloses),
    isOpen: () => controlWebSocketConnection.isOpen(),
    close: () => controlWebSocketConnection.close(),
  };
}

/** The stream graphs the app's windows follow, each change told to the windows following it. */
export function streamGraphChangesFollowedForTheWindows(
  sources: Omit<ControlPushesFollowedForTheWindowsSources<WindowFollowingStreamGraphs, null>, "tellTheWindowItChanged" | "subjectAsTheLogNamesIt">,
): StreamGraphChangesFollowedForTheWindows {
  return new ControlPushesFollowedForTheWindows({
    ...sources,
    tellTheWindowItChanged: (windowFollowing, stream) => windowFollowing.sendTheWindowTheStreamGraphChanged(stream),
    subjectAsTheLogNamesIt: "stream graph",
  });
}
