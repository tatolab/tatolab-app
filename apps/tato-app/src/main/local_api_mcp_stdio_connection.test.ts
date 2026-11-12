import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { LOCAL_API_MCP_PROTOCOL_VERSION, LocalApiMcpStdioConnection, resourceTextFromTheResourcesReadAnswer } from "./local_api_mcp_stdio_connection.js";
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

const FEED_URI = "streamlib://project/2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90/transactions";

/** The JSON-RPC line the runtime's rmcp server writes for request `id`'s `resources/read`: one contents block holding `text`. */
function resourceTextLine(id: unknown, text: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result: { contents: [{ uri: FEED_URI, mimeType: "application/json", text }] } });
}

async function openConnection(localApiSocketPath: string, requestTimeoutMs = 2_000): Promise<LocalApiMcpStdioConnection> {
  const connection = answerOf(await LocalApiMcpStdioConnection.open(localApiSocketPath, requestTimeoutMs, "0.45.0"));
  cleanUps.push(async () => connection.close());
  return connection;
}

test("the_connection_upgrades_with_mcp_stdio_and_reads_a_resource_with_the_per_request_meta", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => [resourceTextLine(request["id"], '{"transactions":[]}')]);
  const connection = await openConnection(runtime.localApiSocketPath);

  expect(answerOf(await connection.readResourceText(FEED_URI))).toBe('{"transactions":[]}');
  expect(runtime.upgradeRequestsRead).toEqual(["GET /mcp/stdio HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: mcp-stdio"]);
  expect(runtime.requestLinesRead[0]).toMatchObject({
    jsonrpc: "2.0",
    method: "resources/read",
    params: {
      uri: FEED_URI,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": LOCAL_API_MCP_PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientInfo": { name: "tatolab-app", version: "0.45.0" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  });
});

test("answers_that_come_back_out_of_order_settle_the_requests_they_answer", async () => {
  const requestsHeld: Record<string, unknown>[] = [];
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => {
    requestsHeld.push(request);
    if (requestsHeld.length < 2) return null;
    const [first, second] = requestsHeld;
    return [resourceTextLine(second?.["id"], "second"), resourceTextLine(first?.["id"], "first")];
  });
  const connection = await openConnection(runtime.localApiSocketPath);

  const [firstRead, secondRead] = await Promise.all([connection.readResourceText(FEED_URI), connection.readResourceText(FEED_URI)]);

  expect(answerOf(firstRead)).toBe("first");
  expect(answerOf(secondRead)).toBe("second");
  expect(new Set(runtime.requestLinesRead.map((request) => request["id"])).size).toBe(2);
});

test("bytes_the_runtime_writes_with_the_101_are_read_as_the_first_lines", async () => {
  const notification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: "hello" } });
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => [resourceTextLine(request["id"], "{}")], `${notification}\n`);
  const connection = await openConnection(runtime.localApiSocketPath);

  expect(answerOf(await connection.readResourceText(FEED_URI))).toBe("{}");
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

  const failure = failureOf(await connection.readResourceText(FEED_URI));
  await expect.poll(() => runtime.requestLinesRead.length).toBe(2);

  expect(failure.failureDescription).toMatch(/^reading streamlib:\/\/project\/.* to the runtime at .* did not answer within 100ms$/);
  const [readRequest, cancellation] = runtime.requestLinesRead;
  expect(cancellation).toMatchObject({ method: "notifications/cancelled", params: { requestId: readRequest?.["id"] } });
  expect(connection.isOpen()).toBe(true);
});

test("the_runtime_closing_the_connection_fails_the_requests_awaiting_answers_and_tells_the_listeners", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, () => null);
  const connection = await openConnection(runtime.localApiSocketPath);
  const whyItClosed: string[] = [];
  connection.onClosed((why) => whyItClosed.push(why));

  const awaitingItsAnswer = connection.readResourceText(FEED_URI);
  await expect.poll(() => runtime.requestLinesRead.length).toBe(1);
  runtime.closeEveryConnection();
  const failure = failureOf(await awaitingItsAnswer);

  expect(failure.isTheRuntimesRefusal).toBe(false);
  expect(failure.failureDescription).toMatch(/^reading streamlib:.* was not answered: the runtime at .* closed the \/mcp\/stdio connection$/);
  expect(whyItClosed).toHaveLength(1);
  expect(connection.isOpen()).toBe(false);
  expect(failureOf(await connection.readResourceText(FEED_URI)).failureDescription).toMatch(/^reading streamlib:.* was not sent: /);
});

