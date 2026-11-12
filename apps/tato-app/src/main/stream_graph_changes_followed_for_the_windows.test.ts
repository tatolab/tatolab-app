import { expect, test } from "vitest";
import { isAJsonObject } from "./json_on_the_wire.js";
import { succeeded } from "./result.js";
import { streamGraphChangesConnectionOver, streamGraphChangesFollowedForTheWindows } from "./stream_graph_changes_followed_for_the_windows.js";
import { TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";
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
