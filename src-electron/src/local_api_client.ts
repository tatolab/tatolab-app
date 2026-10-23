// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The app's client of the runtime's local API: one short HTTP/1.1 request per call over the
// local API's Unix socket. `GET /health` says the runtime is up, the MCP tools `list_streams` and
// `logs` over `POST /mcp` list its streams and read one's log records, `stop_stream`,
// `start_stream` and `remove_stream` act on one, and `GET /api/graph` names the machine and draws
// one stream's graph.
//
// The MCP request is spelled as StreamLib's runtime requires one (`streamlib-api-server`'s
// `mcp.rs` serves rmcp's stateless Streamable HTTP with per-request protocol metadata
// required): the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, an `Accept` of
// both JSON and SSE, and `_meta` carrying the protocol version, client info and capabilities.

import { isUtf8 } from "node:buffer";
import net from "node:net";
import type { ListedStream, StreamGraphSummary, StreamLogRecordsPage, TatolabStreamActionName } from "../../src/backend/tatolab_backend_contract.js";
import {
  everyOneRead,
  isAJsonObject,
  jsonObject,
  optionalText,
  optionalUnsignedInteger,
  parseJsonOnTheWire,
  requiredText,
  textOrDefault,
} from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import { streamGraphSummaryFromTheGraphJson } from "./stream_graph_summary.js";
import { streamLogRecordsPageFromTheLogsToolResult } from "./stream_log_records_page.js";

/** The MCP protocol revision the runtime serves, and the only one. */
export const LOCAL_API_MCP_PROTOCOL_VERSION = "2026-07-28";

/** The client name the app gives the runtime in every MCP request's `_meta`. */
const LOCAL_API_MCP_CLIENT_NAME = "tatolab-app";

/** The most bytes one local API response may carry before the client gives up on it. */
const LARGEST_LOCAL_API_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Why a local API request came back without an answer. */
export interface LocalApiRequestFailure {
  failureDescription: string;
}

function localApiRequestFailure(failureDescription: string): { ok: false; failure: LocalApiRequestFailure } {
  return failedWith({ failureDescription });
}

/** One HTTP response as the client read it. */
export interface LocalApiHttpResponse {
  statusCode: number;
  body: Buffer;
}

/** One HTTP request header, as name and value. */
type HttpRequestHeader = readonly [headerName: string, headerValue: string];

/** Every stream a `list_streams` tool result lists. A stream's unknown state is kept as spelled, an absent project directory reads empty, and unknown fields are ignored. */
export function listedStreamsFromTheListStreamsToolResult(toolResultText: string): Result<ListedStream[], string> {
  const listedStreams = listedStreamsFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return listedStreams.ok ? listedStreams : failedWith(`the runtime's list_streams result could not be read: ${listedStreams.failure}`);
}

function listedStreamsFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<ListedStream[], string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the list_streams result");
  if (!toolResult.ok) return toolResult;
  const streams = toolResult.value["streams"];
  if (streams === undefined) return failedWith("missing field `streams`");
  if (!Array.isArray(streams)) return failedWith("`streams` is not an array");
  return everyOneRead(streams, listedStreamOnTheWire);
}

function listedStreamOnTheWire(listedStreamOnTheWire: unknown): Result<ListedStream, string> {
  const listedStream = jsonObject(listedStreamOnTheWire, "a stream");
  if (!listedStream.ok) return listedStream;
  const name = requiredText(listedStream.value, "name");
  if (!name.ok) return name;
  const state = requiredText(listedStream.value, "state");
  if (!state.ok) return state;
  const projectDirectory = textOrDefault(listedStream.value, "project_directory", "");
  if (!projectDirectory.ok) return projectDirectory;
  const nodeCount = optionalUnsignedInteger(listedStream.value, "node_count");
  if (!nodeCount.ok) return nodeCount;
  const failedBecause = optionalText(listedStream.value, "failed_because");
  if (!failedBecause.ok) return failedBecause;
  return succeeded({
    name: name.value,
    state: state.value,
    project_directory: projectDirectory.value,
    node_count: nodeCount.value,
    failed_because: failedBecause.value,
  });
}

