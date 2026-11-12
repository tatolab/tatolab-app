// Tests' stand-in for the runtime's local API: a Unix socket answering each connection with the
// next scripted raw HTTP response, or each `POST /control` by its operation, and the responses the
// runtime writes. Never imported by shipped code.

import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { LocalApiClient } from "./local_api_client.js";

/** The temporary directory the socket goes in: macOS caps a socket path at 104 bytes, which its `$TMPDIR` alone nearly fills. */
const SHORT_TEMPORARY_DIRECTORY_PREFIX = "/tmp/tl-app-";

/** Answers one control operation call by its method and params, or `null` to close the connection unanswered, as no runtime would. */
export type FakeLocalApiControlOperationAnswer = (method: string, params: Readonly<Record<string, unknown>>) => Promise<Buffer | null>;

/** A local API that answers each connection with the next scripted raw response, recording every request it read. */
export class FakeLocalApiServer {
  private constructor(
    readonly localApiSocketPath: string,
    private readonly socketDirectory: string,
    private readonly server: net.Server,
    private readonly requestsReceived: string[],
    private readonly responsesLeft: Buffer[],
  ) {}

  /** A server answering its connections with `scriptedResponses`, in order, each `answerDelayMs` after its request arrives. */
  static async answering(scriptedResponses: readonly Buffer[], answerDelayMs = 0): Promise<FakeLocalApiServer> {
    const socketDirectory = await mkdtemp(SHORT_TEMPORARY_DIRECTORY_PREFIX);
    const localApiSocketPath = path.join(socketDirectory, "local-api.sock");
    const requestsReceived: string[] = [];
    const responsesLeft = [...scriptedResponses];
    const server = net.createServer((connection) => {
      const scriptedResponse = responsesLeft.shift();
      if (scriptedResponse === undefined) {
        connection.destroy();
        return;
      }
      readOneRequest(connection, (request) => {
        requestsReceived.push(request);
        setTimeout(() => connection.end(scriptedResponse), answerDelayMs);
      });
    });
    await new Promise<void>((listening) => server.listen(localApiSocketPath, listening));
    return new FakeLocalApiServer(localApiSocketPath, socketDirectory, server, requestsReceived, responsesLeft);
  }

  /** A server answering each `POST /control` with what `answerTheCall` gives for its operation, and closing every other request unanswered. */
  static async answeringEachControlOperation(answerTheCall: FakeLocalApiControlOperationAnswer): Promise<FakeLocalApiServer> {
    const socketDirectory = await mkdtemp(SHORT_TEMPORARY_DIRECTORY_PREFIX);
    const localApiSocketPath = path.join(socketDirectory, "local-api.sock");
    const requestsReceived: string[] = [];
    const server = net.createServer((connection) => {
      connection.on("error", () => {});
      readOneRequest(connection, (request) => {
        requestsReceived.push(request);
        const operationCall = controlOperationCallIn(request);
        if (operationCall === null) {
          connection.destroy();
          return;
        }
        void answerTheCall(operationCall.method, operationCall.params).then((answer) => (answer === null ? connection.destroy() : connection.end(answer)));
      });
    });
    await new Promise<void>((listening) => server.listen(localApiSocketPath, listening));
    return new FakeLocalApiServer(localApiSocketPath, socketDirectory, server, requestsReceived, []);
  }

  /** Answer the next connections with `scriptedResponses`, after any still left, as a runtime that comes up does. */
  answerNext(scriptedResponses: readonly Buffer[]): void {
    this.responsesLeft.push(...scriptedResponses);
  }

  /** A client of this server. */
  client(): LocalApiClient {
    return new LocalApiClient(this.localApiSocketPath, 2_000);
  }

  /** Every request the server read, in order. */
  receivedRequests(): string[] {
    return [...this.requestsReceived];
  }

  /** Stop listening and remove the socket's directory. */
  async close(): Promise<void> {
    await new Promise<void>((closed) => this.server.close(() => closed()));
    await rm(this.socketDirectory, { recursive: true, force: true });
  }
}

