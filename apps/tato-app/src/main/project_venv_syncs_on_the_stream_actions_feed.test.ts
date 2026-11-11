import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { localApiRequestFailure, theRuntimesRefusal } from "./local_api_client.js";
import {
  ProjectVenvSyncsOnTheStreamActionsFeed,
  STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI,
  streamActionResourceUri,
} from "./project_venv_syncs_on_the_stream_actions_feed.js";
import type { LocalApiResourceFollowingConnection } from "./local_api_resource_followed_over_one_connection.js";
import { succeeded } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const ACTION = "Rvxjb0uiacgp6c3o13o9qvzj1-1";

/** The `describe_stream_action` object a recorded tool result carries, which is each entry of the stream actions resource. */
async function recordedStreamActionDescription(fixtureFileName: string): Promise<Record<string, unknown>> {
  const toolResponse: { result: { content: { text: string }[] } } = JSON.parse(await readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8"));
  const text = toolResponse.result.content[0]?.text ?? "{}";
  return JSON.parse(text);
}

/** The text of a recorded resource read, its `contents[0].text`, as the runtime served it. */
async function recordedResourceText(fixtureFileName: string): Promise<string> {
  const resourceRead: { result: { contents: { text: string }[] } } = JSON.parse(await readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8"));
  return resourceRead.result.contents[0]?.text ?? expect.unreachable(`${fixtureFileName} holds no resource text`);
}

const downloading = () => recordedStreamActionDescription("local-api-describe-stream-action-of-a-new-project-downloading-numpy-and-pillow.json");
const done = () => recordedStreamActionDescription("local-api-describe-stream-action-of-a-new-project-done-numpy-and-pillow-installed.json");

/** A stand-in connection whose stream actions resource reads `actionsUnderWay` as the test sets it, and whose ended actions read from `endedActions`; a text in `recordedResourceTexts` is served for its uri as it stands. */
function fakeStreamActionsConnection() {
  const served = { actionsUnderWay: [] as Record<string, unknown>[], endedActions: new Map<string, Record<string, unknown>>(), recordedResourceTexts: new Map<string, string>() };
  const recorded = { resourceReads: [] as string[], closed: false, listenStopped: false };
  let sendAnUpdate: () => void = () => undefined;
  let endTheListen: (why: string) => void = () => undefined;
  const connection: LocalApiResourceFollowingConnection = {
    readResourceText: async (uri) => {
      recorded.resourceReads.push(uri);
      const recordedText = served.recordedResourceTexts.get(uri);
      if (recordedText !== undefined) return succeeded(recordedText);
      if (uri === STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI) return succeeded(JSON.stringify({ actions: served.actionsUnderWay }));
      const ended = [...served.endedActions].find(([action]) => uri === streamActionResourceUri(action));
      return ended === undefined ? theRuntimesRefusal(`no stream action at ${uri}`) : succeeded(JSON.stringify(ended[1]));
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
  return { connection, served, recorded, sendAnUpdate: () => sendAnUpdate(), endTheListen: (why: string) => endTheListen(why) };
}

function feedOver(fake: ReturnType<typeof fakeStreamActionsConnection>, logLines: string[] = []) {
  let syncChanges = 0;
  let connectionsOpened = 0;
  const feed = new ProjectVenvSyncsOnTheStreamActionsFeed({
    openTheFeedConnection: async () => {
      connectionsOpened += 1;
      return succeeded(fake.connection);
    },
    whenTheSyncsChange: () => {
      syncChanges += 1;
    },
    tatolabAppLog: createTatolabAppLog("warn", (logLine) => logLines.push(logLine)),
  });
  return { feed, syncChanges: () => syncChanges, connectionsOpened: () => connectionsOpened };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a sync on its making_the_venv step is under way, and the status is asked to refresh", async () => {
  const fake = fakeStreamActionsConnection();
  fake.served.actionsUnderWay = [await downloading()];
  const { feed, syncChanges } = feedOver(fake);

  feed.keepFollowing(true);
  await settle();

  const { underWay, justEnded } = feed.takeTheProjectVenvSyncs();
  expect(underWay).toEqual([{ action: ACTION, project_directory: "/private/tmp/tatolab-proof-projects/numpy-pillow", venv_sync: expect.objectContaining({ phase: "downloading", downloads_done: 3 }) }]);
  expect(justEnded).toEqual([]);
  expect(syncChanges()).toBe(1);
});

test("an action that leaves the list is read once more by its own resource and handed over once as just ended", async () => {
  const fake = fakeStreamActionsConnection();
  fake.served.actionsUnderWay = [await downloading()];
  const { feed } = feedOver(fake);
  feed.keepFollowing(true);
  await settle();

  fake.served.actionsUnderWay = [];
  fake.served.endedActions.set(ACTION, await done());
  fake.sendAnUpdate();
  await settle();

  expect(fake.recorded.resourceReads).toContain(streamActionResourceUri(ACTION));
  const taken = feed.takeTheProjectVenvSyncs();
  expect(taken.underWay).toEqual([]);
  expect(taken.justEnded).toEqual([{ action: ACTION, project_directory: "/private/tmp/tatolab-proof-projects/numpy-pillow", venv_sync: expect.objectContaining({ phase: "installed", packages_installed: 8 }) }]);
  expect(feed.takeTheProjectVenvSyncs().justEnded).toEqual([]);
});

test("a sync no read caught under way still ends: an action seen only before uv started is read again as it leaves", async () => {
  const fake = fakeStreamActionsConnection();
  fake.served.actionsUnderWay = [{ ...(await downloading()), step: "reading_the_graph_documents", venv_sync: null }];
  const { feed, syncChanges } = feedOver(fake);
  feed.keepFollowing(true);
  await settle();
  expect(feed.takeTheProjectVenvSyncs()).toEqual({ underWay: [], justEnded: [] });
  expect(syncChanges()).toBe(0);

  fake.served.actionsUnderWay = [];
  fake.served.endedActions.set(ACTION, await done());
  fake.sendAnUpdate();
  await settle();

  expect(feed.takeTheProjectVenvSyncs().justEnded).toEqual([expect.objectContaining({ action: ACTION, venv_sync: expect.objectContaining({ phase: "installed" }) })]);
  expect(syncChanges()).toBe(1);
});

test("an action still listed that moves past making_the_venv ends once, with the sync it carries, and is not read again as it leaves", async () => {
  const fake = fakeStreamActionsConnection();
  fake.served.actionsUnderWay = [await downloading()];
  const { feed } = feedOver(fake);
  feed.keepFollowing(true);
  await settle();

  const doneDescription = await done();
  fake.served.actionsUnderWay = [{ ...doneDescription, state: "in_progress", step: "starting" }];
  fake.sendAnUpdate();
  await settle();

  expect(fake.recorded.resourceReads.filter((uri) => uri !== STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI)).toEqual([]);
  expect(feed.takeTheProjectVenvSyncs().justEnded).toEqual([expect.objectContaining({ action: ACTION, venv_sync: expect.objectContaining({ phase: "installed" }) })]);

  fake.served.actionsUnderWay = [];
  fake.served.endedActions.set(ACTION, doneDescription);
  fake.sendAnUpdate();
  await settle();

  expect(fake.recorded.resourceReads.filter((uri) => uri !== STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI)).toEqual([]);
  expect(feed.takeTheProjectVenvSyncs().justEnded).toEqual([]);
});

test("an ended action the runtime no longer holds is logged and shows no sync", async () => {
  const fake = fakeStreamActionsConnection();
  fake.served.actionsUnderWay = [await downloading()];
  const logLines: string[] = [];
  const { feed } = feedOver(fake, logLines);
  feed.keepFollowing(true);
  await settle();

  fake.served.actionsUnderWay = [];
  fake.sendAnUpdate();
  await settle();

  expect(feed.takeTheProjectVenvSyncs().justEnded).toEqual([]);
  expect(logLines.some((logLine) => logLine.includes("an ended stream action could not be read") && logLine.includes("no stream action at"))).toBe(true);
});

test("the feed closes while the runtime does not answer, and is followed again once it does; a listen that ends is followed again at the next round", async () => {
  const fake = fakeStreamActionsConnection();
  const logLines: string[] = [];
  const { feed, connectionsOpened } = feedOver(fake, logLines);
  feed.keepFollowing(true);
  feed.keepFollowing(true);
  await settle();
  expect(connectionsOpened()).toBe(1);

  feed.keepFollowing(false);
  expect(fake.recorded.listenStopped).toBe(true);
  expect(fake.recorded.closed).toBe(true);

  feed.keepFollowing(true);
  await settle();
  expect(connectionsOpened()).toBe(2);

  fake.endTheListen("the runtime stopped");
  feed.keepFollowing(true);
  await settle();
  expect(connectionsOpened()).toBe(3);
  expect(logLines.filter((logLine) => logLine.includes("not followed until the next status round"))).toHaveLength(1);
});

test("a feed that cannot be opened says why once and opens again at the next round", async () => {
  const logLines: string[] = [];
  let attempts = 0;
  const feed = new ProjectVenvSyncsOnTheStreamActionsFeed({
    openTheFeedConnection: async () => {
      attempts += 1;
      return localApiRequestFailure("connect ENOENT /tmp/tatolab.sock");
    },
    whenTheSyncsChange: () => undefined,
    tatolabAppLog: createTatolabAppLog("warn", (logLine) => logLines.push(logLine)),
  });

  feed.keepFollowing(true);
  await settle();
  feed.keepFollowing(true);
  await settle();

  expect(attempts).toBe(2);
  expect(logLines.filter((logLine) => logLine.includes("connect ENOENT"))).toHaveLength(1);
});

test("a connection closed while its read is still out is never read from again, and the next connection is read at once", async () => {
  const hungConnection = fakeStreamActionsConnection();
  let releaseTheHungRead: () => void = () => undefined;
  const hungRead = new Promise<void>((resolve) => {
    releaseTheHungRead = resolve;
  });
  const readOfTheHungConnection = hungConnection.connection.readResourceText;
  hungConnection.connection.readResourceText = async (uri) => {
    await hungRead;
    return readOfTheHungConnection(uri);
  };
  hungConnection.served.actionsUnderWay = [{ ...(await downloading()), action: "Rstale-1" }];
  const nextConnection = fakeStreamActionsConnection();
  nextConnection.served.actionsUnderWay = [await downloading()];
  const connections = [hungConnection.connection, nextConnection.connection];
  let syncChanges = 0;
  const feed = new ProjectVenvSyncsOnTheStreamActionsFeed({
    openTheFeedConnection: async () => succeeded(connections.shift() ?? nextConnection.connection),
    whenTheSyncsChange: () => {
      syncChanges += 1;
    },
    tatolabAppLog: createTatolabAppLog("warn", () => undefined),
  });

  feed.keepFollowing(true);
  await settle();
  feed.keepFollowing(false);
  feed.keepFollowing(true);
  await settle();
  releaseTheHungRead();
  await settle();

  expect(hungConnection.recorded.closed).toBe(true);
  expect(nextConnection.recorded.resourceReads).toEqual([STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI]);
  expect(feed.takeTheProjectVenvSyncs().underWay.map((syncUnderWay) => syncUnderWay.action)).toEqual([ACTION]);
  expect(syncChanges).toBe(1);
});

test("a feed whose listen ended hands over no sync as under way until a new connection is read", async () => {
  const fake = fakeStreamActionsConnection();
  fake.served.actionsUnderWay = [await downloading()];
  const { feed } = feedOver(fake);
  feed.keepFollowing(true);
  await settle();
  expect(feed.takeTheProjectVenvSyncs().underWay).toHaveLength(1);

  fake.endTheListen("the runtime stopped");

  expect(feed.takeTheProjectVenvSyncs().underWay).toEqual([]);
});

test("a recorded new project's sync is under way on its making_the_venv step, and once it leaves the list its recorded resource ends it as installed", async () => {
  const recordedAction = "Robwi215r483sn5t185x0l5s1-1";
  const fake = fakeStreamActionsConnection();
  fake.served.recordedResourceTexts.set(STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI, await recordedResourceText("local-api-stream-actions-resource-of-a-new-project-syncing-on-its-making-the-venv-step.json"));
  fake.served.recordedResourceTexts.set(streamActionResourceUri(recordedAction), await recordedResourceText("local-api-stream-action-resource-of-a-new-project-done-after-its-sync.json"));
  const { feed } = feedOver(fake);
  feed.keepFollowing(true);
  await settle();

  const syncing = feed.takeTheProjectVenvSyncs();
  expect(syncing.underWay).toEqual([
    { action: recordedAction, project_directory: "/Users/fonta/Documents/Tato Studio/sync-289a", venv_sync: expect.objectContaining({ phase: "installed", packages_installed: 8 }) },
  ]);
  expect(syncing.underWay[0]?.venv_sync.packages.map((recordedPackage) => `${recordedPackage.name} ${recordedPackage.version}`)).toContain("tatolab-stream 0.68.61");

  fake.served.recordedResourceTexts.delete(STREAM_ACTIONS_UNDER_WAY_RESOURCE_URI);
  fake.sendAnUpdate();
  await settle();

  const ended = feed.takeTheProjectVenvSyncs();
  expect(ended.underWay).toEqual([]);
  expect(ended.justEnded).toEqual([{ action: recordedAction, project_directory: "/Users/fonta/Documents/Tato Studio/sync-289a", venv_sync: expect.objectContaining({ phase: "installed", packages_installed: 8 }) }]);
  expect(ended.justEnded[0]?.venv_sync.packages).toHaveLength(8);
});