/** What the runtime said beside a stream action it carried out: a `stop_stream` result's `not_recorded_because`, and `null` for every other action. */
export function streamActionNoticeFromTheToolResult(streamAction: TatolabStreamActionName, toolResultText: string): Result<string | null, string> {
  if (streamAction !== "stop_stream") return succeeded(null);
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the stop_stream result") : parsedToolResult;
  const notRecordedBecause = toolResult.ok ? optionalText(toolResult.value, "not_recorded_because") : toolResult;
  return notRecordedBecause.ok ? notRecordedBecause : failedWith(`the runtime's stop_stream result could not be read: ${notRecordedBecause.failure}`);
}

/** `durationMs` as a timeout refusal spells it: whole seconds as `3s`, anything else as `200ms`. */
function durationAsTheTimeoutRefusalSpellsIt(durationMs: number): string {
  return durationMs % 1000 === 0 ? `${durationMs / 1000}s` : `${durationMs}ms`;
}

/** Every byte outside RFC 3986's unreserved set, percent-encoded into a query value. */
export function percentEncodedQueryValue(queryValue: string): string {
  return encodeURIComponent(queryValue).replace(/[!'()*]/g, (reservedCharacter) => `%${reservedCharacter.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** A client of the local API served at one socket path. */
export class LocalApiClient {
  /** A client of the local API at `localApiSocketPath`, giving up on a request that goes `requestTimeoutMs` without a byte, and naming itself in MCP requests as `appVersion`. */
  constructor(
    private readonly localApiSocketPath: string,
    private readonly requestTimeoutMs: number,
    private readonly appVersion: string,
  ) {}

  /** Whether the runtime answers `GET /health` with `ok`. */
  async checkHealth(): Promise<Result<void, LocalApiRequestFailure>> {
    const response = await this.sendOneHttpRequestAndReadItsResponse("GET", "/health", [], null);
    if (!response.ok) return response;
    const body = response.value.body.toString("utf8").trim();
    if (response.value.statusCode === 200 && body === "ok") return succeeded(undefined);
    return localApiRequestFailure(`the runtime at ${this.localApiSocketPath} answered /health with ${response.value.statusCode}: ${body}`);
  }

  /** Every stream the runtime holds, from its `list_streams` tool. */
  async listStreams(): Promise<Result<ListedStream[], LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("list_streams", {});
    if (!toolResultText.ok) return toolResultText;
    const listedStreams = listedStreamsFromTheListStreamsToolResult(toolResultText.value);
    return listedStreams.ok ? listedStreams : localApiRequestFailure(listedStreams.failure);
  }

  /** This machine's name, as `GET /api/graph` states it beside every loaded stream's graph. */
  async machineName(): Promise<Result<string, LocalApiRequestFailure>> {
    const graphBody = await this.getBodyOfAnOkAnswer("/api/graph");
    if (!graphBody.ok) return graphBody;
    const graph = parseJsonOnTheWire(graphBody.value.toString("utf8"));
    const machine = graph.ok ? (isAJsonObject(graph.value) ? requiredText(graph.value, "machine") : failedWith("the graph is not an object")) : graph;
    return machine.ok ? machine : localApiRequestFailure(`the runtime's /api/graph names no machine: ${machine.failure}`);
  }

  /** Up to `count` of `stream`'s log records numbered after `after`, from the runtime's `logs` tool. */
  async readStreamLogRecords(stream: string, after: number, count: number): Promise<Result<StreamLogRecordsPage, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("logs", { stream, after, count });
    if (!toolResultText.ok) return toolResultText;
    const page = streamLogRecordsPageFromTheLogsToolResult(toolResultText.value);
    return page.ok ? page : localApiRequestFailure(page.failure);
  }

  /** Run the runtime's tool `streamAction` on `stream`, answering the notice it gives beside an action it carried out, or `null`. */
  async runStreamAction(streamAction: TatolabStreamActionName, stream: string): Promise<Result<string | null, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool(streamAction, { stream });
    if (!toolResultText.ok) return toolResultText;
    const notice = streamActionNoticeFromTheToolResult(streamAction, toolResultText.value);
    return notice.ok ? notice : localApiRequestFailure(notice.failure);
  }

  /** The graph of the loaded stream `stream`, from `GET /api/graph?stream=`. */
  async describeStreamGraph(stream: string): Promise<Result<StreamGraphSummary, LocalApiRequestFailure>> {
    const graphBody = await this.getBodyOfAnOkAnswer(`/api/graph?stream=${percentEncodedQueryValue(stream)}`);
    if (!graphBody.ok) return graphBody;
    const summary = streamGraphSummaryFromTheGraphJson(stream, graphBody.value.toString("utf8"));
    return summary.ok ? summary : localApiRequestFailure(summary.failure);
  }

  /** `GET requestTarget`, answering the body of a `200`; any other answer is refused in the runtime's own words when its body carries them. */
  private async getBodyOfAnOkAnswer(requestTarget: string): Promise<Result<Buffer, LocalApiRequestFailure>> {
    const response = await this.sendOneHttpRequestAndReadItsResponse("GET", requestTarget, [], null);
    if (!response.ok) return response;
    if (response.value.statusCode === 200) return succeeded(response.value.body);
    const bodyText = response.value.body.toString("utf8");
    const errorResponse = parseJsonOnTheWire(bodyText);
    const runtimesOwnWords = errorResponse.ok && isAJsonObject(errorResponse.value) ? requiredText(errorResponse.value, "error") : null;
    return localApiRequestFailure(
      runtimesOwnWords?.ok ? runtimesOwnWords.value : `the runtime answered ${requestTarget} with ${response.value.statusCode}: ${bodyText.trim()}`,
    );
  }

  /** Call the MCP tool `toolName` with `toolArguments` in one stateless request, answering the text of its first content block; a tool that ran and failed is refused in its own words. */
  private async callMcpTool(toolName: string, toolArguments: Readonly<Record<string, unknown>>): Promise<Result<string, LocalApiRequestFailure>> {
    const requestBody = mcpToolCallRequestBody(toolName, toolArguments, this.appVersion);
    const response = await this.sendOneHttpRequestAndReadItsResponse(
      "POST",
      "/mcp",
      [
        ["Accept", "application/json, text/event-stream"],
        ["Content-Type", "application/json"],
        ["MCP-Protocol-Version", LOCAL_API_MCP_PROTOCOL_VERSION],
        ["Mcp-Method", "tools/call"],
        ["Mcp-Name", toolName],
      ],
      Buffer.from(requestBody, "utf8"),
    );
    if (!response.ok) return response;
    const firstText = firstTextBlockOfToolCallResponse(toolName, response.value);
    return firstText.ok ? firstText : localApiRequestFailure(firstText.failure);
  }

  private sendOneHttpRequestAndReadItsResponse(
    method: string,
    requestTarget: string,
    extraHeaders: readonly HttpRequestHeader[],
    requestBody: Buffer | null,
  ): Promise<Result<LocalApiHttpResponse, LocalApiRequestFailure>> {
    const socketText = this.localApiSocketPath;
    return new Promise((settle) => {
      const responseChunks: Buffer[] = [];
      let responseByteCount = 0;
      let connected = false;
      let requestSent = false;
      let settled = false;
      const settleOnce = (outcome: Result<LocalApiHttpResponse, LocalApiRequestFailure>) => {
        if (settled) return;
        settled = true;
        connection.destroy();
        settle(outcome);
      };
      const connection = net.createConnection(this.localApiSocketPath);
      connection.setTimeout(this.requestTimeoutMs);
      connection.on("connect", () => {
        connected = true;
        connection.write(httpRequestBytes(method, requestTarget, extraHeaders, requestBody), () => {
          requestSent = true;
        });
      });
      connection.on("data", (responseChunk: Buffer) => {
        responseChunks.push(responseChunk);
        responseByteCount += responseChunk.length;
        if (responseByteCount > LARGEST_LOCAL_API_RESPONSE_BYTES) {
          settleOnce(
            localApiRequestFailure(`${method} ${requestTarget} to ${socketText} answered more than ${LARGEST_LOCAL_API_RESPONSE_BYTES} bytes`),
          );
        }
      });
      connection.on("timeout", () => {
        settleOnce(
          localApiRequestFailure(`${method} ${requestTarget} to ${socketText} did not answer within ${durationAsTheTimeoutRefusalSpellsIt(this.requestTimeoutMs)}`),
        );
      });
      connection.on("error", (connectionFailure) => {
        const failureText = describeCaughtFailure(connectionFailure);
        const failureDescription = !connected
          ? `no runtime answers at ${socketText}: ${failureText}`
          : requestSent
            ? `${method} ${requestTarget} to ${socketText} did not answer within ${durationAsTheTimeoutRefusalSpellsIt(this.requestTimeoutMs)}: ${failureText}`
            : `the request ${method} ${requestTarget} to ${socketText} could not be sent: ${failureText}`;
        settleOnce(localApiRequestFailure(failureDescription));
      });
      connection.on("end", () => {
        const response = parseHttpResponse(Buffer.concat(responseChunks));
        settleOnce(
          response.ok ? response : localApiRequestFailure(`${method} ${requestTarget} to ${socketText} answered malformed HTTP: ${response.failure}`),
        );
      });
    });
  }
}

