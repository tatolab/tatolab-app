import { Duration, Effect, Stream } from "effect";
import { TestClock } from "effect/testing";
import { expect, test } from "vitest";
import { fakeRuntimeOfConnections, refusedByTheOperation, runOnATestClock, settle, type FakeControlConnection } from "./control_connection_test_support.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER, controlPushesFollowedForTheWindows, type ControlPushesFeed } from "./control_pushes_followed_for_the_windows.js";

/** Stream graphs followed with one subscribe each, refused for a stream the runtime does not hold loaded, and each `stream_graph_changed` pushed with nothing. */
const STREAM_GRAPHS: ControlPushesFeed<null> = {
  subjectAsTheLogNamesIt: "stream graph",
  subscribe: (connection, stream) => connection.call("subscribe_stream_graph_changes", { streams: [stream] }).pipe(Effect.asVoid),
  pushes: (connection) => connection.notifications("stream_graph_changed").pipe(Stream.map((changed) => ({ subject: changed.stream, pushed: null }))),
};

/** A window recording each stream it is told changed. */
interface WindowRecordingTheChanges {
  readonly streamsToldChanged: string[];
}

function windowRecordingTheChanges(): WindowRecordingTheChanges {
  return { streamsToldChanged: [] };
}

/** A runtime holding `streamsLoaded`, whose connections subscribe each and refuse any other in the runtime's words, and the stream graphs followed over it. */
function streamGraphsFollowedOverAFakeRuntime(streamsLoaded: Set<string>) {
  const runtime = fakeRuntimeOfConnections({
    subscribe_stream_graph_changes: ({ streams }) => streams.every((stream) => streamsLoaded.has(stream))
        ? Effect.succeed({ streams })
        : Effect.fail(refusedByTheOperation("subscribe_stream_graph_changes", `subscribe_stream_graph_changes failed: no stream with the id \`${streams.join(", ")}\` is loaded in this runtime`)),
  });
  const followed = controlPushesFollowedForTheWindows(STREAM_GRAPHS, (windowFollowing: WindowRecordingTheChanges, stream) => void windowFollowing.streamsToldChanged.push(stream));
  return { ...runtime, followed };
}

/** Each stream `connection` was asked to subscribe, in order. */
function streamsSubscribedOn(connection: FakeControlConnection | undefined): string[] {
  return (connection?.callsMade ?? []).flatMap(([, params]) =>
    isAJsonObject(params) && Array.isArray(params["streams"]) ? params["streams"].filter((stream): stream is string => typeof stream === "string") : [],
  );
}

test("two_windows_following_one_stream_share_one_subscription_and_each_is_told_of_its_changes", async () => {
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime(new Set(["main"]));
  const studioWindow = windowRecordingTheChanges();
  const poppedOutView = windowRecordingTheChanges();

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("main", studioWindow);
      yield* streamGraphs.follow("main", poppedOutView);
      yield* settle;
      connectionsOpened[0]?.push("stream_graph_changed", { stream: "main", change: "missed" });
      connectionsOpened[0]?.push("stream_graph_changed", { stream: "another-stream", change: "missed" });
      yield* settle;
    }),
    layer,
  );

  expect(connectionsOpened).toHaveLength(1);
  expect(streamsSubscribedOn(connectionsOpened[0])).toEqual(["main"]);
  expect(studioWindow.streamsToldChanged).toEqual(["main", "main"]);
  expect(poppedOutView.streamsToldChanged).toEqual(["main", "main"]);
});

test("a_stream_not_loaded_yet_is_subscribed_again_on_the_schedule_and_its_window_told_once_it_is", async () => {
  const streamsLoaded = new Set<string>();
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime(streamsLoaded);
  const studioWindow = windowRecordingTheChanges();

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("main", studioWindow);
      yield* settle;
      expect(studioWindow.streamsToldChanged).toEqual([]);
      streamsLoaded.add("main");
      yield* TestClock.adjust(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER);
    }),
    layer,
  );

  expect(streamsSubscribedOn(connectionsOpened[0])).toEqual(["main", "main"]);
  expect(studioWindow.streamsToldChanged).toEqual(["main"]);
});

test("a_connection_the_runtime_closes_is_opened_again_on_the_schedule_and_every_followed_stream_subscribed_again", async () => {
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime(new Set(["main", "lobby"]));
  const studioWindow = windowRecordingTheChanges();

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("main", studioWindow);
      yield* streamGraphs.follow("lobby", studioWindow);
      yield* settle;
      connectionsOpened[0]?.closeFromTheRuntime();
      yield* settle;
      connectionsOpened[0]?.push("stream_graph_changed", { stream: "main", change: "missed" });
      expect(connectionsOpened).toHaveLength(1);
      yield* TestClock.adjust(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER);
    }),
    layer,
  );

  expect(connectionsOpened[0]?.closedByTheApp).toBe(true);
  expect(connectionsOpened).toHaveLength(2);
  expect(streamsSubscribedOn(connectionsOpened[1]).sort()).toEqual(["lobby", "main"]);
  expect(studioWindow.streamsToldChanged.sort()).toEqual(["lobby", "lobby", "main", "main"]);
});

