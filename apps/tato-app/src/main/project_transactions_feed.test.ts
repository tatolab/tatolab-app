import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Effect, Layer, ManagedRuntime } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, expect, test } from "vitest";
import type { ProjectTransactionsReading } from "../shared/tatolab_backend_contract.js";
import { fakeRuntimeOfConnections, refusedByTheOperation, settle, type FakeControlConnection } from "./control_connection_test_support.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER, ProjectTransactionsFeedOfAStudioWindow } from "./project_transactions_feed.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { ProjectFeedsFollowed, projectFeedsFollowedLayerOver } from "./studio_runtime.js";
import type { ControlNotifications, ControlOperationResult } from "./tatolab_runtime_control_operation_call.js";

const PROJECT_FOLDER = "/home/sam/streams/pattern";
const PROJECT = "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90";
const ANOTHER_PROJECT = "7d1e0c55-3b2a-4f6e-9c1d-0a8b2e4f6c13";

const disposals: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

/** A change feed in the runtime's shape, holding transactions named by `transactionIds`, newest first. */
function changeFeedHolding(transactionIds: readonly string[]): ControlOperationResult<"read_project_changes"> {
  return JSON.parse(
    JSON.stringify({
      project: PROJECT,
      project_directory: PROJECT_FOLDER,
      transactions: transactionIds.map((transaction) => ({
        status: "applied",
        format_version: 2,
        transaction,
        commit: `commit-${transaction}`,
        parent_commit: null,
        author_kind: "agent",
        author_name: "claude-code",
        operations: [{ stream: "s", operation: "rename_node", node: "n", from: "a", to: "b" }],
        inverse_operations: [{ stream: "s", operation: "rename_node", node: "n", from: "b", to: "a" }],
        undo_state: "applied",
        applied_at: "2026-11-10T18:17:08Z",
      })),
    }),
  );
}

function transactionIdsOf(reading: ProjectTransactionsReading): string[] | string {
  return reading.kind === "read" ? reading.project_transactions.transactions.map((transaction) => transaction.transaction) : reading.because;
}

/** Each call `connection` was asked to make, as `<method> <what it names>`. */
function callsOn(connection: FakeControlConnection | undefined): string[] {
  return (connection?.callsMade ?? []).map(([method, params]) => {
    if (!isAJsonObject(params)) return method;
    const projects = params["projects"];
    return `${method} ${Array.isArray(projects) ? projects.join(", ") : String(params["project_directory"])}`;
  });
}

/** `project_changed` of `project`, as the runtime pushes one. */
function pushAProjectChanged(connection: FakeControlConnection | undefined, project = PROJECT, change: ControlNotifications["project_changed"]["change"] = "applied"): void {
  connection?.push("project_changed", { project, change });
}

/** A window's feed over a fake runtime serving `transactionIds`, followed on a test clock; its subscribe refuses any project but this one's. */
function feedOverAFakeRuntime(transactionIds: string[]) {
  const runtime = fakeRuntimeOfConnections({
    read_project_changes: () => Effect.succeed(changeFeedHolding(transactionIds)),
    subscribe_project_changes: ({ projects }) =>
      projects.every((project) => project === PROJECT) ? Effect.succeed({ projects }) : Effect.fail(refusedByTheOperation("subscribe_project_changes", `no project ${projects.join(", ")}`)),
  });
  const onATestClock = ManagedRuntime.make(Layer.merge(runtime.layer, TestClock.layer()));
  disposals.push(() => onATestClock.dispose());
  const readingsSent: ProjectTransactionsReading[] = [];
  const windowToldTheFilesChanged = { times: 0 };
  const windowToldTheNodeTypesChanged = { times: 0 };
  const feed = new ProjectTransactionsFeedOfAStudioWindow(PROJECT_FOLDER, {
    followOverTheRuntime: (following) => {
      const followingFiber = onATestClock.runFork(following);
      return () => followingFiber.interruptUnsafe();
    },
    sendTheWindowTheProjectTransactions: (reading) => readingsSent.push(reading),
    tellTheWindowTheProjectFilesChanged: () => {
      windowToldTheFilesChanged.times += 1;
    },
    tellTheWindowTheProjectNodeTypesChanged: () => {
      windowToldTheNodeTypesChanged.times += 1;
    },
  });
  return {
    ...runtime,
    feed,
    readingsSent,
    windowToldTheFilesChanged,
    windowToldTheNodeTypesChanged,
    settled: () => onATestClock.runPromise(settle),
    afterTheWait: () => onATestClock.runPromise(TestClock.adjust(PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER).pipe(Effect.andThen(settle))),
  };
}