test("a_request_from_the_runtime_is_answered_method_not_found", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) =>
    request["method"] === "resources/read" ? [JSON.stringify({ jsonrpc: "2.0", id: "ping-1", method: "ping" }), resourceTextLine(request["id"], "{}")] : null,
  );
  const connection = await openConnection(runtime.localApiSocketPath);

  answerOf(await connection.readResourceText(FEED_URI));
  await expect.poll(() => runtime.requestLinesRead.length).toBe(2);

  expect(runtime.requestLinesRead[1]).toEqual({ jsonrpc: "2.0", id: "ping-1", error: { code: -32601, message: "the app serves no requests" } });
});


test("a_resource_the_runtime_refuses_is_its_refusal_in_its_own_words", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => [JSON.stringify({ jsonrpc: "2.0", id: request["id"], error: { code: -32002, message: "no project is open at that uri" } })]);
  const connection = await openConnection(runtime.localApiSocketPath);

  const failure = failureOf(await connection.readResourceText(FEED_URI));
  expect(failure.isTheRuntimesRefusal).toBe(true);
  expect(failure.failureDescription).toBe("no project is open at that uri");
});

test("a_listen_hears_each_update_of_its_resource_until_stopped_and_stopping_cancels_it", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, (request) => {
    if (request["method"] !== "subscriptions/listen") return null;
    const updated = (uri: string) => JSON.stringify({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri } });
    return [JSON.stringify({ jsonrpc: "2.0", method: "notifications/subscriptions/acknowledged", params: {} }), updated(FEED_URI), updated("streamlib://project/other/transactions"), updated(FEED_URI)];
  });
  const connection = await openConnection(runtime.localApiSocketPath);
  let updatesHeard = 0;
  const whyItEnded: string[] = [];

  const listen = connection.listenForUpdatesOfTheResource(FEED_URI, () => (updatesHeard += 1), (why) => whyItEnded.push(why));
  await expect.poll(() => updatesHeard).toBe(2);
  listen.stop();
  await expect.poll(() => runtime.requestLinesRead.length).toBe(2);

  const [listenRequest, cancellation] = runtime.requestLinesRead;
  expect(listenRequest).toMatchObject({ method: "subscriptions/listen", params: { notifications: { resourceSubscriptions: [FEED_URI] } } });
  expect(cancellation).toMatchObject({ method: "notifications/cancelled", params: { requestId: listenRequest?.["id"] } });
  expect(whyItEnded).toEqual([]);
});

test("a_listen_is_held_past_the_request_timeout_and_ends_with_why_when_the_connection_closes", async () => {
  const runtime = await fakeMcpStdioRuntime(UPGRADED, () => null);
  const connection = await openConnection(runtime.localApiSocketPath, 50);
  const whyItEnded: string[] = [];

  connection.listenForUpdatesOfTheResource(FEED_URI, () => undefined, (why) => whyItEnded.push(why));
  await expect.poll(() => runtime.requestLinesRead.length).toBe(1);
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(whyItEnded).toEqual([]);
  runtime.closeEveryConnection();

  await expect.poll(() => whyItEnded.length).toBe(1);
  expect(whyItEnded[0]).toMatch(/closed the \/mcp\/stdio connection$/);
});

test("a_recorded_read_of_a_project_no_tool_has_opened_is_the_runtimes_refusal_in_its_own_words", async () => {
  const answerLine = await readFile(new URL("./test-fixtures/local-api-transactions-resource-refusal-for-a-project-not-open.json", import.meta.url), "utf8");

  expect(failureOf(resourceTextFromTheResourcesReadAnswer(FEED_URI, answerLine))).toEqual({
    isTheRuntimesRefusal: true,
    failureDescription: "no project 00000000-3988-4afd-aa77-5569cbfeb081 is open in this runtime; an asset tool such as `list_assets` opens it by its directory",
  });
});
