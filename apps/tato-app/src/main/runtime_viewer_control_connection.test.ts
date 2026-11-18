import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { fakeControlWebSocketRuntime as fakeControlWebSocketRuntimeOnASocket, resultLine, type FakeControlWebSocketAnswer } from "./fake_control_websocket_runtime.js";
import { type LocalApiRequestFailure } from "./local_api_request_failure.js";
import type { Result } from "./result.js";
import {
  closedViewerFromTheCloseViewerToolResult,
  openedRuntimeViewerFromTheOpenViewerToolResult,
  RuntimeViewerControlConnection,
  type OpenedRuntimeViewer,
} from "./runtime_viewer_control_connection.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

function answerOf<T, F>(result: Result<T, F>): T {
  if (!result.ok) return expect.unreachable(JSON.stringify(result.failure));
  return result.value;
}

function failureOf<T, F>(result: Result<T, F>): F {
  if (result.ok) return expect.unreachable(`expected a failure, answered ${JSON.stringify(result.value)}`);
  return result.failure;
}

/** A fake `/control/ws` runtime answering each call after `discover` with `answerCall`, closed after the test. */
async function fakeControlWebSocketRuntime(answerCall: FakeControlWebSocketAnswer) {
  const runtime = await fakeControlWebSocketRuntimeOnASocket(answerCall);
  cleanUps.push(() => runtime.close());
  return runtime;
}

/** An `open_viewer` result in the shape `OpenViewerToolResult` (`local_api_wire_contract.rs`) serializes to. */
const OPEN_VIEWER_RESULT_ON_LINUX = {
  viewer: "pattern-main-1a2b3c/7f3a/video",
  stream: "pattern-main-1a2b3c",
  node_id: "7f3a",
  node_name: "pattern",
  port: "video",
  iceoryx2_domain_root: "/run/user/1000/tatolab/iceoryx2",
  channel: "streamlib/pattern-main-1a2b3c/pattern/video",
  wake_service: "streamlib/9c1d/notify",
  viewer_reads: "latest_message" as const,
  surface_share_address: "/run/user/1000/tatolab/surface-share.sock",
};

const LINUX_VIEWER: OpenedRuntimeViewer = OPEN_VIEWER_RESULT_ON_LINUX;

async function openConnection(localApiSocketPath: string, requestTimeoutMs = 2_000): Promise<RuntimeViewerControlConnection> {
  const connection = answerOf(await RuntimeViewerControlConnection.open(localApiSocketPath, requestTimeoutMs));
  cleanUps.push(async () => connection.close());
  return connection;
}

test("the_connection_upgrades_control_ws_by_the_apps_name_and_opens_a_viewer_with_open_viewer", async () => {
  const runtime = await fakeControlWebSocketRuntime((call) => [resultLine(call["id"], OPEN_VIEWER_RESULT_ON_LINUX)]);
  const connection = await openConnection(runtime.localApiSocketPath);

  const openedViewer = answerOf(await connection.openViewer({ stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 4242 }));

  expect(openedViewer).toEqual(LINUX_VIEWER);
  const upgradeHeadLines = (runtime.upgradeRequestsRead[0] ?? "").toLowerCase().split("\r\n");
  expect(upgradeHeadLines[0]).toBe("get /control/ws http/1.1");
  expect(upgradeHeadLines).toContain("tatolab-control-client-name: tatolab-app");
  expect(runtime.callsRead).toEqual([
    { jsonrpc: "2.0", id: expect.anything(), method: "open_viewer", params: { stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 4242 } },
  ]);
});

test("answers_that_come_back_out_of_order_settle_the_calls_they_answer", async () => {
  const callsHeld: Record<string, unknown>[] = [];
  const runtime = await fakeControlWebSocketRuntime((call) => {
    callsHeld.push(call);
    if (callsHeld.length < 2) return null;
    const [first, second] = callsHeld;
    return [resultLine(second?.["id"], { viewer: "s/b/out" }), resultLine(first?.["id"], OPEN_VIEWER_RESULT_ON_LINUX)];
  });
  const connection = await openConnection(runtime.localApiSocketPath);

  const [openedViewer, closedViewer] = await Promise.all([
    connection.openViewer({ stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 1 }),
    connection.closeViewer("s/b/out"),
  ]);

  expect(answerOf(openedViewer).viewer).toBe("pattern-main-1a2b3c/7f3a/video");
  expect(answerOf(closedViewer)).toBe("s/b/out");
});

