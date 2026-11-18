import { readFile } from "node:fs/promises";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { expect, test } from "vitest";
import type { StreamActionDescription } from "../shared/tatolab_backend_contract.js";
import { fakeRuntimeOfConnections, refusedByTheOperation, runOnATestClock, settle, type FakeControlConnection } from "./control_connection_test_support.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER, StreamActionsNoticed, streamActionsFollowedForTheStatus } from "./stream_action_changes_followed_for_the_status.js";
import { streamActionDescriptionFromTheDescribeStreamActionToolResult } from "./stream_action_description.js";
import { tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { ControlOperationResult } from "./tatolab_runtime_control_operation_call.js";

const SYNCING_ACTION = "Rvxjb0uiacgp6c3o13o9qvzj1-1";

/** The `describe_stream_action` answer a recorded tool response carries, read as the app reads one. */
async function recordedStreamActionDescription(fixtureFileName: string): Promise<StreamActionDescription> {
  const toolResponse: { result: { content: { text: string }[] } } = JSON.parse(await readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8"));
  const described = streamActionDescriptionFromTheDescribeStreamActionToolResult(JSON.parse(toolResponse.result.content[0]?.text ?? "{}"));
  return described.ok ? described.value : expect.unreachable(described.failure);
}

const makingTheVenv = () => recordedStreamActionDescription("local-api-describe-stream-action-of-a-new-project-downloading-numpy-and-pillow.json");
const doneAfterItsSync = () => recordedStreamActionDescription("local-api-describe-stream-action-of-a-new-project-done-numpy-and-pillow-installed.json");

/** `description` as `describe_stream_action` answers it: the same fields, as JSON carries them. */
function describedOnTheWire(description: StreamActionDescription): ControlOperationResult<"describe_stream_action"> {
  return JSON.parse(JSON.stringify(description));
}

/** The followed stream actions over a fake runtime's connections, each describing an action as `describedActions` holds it now, counting each status read asked for and logging to `logLines`. */
function streamActionsFollowedOverAFakeRuntime(options: { subscribeRefusals?: (string | null)[]; actionsUnderWay?: string[] } = {}) {
  const describedActions = new Map<string, StreamActionDescription>();
  let subscribesAnswered = 0;
  const runtime = fakeRuntimeOfConnections({
    subscribe_stream_action_changes: () => {
      const refusal = options.subscribeRefusals?.[subscribesAnswered] ?? null;
      subscribesAnswered += 1;
      return refusal === null
        ? Effect.succeed({ actions_under_way: options.actionsUnderWay ?? [] })
        : Effect.fail(refusedByTheOperation("subscribe_stream_action_changes", refusal));
    },
    describe_stream_action: ({ action }) => {
      const description = describedActions.get(action);
      return description === undefined
        ? Effect.fail(refusedByTheOperation("describe_stream_action", `describe_stream_action failed: no stream action ${action} is held`))
        : Effect.succeed(describedOnTheWire(description));
    },
  });
  const statusReads = { asked: 0 };
  const logLines: string[] = [];
  const noticed = new StreamActionsNoticed();
  const followed = streamActionsFollowedForTheStatus(noticed, () => {
    statusReads.asked += 1;
  });
  const layer = Layer.merge(runtime.layer, tatolabAppLogAsEffectsLogger(createTatolabAppLog("info", (logLine) => logLines.push(logLine))));
  return { ...runtime, layer, followed, noticed, statusReads, describedActions, logLines };
}

/** Each action `connection` was asked to describe, in order. */
function actionsDescribedOn(connection: FakeControlConnection | undefined): string[] {
  return (connection?.callsMade ?? []).flatMap(([method, params]) => (method === "describe_stream_action" && isAJsonObject(params) && typeof params["action"] === "string" ? [params["action"]] : []));
}

/** `stream_action_changed` naming `action`, as the runtime pushes one. */
function pushAStreamActionChanged(connection: FakeControlConnection | undefined, action = "Rsome-other-action-1"): void {
  connection?.push("stream_action_changed", { change: "changed", action });
}

test("each_stream_action_change_reads_the_status_again_and_so_does_the_subscription_itself", async () => {
  const { followed, connectionsOpened, statusReads, layer } = streamActionsFollowedOverAFakeRuntime();

  await runOnATestClock(
    Effect.gen(function* () {
      const streamActions = yield* followed;
      yield* streamActions.follow;
      yield* streamActions.follow;
      yield* settle;
      expect(statusReads.asked).toBe(1);
      pushAStreamActionChanged(connectionsOpened[0]);
      pushAStreamActionChanged(connectionsOpened[0]);
      yield* settle;
    }),
    layer,
  );

  expect(connectionsOpened).toHaveLength(1);
  expect(connectionsOpened[0]?.callsMade.filter(([method]) => method === "subscribe_stream_action_changes")).toHaveLength(1);
  expect(statusReads.asked).toBe(3);
});

test("nothing_is_followed_before_follow", async () => {
  const { followed, connectionsOpened, layer } = streamActionsFollowedOverAFakeRuntime();

  await runOnATestClock(
    Effect.gen(function* () {
      yield* followed;
      yield* TestClock.adjust(STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER);
    }),
    layer,
  );

  expect(connectionsOpened).toEqual([]);
});

test("a_sync_on_its_making_the_venv_step_is_under_way_and_ends_once_with_the_sync_its_ended_action_carries", async () => {
  const { followed, connectionsOpened, describedActions, statusReads, noticed, layer } = streamActionsFollowedOverAFakeRuntime();
  const syncing = await makingTheVenv();
  const done = await doneAfterItsSync();

  const { whileSyncing, statusReadsWhileSyncing, onceDone } = await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      describedActions.set(SYNCING_ACTION, syncing);
      pushAStreamActionChanged(connectionsOpened[0], SYNCING_ACTION);
      yield* settle;
      const whileSyncing = noticed.takeTheProjectVenvSyncs();
      const statusReadsWhileSyncing = statusReads.asked;
      describedActions.set(SYNCING_ACTION, done);
      pushAStreamActionChanged(connectionsOpened[0], SYNCING_ACTION);
      yield* settle;
      return { whileSyncing, statusReadsWhileSyncing, onceDone: noticed.takeTheProjectVenvSyncs() };
    }),
    layer,
  );

  expect(whileSyncing.underWay.map((sync) => [sync.action, sync.venv_sync.phase])).toEqual([[SYNCING_ACTION, "downloading"]]);
  expect(whileSyncing.justEnded).toEqual([]);
  expect(statusReadsWhileSyncing).toBe(3);
  expect(onceDone.underWay).toEqual([]);
  expect(onceDone.justEnded.map((sync) => [sync.action, sync.venv_sync.phase])).toEqual([[SYNCING_ACTION, "installed"]]);
  expect(noticed.takeTheProjectVenvSyncs()).toEqual({ underWay: [], justEnded: [] });
});

