import { readFile } from "node:fs/promises";
import { Effect, Exit } from "effect";
import { expect, test } from "vitest";
import type { StreamGraphInputValueChange } from "../shared/tatolab_backend_contract.js";
import { fakeRuntimeOfConnections, pushesFollowedOverALiveRuntime, refusedByTheOperation, runOnATestClock, settle } from "./control_connection_test_support.js";
import { CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER, controlPushesFollowedForTheWindows } from "./control_pushes_followed_for_the_windows.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { STREAM_GRAPH_CHANGES, tellTheWindowTheStreamGraphChanged, type WindowFollowingStreamGraphs } from "./stream_graph_changes_followed_for_the_windows.js";
import { StreamGraphsFollowed } from "./studio_runtime.js";
import { readControlContractValue, RuntimeControl, type ControlNotifications } from "./tatolab_runtime_control_operation_call.js";
import { TestClock } from "effect/testing";

/** Against a real runtime holding the stream loaded: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> TATOLAB_APP_LIVE_LOADED_STREAM=<stream id> npx vitest run src/main/stream_graph_changes_followed_for_the_windows.test.ts`. */
const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "";
const liveLoadedStream = process.env["TATOLAB_APP_LIVE_LOADED_STREAM"] ?? "";
test.skipIf(liveLocalApiSocket === "" || liveLoadedStream === "")("a_real_runtime_pushes_an_edit_of_a_followed_stream_to_its_window", async () => {
  const liveRuntime = pushesFollowedOverALiveRuntime(liveLocalApiSocket);
  const streamsToldChanged: string[] = [];
  const studioWindow = { sendTheWindowTheStreamGraphChanged: (stream: string) => streamsToldChanged.push(stream) };
  try {
    await liveRuntime.runPromise(StreamGraphsFollowed.use((followed) => followed.follow(liveLoadedStream, studioWindow)));
    await expect.poll(() => streamsToldChanged.length, { timeout: 5_000 }).toBe(1);

    const graph = await liveRuntime.runPromise(RuntimeControl.use((runtimeControl) => runtimeControl.call("graph", { stream: liveLoadedStream })));
    const streamAsset = isAJsonObject(graph) ? graph["asset"] : undefined;
    if (typeof streamAsset !== "string") return expect.unreachable(`the graph of ${liveLoadedStream} names no asset`);
    const noteAdded = await liveRuntime.runPromiseExit(
      RuntimeControl.use((runtimeControl) => runtimeControl.call("add_note", { stream: streamAsset, text: "pushed", position: [0, 0], size: [120, 60], mode: "live" })),
    );

    expect(Exit.isSuccess(noteAdded)).toBe(true);
    await expect.poll(() => streamsToldChanged.length, { timeout: 5_000 }).toBeGreaterThan(1);
    expect(new Set(streamsToldChanged)).toEqual(new Set([liveLoadedStream]));
  } finally {
    await liveRuntime.dispose();
  }
});