function readOneRequest(connection: net.Socket, onRequest: (request: string) => void): void {
  const requestChunks: Buffer[] = [];
  let requestRead = false;
  connection.on("data", (requestChunk: Buffer) => {
    requestChunks.push(requestChunk);
    const requestBytes = Buffer.concat(requestChunks);
    const headEnd = requestBytes.indexOf("\r\n\r\n");
    if (requestRead || headEnd === -1) return;
    const contentLengthLine = requestBytes
      .subarray(0, headEnd)
      .toString("utf8")
      .split("\r\n")
      .find((headerLine) => headerLine.startsWith("Content-Length: "));
    const contentLength = contentLengthLine === undefined ? 0 : Number(contentLengthLine.slice("Content-Length: ".length).trim());
    if (requestBytes.length < headEnd + 4 + contentLength) return;
    requestRead = true;
    onRequest(requestBytes.toString("utf8"));
  });
}

function controlOperationCallIn(request: string): { method: string; params: Record<string, unknown> } | null {
  if (!request.startsWith("POST /control ")) return null;
  const body = request.slice(request.indexOf("\r\n\r\n") + 4);
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || !("method" in parsed) || typeof parsed.method !== "string") return null;
    const params = "params" in parsed && typeof parsed.params === "object" && parsed.params !== null ? Object.fromEntries(Object.entries(parsed.params)) : {};
    return { method: parsed.method, params };
  } catch {
    return null;
  }
}

/** An HTTP/1.1 response carrying `body` as `contentType`. */
export function httpResponse(statusLine: string, contentType: string, body: string): Buffer {
  return Buffer.from(`HTTP/1.1 ${statusLine}\r\ncontent-type: ${contentType}\r\ncontent-length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, "utf8");
}

/** The JSON-RPC body `POST /control` answers with for `jsonRpcAnswerText`, as the runtime writes it. */
function controlResponse(jsonRpcAnswerText: string): Buffer {
  return httpResponse("200 OK", "application/json", jsonRpcAnswerText);
}

/** The runtime's answer to an operation that answered `result`. */
export function controlOperationResultResponse(result: unknown): Buffer {
  return controlResponse(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
}

/** The runtime's answer to an operation that refused, in `runtimeWords`, with the structured `refusal` (`ProjectActionRefusalOnTheWire`). */
export function controlOperationRefusedResponse(runtimeWords: string, refusal: unknown): Buffer {
  return controlResponse(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: 1, message: runtimeWords, data: refusal } }));
}

/** The runtime's answer to an operation that failed, in `runtimeWords`. */
export function controlOperationFailedResponse(runtimeWords: string): Buffer {
  return controlResponse(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: 2, message: runtimeWords } }));
}

/**
 * The answer `POST /control` gives for the operation a recorded MCP `tools/call` response answered: its result's text spliced in
 * whole, so its numbers keep their digits, or its words as a refusal (code 1, with `structuredContent.refusal` as the data) or a
 * failure (code 2). The JSON-RPC adapter serializes the same result type the MCP tool printed.
 */
export function controlOperationResponseOfTheRecordedToolResponse(recordedToolResponseBody: string): Buffer {
  const recorded: unknown = JSON.parse(recordedToolResponseBody);
  const toolResult = typeof recorded === "object" && recorded !== null && "result" in recorded ? recorded.result : null;
  if (typeof toolResult !== "object" || toolResult === null || !("content" in toolResult) || !Array.isArray(toolResult.content)) {
    return controlResponse(recordedToolResponseBody);
  }
  const firstContent: unknown = toolResult.content[0];
  const text = typeof firstContent === "object" && firstContent !== null && "text" in firstContent && typeof firstContent.text === "string" ? firstContent.text : "";
  if (!("isError" in toolResult) || toolResult.isError !== true) return controlResponse(`{"jsonrpc":"2.0","id":1,"result":${text}}`);
  const structuredContent = "structuredContent" in toolResult ? toolResult.structuredContent : null;
  const refusal = typeof structuredContent === "object" && structuredContent !== null && "refusal" in structuredContent ? structuredContent.refusal : null;
  return refusal === null ? controlOperationFailedResponse(text) : controlOperationRefusedResponse(text, refusal);
}

/** The result text a recorded MCP `tools/call` response carries, parsed: what the control operation answers as its result. */
export function operationResultOfTheRecordedToolResponse(recordedToolResponseBody: string): unknown {
  const recorded: unknown = JSON.parse(controlOperationResponseOfTheRecordedToolResponse(recordedToolResponseBody).toString("utf8").split("\r\n\r\n")[1] ?? "null");
  return typeof recorded === "object" && recorded !== null && "result" in recorded ? recorded.result : null;
}
