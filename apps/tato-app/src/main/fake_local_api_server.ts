// Tests' stand-in for the runtime's local API: a Unix socket answering each connection with the
// next scripted raw HTTP response, or each MCP tool call by its tool, and the responses the runtime
// writes. Never imported by shipped code.

import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { LocalApiClient } from "./local_api_client.js";

/** The temporary directory the socket goes in: macOS caps a socket path at 104 bytes, which its `$TMPDIR` alone nearly fills. */
const SHORT_TEMPORARY_DIRECTORY_PREFIX = "/tmp/tl-app-";

/** Answers one MCP tool call by its tool's name and arguments, or `null` to close the connection unanswered, as no runtime would. */
export type FakeLocalApiToolCallAnswer = (toolName: string, toolArguments: Readonly<Record<string, unknown>>) => Promise<Buffer | null>;

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

  /** A server answering each MCP tool call with what `answerTheToolCall` gives for it, and closing every other request unanswered. */
  static async answeringEachToolCall(answerTheToolCall: FakeLocalApiToolCallAnswer): Promise<FakeLocalApiServer> {
    const socketDirectory = await mkdtemp(SHORT_TEMPORARY_DIRECTORY_PREFIX);
    const localApiSocketPath = path.join(socketDirectory, "local-api.sock");
    const requestsReceived: string[] = [];
    const server = net.createServer((connection) => {
      connection.on("error", () => {});
      readOneRequest(connection, (request) => {
        requestsReceived.push(request);
        const toolCall = toolCallIn(request);
        if (toolCall === null) {
          connection.destroy();
          return;
        }
        void answerTheToolCall(toolCall.toolName, toolCall.toolArguments).then((answer) => (answer === null ? connection.destroy() : connection.end(answer)));
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
    return new LocalApiClient(this.localApiSocketPath, 2_000, "0.45.0");
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

function toolCallIn(request: string): { toolName: string; toolArguments: Record<string, unknown> } | null {
  const body = request.slice(request.indexOf("\r\n\r\n") + 4);
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || !("method" in parsed) || parsed.method !== "tools/call" || !("params" in parsed)) return null;
    const params = parsed.params;
    if (typeof params !== "object" || params === null || !("name" in params) || typeof params.name !== "string") return null;
    const toolArguments = "arguments" in params && typeof params.arguments === "object" && params.arguments !== null ? Object.fromEntries(Object.entries(params.arguments)) : {};
    return { toolName: params.name, toolArguments };
  } catch {
    return null;
  }
}

/** The JSON-RPC response the runtime's rmcp server writes for a tool that ran and failed, in `failureWords`. */
export function toolFailureResponse(failureWords: string): Buffer {
  const body = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: failureWords }], isError: true } };
  return httpResponse("200 OK", "application/json", JSON.stringify(body));
}

/** An HTTP/1.1 response carrying `body` as `contentType`. */
export function httpResponse(statusLine: string, contentType: string, body: string): Buffer {
  return Buffer.from(`HTTP/1.1 ${statusLine}\r\ncontent-type: ${contentType}\r\ncontent-length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, "utf8");
}

/** The JSON-RPC response the runtime's rmcp server writes for a tool result: the tool's JSON as one pretty-printed text block. */
export function toolResultResponse(toolResult: unknown): Buffer {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }], isError: false },
  };
  return httpResponse("200 OK", "application/json", JSON.stringify(body));
}