/** A runtime whose connections answer both subscriptions for each stream, or refuse `refused` in the runtime's words, and the stream graphs followed over it. */
function streamGraphsFollowedOverAFakeRuntime(refused: "subscribe_stream_graph_changes" | "subscribe_input_value_changes" | null = null) {
  const subscribed = (method: "subscribe_stream_graph_changes" | "subscribe_input_value_changes", streams: readonly string[]) =>
    method === refused ? Effect.fail(refusedByTheOperation(method, `${method} failed: no stream with the id \`${streams.join(", ")}\` is loaded in this runtime`)) : Effect.succeed({ streams: [...streams] });
  const runtime = fakeRuntimeOfConnections({
    subscribe_stream_graph_changes: ({ streams }) => subscribed("subscribe_stream_graph_changes", streams),
    subscribe_input_value_changes: ({ streams }) => subscribed("subscribe_input_value_changes", streams),
  });
  return { ...runtime, followed: controlPushesFollowedForTheWindows(STREAM_GRAPH_CHANGES, tellTheWindowTheStreamGraphChanged) };
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

function firstOf<Item>(items: readonly Item[]): Item {
  return items[0] ?? expect.unreachable("the list holds an item");
}

function windowRecordingWhatItIsSent(): WindowFollowingStreamGraphs & { sent: [string, StreamGraphInputValueChange | null][] } {
  const sent: [string, StreamGraphInputValueChange | null][] = [];
  return { sent, sendTheWindowTheStreamGraphChanged: (stream, inputValueChange) => void sent.push([stream, inputValueChange]) };
}

test("a_followed_stream_is_subscribed_to_both_its_graph_and_its_input_values_on_one_connection_and_its_window_reads_the_graph_once_both_answer", async () => {
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime();
  const studioWindow = windowRecordingWhatItIsSent();

  await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow("pattern-main-bcd55b", studioWindow);
      yield* settle;
    }),
    layer,
  );

  expect(connectionsOpened[0]?.callsMade).toEqual([
    ["subscribe_stream_graph_changes", { streams: ["pattern-main-bcd55b"] }],
    ["subscribe_input_value_changes", { streams: ["pattern-main-bcd55b"] }],
  ]);
  expect(studioWindow.sent).toEqual([["pattern-main-bcd55b", null]]);
});

test("a_stream_whose_input_values_the_runtime_will_not_subscribe_is_not_counted_followed_and_is_subscribed_again_on_the_schedule", async () => {
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime("subscribe_input_value_changes");
  const studioWindow = windowRecordingWhatItIsSent();

  await runOnATestClock(
    Effect.gen(function* () {
      yield* (yield* followed).follow("pattern-main-bcd55b", studioWindow);
      yield* settle;
      expect(connectionsOpened[0]?.callsMade).toHaveLength(2);
      yield* TestClock.adjust(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER);
    }),
    layer,
  );

  expect(studioWindow.sent).toEqual([]);
  expect(connectionsOpened[0]?.callsMade).toHaveLength(4);
});

test("each_recorded_value_change_reaches_only_the_windows_following_its_stream_as_what_the_input_or_its_member_reads_and_a_graph_change_asks_for_a_read", async () => {
  const { followed, connectionsOpened, layer } = streamGraphsFollowedOverAFakeRuntime();
  const patternWindow = windowRecordingWhatItIsSent();
  const lobbyWindow = windowRecordingWhatItIsSent();
  const recorded = await recordedInputValueChanges();

  await runOnATestClock(
    Effect.gen(function* () {
      const streamGraphs = yield* followed;
      yield* streamGraphs.follow("pattern-main-bcd55b", patternWindow);
      yield* streamGraphs.follow("lobby-wall-3a91f0", lobbyWindow);
      yield* settle;
      for (const notification of recorded) connectionsOpened[0]?.push("input_value_changed", notification);
      connectionsOpened[0]?.push("input_value_changed", { ...firstOf(recorded), input: "levels", member: "left", value: 0.25, value_comes_from: "live" });
      yield* settle;
      connectionsOpened[0]?.push("stream_graph_changed", { stream: "pattern-main-bcd55b", change: "missed" });
      yield* settle;
    }),
    layer,
  );

  const MIX = "8f1e2c74-6b0a-4c1d-9a63-0d5c7e21a9b4";
  expect(patternWindow.sent).toEqual([
    ["pattern-main-bcd55b", null],
    ["pattern-main-bcd55b", { node: MIX, input: "gain", member: null, value_read: { value: 0.6, comes_from: "live" } }],
    ["pattern-main-bcd55b", { node: MIX, input: "gain", member: null, value_read: { value: 0.9, comes_from: "saved" } }],
    ["pattern-main-bcd55b", { node: MIX, input: "gain", member: null, value_read: { value: null, comes_from: "wire" } }],
    ["pattern-main-bcd55b", { node: MIX, input: "label", member: null, value_read: { value: null, comes_from: null } }],
    ["pattern-main-bcd55b", { node: MIX, input: "levels", member: "left", value_read: { value: 0.25, comes_from: "live" } }],
    ["pattern-main-bcd55b", null],
  ]);
  expect(lobbyWindow.sent).toEqual([
    ["lobby-wall-3a91f0", null],
    ["lobby-wall-3a91f0", { node: "1d0b6a55-2f48-4e7c-8b19-7c3e9d04f612", input: "colour", member: null, value_read: { value: { r: 1, g: 0.5, b: 0, a: 1 }, comes_from: "live" } }],
  ]);
});