test("reads_the_feed_subscribes_its_project_and_reads_it_again_on_each_change_of_that_project_alone", async () => {
  const transactionIds = ["t1"];
  const { feed, connectionsOpened, readingsSent, settled } = feedOverAFakeRuntime(transactionIds);

  feed.follow();
  await settled();
  transactionIds.unshift("t2");
  pushAProjectChanged(connectionsOpened[0]);
  await settled();
  pushAProjectChanged(connectionsOpened[0], ANOTHER_PROJECT);
  await settled();

  expect(callsOn(connectionsOpened[0])).toEqual([
    `read_project_changes ${PROJECT_FOLDER}`,
    `subscribe_project_changes ${PROJECT}`,
    `read_project_changes ${PROJECT_FOLDER}`,
    `read_project_changes ${PROJECT_FOLDER}`,
  ]);
  expect(readingsSent.map(transactionIdsOf)).toEqual([["t1"], ["t2", "t1"]]);
  expect(transactionIdsOf(feed.readProjectTransactions())).toEqual(["t2", "t1"]);
});

test("a_file_changed_in_the_folder_tells_the_window_without_reading_the_feed_and_missed_does_both", async () => {
  const { feed, connectionsOpened, windowToldTheFilesChanged, settled } = feedOverAFakeRuntime(["t1"]);
  feed.follow();
  await settled();
  const toldOnceSubscribed = windowToldTheFilesChanged.times;

  pushAProjectChanged(connectionsOpened[0], PROJECT, "files_changed");
  pushAProjectChanged(connectionsOpened[0], ANOTHER_PROJECT, "files_changed");
  await settled();
  pushAProjectChanged(connectionsOpened[0], PROJECT, "missed");
  await settled();

  expect(toldOnceSubscribed).toBe(1);
  expect(windowToldTheFilesChanged.times).toBe(3);
  expect(callsOn(connectionsOpened[0])).toEqual([
    `read_project_changes ${PROJECT_FOLDER}`,
    `subscribe_project_changes ${PROJECT}`,
    `read_project_changes ${PROJECT_FOLDER}`,
    `read_project_changes ${PROJECT_FOLDER}`,
  ]);
});

test("each_node_type_change_of_its_project_tells_the_window_its_node_types_changed_and_leaves_the_feed_unread", async () => {
  const { feed, connectionsOpened, windowToldTheFilesChanged, windowToldTheNodeTypesChanged, settled } = feedOverAFakeRuntime(["t1"]);
  feed.follow();
  await settled();
  const toldOnceSubscribed = windowToldTheNodeTypesChanged.times;

  pushAProjectChanged(connectionsOpened[0], PROJECT, "node_types_added");
  pushAProjectChanged(connectionsOpened[0], PROJECT, "node_types_removed");
  pushAProjectChanged(connectionsOpened[0], PROJECT, "node_types_updated");
  pushAProjectChanged(connectionsOpened[0], ANOTHER_PROJECT, "node_types_added");
  await settled();
  pushAProjectChanged(connectionsOpened[0], PROJECT, "venv_made_current");
  await settled();
  pushAProjectChanged(connectionsOpened[0], PROJECT, "files_changed");
  await settled();
  pushAProjectChanged(connectionsOpened[0], PROJECT, "missed");
  await settled();

  expect(toldOnceSubscribed).toBe(1);
  expect(windowToldTheNodeTypesChanged.times).toBe(5);
  expect(windowToldTheFilesChanged.times).toBe(3);
  expect(callsOn(connectionsOpened[0])).toEqual([
    `read_project_changes ${PROJECT_FOLDER}`,
    `subscribe_project_changes ${PROJECT}`,
    `read_project_changes ${PROJECT_FOLDER}`,
    `read_project_changes ${PROJECT_FOLDER}`,
    `read_project_changes ${PROJECT_FOLDER}`,
  ]);
});

test("a_connection_that_closes_is_followed_again_at_once_keeping_the_last_reading_and_the_window_hears_nothing", async () => {
  const { feed, connectionsOpened, readingsSent, settled } = feedOverAFakeRuntime(["t1"]);
  feed.follow();
  await settled();

  connectionsOpened[0]?.closeFromTheRuntime();
  await settled();

  expect(connectionsOpened).toHaveLength(2);
  expect(connectionsOpened[0]?.closedByTheApp).toBe(true);
  expect(callsOn(connectionsOpened[1]).slice(0, 2)).toEqual([`read_project_changes ${PROJECT_FOLDER}`, `subscribe_project_changes ${PROJECT}`]);
  expect(readingsSent.map(transactionIdsOf)).toEqual([["t1"]]);
});

test("tells_the_window_why_the_feed_ended_in_the_runtimes_words_when_following_it_again_fails_and_tries_again_after_a_while", async () => {
  const { feed, connectionsOpened, readingsSent, runtime, settled, afterTheWait } = feedOverAFakeRuntime(["t1"]);
  feed.follow();
  await settled();

  runtime.answers = false;
  connectionsOpened[0]?.closeFromTheRuntime();
  await settled();
  expect(readingsSent.map(transactionIdsOf)).toEqual([["t1"], "no runtime answers at /tmp/local-api.sock"]);
  runtime.answers = true;
  await afterTheWait();

  expect(connectionsOpened).toHaveLength(2);
  expect(readingsSent.map(transactionIdsOf)).toEqual([["t1"], "no runtime answers at /tmp/local-api.sock", ["t1"]]);
});

