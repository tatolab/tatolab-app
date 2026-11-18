import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { StreamGraphInputValueChange } from "../shared/tatolab_backend_contract.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { succeeded, type Result } from "./result.js";
import {
  streamGraphChangesConnectionOver,
  streamGraphChangesFollowedForTheWindows,
  type StreamGraphControlConnection,
  type StreamGraphNotification,
  type StreamGraphSubscription,
} from "./stream_graph_changes_followed_for_the_windows.js";
import { readControlContractValue, TatolabRuntimeControlWebSocketConnection, type ControlNotifications, type ControlOperationAnswer } from "./tatolab_runtime_control_operation_call.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** Against a real runtime holding the stream loaded: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> TATOLAB_APP_LIVE_LOADED_STREAM=<stream id> npx vitest run src/main/stream_graph_changes_followed_for_the_windows.test.ts`. */
const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "";
const liveLoadedStream = process.env["TATOLAB_APP_LIVE_LOADED_STREAM"] ?? "";
test.skipIf(liveLocalApiSocket === "" || liveLoadedStream === "")("a_real_runtime_pushes_an_edit_of_a_followed_stream_to_its_window", async () => {
  const followed = streamGraphChangesFollowedForTheWindows({
    openThePushesConnection: async () => {
      const opened = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
      return opened.ok ? succeeded(streamGraphChangesConnectionOver(opened.value)) : opened;
    },
    waitThen: (afterMs, then) => {
      setTimeout(then, afterMs);
    },
    tatolabAppLog: quietTatolabAppLog,
  });
  const streamsToldChanged: string[] = [];
  const studioWindow = { sendTheWindowTheStreamGraphChanged: (stream: string) => streamsToldChanged.push(stream) };
  followed.follow(liveLoadedStream, studioWindow);
  await expect.poll(() => streamsToldChanged.length, { timeout: 5_000 }).toBe(1);

  const editor = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
  if (!editor.ok) return expect.unreachable(editor.failure.failureDescription);
  const graphRead = await editor.value.callControlOperation("graph", { stream: liveLoadedStream });
  const streamAsset = graphRead.ok && graphRead.value.kind === "answered" && isAJsonObject(graphRead.value.result) ? graphRead.value.result["asset"] : undefined;
  if (typeof streamAsset !== "string") return expect.unreachable(`the graph of ${liveLoadedStream} names no asset`);
  const noteAdded = await editor.value.callControlOperation("add_note", { stream: streamAsset, text: "pushed", position: [0, 0], size: [120, 60], mode: "live" });
  editor.value.close();

  expect(noteAdded.ok && noteAdded.value.kind).toBe("answered");
  await expect.poll(() => streamsToldChanged.length, { timeout: 5_000 }).toBeGreaterThan(1);
  expect(new Set(streamsToldChanged)).toEqual(new Set([liveLoadedStream]));
  followed.stopFollowingEverySubject();
});

/** A `/control/ws` connection that answers both subscriptions for each stream, or refuses `refused` in the runtime's words, recording each, and pushes what a test hands it. */
class StandInStreamGraphControlConnection implements StreamGraphControlConnection {
  readonly subscriptionsMade: [StreamGraphSubscription, string[]][] = [];
  private readonly listeners: { [Method in StreamGraphNotification]: ((params: ControlNotifications[Method]) => void)[] } = { stream_graph_changed: [], input_value_changed: [] };
  private isOpenNow = true;

  constructor(private readonly refused: StreamGraphSubscription | null = null) {}

  async callControlOperation(method: StreamGraphSubscription, params: { streams: string[] }): Promise<Result<ControlOperationAnswer<StreamGraphSubscription>, LocalApiRequestFailure>> {
    this.subscriptionsMade.push([method, params.streams]);
    if (method === this.refused) return succeeded({ kind: "refused_by_the_operation", words: `${method} failed: no stream with the id \`${params.streams.join(", ")}\` is loaded in this runtime` });
    return succeeded({ kind: "answered", result: { streams: params.streams } });
  }

  onNotification<Method extends StreamGraphNotification>(method: Method, listener: (params: ControlNotifications[Method]) => void): () => void {
    this.listeners[method].push(listener);
    return () => undefined;
  }

  onClosed(): void {}

  isOpen(): boolean {
    return this.isOpenNow;
  }

  close(): void {
    this.isOpenNow = false;
  }