/** Against a real runtime holding the stream loaded, one of whose top-level nodes has an unlinked input reading a number: the same variables as the test above. */
test.skipIf(liveLocalApiSocket === "" || liveLoadedStream === "")("a_real_runtime_sends_a_window_following_a_stream_each_value_set_live_and_no_graph_change", async () => {
  const liveRuntime = pushesFollowedOverALiveRuntime(liveLocalApiSocket);
  const studioWindow = windowRecordingWhatItIsSent();
  try {
    await liveRuntime.runPromise(StreamGraphsFollowed.use((followed) => followed.follow(liveLoadedStream, studioWindow)));
    await expect.poll(() => studioWindow.sent.length, { timeout: 5_000 }).toBe(1);

    const graph = await liveRuntime.runPromise(RuntimeControl.use((runtimeControl) => runtimeControl.call("graph", { stream: liveLoadedStream })));
    const graphRead = isAJsonObject(graph) ? graph : null;
    const streamAsset = graphRead?.["asset"];
    const nodes = graphRead?.["nodes"];
    if (typeof streamAsset !== "string" || !Array.isArray(nodes)) return expect.unreachable(`the graph of ${liveLoadedStream} names no asset or nodes`);
    const numberInput = nodes.flatMap((node: unknown) => {
      if (!isAJsonObject(node) || typeof node["id"] !== "string" || !isAJsonObject(node["ports"]) || !Array.isArray(node["ports"]["inputs"])) return [];
      const nodeId = node["id"];
      return node["ports"]["inputs"].flatMap((port: unknown) => (isAJsonObject(port) && typeof port["name"] === "string" && typeof port["value"] === "number" && port["value_comes_from"] !== "wire" && isAJsonObject(port["pin_type"]) && port["pin_type"]["type"] === "float" ? [{ node: nodeId, input: port["name"] }] : []));
    })[0];
    if (numberInput === undefined) return expect.unreachable(`no top-level node of ${liveLoadedStream} has an unlinked Float input`);
    const setTheInput = (value: number | null) =>
      liveRuntime.runPromiseExit(
        RuntimeControl.use((runtimeControl) =>
          runtimeControl.call("transact", { operations: [{ operation: "set_node_input_value", stream: streamAsset, node: numberInput.node, input: numberInput.input, value }], mode: "live" }),
        ),
      );
    for (const value of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) expect(Exit.isSuccess(await setTheInput(value))).toBe(true);
    await setTheInput(null);

    const pushedAfterTheFirstRead = (): readonly [string, StreamGraphInputValueChange | null][] => studioWindow.sent.slice(1);
    await expect.poll(() => pushedAfterTheFirstRead().some(([, inputValueChange]) => inputValueChange?.value_read.comes_from === "live" && inputValueChange.value_read.value === 0.8), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => pushedAfterTheFirstRead().at(-1)?.[1]?.value_read.comes_from, { timeout: 5_000 }).toBeOneOf(["saved", "default", null]);
    expect(pushedAfterTheFirstRead().filter(([, inputValueChange]) => inputValueChange === null)).toEqual([]);
    expect(pushedAfterTheFirstRead().every(([, inputValueChange]) => inputValueChange?.node === numberInput.node && inputValueChange.input === numberInput.input)).toBe(true);
  } finally {
    await liveRuntime.dispose();
  }
});
