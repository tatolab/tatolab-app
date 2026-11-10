import { expect, test } from "vitest";
import type { ProjectTransactionsReading } from "../shared/tatolab_backend_contract.js";
import { localApiRequestFailure, theRuntimesRefusal } from "./local_api_client.js";
import { PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS, ProjectTransactionsFeedOfAStudioWindow, type ProjectTransactionsFeedConnection } from "./project_transactions_feed.js";
import { succeeded } from "./result.js";

const PROJECT_FOLDER = "/home/sam/streams/pattern";
const FEED_URI = "streamlib://project/2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90/transactions";

/** A change feed's resource text in the runtime's shape, holding transactions named by `transactionIds`, newest first. */
function feedText(transactionIds: readonly string[]): string {
  return JSON.stringify({
    project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90",
    project_directory: PROJECT_FOLDER,
    transactions: transactionIds.map((transaction) => ({
      transaction,
      commit: `commit-${transaction}`,
      parent_commit: null,
      author_kind: "agent",
      author_name: "claude-code",
      operations: [{ stream: "s", operation: "rename_node", node: "n", from: "a", to: "b" }],
      inverse_operations: [{ stream: "s", operation: "rename_node", node: "n", from: "b", to: "a" }],
    })),
  });
}

/** A stand-in connection serving the feed `transactionIds` holds, recording each call, its listen's update and end in the test's hands. */
function fakeFeedConnection(transactionIds: string[]) {
  const recorded = { toolCalls: [] as string[], resourceReads: 0, closed: false, listenStopped: false };
  let sendAnUpdate: () => void = () => undefined;
  let endTheListen: (why: string) => void = () => undefined;
  const connection: ProjectTransactionsFeedConnection = {
    callMcpTool: async (toolName) => {
      recorded.toolCalls.push(toolName);
      return succeeded(JSON.stringify({ project: "2c4b1f0e", project_directory: PROJECT_FOLDER, project_name: "pattern", transactions_resource_uri: FEED_URI, assets: [] }));
    },
    readResourceText: async (uri) => {
      recorded.resourceReads += 1;
      return uri === FEED_URI ? succeeded(feedText(transactionIds)) : theRuntimesRefusal(`no resource ${uri}`);
    },
    listenForUpdatesOfTheResource: (_uri, whenUpdated, whenEnded) => {
      sendAnUpdate = whenUpdated;
      endTheListen = whenEnded;
      return {
        stop: () => {
          recorded.listenStopped = true;
        },
      };
    },
    close: () => {
      recorded.closed = true;
    },
  };
  return { connection, recorded, sendAnUpdate: () => sendAnUpdate(), endTheListen: (why: string) => endTheListen(why) };
}

function transactionIdsOf(reading: ProjectTransactionsReading): string[] | string {
  return reading.kind === "read" ? reading.project_transactions.transactions.map((transaction) => transaction.transaction) : reading.because;
}

/** Resolves once every promise already settled has run its callbacks. */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("opens the project with list_assets, sends the feed it reads, and reads it again on each update the listen is told of", async () => {
  const transactionIds = ["t1"];
  const fake = fakeFeedConnection(transactionIds);
  const readingsSent: ProjectTransactionsReading[] = [];
  const feed = new ProjectTransactionsFeedOfAStudioWindow(PROJECT_FOLDER, {
    openTheFeedConnection: async () => succeeded(fake.connection),
    runAfter: () => () => undefined,
    sendTheWindowTheProjectTransactions: (reading) => readingsSent.push(reading),
  });
  await feed.follow();
  transactionIds.unshift("t2");
  fake.sendAnUpdate();
  await settled();

  expect(fake.recorded.toolCalls).toEqual(["list_assets"]);
  expect(readingsSent.map(transactionIdsOf)).toEqual([["t1"], ["t2", "t1"]]);
  expect(transactionIdsOf(feed.readProjectTransactions())).toEqual(["t2", "t1"]);
});

test("tells the window why the feed ended in the runtime's words, and follows it again after a while", async () => {
  const fake = fakeFeedConnection(["t1"]);
  const readingsSent: ProjectTransactionsReading[] = [];
  const followsLater: { delayMs: number; work: () => void }[] = [];
  let connectionsOpened = 0;
  const feed = new ProjectTransactionsFeedOfAStudioWindow(PROJECT_FOLDER, {
    openTheFeedConnection: async () => {
      connectionsOpened += 1;
      return connectionsOpened === 2 ? localApiRequestFailure("no runtime answers at /run/tatolab/local-api.sock") : succeeded(fake.connection);
    },
    runAfter: (delayMs, work) => {
      followsLater.push({ delayMs, work });
      return () => undefined;
    },
    sendTheWindowTheProjectTransactions: (reading) => readingsSent.push(reading),
  });
  await feed.follow();
  fake.endTheListen("`listening to the feed` was not answered: the runtime closed the /mcp/stdio connection");
  expect(fake.recorded.closed).toBe(true);
  expect(followsLater.map((later) => later.delayMs)).toEqual([PROJECT_TRANSACTIONS_FOLLOWED_AGAIN_AFTER_MS]);
  followsLater[0]?.work();
  await settled();
  followsLater[1]?.work();
  await settled();

  expect(readingsSent.map(transactionIdsOf)).toEqual([
    ["t1"],
    "`listening to the feed` was not answered: the runtime closed the /mcp/stdio connection",
    "no runtime answers at /run/tatolab/local-api.sock",
    ["t1"],
  ]);
});

test("stops listening and closes its connection when the window closes, and sends nothing after", async () => {
  const fake = fakeFeedConnection(["t1"]);
  const readingsSent: ProjectTransactionsReading[] = [];
  const feed = new ProjectTransactionsFeedOfAStudioWindow(PROJECT_FOLDER, {
    openTheFeedConnection: async () => succeeded(fake.connection),
    runAfter: () => () => undefined,
    sendTheWindowTheProjectTransactions: (reading) => readingsSent.push(reading),
  });
  await feed.follow();
  feed.stopFollowing();
  fake.sendAnUpdate();
  await settled();

  expect(fake.recorded.listenStopped).toBe(true);
  expect(fake.recorded.closed).toBe(true);
  expect(readingsSent).toHaveLength(1);
});