  push<Method extends StreamGraphNotification>(method: Method, params: ControlNotifications[Method]): void {
    for (const listener of this.listeners[method]) listener(params);
  }
}

/** The notifications of a drag on Mix's gain and a colour set on the lobby wall, then a link fed into the gain, and a label that reads nothing, as `input_value_changed` carries them. */
async function recordedInputValueChanges(): Promise<ControlNotifications["input_value_changed"][]> {
  const recorded: unknown = JSON.parse(await readFile(new URL("./test-fixtures/control-ws-input-value-changed-notifications-of-a-drag-on-mix-gain-then-a-wire.json", import.meta.url), "utf8"));
  if (!Array.isArray(recorded)) return expect.unreachable("the fixture holds a list of notifications");
  return recorded.map((notification: unknown) => {
    const read = readControlContractValue("InputValueChangedNotificationParams", notification);
    return read.read ? read.value : expect.unreachable(`a notification does not match the contract: ${JSON.stringify(notification)}`);
  });
}

/** Stream graphs followed over `connection`, each window recording what it is sent. */
function followedOver(connection: StandInStreamGraphControlConnection) {
  return streamGraphChangesFollowedForTheWindows({
    openThePushesConnection: async () => succeeded(streamGraphChangesConnectionOver(connection)),
    waitThen: () => undefined,
    tatolabAppLog: quietTatolabAppLog,
  });
}

function windowRecordingWhatItIsSent() {
  const sent: [string, StreamGraphInputValueChange | null][] = [];
  return { sent, sendTheWindowTheStreamGraphChanged: (stream: string, inputValueChange: StreamGraphInputValueChange | null) => sent.push([stream, inputValueChange]) };
}

test("a_followed_stream_is_subscribed_to_both_its_graph_and_its_input_values_on_one_connection_and_its_window_reads_the_graph_once_both_answer", async () => {
  const connection = new StandInStreamGraphControlConnection();
  const followed = followedOver(connection);
  const studioWindow = windowRecordingWhatItIsSent();
  followed.follow("pattern-main-bcd55b", studioWindow);
  await expect.poll(() => studioWindow.sent.length).toBe(1);
  expect(connection.subscriptionsMade).toEqual([
    ["subscribe_stream_graph_changes", ["pattern-main-bcd55b"]],
    ["subscribe_input_value_changes", ["pattern-main-bcd55b"]],
  ]);
  expect(studioWindow.sent).toEqual([["pattern-main-bcd55b", null]]);
});

test("a_stream_whose_input_values_the_runtime_will_not_subscribe_is_not_counted_followed_and_is_subscribed_again_after_a_wait", async () => {
  const connection = new StandInStreamGraphControlConnection("subscribe_input_value_changes");
  const waitsPending: (() => void)[] = [];
  const followed = streamGraphChangesFollowedForTheWindows({
    openThePushesConnection: async () => succeeded(streamGraphChangesConnectionOver(connection)),
    waitThen: (_afterMs, then) => waitsPending.push(then),
    tatolabAppLog: quietTatolabAppLog,
  });
  const studioWindow = windowRecordingWhatItIsSent();
  followed.follow("pattern-main-bcd55b", studioWindow);
  await expect.poll(() => waitsPending.length).toBe(1);
  expect(studioWindow.sent).toEqual([]);
  for (const then of waitsPending.splice(0)) then();
  await expect.poll(() => connection.subscriptionsMade.length).toBe(4);
});

