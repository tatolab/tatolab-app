import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";
import type { ProjectTransactions, ProjectTransactionsReading } from "../shared/tatolab_backend_contract.js";
import { localApiRequestFailure } from "./local_api_request_failure.js";
import { PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS, ProjectTransactionsFeedOfAStudioWindow, projectChangesConnectionOver, type ProjectChangesConnection } from "./project_transactions_feed.js";
import { projectTransactionsFromTheChangeFeed } from "./project_transactions_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { TatolabRuntimeControlWebSocketConnection, type ControlNotifications } from "./tatolab_runtime_control_operation_call.js";

const PROJECT_FOLDER = "/home/sam/streams/pattern";
const PROJECT = "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90";
const ANOTHER_PROJECT = "7d1e0c55-3b2a-4f6e-9c1d-0a8b2e4f6c13";

/** A change feed in the runtime's shape, holding transactions named by `transactionIds`, newest first. */
function changeFeedHolding(transactionIds: readonly string[]): ProjectTransactions {
  const changeFeed = projectTransactionsFromTheChangeFeed({
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
  });
  return changeFeed.ok ? changeFeed.value : expect.unreachable(changeFeed.failure);
}

/** A `/control/ws` connection serving the feed `transactionIds` holds, recording each call, and letting a test push a change or close it from the runtime's end. */
class FakeProjectChangesConnection implements ProjectChangesConnection {
  readonly calls: string[] = [];
  isClosed = false;
  private readonly projectChangedListeners: ((change: ControlNotifications["project_changed"]) => void)[] = [];
  private readonly closedListeners: ((whyItClosed: string) => void)[] = [];

  constructor(private readonly transactionIds: string[]) {}

  async readTheProjectChanges(projectFolder: string): Promise<Result<ProjectTransactions, string>> {
    this.calls.push(`read_project_changes ${projectFolder}`);
    return succeeded(changeFeedHolding(this.transactionIds));
  }

  async subscribeToTheProjectChanges(project: string): Promise<Result<void, string>> {
    this.calls.push(`subscribe_project_changes ${project}`);
    return project === PROJECT ? succeeded(undefined) : failedWith(`no project ${project}`);
  }

  onProjectChanged(listener: (change: ControlNotifications["project_changed"]) => void): void {
    this.projectChangedListeners.push(listener);
  }

  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void {
    this.closedListeners.push(whenTheConnectionCloses);
  }

  close(): void {
    this.isClosed = true;
  }

  pushAProjectChanged(project = PROJECT, change: ControlNotifications["project_changed"]["change"] = "applied"): void {
    for (const listener of this.projectChangedListeners) listener({ project, change });
  }

  closeFromTheRuntime(why: string): void {
    this.isClosed = true;
    for (const listener of this.closedListeners) listener(why);
  }
}

function transactionIdsOf(reading: ProjectTransactionsReading): string[] | string {
  return reading.kind === "read" ? reading.project_transactions.transactions.map((transaction) => transaction.transaction) : reading.because;
}

/** Resolves once every promise already settled has run its callbacks. */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A window's feed over fake connections serving `transactionIds`; an open in `failingOpens` (counted from 1) answers that no runtime answers, and each follow later waits for the test. */
function feedOverFakeConnections(transactionIds: string[], failingOpens: number[] = []) {
  const connectionsOpened: FakeProjectChangesConnection[] = [];
  const readingsSent: ProjectTransactionsReading[] = [];
  const followsLater: { delayMs: number; work: () => void }[] = [];
  const windowToldTheFilesChanged = { times: 0 };
  let opens = 0;
  const feed = new ProjectTransactionsFeedOfAStudioWindow(PROJECT_FOLDER, {
    openTheFeedConnection: async () => {
      opens += 1;
      if (failingOpens.includes(opens)) return localApiRequestFailure("no runtime answers at /run/tatolab/local-api.sock");
      const connection = new FakeProjectChangesConnection(transactionIds);
      connectionsOpened.push(connection);
      return succeeded(connection);
    },
    runAfter: (delayMs, work) => {
      followsLater.push({ delayMs, work });
      return () => undefined;
    },
    sendTheWindowTheProjectTransactions: (reading) => readingsSent.push(reading),
    tellTheWindowTheProjectFilesChanged: () => {
      windowToldTheFilesChanged.times += 1;
    },
  });
  return { feed, connectionsOpened, readingsSent, followsLater, windowToldTheFilesChanged };
}

test("reads_the_feed_subscribes_its_project_and_reads_it_again_on_each_change_of_that_project_alone", async () => {
  const transactionIds = ["t1"];
  const { feed, connectionsOpened, readingsSent } = feedOverFakeConnections(transactionIds);

  await feed.follow();
  transactionIds.unshift("t2");
  connectionsOpened[0]?.pushAProjectChanged();
  await settled();
  connectionsOpened[0]?.pushAProjectChanged(ANOTHER_PROJECT);
  await settled();

  expect(connectionsOpened[0]?.calls).toEqual([
    `read_project_changes ${PROJECT_FOLDER}`,
    `subscribe_project_changes ${PROJECT}`,
    `read_project_changes ${PROJECT_FOLDER}`,
    `read_project_changes ${PROJECT_FOLDER}`,
  ]);
  expect(readingsSent.map(transactionIdsOf)).toEqual([["t1"], ["t2", "t1"]]);
  expect(transactionIdsOf(feed.readProjectTransactions())).toEqual(["t2", "t1"]);
});

