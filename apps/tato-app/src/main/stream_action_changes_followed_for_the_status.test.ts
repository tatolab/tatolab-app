import { expect, test } from "vitest";
import { localApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import {
  STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER_MS,
  StreamActionChangesFollowedForTheStatus,
  type StreamActionChangesConnection,
} from "./stream_action_changes_followed_for_the_status.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** A `/control/ws` connection that subscribes, or refuses in `subscribeRefusal`, and lets a test push a change or close it from the runtime's end. */
class FakeStreamActionChangesConnection implements StreamActionChangesConnection {
  subscribeCount = 0;
  isClosed = false;
  private readonly streamActionChangedListeners: (() => void)[] = [];
  private readonly closedListeners: ((whyItClosed: string) => void)[] = [];

  constructor(private readonly subscribeRefusal: string | null) {}

  async subscribeToTheStreamActionChanges(): Promise<Result<void, string>> {
    this.subscribeCount += 1;
    return this.subscribeRefusal === null ? succeeded(undefined) : failedWith(this.subscribeRefusal);
  }

  onStreamActionChanged(whenAStreamActionChanged: () => void): void {
    this.streamActionChangedListeners.push(whenAStreamActionChanged);
  }

  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void {
    this.closedListeners.push(whenTheConnectionCloses);
  }

  close(): void {
    this.isClosed = true;
  }

  pushAStreamActionChanged(): void {
    for (const listener of this.streamActionChangedListeners) listener();
  }

  closeFromTheRuntime(): void {
    this.isClosed = true;
    for (const listener of this.closedListeners) listener("the runtime closed the /control/ws connection");
  }
}

/** The followed stream actions over fake connections, counting each status read asked for; waits run only when `runTheWaits` is called. */
function streamActionsFollowedOverFakeConnections(subscribeRefusals: (string | null)[] = []) {
  const connectionsOpened: FakeStreamActionChangesConnection[] = [];
  const waitsPending: { afterMs: number; then: () => void }[] = [];
  const statusReads = { asked: 0 };
  let doesTheRuntimeAnswer = true;
  const followed = new StreamActionChangesFollowedForTheStatus({
    openTheStreamActionChangesConnection: async () => {
      if (!doesTheRuntimeAnswer) return localApiRequestFailure("no runtime answers at /tmp/local-api.sock");
      const connection = new FakeStreamActionChangesConnection(subscribeRefusals[connectionsOpened.length] ?? null);
      connectionsOpened.push(connection);
      return succeeded(connection);
    },
    waitThen: (afterMs, then) => waitsPending.push({ afterMs, then }),
    readTheStatusAgain: () => {
      statusReads.asked += 1;
    },
    tatolabAppLog: quietTatolabAppLog,
  });
  return {
    followed,
    connectionsOpened,
    waitsPending,
    statusReads,
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

test("each_stream_action_change_reads_the_status_again_and_so_does_the_subscription_itself", async () => {
  const { followed, connectionsOpened, statusReads } = streamActionsFollowedOverFakeConnections();

  followed.follow();
  followed.follow();
  await settle();
  expect(statusReads.asked).toBe(1);
  connectionsOpened[0]?.pushAStreamActionChanged();
  connectionsOpened[0]?.pushAStreamActionChanged();

  expect(connectionsOpened).toHaveLength(1);
  expect(connectionsOpened[0]?.subscribeCount).toBe(1);
  expect(statusReads.asked).toBe(3);
});

test("a_connection_the_runtime_closes_is_followed_again_after_a_wait", async () => {
  const { followed, connectionsOpened, waitsPending, statusReads, runTheWaits } = streamActionsFollowedOverFakeConnections();
  followed.follow();
  await settle();

  connectionsOpened[0]?.closeFromTheRuntime();
  connectionsOpened[0]?.pushAStreamActionChanged();
  expect(waitsPending.map((wait) => wait.afterMs)).toEqual([STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER_MS]);
  runTheWaits();
  await settle();
  connectionsOpened[1]?.pushAStreamActionChanged();

  expect(connectionsOpened).toHaveLength(2);
  expect(statusReads.asked).toBe(3);
});

test("a_runtime_that_does_not_answer_or_refuses_the_subscription_is_followed_again_after_a_wait", async () => {
  const { followed, connectionsOpened, statusReads, setTheRuntimeAnswers, runTheWaits } = streamActionsFollowedOverFakeConnections(["subscribe_stream_action_changes failed: not now"]);
  setTheRuntimeAnswers(false);

  followed.follow();
  await settle();
  setTheRuntimeAnswers(true);
  runTheWaits();
  await settle();
  expect(connectionsOpened[0]?.isClosed).toBe(true);
  runTheWaits();
  await settle();

  expect(connectionsOpened).toHaveLength(2);
  expect(statusReads.asked).toBe(1);
});

test("stopping_closes_the_connection_and_reads_the_status_no_more", async () => {
  const { followed, connectionsOpened, statusReads } = streamActionsFollowedOverFakeConnections();
  followed.follow();
  await settle();

  followed.stop();
  connectionsOpened[0]?.pushAStreamActionChanged();

  expect(connectionsOpened[0]?.isClosed).toBe(true);
  expect(statusReads.asked).toBe(1);
});