test("each_recorded_value_change_reaches_only_the_windows_following_its_stream_as_what_the_input_reads_and_a_graph_change_asks_for_a_read", async () => {
  const connection = new StandInStreamGraphControlConnection();
  const followed = followedOver(connection);
  const patternWindow = windowRecordingWhatItIsSent();
  const lobbyWindow = windowRecordingWhatItIsSent();
  followed.follow("pattern-main-bcd55b", patternWindow);
  followed.follow("lobby-wall-3a91f0", lobbyWindow);
  await expect.poll(() => patternWindow.sent.length + lobbyWindow.sent.length).toBe(2);
  for (const notification of await recordedInputValueChanges()) connection.push("input_value_changed", notification);
  connection.push("stream_graph_changed", { stream: "pattern-main-bcd55b", change: "missed" });
  const MIX = "8f1e2c74-6b0a-4c1d-9a63-0d5c7e21a9b4";
  expect(patternWindow.sent).toEqual([
    ["pattern-main-bcd55b", null],
    ["pattern-main-bcd55b", { node: MIX, input: "gain", value_read: { value: 0.6, comes_from: "live" } }],
    ["pattern-main-bcd55b", { node: MIX, input: "gain", value_read: { value: 0.9, comes_from: "saved" } }],
    ["pattern-main-bcd55b", { node: MIX, input: "gain", value_read: { value: null, comes_from: "wire" } }],
    ["pattern-main-bcd55b", { node: MIX, input: "label", value_read: { value: null, comes_from: null } }],
    ["pattern-main-bcd55b", null],
  ]);
  expect(lobbyWindow.sent).toEqual([
    ["lobby-wall-3a91f0", null],
    ["lobby-wall-3a91f0", { node: "1d0b6a55-2f48-4e7c-8b19-7c3e9d04f612", input: "colour", value_read: { value: { r: 1, g: 0.5, b: 0, a: 1 }, comes_from: "live" } }],
  ]);
});

/** Against a real runtime holding the stream loaded, one of whose top-level nodes has an unlinked input reading a number: the same variables as the test above. */
test.skipIf(liveLocalApiSocket === "" || liveLoadedStream === "")("a_real_runtime_sends_a_window_following_a_stream_each_value_set_live_and_no_graph_change", async () => {
  const followed = streamGraphChangesFollowedForTheWindows({
    openThePushesConnection: async () => {
      const opened = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
      return opened.ok ? succeeded(streamGraphChangesConnectionOver(opened.value)) : opened;
    },
    waitThen: (afterMs, then) => {
      setTimeout(then, afterMs);
    },
    tatolabAppLog: quietTatolabAppLog,
  });
  const studioWindow = windowRecordingWhatItIsSent();
  followed.follow(liveLoadedStream, studioWindow);
  await expect.poll(() => studioWindow.sent.length, { timeout: 5_000 }).toBe(1);

  const shell = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
  if (!shell.ok) return expect.unreachable(shell.failure.failureDescription);
  const graphRead = await shell.value.callControlOperation("graph", { stream: liveLoadedStream });
  const graph = graphRead.ok && graphRead.value.kind === "answered" && isAJsonObject(graphRead.value.result) ? graphRead.value.result : null;
  const streamAsset = graph?.["asset"];
  const nodes = graph?.["nodes"];
  if (typeof streamAsset !== "string" || !Array.isArray(nodes)) return expect.unreachable(`the graph of ${liveLoadedStream} names no asset or nodes`);
  const numberInput = nodes.flatMap((node: unknown) => {
    if (!isAJsonObject(node) || typeof node["id"] !== "string" || !isAJsonObject(node["ports"]) || !Array.isArray(node["ports"]["inputs"])) return [];
    const nodeId = node["id"];
    return node["ports"]["inputs"].flatMap((port: unknown) => (isAJsonObject(port) && typeof port["name"] === "string" && typeof port["value"] === "number" && port["value_comes_from"] !== "wire" ? [{ node: nodeId, input: port["name"] }] : []));
  })[0];
  if (numberInput === undefined) return expect.unreachable(`no top-level node of ${liveLoadedStream} has an unlinked input reading a number`);
  const valuesSet = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  for (const value of valuesSet) {
    const set = await shell.value.callControlOperation("transact", { operations: [{ operation: "set_node_input_value", stream: streamAsset, node: numberInput.node, input: numberInput.input, value }], mode: "live" });
    expect(set.ok && set.value.kind).toBe("answered");
  }
  await shell.value.callControlOperation("transact", { operations: [{ operation: "set_node_input_value", stream: streamAsset, node: numberInput.node, input: numberInput.input, value: null }], mode: "live" });
  shell.value.close();

  await expect.poll(() => studioWindow.sent.at(-1)?.[1]?.value_read.comes_from, { timeout: 5_000 }).not.toBe("live");
  const pushedAfterTheFirstRead = studioWindow.sent.slice(1);
  expect(pushedAfterTheFirstRead.filter(([, inputValueChange]) => inputValueChange === null)).toEqual([]);
  expect(pushedAfterTheFirstRead.every(([, inputValueChange]) => inputValueChange?.node === numberInput.node && inputValueChange.input === numberInput.input)).toBe(true);
  followed.stopFollowingEverySubject();
});