/** One HTTP/1.1 request on a connection the server closes after answering; it carries a `Content-Length` exactly when it carries a body. */
export function httpRequestBytes(method: string, requestTarget: string, extraHeaders: readonly HttpRequestHeader[], requestBody: Buffer | null): Buffer {
  let requestHead = `${method} ${requestTarget} HTTP/1.1\r\nHost: localhost\r\n`;
  for (const [headerName, headerValue] of extraHeaders) requestHead += `${headerName}: ${headerValue}\r\n`;
  if (requestBody !== null) requestHead += `Content-Length: ${requestBody.length}\r\n`;
  requestHead += "Connection: close\r\n\r\n";
  return Buffer.concat([Buffer.from(requestHead, "utf8"), requestBody ?? Buffer.alloc(0)]);
}

/** The JSON-RPC `tools/call` request for `toolName`, carrying the per-request `_meta` the runtime's stateless MCP transport requires. */
function mcpToolCallRequestBody(toolName: string, toolArguments: Readonly<Record<string, unknown>>, appVersion: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: toolArguments,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": LOCAL_API_MCP_PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientInfo": { name: LOCAL_API_MCP_CLIENT_NAME, version: appVersion },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  });
}

function firstTextBlockOfToolCallResponse(toolName: string, response: LocalApiHttpResponse): Result<string, string> {
  const jsonRpcResponse = parseJsonOnTheWire(response.body.toString("utf8"));
  if (!jsonRpcResponse.ok) {
    return failedWith(`\`${toolName}\` answered ${response.statusCode} with a body that is not JSON-RPC: ${jsonRpcResponse.failure}`);
  }
  const jsonRpcFields = isAJsonObject(jsonRpcResponse.value) ? jsonRpcResponse.value : {};
  const jsonRpcError = jsonRpcFields["error"];
  if (jsonRpcError !== undefined) {
    const message = isAJsonObject(jsonRpcError) && typeof jsonRpcError["message"] === "string" ? jsonRpcError["message"] : "no message";
    return failedWith(`the runtime refused \`${toolName}\` (${response.statusCode}): ${message}`);
  }
  const toolResult = jsonRpcFields["result"];
  if (toolResult === undefined) return failedWith(`\`${toolName}\` answered with neither a result nor an error`);
  const toolResultFields = isAJsonObject(toolResult) ? toolResult : {};
  const content = toolResultFields["content"];
  const firstText = Array.isArray(content) ? content.map(textOfATextBlock).find((blockText) => blockText !== null) ?? null : null;
  const toolFailed = toolResultFields["isError"] === true;
  if (toolFailed) return failedWith(firstText ?? `\`${toolName}\` failed and gave no reason`);
  return firstText === null ? failedWith(`\`${toolName}\` answered with no text`) : succeeded(firstText);
}

