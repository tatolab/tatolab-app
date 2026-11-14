import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { CONTROL_OPERATION_METHOD_NAMES } from "@tatolab/runtime-client";
import { afterEach, expect, test } from "vitest";
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

/** How the fake runtime answers one call on `/control/ws` after `discover`: the messages to send back, or `null` to leave it unanswered. */
type FakeControlWebSocketAnswer = (call: Record<string, unknown>) => string[] | null;

/** What `discover` answers, in the shape the runtime's `DiscoverResult` serializes to. */
const DISCOVERED = { contract_version: 2, runtime_version: "0.68.74", build_id: "test-build", operations: [...CONTROL_OPERATION_METHOD_NAMES] };

/** The GUID RFC 6455 appends to a client's `Sec-WebSocket-Key` before hashing it into `Sec-WebSocket-Accept`. */
const WEBSOCKET_ACCEPT_KEY_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const WEBSOCKET_TEXT_OPCODE = 0x1;
const WEBSOCKET_CLOSE_OPCODE = 0x8;

/** One unmasked, final server frame carrying `payload` with `opcode`, as RFC 6455 frames it. */
function serverWebSocketFrame(opcode: number, payload: Buffer): Buffer {
  const lengthBytes = payload.length < 126 ? Buffer.from([payload.length]) : Buffer.alloc(9);
  if (payload.length >= 126) {
    lengthBytes[0] = 127;
    lengthBytes.writeBigUInt64BE(BigInt(payload.length), 1);
  }
  return Buffer.concat([Buffer.from([0x80 | opcode]), lengthBytes, payload]);
}

/** The first whole masked client frame in `bytes`, unmasked, with the bytes after it; or `null` while it has not all arrived. */
function firstClientWebSocketFrame(bytes: Buffer): { opcode: number; payload: Buffer; bytesAfter: Buffer } | null {
  if (bytes.length < 2) return null;
  const opcode = (bytes[0] ?? 0) & 0x0f;
  const shortLength = (bytes[1] ?? 0) & 0x7f;
  const lengthFieldBytes = shortLength === 126 ? 2 : shortLength === 127 ? 8 : 0;
  const maskStart = 2 + lengthFieldBytes;
  if (bytes.length < maskStart + 4) return null;
  const payloadLength = shortLength === 126 ? bytes.readUInt16BE(2) : shortLength === 127 ? Number(bytes.readBigUInt64BE(2)) : shortLength;
  const payloadStart = maskStart + 4;
  if (bytes.length < payloadStart + payloadLength) return null;
  const mask = bytes.subarray(maskStart, payloadStart);
  const payload = Buffer.from(bytes.subarray(payloadStart, payloadStart + payloadLength).map((byte, index) => byte ^ (mask[index % 4] ?? 0)));
  return { opcode, payload, bytesAfter: bytes.subarray(payloadStart + payloadLength) };
}

/** A local API that upgrades `/control/ws`, answers `discover`, and then each call with `answerCall`, recording every upgrade and call it read. */
async function fakeControlWebSocketRuntime(answerCall: FakeControlWebSocketAnswer) {
  const socketDirectory = await mkdtemp("/tmp/tl-app-");
  const localApiSocketPath = path.join(socketDirectory, "local-api.sock");
  const upgradeRequestsRead: string[] = [];
  const callsRead: Record<string, unknown>[] = [];
  const connectionsOpen: net.Socket[] = [];
  const server = net.createServer((connection) => {
    connectionsOpen.push(connection);
    const sendText = (messageText: string) => connection.write(serverWebSocketFrame(WEBSOCKET_TEXT_OPCODE, Buffer.from(messageText, "utf8")));
    let bytesRead: Buffer = Buffer.alloc(0);
    let upgraded = false;
    connection.on("data", (chunk: Buffer) => {
      bytesRead = Buffer.concat([bytesRead, chunk]);
      if (!upgraded) {
        const headEnd = bytesRead.indexOf("\r\n\r\n");
        if (headEnd === -1) return;
        const upgradeHead = bytesRead.subarray(0, headEnd).toString("utf8");
        upgradeRequestsRead.push(upgradeHead);
        bytesRead = bytesRead.subarray(headEnd + 4);
        upgraded = true;
        const websocketKey = /^sec-websocket-key:\s*(\S+)\s*$/im.exec(upgradeHead)?.[1] ?? "";
        const acceptKey = createHash("sha1").update(websocketKey + WEBSOCKET_ACCEPT_KEY_GUID).digest("base64");
        connection.write(`HTTP/1.1 101 Switching Protocols\r\nconnection: upgrade\r\nupgrade: websocket\r\nsec-websocket-accept: ${acceptKey}\r\n\r\n`);
      }
      for (let frame = firstClientWebSocketFrame(bytesRead); frame !== null; frame = firstClientWebSocketFrame(bytesRead)) {
        bytesRead = frame.bytesAfter;
        if (frame.opcode === WEBSOCKET_CLOSE_OPCODE) {
          connection.end(serverWebSocketFrame(WEBSOCKET_CLOSE_OPCODE, frame.payload.subarray(0, 2)));
          return;
        }
        if (frame.opcode !== WEBSOCKET_TEXT_OPCODE) continue;
        const call: unknown = JSON.parse(frame.payload.toString("utf8"));
        if (typeof call !== "object" || call === null) continue;
        const callFields = Object.fromEntries(Object.entries(call));
        if (callFields["method"] === "discover") {
          sendText(JSON.stringify({ jsonrpc: "2.0", id: callFields["id"], result: DISCOVERED }));
          continue;
        }
        callsRead.push(callFields);
        for (const answerText of answerCall(callFields) ?? []) sendText(answerText);
      }
    });
    connection.on("error", () => connection.destroy());
    connection.once("end", () => connection.end());
  });
  await new Promise<void>((listening) => server.listen(localApiSocketPath, listening));
  cleanUps.push(async () => {
    for (const connection of connectionsOpen) connection.destroy();
    await new Promise<void>((closed) => server.close(() => closed()));
    await rm(socketDirectory, { recursive: true, force: true });
  });
  return {
    localApiSocketPath,
    upgradeRequestsRead,
    callsRead,
    closeEveryConnection: () => connectionsOpen.forEach((connection) => connection.destroy()),
  };
}

function resultLine(id: unknown, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
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
