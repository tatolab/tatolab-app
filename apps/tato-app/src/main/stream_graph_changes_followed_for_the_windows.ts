// The graph changes of every stream a window follows, pushed by the runtime as
// `stream_graph_changed`, and the changes of the values its inputs read, pushed as
// `input_value_changed`. One connection makes both subscriptions for each stream, so the runtime
// sends it no graph change for a value set live. The runtime refuses to subscribe a stream it does
// not hold loaded, so that stream is subscribed again after a wait; once subscribed, the runtime
// follows it across reloads itself.

import type { StreamGraphInputValueChange } from "../shared/tatolab_backend_contract.js";
import { ControlPushesFollowedForTheWindows, type ControlPushesConnection, type ControlPushesFollowedForTheWindowsSources } from "./control_pushes_followed_for_the_windows.js";
import { inputValueReadOnTheWire } from "./input_value_read_on_the_wire.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { ControlNotifications, ControlOperationAnswer } from "./tatolab_runtime_control_operation_call.js";

/** The subscriptions a stream is followed by, both on one connection. */
export type StreamGraphSubscription = "subscribe_stream_graph_changes" | "subscribe_input_value_changes";

/** The pushes a followed stream sends. */
export type StreamGraphNotification = "stream_graph_changed" | "input_value_changed";

/** The parts of a `/control/ws` connection stream graphs are followed over, so a test can stand in for one; `TatolabRuntimeControlWebSocketConnection` is one. */
export interface StreamGraphControlConnection {
  callControlOperation(method: StreamGraphSubscription, params: { streams: string[] }): Promise<Result<ControlOperationAnswer<StreamGraphSubscription>, LocalApiRequestFailure>>;
  onNotification<Method extends StreamGraphNotification>(method: Method, listener: (params: ControlNotifications[Method]) => void): () => void;
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void;
  isOpen(): boolean;
  close(): void;
}

/** A window that follows stream graphs: where each change of one it follows goes, a value change, or `null` to read the graph again. */
export interface WindowFollowingStreamGraphs {
  sendTheWindowTheStreamGraphChanged(stream: string, inputValueChange: StreamGraphInputValueChange | null): void;
}

/** What a push of a followed stream carries: the change of what one input reads, or `null` when the graph is read again. */
export type StreamGraphPushed = StreamGraphInputValueChange | null;

/** Every stream graph the app's windows follow, each by its stream id. */
export type StreamGraphChangesFollowedForTheWindows = ControlPushesFollowedForTheWindows<WindowFollowingStreamGraphs, StreamGraphPushed>;

/** What an input reads after an `input_value_changed`: a value, a link feeding it, or nothing at all. */
export function inputValueChangeOnTheWire(changed: ControlNotifications["input_value_changed"]): StreamGraphInputValueChange {
  return { node: changed.node, input: changed.input, value_read: inputValueReadOnTheWire(changed) ?? { value: null, comes_from: null } };
}

/** `controlWebSocketConnection` as the connection stream graphs are followed over: both subscriptions for each stream, each `stream_graph_changed` and each `input_value_changed`. */
export function streamGraphChangesConnectionOver(controlWebSocketConnection: StreamGraphControlConnection): ControlPushesConnection<StreamGraphPushed> {
  const subscribe = async (operation: StreamGraphSubscription, stream: string): Promise<Result<void, string>> => {
    const subscribed = await controlWebSocketConnection.callControlOperation(operation, { streams: [stream] });
    if (!subscribed.ok) return failedWith(subscribed.failure.failureDescription);
    return subscribed.value.kind === "refused_by_the_operation" ? failedWith(subscribed.value.words) : succeeded(undefined);
  };
  return {
    subscribeToThePushesOf: async (stream) => {
      const graphChangesSubscribed = await subscribe("subscribe_stream_graph_changes", stream);
      return graphChangesSubscribed.ok ? subscribe("subscribe_input_value_changes", stream) : graphChangesSubscribed;
    },
    onPushed: (listener) => {
      controlWebSocketConnection.onNotification("stream_graph_changed", (change) => listener(change.stream, null));
      controlWebSocketConnection.onNotification("input_value_changed", (changed) => listener(changed.stream, inputValueChangeOnTheWire(changed)));
    },
    onClosed: (whenTheConnectionCloses) => controlWebSocketConnection.onClosed(whenTheConnectionCloses),
    isOpen: () => controlWebSocketConnection.isOpen(),
    close: () => controlWebSocketConnection.close(),
  };
}

/** The stream graphs the app's windows follow, each change told to the windows following it. */
export function streamGraphChangesFollowedForTheWindows(
  sources: Omit<ControlPushesFollowedForTheWindowsSources<WindowFollowingStreamGraphs, StreamGraphPushed>, "tellTheWindowItChanged" | "subjectAsTheLogNamesIt">,
): StreamGraphChangesFollowedForTheWindows {
  return new ControlPushesFollowedForTheWindows({
    ...sources,
    tellTheWindowItChanged: (windowFollowing, stream, pushed) => windowFollowing.sendTheWindowTheStreamGraphChanged(stream, pushed),
    subjectAsTheLogNamesIt: "stream graph",
  });
}