/** A content block's text when it is a text block carrying text. */
function textOfATextBlock(contentBlock: unknown): string | null {
  if (!isAJsonObject(contentBlock) || contentBlock["type"] !== "text") return null;
  const blockText = contentBlock["text"];
  return typeof blockText === "string" ? blockText : null;
}

/** A complete HTTP/1.1 response read to end of stream: its status and its body, de-chunked when it was sent chunked. */
export function parseHttpResponse(responseBytes: Buffer): Result<LocalApiHttpResponse, string> {
  const headEnd = responseBytes.indexOf("\r\n\r\n");
  if (headEnd === -1) return failedWith("the response head never ended");
  const headBytes = responseBytes.subarray(0, headEnd);
  if (!isUtf8(headBytes)) return failedWith("the response head is not UTF-8");
  const body = responseBytes.subarray(headEnd + 4);
  const [statusLine, ...headerLines] = headBytes.toString("utf8").split("\r\n");
  if (statusLine === undefined) return failedWith("the response has no status line");
  const statusCodeText = statusLine.split(" ")[1];
  const statusCode = statusCodeText !== undefined && /^\d{1,5}$/.test(statusCodeText) ? Number(statusCodeText) : null;
  if (statusCode === null || statusCode > 65535) return failedWith(`the status line ${JSON.stringify(statusLine)} names no status`);
  let contentLength: number | null = null;
  let chunked = false;
  for (const headerLine of headerLines) {
    const colon = headerLine.indexOf(":");
    if (colon === -1) continue;
    const headerName = headerLine.slice(0, colon).toLowerCase();
    const headerValue = headerLine.slice(colon + 1).trim();
    if (headerName === "content-length") {
      contentLength = /^\d+$/.test(headerValue) ? Number(headerValue) : null;
    } else if (headerName === "transfer-encoding" && headerValue.toLowerCase().includes("chunked")) {
      chunked = true;
    }
  }
  if (chunked) {
    const dechunked = dechunkedBody(body);
    return dechunked.ok ? succeeded({ statusCode, body: dechunked.value }) : dechunked;
  }
  if (contentLength === null) return succeeded({ statusCode, body });
  if (body.length < contentLength) return failedWith(`the body ended after ${body.length} of its ${contentLength} bytes`);
  return succeeded({ statusCode, body: body.subarray(0, contentLength) });
}

