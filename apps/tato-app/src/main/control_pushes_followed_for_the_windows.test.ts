import { expect, test } from "vitest";
import { CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER_MS, ControlPushesFollowedForTheWindows, type ControlPushesConnection } from "./control_pushes_followed_for_the_windows.js";
import { localApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** A `/control/ws` connection that subscribes each stream in `streamsLoaded`, refuses any other in the runtime's words, and records every subscribe. */
class FakeStreamGraphChangesConnection implements ControlPushesConnection {
  readonly streamsSubscribed: string[] = [];
  private readonly streamGraphChangedListeners: ((stream: string) => void)[] = [];
  private readonly closedListeners: ((whyItClosed: string) => void)[] = [];
  private isOpenNow = true;

  constructor(private readonly streamsLoaded: Set<string>) {}

  async subscribeToThePushesOf(stream: string): Promise<Result<void, string>> {
    this.streamsSubscribed.push(stream);
    return this.streamsLoaded.has(stream) ? succeeded(undefined) : failedWith(`subscribe_stream_graph_changes failed: no stream with the id \`${stream}\` is loaded in this runtime`);
  }

  onPushed(listener: (stream: string) => void): void {
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

  pushTheStreamGraphChanged(stream: string): void {
    for (const listener of this.streamGraphChangedListeners) listener(stream);
  }

  closeFromTheRuntime(): void {
    this.isOpenNow = false;
    for (const listener of this.closedListeners) listener("the runtime closed the /control/ws connection");
  }
}

/** A window recording each stream it is told changed. */
function windowRecordingTheChanges(): { streamsToldChanged: string[] } {
  return { streamsToldChanged: [] };
}

/** The followed stream graphs over fake connections, each opened one recorded, and waits run only when `runTheWaits` is called. */
function streamGraphChangesFollowedOverFakeConnections(streamsLoaded: Set<string>) {
  const connectionsOpened: FakeStreamGraphChangesConnection[] = [];
  const waitsPending: { afterMs: number; then: () => void }[] = [];
  let doesTheRuntimeAnswer = true;
  const followed = new ControlPushesFollowedForTheWindows<{ streamsToldChanged: string[] }>({
    openThePushesConnection: async () => {
      if (!doesTheRuntimeAnswer) return localApiRequestFailure("no runtime answers at /tmp/local-api.sock");
      const connection = new FakeStreamGraphChangesConnection(streamsLoaded);
      connectionsOpened.push(connection);
      return succeeded(connection);
    },
    tellTheWindowItChanged: (windowFollowing, stream) => windowFollowing.streamsToldChanged.push(stream),
    waitThen: (afterMs, then) => waitsPending.push({ afterMs, then }),
    tatolabAppLog: quietTatolabAppLog,
    subjectAsTheLogNamesIt: "stream graph",
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

  followed.follow("main", studioWindow);
  followed.follow("main", poppedOutView);
  await settle();
  const [connection] = connectionsOpened;
  connection?.pushTheStreamGraphChanged("main");
  connection?.pushTheStreamGraphChanged("another-stream");

  expect(connectionsOpened).toHaveLength(1);
  expect(connection?.streamsSubscribed).toEqual(["main"]);
  expect(studioWindow.streamsToldChanged).toEqual(["main", "main"]);
  expect(poppedOutView.streamsToldChanged).toEqual(["main", "main"]);
});

test("a_stream_not_loaded_yet_is_subscribed_again_after_a_wait_and_its_window_told_once_it_is", async () => {
  const streamsLoaded = new Set<string>();
  const { followed, connectionsOpened, waitsPending, runTheWaits } = streamGraphChangesFollowedOverFakeConnections(streamsLoaded);
  const studioWindow = windowRecordingTheChanges();

  followed.follow("main", studioWindow);
  await settle();
  expect(waitsPending.map((wait) => wait.afterMs)).toEqual([CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER_MS]);
  expect(studioWindow.streamsToldChanged).toEqual([]);
  streamsLoaded.add("main");
  runTheWaits();
  await settle();

  expect(connectionsOpened[0]?.streamsSubscribed).toEqual(["main", "main"]);
  expect(studioWindow.streamsToldChanged).toEqual(["main"]);
});

test("a_connection_the_runtime_closes_is_opened_again_and_every_followed_stream_subscribed_again", async () => {
  const { followed, connectionsOpened, runTheWaits } = streamGraphChangesFollowedOverFakeConnections(new Set(["main", "lobby"]));
  const studioWindow = windowRecordingTheChanges();
  followed.follow("main", studioWindow);
  followed.follow("lobby", studioWindow);
  await settle();

  connectionsOpened[0]?.closeFromTheRuntime();
  connectionsOpened[0]?.pushTheStreamGraphChanged("main");
  runTheWaits();
  await settle();

  expect(connectionsOpened).toHaveLength(2);
  expect(connectionsOpened[1]?.streamsSubscribed.sort()).toEqual(["lobby", "main"]);
  expect(studioWindow.streamsToldChanged.sort()).toEqual(["lobby", "lobby", "main", "main"]);
});

test("a_runtime_that_does_not_answer_is_tried_again_after_a_wait", async () => {
  const { followed, connectionsOpened, setTheRuntimeAnswers, runTheWaits } = streamGraphChangesFollowedOverFakeConnections(new Set(["main"]));
  const studioWindow = windowRecordingTheChanges();
  setTheRuntimeAnswers(false);

  followed.follow("main", studioWindow);
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
  followed.follow("main", studioWindow);
  followed.follow("lobby", poppedOutView);
  await settle();
  const [connection] = connectionsOpened;

  followed.stopFollowingEverySubjectOf(poppedOutView);
  connection?.pushTheStreamGraphChanged("lobby");
  expect(connection?.isOpen()).toBe(true);
  followed.stopFollowing("main", studioWindow);

  expect(poppedOutView.streamsToldChanged).toEqual(["lobby"]);
  expect(connection?.isOpen()).toBe(false);
});
