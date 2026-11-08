import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { LOCAL_API_MCP_PROTOCOL_VERSION, type LocalApiRequestFailure } from "./local_api_client.js";
import {
  closedViewerFromTheCloseViewerToolResult,
  LocalApiMcpStdioConnection,
  openedRuntimeViewerFromTheOpenViewerToolResult,
  type OpenedRuntimeViewer,
} from "./local_api_mcp_stdio_connection.js";
import type { Result } from "./result.js";

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

/** How the fake runtime answers one JSON-RPC request line: the lines to write back, or `null` to leave it unanswered. */
type FakeRuntimeAnswer = (request: Record<string, unknown>) => string[] | null;

/** A local API that answers `/mcp/stdio`'s upgrade with `upgradeResponse` and then each request line with `answerRequest`, recording every line it read. */
async function fakeMcpStdioRuntime(upgradeResponse: string, answerRequest: FakeRuntimeAnswer, bytesWrittenWithTheUpgrade = "") {
  const socketDirectory = await mkdtemp("/tmp/tl-app-");
  const localApiSocketPath = path.join(socketDirectory, "local-api.sock");
  const upgradeRequestsRead: string[] = [];
  const requestLinesRead: Record<string, unknown>[] = [];
  const connectionsOpen: net.Socket[] = [];
  const server = net.createServer((connection) => {
    connectionsOpen.push(connection);
    let bytesRead = Buffer.alloc(0);
    let upgraded = false;
    connection.on("data", (chunk: Buffer) => {
      bytesRead = Buffer.concat([bytesRead, chunk]);
      if (!upgraded) {
        const headEnd = bytesRead.indexOf("\r\n\r\n");
        if (headEnd === -1) return;
        upgradeRequestsRead.push(bytesRead.subarray(0, headEnd).toString("utf8"));
        bytesRead = bytesRead.subarray(headEnd + 4);
        upgraded = true;
        if (!upgradeResponse.startsWith("HTTP/1.1 101 ")) {
          connection.end(upgradeResponse);
          return;
        }
        connection.write(upgradeResponse + bytesWrittenWithTheUpgrade);
      }
      for (let lineEnd = bytesRead.indexOf(0x0a); lineEnd !== -1; lineEnd = bytesRead.indexOf(0x0a)) {
        const request: unknown = JSON.parse(bytesRead.subarray(0, lineEnd).toString("utf8"));
        bytesRead = bytesRead.subarray(lineEnd + 1);
        if (typeof request !== "object" || request === null) continue;
        const requestFields = Object.fromEntries(Object.entries(request));
        requestLinesRead.push(requestFields);
        for (const answerLine of answerRequest(requestFields) ?? []) connection.write(`${answerLine}\n`);
      }
    });
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
    requestLinesRead,
    closeEveryConnection: () => connectionsOpen.forEach((connection) => connection.destroy()),
  };
}

const UPGRADED = "HTTP/1.1 101 Switching Protocols\r\nconnection: upgrade\r\nupgrade: mcp-stdio\r\n\r\n";

/** The JSON-RPC line the runtime's rmcp server writes for request `id`'s tool result: the tool's JSON as one pretty-printed text block. */
function toolResultLine(id: unknown, toolResult: unknown, isError = false): string {
  const text = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult, null, 2);
  return JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError } });
}

function toolCallParams(request: Record<string, unknown>): Record<string, unknown> {
  const params = request["params"];
  return typeof params === "object" && params !== null ? Object.fromEntries(Object.entries(params)) : {};
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
  surface_share_address: "/run/user/1000/tatolab/surface-share.sock",
};

const LINUX_VIEWER: OpenedRuntimeViewer = OPEN_VIEWER_RESULT_ON_LINUX;

async function openConnection(localApiSocketPath: string, requestTimeoutMs = 2_000): Promise<LocalApiMcpStdioConnection> {
  const connection = answerOf(await LocalApiMcpStdioConnection.open(localApiSocketPath, requestTimeoutMs, "0.45.0"));
  cleanUps.push(async () => connection.close());
  return connection;
}