test("a_sync_no_describe_caught_under_way_still_ends_once_its_action_is_described_done", async () => {
  const { followed, connectionsOpened, describedActions, noticed, layer } = streamActionsFollowedOverAFakeRuntime();
  describedActions.set(SYNCING_ACTION, await doneAfterItsSync());

  const justEnded = await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      pushAStreamActionChanged(connectionsOpened[0], SYNCING_ACTION);
      yield* settle;
      return noticed.takeTheProjectVenvSyncs().justEnded;
    }),
    layer,
  );

  expect(justEnded.map((sync) => sync.action)).toEqual([SYNCING_ACTION]);
});

test("an_action_already_past_its_sync_as_the_subscription_began_hands_over_no_ended_sync", async () => {
  const { followed, describedActions, connectionsOpened, noticed, layer } = streamActionsFollowedOverAFakeRuntime({ actionsUnderWay: [SYNCING_ACTION] });
  describedActions.set(SYNCING_ACTION, { ...(await doneAfterItsSync()), state: "in_progress", step: "starting" });

  const syncs = await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      pushAStreamActionChanged(connectionsOpened[0], SYNCING_ACTION);
      yield* settle;
      return noticed.takeTheProjectVenvSyncs();
    }),
    layer,
  );

  expect(actionsDescribedOn(connectionsOpened[0])).toEqual([SYNCING_ACTION, SYNCING_ACTION]);
  expect(syncs).toEqual({ underWay: [], justEnded: [] });
});

test("missed_describes_every_action_followed_again", async () => {
  const { followed, describedActions, connectionsOpened, noticed, layer } = streamActionsFollowedOverAFakeRuntime({ actionsUnderWay: [SYNCING_ACTION] });
  describedActions.set(SYNCING_ACTION, await makingTheVenv());
  const done = await doneAfterItsSync();

  const justEnded = await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      describedActions.set(SYNCING_ACTION, done);
      connectionsOpened[0]?.push("stream_action_changed", { change: "missed" });
      yield* settle;
      return noticed.takeTheProjectVenvSyncs().justEnded;
    }),
    layer,
  );

  expect(actionsDescribedOn(connectionsOpened[0])).toEqual([SYNCING_ACTION, SYNCING_ACTION]);
  expect(justEnded.map((sync) => sync.venv_sync.phase)).toEqual(["installed"]);
});

test("an_action_the_runtime_no_longer_describes_is_logged_and_shows_no_sync", async () => {
  const { followed, connectionsOpened, logLines, noticed, layer } = streamActionsFollowedOverAFakeRuntime();

  await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      pushAStreamActionChanged(connectionsOpened[0], SYNCING_ACTION);
      yield* settle;
    }),
    layer,
  );

  expect(noticed.takeTheProjectVenvSyncs()).toEqual({ underWay: [], justEnded: [] });
  expect(logLines.join("\n")).toContain(`no stream action ${SYNCING_ACTION} is held`);
  expect(connectionsOpened).toHaveLength(1);
});