test("a_viewer_the_operation_refuses_is_the_runtimes_refusal_in_its_own_words", async () => {
  const refusal = "open_viewer failed: node `pattern` of stream `pattern-main-1a2b3c` is not running";
  const runtime = await fakeControlWebSocketRuntime((call) => [JSON.stringify({ jsonrpc: "2.0", id: call["id"], error: { code: 2, message: refusal } })]);
  const connection = await openConnection(runtime.localApiSocketPath);

  const failure = failureOf(await connection.openViewer({ stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 1 }));

  expect(failure).toEqual<LocalApiRequestFailure>({ failureDescription: refusal, isTheRuntimesRefusal: true });
});

test("no_runtime_at_the_socket_fails_to_open_without_a_refusal", async () => {
  const socketDirectory = await mkdtemp("/tmp/tl-app-");
  cleanUps.push(() => rm(socketDirectory, { recursive: true, force: true }));

  const failure = failureOf(await RuntimeViewerControlConnection.open(path.join(socketDirectory, "local-api.sock"), 2_000));

  expect(failure.isTheRuntimesRefusal).toBe(false);
  expect(failure.failureDescription).toMatch(/^no runtime answers at /);
});

test("an_unanswered_call_times_out_and_leaves_the_connection_open", async () => {
  const runtime = await fakeControlWebSocketRuntime(() => null);
  const connection = await openConnection(runtime.localApiSocketPath, 100);

  const failure = failureOf(await connection.closeViewer("a/b/c"));

  expect(failure).toEqual<LocalApiRequestFailure>({ failureDescription: `\`close_viewer\` to ${runtime.localApiSocketPath} did not answer within 100ms`, isTheRuntimesRefusal: false });
  expect(connection.isOpen()).toBe(true);
});

test("the_runtime_closing_the_connection_fails_the_calls_awaiting_answers_and_tells_the_listeners", async () => {
  const runtime = await fakeControlWebSocketRuntime(() => null);
  const connection = await openConnection(runtime.localApiSocketPath);
  const whyItClosed: string[] = [];
  connection.onClosed((why) => whyItClosed.push(why));

  const awaitingItsAnswer = connection.openViewer({ stream: "s", node_id: "n", port: "p", viewer_process_id: 1 });
  await expect.poll(() => runtime.callsRead.length).toBe(1);
  runtime.closeEveryConnection();
  const failure = failureOf(await awaitingItsAnswer);

  expect(failure.isTheRuntimesRefusal).toBe(false);
  expect(failure.failureDescription).toMatch(/^`open_viewer` to .* got no answer: /);
  await expect.poll(() => whyItClosed).toEqual([`the runtime at ${runtime.localApiSocketPath} closed the /control/ws connection`]);
  expect(connection.isOpen()).toBe(false);
  expect(failureOf(await connection.closeViewer("s/n/p")).failureDescription).toMatch(/^`close_viewer` was not sent: /);
});

test("an_open_viewer_result_on_macos_without_a_viewer_process_names_no_surface_share_address", () => {
  const { surface_share_address: _surfaceShareAddress, ...withoutSurfaceShareAddress } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(answerOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutSurfaceShareAddress))).toEqual({ ...LINUX_VIEWER, surface_share_address: null });
});

test("an_open_viewer_result_missing_its_channel_cannot_be_read", () => {
  const { channel: _channel, ...withoutChannel } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(failureOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutChannel))).toMatch(/^the runtime's open_viewer result could not be read: .*channel/);
  expect(failureOf(closedViewerFromTheCloseViewerToolResult({}))).toMatch(/^the runtime's close_viewer result could not be read: /);
});

test("an_open_viewer_result_missing_its_wake_service_cannot_be_read", () => {
  const { wake_service: _wakeService, ...withoutWakeService } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(failureOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutWakeService))).toMatch(/^the runtime's open_viewer result could not be read: .*wake_service/);
});