test("the_connection_upgrades_with_mcp_stdio_and_opens_a_viewer_with_the_per_request_meta", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => [toolResultLine(request["id"], OPEN_VIEWER_RESULT_ON_LINUX)]);
  const connection = await openConnection(runtime.localApiSocketPath);

  const openedViewer = answerOf(await connection.openViewer({ stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 4242 }));

  expect(openedViewer).toEqual(LINUX_VIEWER);
  expect(runtime.upgradeRequestsRead).toEqual(["GET /mcp/stdio HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: mcp-stdio"]);
  const [openViewerRequest] = runtime.requestLinesRead;
  expect(openViewerRequest).toMatchObject({ jsonrpc: "2.0", method: "tools/call" });
  expect(toolCallParams(openViewerRequest ?? {})).toEqual({
    name: "open_viewer",
    arguments: { stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 4242 },
    _meta: {
      "io.modelcontextprotocol/protocolVersion": LOCAL_API_MCP_PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientInfo": { name: "tatolab-app", version: "0.45.0" },
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  });
});

test("answers_that_come_back_out_of_order_settle_the_requests_they_answer", async () => {
  const requestsHeld: Record<string, unknown>[] = [];
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => {
    requestsHeld.push(request);
    if (requestsHeld.length < 2) return null;
    const [first, second] = requestsHeld;
    return [toolResultLine(second?.["id"], { viewer: "s/b/out" }), toolResultLine(first?.["id"], OPEN_VIEWER_RESULT_ON_LINUX)];
  });
  const connection = await openConnection(runtime.localApiSocketPath);

  const [openedViewer, closedViewer] = await Promise.all([
    connection.openViewer({ stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 1 }),
    connection.closeViewer("s/b/out"),
  ]);

  expect(answerOf(openedViewer).viewer).toBe("pattern-main-1a2b3c/7f3a/video");
  expect(answerOf(closedViewer)).toBe("s/b/out");
  expect(new Set(runtime.requestLinesRead.map((request) => request["id"])).size).toBe(2);
});

test("bytes_the_runtime_writes_with_the_101_are_read_as_the_first_lines", async () => {
  const notification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: "hello" } });
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => [toolResultLine(request["id"], { viewer: "a/b/c" })], `${notification}\n`);
  const connection = await openConnection(runtime.localApiSocketPath);

  expect(answerOf(await connection.closeViewer("a/b/c"))).toBe("a/b/c");
});

test("a_viewer_the_tool_refuses_is_the_runtimes_refusal_in_its_own_words", async () => {
  const refusal = "open_viewer failed: node `pattern` of stream `pattern-main-1a2b3c` is not running";
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => [toolResultLine(request["id"], refusal, true)]);
  const connection = await openConnection(runtime.localApiSocketPath);

  const failure = failureOf(await connection.openViewer({ stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 1 }));

  expect(failure).toEqual<LocalApiRequestFailure>({ failureDescription: refusal, isTheRuntimesRefusal: true });
});

test("a_json_rpc_error_is_the_runtimes_refusal_naming_mcp_stdio", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => [JSON.stringify({ jsonrpc: "2.0", id: request["id"], error: { code: -32602, message: "unknown field `extra`" } })]);
  const connection = await openConnection(runtime.localApiSocketPath);

  const failure = failureOf(await connection.callMcpTool("open_viewer", { extra: true }));

  expect(failure).toEqual<LocalApiRequestFailure>({ failureDescription: "the runtime refused `open_viewer` (/mcp/stdio): unknown field `extra`", isTheRuntimesRefusal: true });
});

test("a_runtime_that_refuses_the_upgrade_is_refused_in_its_own_words", async () => {
  const refusalBody = "`/mcp/stdio` serves MCP only after `Connection: upgrade` and `Upgrade: mcp-stdio`";
  const runtime = await fakeMcpStdioRuntime(`HTTP/1.1 426 Upgrade Required\r\ncontent-length: ${refusalBody.length}\r\n\r\n${refusalBody}`, () => null);

  const failure = failureOf(await LocalApiMcpStdioConnection.open(runtime.localApiSocketPath, 2_000, "0.45.0"));

  expect(failure.isTheRuntimesRefusal).toBe(true);
  expect(failure.failureDescription).toContain("426 Upgrade Required");
  expect(failure.failureDescription).toContain(refusalBody);
});