test("a_runtime_that_starts_answering_is_followed_again_at_once_rather_than_after_the_wait", async () => {
  const { feed, connectionsOpened, readingsSent, runtime, settled } = feedOverAFakeRuntime(["t1"]);
  runtime.answers = false;
  feed.follow();
  await settled();

  runtime.answers = true;
  feed.followAgain();
  await settled();

  expect(connectionsOpened).toHaveLength(1);
  expect(readingsSent.map(transactionIdsOf)).toEqual(["no runtime answers at /tmp/local-api.sock", ["t1"]]);
});

test("a_connect_that_breaks_tells_the_window_and_is_followed_again_after_a_while", async () => {
  const { feed, connectionsOpened, readingsSent, runtime, settled, afterTheWait } = feedOverAFakeRuntime(["t1"]);
  runtime.breaksOnTheNextConnect = true;
  feed.follow();
  await settled();
  expect(readingsSent.map(transactionIdsOf)).toEqual(["Error: the connect broke"]);

  await afterTheWait();

  expect(connectionsOpened).toHaveLength(1);
  expect(transactionIdsOf(feed.readProjectTransactions())).toEqual(["t1"]);
});

test("closes_its_connection_when_the_window_closes_and_sends_nothing_after", async () => {
  const { feed, connectionsOpened, readingsSent, settled } = feedOverAFakeRuntime(["t1"]);
  feed.follow();
  await settled();

  feed.stopFollowing();
  await settled();
  pushAProjectChanged(connectionsOpened[0]);
  await settled();

  expect(connectionsOpened[0]?.closedByTheApp).toBe(true);
  expect(readingsSent).toHaveLength(1);
});

test("a_feed_followed_in_the_studio_runtimes_scope_closes_its_connection_as_the_studio_runtime_is_disposed", async () => {
  const runtime = fakeRuntimeOfConnections({
    read_project_changes: () => Effect.succeed(changeFeedHolding(["t1"])),
    subscribe_project_changes: ({ projects }) => Effect.succeed({ projects }),
  });
  const studioRuntime = ManagedRuntime.make(projectFeedsFollowedLayerOver(runtime.layer));
  const feed = new ProjectTransactionsFeedOfAStudioWindow(PROJECT_FOLDER, {
    followOverTheRuntime: (following) => {
      const followingFiber = studioRuntime.runFork(ProjectFeedsFollowed.use((followed) => followed.follow(following)));
      return () => followingFiber.interruptUnsafe();
    },
    sendTheWindowTheProjectTransactions: () => undefined,
    tellTheWindowTheProjectFilesChanged: () => undefined,
    tellTheWindowTheProjectNodeTypesChanged: () => undefined,
  });

  feed.follow();
  await expect.poll(() => feed.readProjectTransactions().kind).toBe("read");
  await studioRuntime.dispose();

  expect(runtime.connectionsOpened.map((connection) => connection.closedByTheApp)).toEqual([true]);
});

const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"];
const liveProjectFolder = process.env["TATOLAB_APP_LIVE_PROJECT_FOLDER"];

test.skipIf(liveLocalApiSocket === undefined || liveProjectFolder === undefined)("a_real_runtime_reads_a_projects_change_feed_and_tells_the_window_of_a_file_saved_in_its_folder_outside_the_runtime", async () => {
  const overTheRuntime = ManagedRuntime.make(runtimeControlLayer(liveLocalApiSocket ?? "", 5_000));
  const readingsSent: ProjectTransactionsReading[] = [];
  const windowToldTheFilesChanged = { times: 0 };
  const feed = new ProjectTransactionsFeedOfAStudioWindow(liveProjectFolder ?? "", {
    followOverTheRuntime: (following) => {
      const followingFiber = overTheRuntime.runFork(following);
      return () => followingFiber.interruptUnsafe();
    },
    sendTheWindowTheProjectTransactions: (reading) => readingsSent.push(reading),
    tellTheWindowTheProjectFilesChanged: () => {
      windowToldTheFilesChanged.times += 1;
    },
    tellTheWindowTheProjectNodeTypesChanged: () => undefined,
  });
  const savedByAnEditor = path.join(liveProjectFolder ?? "", "saved_by_an_editor_in_the_live_test.txt");
  try {
    feed.follow();
    await expect.poll(() => feed.readProjectTransactions().kind, { timeout: 5_000 }).toBe("read");
    const toldOnceSubscribed = windowToldTheFilesChanged.times;
    await writeFile(savedByAnEditor, "saved outside the runtime");

    await expect.poll(() => windowToldTheFilesChanged.times, { timeout: 5_000 }).toBeGreaterThan(toldOnceSubscribed);
  } finally {
    feed.stopFollowing();
    await overTheRuntime.dispose();
    await rm(savedByAnEditor, { force: true });
  }
});
