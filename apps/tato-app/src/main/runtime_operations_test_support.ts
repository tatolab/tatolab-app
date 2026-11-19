import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import type { ListedStream, StreamLocation } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse } from "./fake_local_api_server.js";
import type { Result } from "./result.js";

export const cleanUps: (() => Promise<void>)[] = [];

/** Closes every fake server and removes every temporary folder the test that just ended started. */
export async function cleanUpWhatTheTestStarted(): Promise<void> {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
}

/** A JSON-RPC response body recorded from a real runtime's local API. */
export const recordedResponseBody = (fixtureFileName: string) => readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

export async function fakeLocalApiServerAnswering(scriptedResponses: readonly Buffer[]): Promise<FakeLocalApiServer> {
  const server = await FakeLocalApiServer.answering(scriptedResponses);
  cleanUps.push(() => server.close());
  return server;
}

export function answerOf<T, F>(result: Result<T, F>): T {
  if (!result.ok) return expect.unreachable(JSON.stringify(result.failure));
  return result.value;
}

export function failureOf<T, F>(result: Result<T, F>): F {
  if (result.ok) return expect.unreachable(`expected a failure, answered ${JSON.stringify(result.value)}`);
  return result.failure;
}

export function headAndBodyOf(request: string | undefined): [string, string] {
  const headEnd = request?.indexOf("\r\n\r\n") ?? -1;
  if (request === undefined || headEnd === -1) return expect.unreachable(`not a request: ${request}`);
  return [request.slice(0, headEnd), request.slice(headEnd + 4)];
}

export function listedStream(
  stream: string,
  displayName: string,
  location: StreamLocation | null,
  state: string,
  nodeCount: number | null,
  failedBecause: string | null,
  actionUnderWay: { action: string; step: string | null } | null = null,
): ListedStream {
  return {
    stream,
    display_name: displayName,
    location,
    state,
    node_count: nodeCount,
    failed_because: failedBecause,
    capture_devices_whose_access_was_never_asked_for: [], condition: null,
    action: actionUnderWay?.action ?? null,
    step: actionUnderWay?.step ?? null,
  };
}

/** The `POST /control` answer carrying `resultText` as its result, spliced in exactly as written. */
export function controlOperationResponseOfTheResultText(resultText: string): Buffer {
  return httpResponse("200 OK", "application/json", `{"jsonrpc":"2.0","id":1,"result":${resultText}}`);
}

/** The operation and params of each `POST /control` `server` read, in order. */
export function controlOperationCallsReceivedBy(server: FakeLocalApiServer): [string | undefined, unknown][] {
  return server.receivedRequests().map((request) => {
    const [head, body] = headAndBodyOf(request);
    expect(head.startsWith("POST /control HTTP/1.1\r\n"), head).toBe(true);
    const requestBody: { method: string; params: unknown } = JSON.parse(body);
    return [requestBody.method, requestBody.params];
  });
}