test("no_runtime_at_the_socket_fails_to_open_without_a_refusal", async () => {
  const socketDirectory = await mkdtemp("/tmp/tl-app-");
  cleanUps.push(() => rm(socketDirectory, { recursive: true, force: true }));

  const failure = failureOf(await LocalApiMcpStdioConnection.open(path.join(socketDirectory, "local-api.sock"), 2_000, "0.45.0"));

  expect(failure.isTheRuntimesRefusal).toBe(false);
  expect(failure.failureDescription).toMatch(/^no runtime answers at /);
});

test("an_unanswered_request_times_out_and_is_cancelled_on_the_connection", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, () => null);
  const connection = await openConnection(runtime.localApiSocketPath, 100);

  const failure = failureOf(await connection.closeViewer("a/b/c"));
  await expect.poll(() => runtime.requestLinesRead.length).toBe(2);

  expect(failure.failureDescription).toMatch(/`close_viewer` to the runtime at .* did not answer within 100ms/);
  const [closeViewerRequest, cancellation] = runtime.requestLinesRead;
  expect(cancellation).toMatchObject({ method: "notifications/cancelled", params: { requestId: closeViewerRequest?.["id"] } });
  expect(connection.isOpen()).toBe(true);
});

test("the_runtime_closing_the_connection_fails_the_requests_awaiting_answers_and_tells_the_listeners", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, () => null);
  const connection = await openConnection(runtime.localApiSocketPath);
  const whyItClosed: string[] = [];
  connection.onClosed((why) => whyItClosed.push(why));

  const awaitingItsAnswer = connection.openViewer({ stream: "s", node_id: "n", port: "p", viewer_process_id: 1 });
  await expect.poll(() => runtime.requestLinesRead.length).toBe(1);
  runtime.closeEveryConnection();
  const failure = failureOf(await awaitingItsAnswer);

  expect(failure.isTheRuntimesRefusal).toBe(false);
  expect(failure.failureDescription).toMatch(/^`open_viewer` was not answered: the runtime at .* closed the \/mcp\/stdio connection$/);
  expect(whyItClosed).toHaveLength(1);
  expect(connection.isOpen()).toBe(false);
  expect(failureOf(await connection.closeViewer("s/n/p")).failureDescription).toMatch(/^`close_viewer` was not sent: /);
});

test("a_request_from_the_runtime_is_answered_method_not_found", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) =>
    request["method"] === "tools/call" ? [JSON.stringify({ jsonrpc: "2.0", id: "ping-1", method: "ping" }), toolResultLine(request["id"], { viewer: "a/b/c" })] : null,
  );
  const connection = await openConnection(runtime.localApiSocketPath);

  answerOf(await connection.closeViewer("a/b/c"));
  await expect.poll(() => runtime.requestLinesRead.length).toBe(2);

  expect(runtime.requestLinesRead[1]).toEqual({ jsonrpc: "2.0", id: "ping-1", error: { code: -32601, message: "the app serves no requests" } });
});

test("an_open_viewer_result_on_macos_without_a_viewer_process_names_no_surface_share_address", () => {
  const { surface_share_address: _surfaceShareAddress, ...withoutSurfaceShareAddress } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(answerOf(openedRuntimeViewerFromTheOpenViewerToolResult(JSON.stringify(withoutSurfaceShareAddress)))).toEqual({ ...LINUX_VIEWER, surface_share_address: null });
});

test("an_open_viewer_result_missing_its_channel_cannot_be_read", () => {
  const { channel: _channel, ...withoutChannel } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(failureOf(openedRuntimeViewerFromTheOpenViewerToolResult(JSON.stringify(withoutChannel)))).toMatch(/^the runtime's open_viewer result could not be read: .*channel/);
  expect(failureOf(closedViewerFromTheCloseViewerToolResult("{}"))).toMatch(/^the runtime's close_viewer result could not be read: /);
});