function dechunkedBody(chunkedBody: Buffer): Result<Buffer, string> {
  const bodyChunks: Buffer[] = [];
  let remaining = chunkedBody;
  for (;;) {
    const sizeLineEnd = remaining.indexOf("\r\n");
    if (sizeLineEnd === -1) return failedWith("a chunk size line never ended");
    const sizeLineBytes = remaining.subarray(0, sizeLineEnd);
    if (!isUtf8(sizeLineBytes)) return failedWith("a chunk size line is not UTF-8");
    const sizeText = (sizeLineBytes.toString("utf8").split(";")[0] ?? "").trim();
    if (!/^[0-9a-fA-F]+$/.test(sizeText)) return failedWith(`the chunk size ${JSON.stringify(sizeText)} is not hexadecimal`);
    const chunkSize = parseInt(sizeText, 16);
    remaining = remaining.subarray(sizeLineEnd + 2);
    if (chunkSize === 0) return succeeded(Buffer.concat(bodyChunks));
    if (remaining.length < chunkSize) return failedWith("the body ended inside a chunk");
    bodyChunks.push(remaining.subarray(0, chunkSize));
    if (remaining.length < chunkSize + 2) return failedWith("the body ended after a chunk");
    remaining = remaining.subarray(chunkSize + 2);
  }
}
