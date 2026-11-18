// The graph changes of every stream a window follows, pushed by the runtime as
// `stream_graph_changed`, and the changes of the values its inputs read, pushed as
// `input_value_changed`. One connection makes both subscriptions for each stream, so the runtime
// sends it no graph change for a value set live. The runtime refuses to subscribe a stream it does
// not hold loaded, so that stream is subscribed again after a wait; once subscribed, the runtime
// follows it across reloads itself.

import { Effect, Stream } from "effect";
import type { StreamGraphInputValueChange } from "../shared/tatolab_backend_contract.js";
import type { ControlPushesFeed, ControlPushesFollowed, SubjectPushed } from "./control_pushes_followed_for_the_windows.js";
import { inputValueReadOnTheWire } from "./input_value_read_on_the_wire.js";
import type { ControlNotifications } from "./tatolab_runtime_control_operation_call.js";

/** A window that follows stream graphs: where each change of one it follows goes, a value change, or `null` to read the graph again. */
export interface WindowFollowingStreamGraphs {
  sendTheWindowTheStreamGraphChanged(stream: string, inputValueChange: StreamGraphInputValueChange | null): void;
}

/** What a push of a followed stream carries: the change of what one input reads, or `null` when the graph is read again. */
export type StreamGraphPushed = StreamGraphInputValueChange | null;

/** Every stream graph the app's windows follow, each by its stream id. */
export type StreamGraphChangesFollowedForTheWindows = ControlPushesFollowed<WindowFollowingStreamGraphs>;

/** What an input reads after an `input_value_changed`: a value, a link feeding it, or nothing at all. */
export function inputValueChangeOnTheWire(changed: ControlNotifications["input_value_changed"]): StreamGraphInputValueChange {
  return { node: changed.node, input: changed.input, value_read: inputValueReadOnTheWire(changed) ?? { value: null, comes_from: null } };
}

/** Stream graphs as followed on a connection: both subscriptions for each stream, each `stream_graph_changed` and each `input_value_changed`. */
export const STREAM_GRAPH_CHANGES: ControlPushesFeed<StreamGraphPushed> = {
  subjectAsTheLogNamesIt: "stream graph",
  subscribe: (connection, stream) =>
    connection.call("subscribe_stream_graph_changes", { streams: [stream] }).pipe(Effect.andThen(connection.call("subscribe_input_value_changes", { streams: [stream] })), Effect.asVoid),
  pushes: (connection) =>
    Stream.merge(
      connection.notifications("stream_graph_changed").pipe(Stream.map((change): SubjectPushed<StreamGraphPushed> => ({ subject: change.stream, pushed: null }))),
      connection.notifications("input_value_changed").pipe(Stream.map((changed): SubjectPushed<StreamGraphPushed> => ({ subject: changed.stream, pushed: inputValueChangeOnTheWire(changed) }))),
    ),
};

/** Hand `windowFollowing` what the runtime pushed of `stream`. */
export function tellTheWindowTheStreamGraphChanged(windowFollowing: WindowFollowingStreamGraphs, stream: string, pushed: StreamGraphPushed): void {
  windowFollowing.sendTheWindowTheStreamGraphChanged(stream, pushed);
}