test("a_file_changed_in_the_folder_tells_the_window_without_reading_the_feed_and_missed_does_both", async () => {
  const { feed, connectionsOpened, windowToldTheFilesChanged } = feedOverFakeConnections(["t1"]);
  await feed.follow();
  const toldOnceSubscribed = windowToldTheFilesChanged.times;

  connectionsOpened[0]?.pushAProjectChanged(PROJECT, "files_changed");
  await settled();
  connectionsOpened[0]?.pushAProjectChanged(ANOTHER_PROJECT, "files_changed");
  await settled();
  connectionsOpened[0]?.pushAProjectChanged(PROJECT, "missed");
  await settled();

  expect(toldOnceSubscribed).toBe(1);
  expect(windowToldTheFilesChanged.times).toBe(3);
  expect(connectionsOpened[0]?.calls).toEqual([
    `read_project_changes ${PROJECT_FOLDER}`,
    `subscribe_project_changes ${PROJECT}`,
    `read_project_changes ${PROJECT_FOLDER}`,
    `read_project_changes ${PROJECT_FOLDER}`,
  ]);
});

test("a_connection_that_closes_is_followed_again_at_once_keeping_the_last_reading_and_the_window_hears_nothing", async () => {
  const { feed, connectionsOpened, readingsSent } = feedOverFakeConnections(["t1"]);
  await feed.follow();

  connectionsOpened[0]?.closeFromTheRuntime("the runtime closed the /control/ws connection");
  await settled();

  expect(connectionsOpened).toHaveLength(2);
  expect(connectionsOpened[1]?.calls.slice(0, 2)).toEqual([`read_project_changes ${PROJECT_FOLDER}`, `subscribe_project_changes ${PROJECT}`]);
  expect(readingsSent.map(transactionIdsOf)).toEqual([["t1"]]);
});

test("tells_the_window_why_the_feed_ended_in_the_runtimes_words_when_following_it_again_fails_and_tries_again_after_a_while", async () => {
  const { feed, connectionsOpened, readingsSent, followsLater } = feedOverFakeConnections(["t1"], [2]);
  await feed.follow();

  connectionsOpened[0]?.closeFromTheRuntime("the runtime closed the /control/ws connection");
  await settled();
  expect(followsLater.map((later) => later.delayMs)).toEqual([PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS]);
  followsLater[0]?.work();
  await settled();

  expect(readingsSent.map(transactionIdsOf)).toEqual([["t1"], "no runtime answers at /run/tatolab/local-api.sock", ["t1"]]);
});

test("closes_its_connection_when_the_window_closes_and_sends_nothing_after", async () => {
  const { feed, connectionsOpened, readingsSent } = feedOverFakeConnections(["t1"]);
  await feed.follow();

  feed.stopFollowing();
  connectionsOpened[0]?.pushAProjectChanged();
  await settled();

  expect(connectionsOpened[0]?.isClosed).toBe(true);
  expect(readingsSent).toHaveLength(1);
});

const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"];
const liveProjectFolder = process.env["TATOLAB_APP_LIVE_PROJECT_FOLDER"];

test.skipIf(liveLocalApiSocket === undefined || liveProjectFolder === undefined)("a_real_runtime_answers_a_projects_change_feed_and_subscribes_its_project_over_control_ws", async () => {
  const opened = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket ?? "", 5_000);
  const connection = projectChangesConnectionOver(opened.ok ? opened.value : expect.unreachable(opened.failure.failureDescription));
  try {
    const changeFeed = await connection.readTheProjectChanges(liveProjectFolder ?? "");
    const project = changeFeed.ok ? changeFeed.value.project : expect.unreachable(changeFeed.failure);
    expect(await connection.subscribeToTheProjectChanges(project)).toEqual(succeeded(undefined));
  } finally {
    connection.close();
  }
});

test.skipIf(liveLocalApiSocket === undefined || liveProjectFolder === undefined)("a_real_runtime_tells_the_window_of_a_file_saved_in_the_projects_folder_outside_the_runtime", async () => {
  const windowToldTheFilesChanged = { times: 0 };
  const feed = new ProjectTransactionsFeedOfAStudioWindow(liveProjectFolder ?? "", {
    openTheFeedConnection: async () => {
      const opened = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket ?? "", 5_000);
      return opened.ok ? succeeded(projectChangesConnectionOver(opened.value)) : opened;
    },
    runAfter: () => () => undefined,
    sendTheWindowTheProjectTransactions: () => undefined,
    tellTheWindowTheProjectFilesChanged: () => {
      windowToldTheFilesChanged.times += 1;
    },
  });
  const savedByAnEditor = path.join(liveProjectFolder ?? "", "saved_by_an_editor_in_the_live_test.txt");
  try {
    await feed.follow();
    const toldOnceSubscribed = windowToldTheFilesChanged.times;
    await writeFile(savedByAnEditor, "saved outside the runtime");

    await expect.poll(() => windowToldTheFilesChanged.times, { timeout: 5_000 }).toBeGreaterThan(toldOnceSubscribed);
  } finally {
    feed.stopFollowing();
    await rm(savedByAnEditor, { force: true });
  }
});