test("a_connection_the_runtime_closes_drops_its_syncs_under_way_and_is_followed_again_on_the_schedule", async () => {
  const { followed, connectionsOpened, describedActions, statusReads, noticed, logLines, layer } = streamActionsFollowedOverAFakeRuntime();
  describedActions.set(SYNCING_ACTION, await makingTheVenv());

  const statusReadsBeforeTheClose = await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      pushAStreamActionChanged(connectionsOpened[0], SYNCING_ACTION);
      yield* settle;
      const statusReadsBeforeTheClose = statusReads.asked;
      connectionsOpened[0]?.closeFromTheRuntime();
      yield* settle;
      pushAStreamActionChanged(connectionsOpened[0]);
      expect(noticed.takeTheProjectVenvSyncs().underWay).toEqual([]);
      expect(statusReads.asked).toBe(statusReadsBeforeTheClose + 1);
      expect(connectionsOpened).toHaveLength(1);
      yield* TestClock.adjust(STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER);
      pushAStreamActionChanged(connectionsOpened[1]);
      yield* settle;
      return statusReadsBeforeTheClose;
    }),
    layer,
  );

  expect(connectionsOpened).toHaveLength(2);
  expect(connectionsOpened[0]?.closedByTheApp).toBe(true);
  expect(statusReads.asked).toBe(statusReadsBeforeTheClose + 3);
  expect(logLines.join("\n")).toContain("will follow the stream actions again");
});

test("a_runtime_that_does_not_answer_or_refuses_the_subscription_is_followed_again_on_the_schedule", async () => {
  const { followed, connectionsOpened, statusReads, runtime, layer } = streamActionsFollowedOverAFakeRuntime({ subscribeRefusals: ["subscribe_stream_action_changes failed: not now"] });
  runtime.answers = false;

  await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      runtime.answers = true;
      yield* TestClock.adjust(STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER);
      expect(connectionsOpened[0]?.closedByTheApp).toBe(true);
      yield* TestClock.adjust(STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER);
    }),
    layer,
  );

  expect(connectionsOpened).toHaveLength(2);
  expect(statusReads.asked).toBe(1);
});

test("a_connect_that_breaks_is_logged_and_followed_again_on_the_schedule", async () => {
  const { followed, connectionsOpened, runtime, logLines, layer } = streamActionsFollowedOverAFakeRuntime();
  runtime.breaksOnTheNextConnect = true;

  await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      yield* TestClock.adjust(STREAM_ACTIONS_FOLLOWED_AGAIN_AFTER);
    }),
    layer,
  );

  expect(connectionsOpened).toHaveLength(1);
  expect(logLines.join("\n")).toContain("following the stream actions broke");
});

test("closing_the_scope_closes_the_connection_and_reads_the_status_no_more", async () => {
  const { followed, connectionsOpened, statusReads, layer } = streamActionsFollowedOverAFakeRuntime();

  await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
    }),
    layer,
  );
  pushAStreamActionChanged(connectionsOpened[0]);

  expect(connectionsOpened[0]?.closedByTheApp).toBe(true);
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
  const { followed, connectionsOpened, describedActions, statusReads, noticed, layer } = streamActionsFollowedOverAFakeRuntime();
  const openThatFailed = await anOpenThatFailed();
  describedActions.set(OPEN_ACTION, openThatFailed);
  const failureHeld = { action: OPEN_ACTION, project_directory: openThatFailed.project_directory, kind: "open", failed_because: EARLIER_RECORD_REFUSAL };

  await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      const statusReadsBeforeTheFailure = statusReads.asked;
      pushAStreamActionChanged(connectionsOpened[0], OPEN_ACTION);
      yield* settle;
      pushAStreamActionChanged(connectionsOpened[0], OPEN_ACTION);
      yield* settle;
      expect(noticed.projectStreamActionFailuresNow()).toEqual([failureHeld]);
      expect(statusReads.asked).toBe(statusReadsBeforeTheFailure + 3);
      describedActions.set(RELOAD_ACTION, { ...openThatFailed, action: RELOAD_ACTION, kind: "load", state: "queued", failed_because: null });
      pushAStreamActionChanged(connectionsOpened[0], RELOAD_ACTION);
      yield* settle;
    }),
    layer,
  );

  expect(noticed.projectStreamActionFailuresNow()).toEqual([]);
});

test("a_lost_connection_forgets_every_projects_failure", async () => {
  const { followed, connectionsOpened, describedActions, noticed, layer } = streamActionsFollowedOverAFakeRuntime();
  describedActions.set(OPEN_ACTION, await anOpenThatFailed());

  await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow;
      yield* settle;
      pushAStreamActionChanged(connectionsOpened[0], OPEN_ACTION);
      yield* settle;
      expect(noticed.projectStreamActionFailuresNow()).toHaveLength(1);
      connectionsOpened[0]?.closeFromTheRuntime();
      yield* settle;
    }),
    layer,
  );

  expect(noticed.projectStreamActionFailuresNow()).toEqual([]);
});