test("a_runtime_that_does_not_answer_is_tried_again_on_the_schedule", async () => {
  const { followed, connectionsOpened, runtime, layer } = streamGraphsFollowedOverAFakeRuntime(new Set(["main"]));
  const studioWindow = windowRecordingTheChanges();
  runtime.answers = false;

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("main", studioWindow);
      yield* settle;
      runtime.answers = true;
      yield* TestClock.adjust(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER);
    }),
    layer,
  );

  expect(connectionsOpened).toHaveLength(1);
  expect(studioWindow.streamsToldChanged).toEqual(["main"]);
});

test("the_connection_closes_once_no_window_follows_and_a_closed_window_is_told_nothing_more", async () => {
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime(new Set(["main", "lobby"]));
  const studioWindow = windowRecordingTheChanges();
  const poppedOutView = windowRecordingTheChanges();

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("main", studioWindow);
      yield* streamGraphs.follow("lobby", poppedOutView);
      yield* settle;
      yield* streamGraphs.stopFollowingEverySubjectOf(poppedOutView);
      connectionsOpened[0]?.push("stream_graph_changed", { stream: "lobby", change: "missed" });
      yield* settle;
      expect(connectionsOpened[0]?.closedByTheApp).toBe(false);
      yield* streamGraphs.stopFollowing("main", studioWindow);
      yield* settle;
    }),
    layer,
  );

  expect(poppedOutView.streamsToldChanged).toEqual(["lobby"]);
  expect(connectionsOpened[0]?.closedByTheApp).toBe(true);
  expect(connectionsOpened).toHaveLength(1);
});

test("a_stream_followed_again_after_the_connection_closed_opens_a_new_one", async () => {
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime(new Set(["main"]));
  const studioWindow = windowRecordingTheChanges();

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("main", studioWindow);
      yield* settle;
      yield* streamGraphs.stopFollowing("main", studioWindow);
      yield* settle;
      yield* streamGraphs.follow("main", studioWindow);
      yield* settle;
    }),
    layer,
  );

  expect(connectionsOpened.map((connection) => connection.closedByTheApp)).toEqual([true, true]);
  expect(studioWindow.streamsToldChanged).toEqual(["main", "main"]);
});

test("a_window_that_breaks_on_a_push_closes_the_connection_and_it_is_opened_again_on_the_schedule", async () => {
  const runtime = fakeRuntimeOfConnections({ subscribe_stream_graph_changes: ({ streams }) => Effect.succeed({ streams }) });
  let timesTold = 0;
  const studioWindow = windowRecordingTheChanges();
  const followed = controlPushesFollowedForTheWindows(STREAM_GRAPHS, (windowFollowing: WindowRecordingTheChanges, stream) => {
    timesTold += 1;
    if (timesTold === 2) throw new Error("the window could not draw the change");
    windowFollowing.streamsToldChanged.push(stream);
  });

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("main", studioWindow);
      yield* settle;
      runtime.connectionsOpened[0]?.push("stream_graph_changed", { stream: "main", change: "missed" });
      yield* settle;
      expect(runtime.connectionsOpened[0]?.closedByTheApp).toBe(true);
      yield* TestClock.adjust(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER);
      runtime.connectionsOpened[1]?.push("stream_graph_changed", { stream: "main", change: "missed" });
      yield* settle;
    }),
    runtime.layer,
  );

  expect(runtime.connectionsOpened).toHaveLength(2);
  expect(studioWindow.streamsToldChanged).toEqual(["main", "main", "main"]);
});

test("a_connect_that_breaks_is_tried_again_on_the_schedule", async () => {
  const { followed, connectionsOpened, runtime, layer } = streamGraphsFollowedOverAFakeRuntime(new Set(["main"]));
  const studioWindow = windowRecordingTheChanges();
  runtime.breaksOnTheNextConnect = true;

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("main", studioWindow);
      yield* settle;
      expect(connectionsOpened).toHaveLength(0);
      yield* TestClock.adjust(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER);
    }),
    layer,
  );

  expect(connectionsOpened).toHaveLength(1);
  expect(studioWindow.streamsToldChanged).toEqual(["main"]);
});

test("a_stream_unfollowed_before_it_was_subscribed_is_tried_no_more_and_its_window_told_once_it_is_followed_again", async () => {
  const streamsLoaded = new Set<string>(["lobby"]);
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime(streamsLoaded);
  const studioWindow = windowRecordingTheChanges();

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("lobby", studioWindow);
      yield* streamGraphs.follow("main", studioWindow);
      yield* settle;
      yield* streamGraphs.stopFollowing("main", studioWindow);
      yield* settle;
      yield* TestClock.adjust(Duration.times(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER, 3));
      expect(streamsSubscribedOn(connectionsOpened[0]).sort()).toEqual(["lobby", "main"]);
      streamsLoaded.add("main");
      yield* streamGraphs.follow("main", studioWindow);
      yield* settle;
    }),
    layer,
  );

  expect(connectionsOpened).toHaveLength(1);
  expect(studioWindow.streamsToldChanged.sort()).toEqual(["lobby", "main"]);
});
