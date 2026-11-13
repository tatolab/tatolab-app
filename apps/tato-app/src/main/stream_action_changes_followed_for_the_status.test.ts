import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { StreamActionDescription } from "../shared/tatolab_backend_contract.js";
import { localApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import {
  STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER_MS,
  StreamActionChangesFollowedForTheStatus,
  type StreamActionChangesConnection,
} from "./stream_action_changes_followed_for_the_status.js";
import { streamActionDescriptionFromTheDescribeStreamActionToolResult } from "./stream_action_description.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { ControlNotifications } from "./tatolab_runtime_control_operation_call.js";

const SYNCING_ACTION = "Rvxjb0uiacgp6c3o13o9qvzj1-1";

/** The `describe_stream_action` answer a recorded tool response carries, read as the app reads one. */
async function recordedStreamActionDescription(fixtureFileName: string): Promise<StreamActionDescription> {
  const toolResponse: { result: { content: { text: string }[] } } = JSON.parse(await readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8"));
  const described = streamActionDescriptionFromTheDescribeStreamActionToolResult(JSON.parse(toolResponse.result.content[0]?.text ?? "{}"));
  return described.ok ? described.value : expect.unreachable(described.failure);
}

const makingTheVenv = () => recordedStreamActionDescription("local-api-describe-stream-action-of-a-new-project-downloading-numpy-and-pillow.json");
const doneAfterItsSync = () => recordedStreamActionDescription("local-api-describe-stream-action-of-a-new-project-done-numpy-and-pillow-installed.json");

/** A `/control/ws` connection that subscribes, or refuses in `subscribeRefusal`, describes each action as `describedActions` holds it now, and lets a test push a change or close it from the runtime's end. */
class FakeStreamActionChangesConnection implements StreamActionChangesConnection {
  subscribeCount = 0;
  isClosed = false;
  readonly actionsDescribed: string[] = [];
  private readonly streamActionChangedListeners: ((change: ControlNotifications["stream_action_changed"]) => void)[] = [];
  private readonly closedListeners: ((whyItClosed: string) => void)[] = [];

  constructor(
    private readonly subscribeRefusal: string | null,
    private readonly actionsUnderWay: string[],
    private readonly describedActions: Map<string, StreamActionDescription>,
  ) {}

  async subscribeToTheStreamActionChanges(): Promise<Result<string[], string>> {
    this.subscribeCount += 1;
    return this.subscribeRefusal === null ? succeeded(this.actionsUnderWay) : failedWith(this.subscribeRefusal);
  }

  onStreamActionChanged(listener: (change: ControlNotifications["stream_action_changed"]) => void): void {
    this.streamActionChangedListeners.push(listener);
  }

  async describeTheStreamAction(action: string): Promise<Result<StreamActionDescription, string>> {
    this.actionsDescribed.push(action);
    const description = this.describedActions.get(action);
    return description === undefined ? failedWith(`describe_stream_action failed: no stream action ${action} is held`) : succeeded(description);
  }

  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void {
    this.closedListeners.push(whenTheConnectionCloses);
  }

  close(): void {
    this.isClosed = true;
  }

  pushAStreamActionChanged(action = "Rsome-other-action-1"): void {
    for (const listener of this.streamActionChangedListeners) listener({ change: "changed", action });
  }

  pushMissed(): void {
    for (const listener of this.streamActionChangedListeners) listener({ change: "missed" });
  }

  closeFromTheRuntime(): void {
    this.isClosed = true;
    for (const listener of this.closedListeners) listener("the runtime closed the /control/ws connection");
  }
}

/** The followed stream actions over fake connections, counting each status read asked for; waits run only when `runTheWaits` is called. */
function streamActionsFollowedOverFakeConnections(options: { subscribeRefusals?: (string | null)[]; actionsUnderWay?: string[] } = {}) {
  const connectionsOpened: FakeStreamActionChangesConnection[] = [];
  const waitsPending: { afterMs: number; then: () => void }[] = [];
  const statusReads = { asked: 0 };
  const describedActions = new Map<string, StreamActionDescription>();
  const logLines: string[] = [];
  let doesTheRuntimeAnswer = true;
  const followed = new StreamActionChangesFollowedForTheStatus({
    openTheStreamActionChangesConnection: async () => {
      if (!doesTheRuntimeAnswer) return localApiRequestFailure("no runtime answers at /tmp/local-api.sock");
      const connection = new FakeStreamActionChangesConnection(options.subscribeRefusals?.[connectionsOpened.length] ?? null, options.actionsUnderWay ?? [], describedActions);
      connectionsOpened.push(connection);
      return succeeded(connection);
    },
    waitThen: (afterMs, then) => waitsPending.push({ afterMs, then }),
    readTheStatusAgain: () => {
      statusReads.asked += 1;
    },
    tatolabAppLog: createTatolabAppLog("warn", (logLine) => logLines.push(logLine)),
  });
  return {
    followed,
    connectionsOpened,
    waitsPending,
    statusReads,
    describedActions,
    logLines,
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

test("a_sync_on_its_making_the_venv_step_is_under_way_and_ends_once_with_the_sync_its_ended_action_carries", async () => {
  const { followed, connectionsOpened, describedActions, statusReads } = streamActionsFollowedOverFakeConnections();
  followed.follow();
  await settle();

  describedActions.set(SYNCING_ACTION, await makingTheVenv());
  connectionsOpened[0]?.pushAStreamActionChanged(SYNCING_ACTION);
  await settle();
  const whileSyncing = followed.takeTheProjectVenvSyncs();
  const statusReadsWhileSyncing = statusReads.asked;
  describedActions.set(SYNCING_ACTION, await doneAfterItsSync());
  connectionsOpened[0]?.pushAStreamActionChanged(SYNCING_ACTION);
  await settle();
  const onceDone = followed.takeTheProjectVenvSyncs();

  expect(whileSyncing.underWay.map((sync) => [sync.action, sync.venv_sync.phase])).toEqual([[SYNCING_ACTION, "downloading"]]);
  expect(whileSyncing.justEnded).toEqual([]);
  expect(statusReadsWhileSyncing).toBe(3);
  expect(onceDone.underWay).toEqual([]);
  expect(onceDone.justEnded.map((sync) => [sync.action, sync.venv_sync.phase])).toEqual([[SYNCING_ACTION, "installed"]]);
  expect(followed.takeTheProjectVenvSyncs()).toEqual({ underWay: [], justEnded: [] });
});

test("a_sync_no_describe_caught_under_way_still_ends_once_its_action_is_described_done", async () => {
  const { followed, connectionsOpened, describedActions } = streamActionsFollowedOverFakeConnections();
  followed.follow();
  await settle();

  describedActions.set(SYNCING_ACTION, await doneAfterItsSync());
  connectionsOpened[0]?.pushAStreamActionChanged(SYNCING_ACTION);
  await settle();

  expect(followed.takeTheProjectVenvSyncs().justEnded.map((sync) => sync.action)).toEqual([SYNCING_ACTION]);
});

test("an_action_already_past_its_sync_as_the_subscription_began_hands_over_no_ended_sync", async () => {
  const { followed, describedActions, connectionsOpened } = streamActionsFollowedOverFakeConnections({ actionsUnderWay: [SYNCING_ACTION] });
  describedActions.set(SYNCING_ACTION, { ...(await doneAfterItsSync()), state: "in_progress", step: "starting" });

  followed.follow();
  await settle();
  connectionsOpened[0]?.pushAStreamActionChanged(SYNCING_ACTION);
  await settle();

  expect(connectionsOpened[0]?.actionsDescribed).toEqual([SYNCING_ACTION, SYNCING_ACTION]);
  expect(followed.takeTheProjectVenvSyncs()).toEqual({ underWay: [], justEnded: [] });
});

test("missed_describes_every_action_followed_again", async () => {
  const { followed, describedActions, connectionsOpened } = streamActionsFollowedOverFakeConnections({ actionsUnderWay: [SYNCING_ACTION] });
  describedActions.set(SYNCING_ACTION, await makingTheVenv());
  followed.follow();
  await settle();

  describedActions.set(SYNCING_ACTION, await doneAfterItsSync());
  connectionsOpened[0]?.pushMissed();
  await settle();

  expect(connectionsOpened[0]?.actionsDescribed).toEqual([SYNCING_ACTION, SYNCING_ACTION]);
  expect(followed.takeTheProjectVenvSyncs().justEnded.map((sync) => sync.venv_sync.phase)).toEqual(["installed"]);
});

test("an_action_the_runtime_no_longer_describes_is_logged_and_shows_no_sync", async () => {
  const { followed, connectionsOpened, logLines } = streamActionsFollowedOverFakeConnections();
  followed.follow();
  await settle();

  connectionsOpened[0]?.pushAStreamActionChanged(SYNCING_ACTION);
  await settle();

  expect(followed.takeTheProjectVenvSyncs()).toEqual({ underWay: [], justEnded: [] });
  expect(logLines.join("\n")).toContain(`no stream action ${SYNCING_ACTION} is held`);
});

test("a_connection_the_runtime_closes_drops_its_syncs_under_way_and_is_followed_again_after_a_wait", async () => {
  const { followed, connectionsOpened, describedActions, waitsPending, statusReads, runTheWaits } = streamActionsFollowedOverFakeConnections();
  followed.follow();
  await settle();
  describedActions.set(SYNCING_ACTION, await makingTheVenv());
  connectionsOpened[0]?.pushAStreamActionChanged(SYNCING_ACTION);
  await settle();
  const statusReadsBeforeTheClose = statusReads.asked;

  connectionsOpened[0]?.closeFromTheRuntime();
  connectionsOpened[0]?.pushAStreamActionChanged();
  expect(followed.takeTheProjectVenvSyncs().underWay).toEqual([]);
  expect(statusReads.asked).toBe(statusReadsBeforeTheClose + 1);
  expect(waitsPending.map((wait) => wait.afterMs)).toEqual([STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER_MS]);
  runTheWaits();
  await settle();
  connectionsOpened[1]?.pushAStreamActionChanged();

  expect(connectionsOpened).toHaveLength(2);
  expect(statusReads.asked).toBe(statusReadsBeforeTheClose + 3);
});

test("a_runtime_that_does_not_answer_or_refuses_the_subscription_is_followed_again_after_a_wait", async () => {
  const { followed, connectionsOpened, statusReads, setTheRuntimeAnswers, runTheWaits } = streamActionsFollowedOverFakeConnections({ subscribeRefusals: ["subscribe_stream_action_changes failed: not now"] });
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

const OPEN_ACTION = "Rvxjb0uiacgp6c3o13o9qvzj1-2";
const RELOAD_ACTION = "Rvxjb0uiacgp6c3o13o9qvzj1-3";
const EARLIER_RECORD_REFUSAL = "stream p-main-0a1b2c is held by a record an earlier runtime wrote";

async function anOpenThatFailed(): Promise<StreamActionDescription> {
  const done = await doneAfterItsSync();
  return { ...done, action: OPEN_ACTION, kind: "open", state: "failed", step: null, streams: [], failed_because: EARLIER_RECORD_REFUSAL, venv_sync: null };
}

test("an_action_that_failed_holds_its_projects_failure_in_the_runtimes_words_until_another_action_of_the_project_is_described", async () => {
  const { followed, connectionsOpened, describedActions, statusReads } = streamActionsFollowedOverFakeConnections();
  const openThatFailed = await anOpenThatFailed();
  describedActions.set(OPEN_ACTION, openThatFailed);
  followed.follow();
  await settle();
  const statusReadsBeforeTheFailure = statusReads.asked;

  connectionsOpened[0]?.pushAStreamActionChanged(OPEN_ACTION);
  await settle();
  connectionsOpened[0]?.pushAStreamActionChanged(OPEN_ACTION);
  await settle();

  const failureHeld = { action: OPEN_ACTION, project_directory: openThatFailed.project_directory, kind: "open", failed_because: EARLIER_RECORD_REFUSAL };
  expect(followed.projectStreamActionFailuresNow()).toEqual([failureHeld]);
  expect(statusReads.asked).toBe(statusReadsBeforeTheFailure + 3);

  describedActions.set(RELOAD_ACTION, { ...openThatFailed, action: RELOAD_ACTION, kind: "load", state: "queued", failed_because: null });
  connectionsOpened[0]?.pushAStreamActionChanged(RELOAD_ACTION);
  await settle();

  expect(followed.projectStreamActionFailuresNow()).toEqual([]);
});

test("a_lost_connection_forgets_every_projects_failure", async () => {
  const { followed, connectionsOpened, describedActions } = streamActionsFollowedOverFakeConnections();
  describedActions.set(OPEN_ACTION, await anOpenThatFailed());
  followed.follow();
  await settle();
  connectionsOpened[0]?.pushAStreamActionChanged(OPEN_ACTION);
  await settle();

  connectionsOpened[0]?.closeFromTheRuntime();

  expect(followed.projectStreamActionFailuresNow()).toEqual([]);
});
