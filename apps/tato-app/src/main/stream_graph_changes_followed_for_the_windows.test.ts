import { expect, test } from "vitest";
import { isAJsonObject } from "./json_on_the_wire.js";
import { localApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import {
  STREAM_GRAPH_SUBSCRIBED_AGAIN_AFTER_MS,
  StreamGraphChangesFollowedForTheWindows,
  streamGraphChangesConnectionOver,
  type StreamGraphChangesConnection,
  type WindowFollowingStreamGraphs,
} from "./stream_graph_changes_followed_for_the_windows.js";
import { TatolabRuntimeControlWebSocketConnection, type ControlNotifications } from "./tatolab_runtime_control_operation_call.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** A `/control/ws` connection that subscribes each stream in `streamsLoaded`, refuses any other in the runtime's words, and records every subscribe. */
class FakeStreamGraphChangesConnection implements StreamGraphChangesConnection {
  readonly streamsSubscribed: string[][] = [];
  private readonly streamGraphChangedListeners: ((change: ControlNotifications["stream_graph_changed"]) => void)[] = [];
  private readonly closedListeners: ((whyItClosed: string) => void)[] = [];
  private isOpenNow = true;

  constructor(private readonly streamsLoaded: Set<string>) {}

  async subscribeToTheStreamGraphChanges(streams: string[]): Promise<Result<void, string>> {
    this.streamsSubscribed.push(streams);
    const notLoaded = streams.find((stream) => !this.streamsLoaded.has(stream));
    return notLoaded === undefined ? succeeded(undefined) : failedWith(`subscribe_stream_graph_changes failed: no stream with the id \`${notLoaded}\` is loaded in this runtime`);
  }

  onStreamGraphChanged(listener: (change: ControlNotifications["stream_graph_changed"]) => void): void {
    this.streamGraphChangedListeners.push(listener);
  }

  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void {
    this.closedListeners.push(whenTheConnectionCloses);
  }

  isOpen(): boolean {
    return this.isOpenNow;
  }

  close(): void {
    this.isOpenNow = false;
  }

  pushTheStreamGraphChanged(change: ControlNotifications["stream_graph_changed"]): void {
    for (const listener of this.streamGraphChangedListeners) listener(change);
  }

  closeFromTheRuntime(): void {
    this.isOpenNow = false;
    for (const listener of this.closedListeners) listener("the runtime closed the /control/ws connection");
  }
}

/** A window recording each stream it is told changed. */
function windowRecordingTheChanges(): WindowFollowingStreamGraphs & { streamsToldChanged: string[] } {
  const streamsToldChanged: string[] = [];
  return { streamsToldChanged, sendTheWindowTheStreamGraphChanged: (stream) => streamsToldChanged.push(stream) };
}

/** The followed stream graphs over fake connections, each opened one recorded, and waits run only when `runTheWaits` is called. */
function streamGraphChangesFollowedOverFakeConnections(streamsLoaded: Set<string>) {
  const connectionsOpened: FakeStreamGraphChangesConnection[] = [];
  const waitsPending: { afterMs: number; then: () => void }[] = [];
  let doesTheRuntimeAnswer = true;
  const followed = new StreamGraphChangesFollowedForTheWindows({
    openTheStreamGraphChangesConnection: async () => {
      if (!doesTheRuntimeAnswer) return localApiRequestFailure("no runtime answers at /tmp/local-api.sock");
      const connection = new FakeStreamGraphChangesConnection(streamsLoaded);
      connectionsOpened.push(connection);
      return succeeded(connection);
    },
    waitThen: (afterMs, then) => waitsPending.push({ afterMs, then }),
    tatolabAppLog: quietTatolabAppLog,
  });
  return {
    followed,
    connectionsOpened,
    waitsPending,
    setTheRuntimeAnswers: (answers: boolean) => {
      doesTheRuntimeAnswer = answers;
    },
    runTheWaits: () => {
      for (const wait of waitsPending.splice(0)) wait.then();
    },
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

test("two_windows_following_one_stream_share_one_subscription_and_each_is_told_of_its_changes", async () => {
  const { followed, connectionsOpened } = streamGraphChangesFollowedOverFakeConnections(new Set(["main"]));
  const studioWindow = windowRecordingTheChanges();
  const poppedOutView = windowRecordingTheChanges();

  followed.followTheStreamGraph("main", studioWindow);
  followed.followTheStreamGraph("main", poppedOutView);
  await settle();
  const [connection] = connectionsOpened;
  connection?.pushTheStreamGraphChanged({ stream: "main", change: "edited" });
  connection?.pushTheStreamGraphChanged({ stream: "another-stream", change: "edited" });

  expect(connectionsOpened).toHaveLength(1);
  expect(connection?.streamsSubscribed).toEqual([["main"]]);
  expect(studioWindow.streamsToldChanged).toEqual(["main", "main"]);
  expect(poppedOutView.streamsToldChanged).toEqual(["main", "main"]);
});

test("a_stream_not_loaded_yet_is_subscribed_again_after_a_wait_and_its_window_told_once_it_is", async () => {
  const streamsLoaded = new Set<string>();
  const { followed, connectionsOpened, waitsPending, runTheWaits } = streamGraphChangesFollowedOverFakeConnections(streamsLoaded);
  const studioWindow = windowRecordingTheChanges();

  followed.followTheStreamGraph("main", studioWindow);
  await settle();
  expect(waitsPending.map((wait) => wait.afterMs)).toEqual([STREAM_GRAPH_SUBSCRIBED_AGAIN_AFTER_MS]);
  expect(studioWindow.streamsToldChanged).toEqual([]);
  streamsLoaded.add("main");
  runTheWaits();
  await settle();

  expect(connectionsOpened[0]?.streamsSubscribed).toEqual([["main"], ["main"]]);
  expect(studioWindow.streamsToldChanged).toEqual(["main"]);
});

test("a_connection_the_runtime_closes_is_opened_again_and_every_followed_stream_subscribed_again", async () => {
  const { followed, connectionsOpened, runTheWaits } = streamGraphChangesFollowedOverFakeConnections(new Set(["main", "lobby"]));
  const studioWindow = windowRecordingTheChanges();
  followed.followTheStreamGraph("main", studioWindow);
  followed.followTheStreamGraph("lobby", studioWindow);
  await settle();

  connectionsOpened[0]?.closeFromTheRuntime();
  connectionsOpened[0]?.pushTheStreamGraphChanged({ stream: "main", change: "edited" });
  runTheWaits();
  await settle();

  expect(connectionsOpened).toHaveLength(2);
  expect(connectionsOpened[1]?.streamsSubscribed.flat().sort()).toEqual(["lobby", "main"]);
  expect(studioWindow.streamsToldChanged.sort()).toEqual(["lobby", "lobby", "main", "main"]);
});

test("a_runtime_that_does_not_answer_is_tried_again_after_a_wait", async () => {
  const { followed, connectionsOpened, setTheRuntimeAnswers, runTheWaits } = streamGraphChangesFollowedOverFakeConnections(new Set(["main"]));
  const studioWindow = windowRecordingTheChanges();
  setTheRuntimeAnswers(false);

  followed.followTheStreamGraph("main", studioWindow);
  await settle();
  setTheRuntimeAnswers(true);
  runTheWaits();
  await settle();

  expect(connectionsOpened).toHaveLength(1);
  expect(studioWindow.streamsToldChanged).toEqual(["main"]);
});

test("the_connection_closes_once_no_window_follows_and_a_closed_window_is_told_nothing_more", async () => {
  const { followed, connectionsOpened } = streamGraphChangesFollowedOverFakeConnections(new Set(["main", "lobby"]));
  const studioWindow = windowRecordingTheChanges();
  const poppedOutView = windowRecordingTheChanges();
  followed.followTheStreamGraph("main", studioWindow);
  followed.followTheStreamGraph("lobby", poppedOutView);
  await settle();
  const [connection] = connectionsOpened;

  followed.stopFollowingEveryStreamGraphOf(poppedOutView);
  connection?.pushTheStreamGraphChanged({ stream: "lobby", change: "node_state_changed", node: "7f3a", node_state: "Running" });
  expect(connection?.isOpen()).toBe(true);
  followed.stopFollowingTheStreamGraph("main", studioWindow);

  expect(poppedOutView.streamsToldChanged).toEqual(["lobby"]);
  expect(connection?.isOpen()).toBe(false);
});

/** Against a real runtime holding the stream loaded: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> TATOLAB_APP_LIVE_LOADED_STREAM=<stream id> npx vitest run src/main/stream_graph_changes_followed_for_the_windows.test.ts`. */
const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "";
const liveLoadedStream = process.env["TATOLAB_APP_LIVE_LOADED_STREAM"] ?? "";
test.skipIf(liveLocalApiSocket === "" || liveLoadedStream === "")("a_real_runtime_pushes_an_edit_of_a_followed_stream_to_its_window", async () => {
  const followed = new StreamGraphChangesFollowedForTheWindows({
    openTheStreamGraphChangesConnection: async () => {
      const opened = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
      return opened.ok ? succeeded(streamGraphChangesConnectionOver(opened.value)) : opened;
    },
    waitThen: (afterMs, then) => {
      setTimeout(then, afterMs);
    },
    tatolabAppLog: quietTatolabAppLog,
  });
  const studioWindow = windowRecordingTheChanges();
  followed.followTheStreamGraph(liveLoadedStream, studioWindow);
  await expect.poll(() => studioWindow.streamsToldChanged.length, { timeout: 5_000 }).toBe(1);

  const editor = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
  if (!editor.ok) return expect.unreachable(editor.failure.failureDescription);
  const graphRead = await editor.value.callControlOperation("graph", { stream: liveLoadedStream });
  const streamAsset = graphRead.ok && graphRead.value.kind === "answered" && isAJsonObject(graphRead.value.result) ? graphRead.value.result["asset"] : undefined;
  if (typeof streamAsset !== "string") return expect.unreachable(`the graph of ${liveLoadedStream} names no asset`);
  const noteAdded = await editor.value.callControlOperation("add_note", { stream: streamAsset, text: "pushed", position: [0, 0], size: [120, 60], mode: "live" });
  editor.value.close();

  expect(noteAdded.ok && noteAdded.value.kind).toBe("answered");
  await expect.poll(() => studioWindow.streamsToldChanged.length, { timeout: 5_000 }).toBeGreaterThan(1);
  expect(new Set(studioWindow.streamsToldChanged)).toEqual(new Set([liveLoadedStream]));
  followed.stopFollowingEveryStreamGraph();
});
