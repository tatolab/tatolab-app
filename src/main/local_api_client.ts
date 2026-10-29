// The app's client of the runtime's local API: one short HTTP/1.1 request per call over the
// local API's Unix socket. `GET /health` says the runtime is up, `describe_runtime` names its
// version, uptime and log folder, the MCP tools `list_streams`,
// `logs` and `graph` over `POST /mcp` list its streams, read one's log records and draw one's
// graph, `run_stream` compiles a project and loads it, `stop_stream`, `start_stream`,
// `remove_stream` and `rename_stream` act on one, and `GET /api/graph` names the machine. `GET /api/relay-adapters`
// and `list_relays` describe the machine's relays, and `add_relay`, `configure_relay` and
// `remove_relay` change them.
//
// The MCP request is spelled as StreamLib's runtime requires one (`streamlib-api-server`'s
// `mcp.rs` serves rmcp's stateless Streamable HTTP with per-request protocol metadata
// required): the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, an `Accept` of
// both JSON and SSE, and `_meta` carrying the protocol version, client info and capabilities.

import { isUtf8 } from "node:buffer";
import net from "node:net";
import type {
  ListedStream,
  RelaySettingsByName,
  RelaysDescription,
  RuntimeDescription,
  StreamGraphSummary,
  StreamLocation,
  StreamLogRecordsPage,
  StreamRunAnswer,
  TatolabStreamActionName,
} from "../shared/tatolab_backend_contract.js";
import {
  everyOneRead,
  isAJsonObject,
  jsonObject,
  type JsonObjectOnTheWire,
  optionalObject,
  optionalText,
  optionalUnsignedInteger,
  parseJsonOnTheWire,
  requiredObject,
  requiredText,
  requiredTrueOrFalse,
  requiredUnsignedInteger,
} from "./json_on_the_wire.js";
import {
  listedRelaysFromTheListRelaysToolResult,
  relayAdaptersFromTheRelayAdaptersAnswer,
  relayIdFromTheRelayToolResult,
  type RelayChangeToolName,
} from "./relays_description.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";
import { streamLogRecordsPageFromTheLogsToolResult } from "./stream_log_records_page.js";

/** The MCP protocol revision the runtime serves, and the only one. */
export const LOCAL_API_MCP_PROTOCOL_VERSION = "2026-07-28";

/** The client name the app gives the runtime in every MCP request's `_meta`. */
const LOCAL_API_MCP_CLIENT_NAME = "tatolab-app";

/** How long a stream action may go without a byte: `start_stream` answers once the stream's graph has loaded, which compiles `stream.py` and starts its Python processes. */
const STREAM_ACTION_RESPONSE_TIMEOUT_MS = 120_000;

/** How long `run_stream` may go without a byte: StreamLib's `STREAM_LOAD_TOOL_CALL_TIMEOUT`, which the runtime's compile, describe and teardown bounds fit within. */
const STREAM_LOAD_RESPONSE_TIMEOUT_MS = 360_000;

/** How long a relay change may go without a byte: a generous bound, as `add_relay` and `configure_relay` answer once the relay's adapter has taken the settings, and the runtime states no bound of its own. */
const RELAY_CHANGE_RESPONSE_TIMEOUT_MS = 120_000;

/** The most bytes one local API response may carry before the client gives up on it. */
const LARGEST_LOCAL_API_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Why a local API request came back without an answer. */
export interface LocalApiRequestFailure {
  failureDescription: string;
  /** Whether the runtime answered and refused, in its own words, rather than not answering or answering something unreadable. */
  isTheRuntimesRefusal: boolean;
}

function localApiRequestFailure(failureDescription: string): { ok: false; failure: LocalApiRequestFailure } {
  return failedWith({ failureDescription, isTheRuntimesRefusal: false });
}

function theRuntimesRefusal(failureDescription: string): { ok: false; failure: LocalApiRequestFailure } {
  return failedWith({ failureDescription, isTheRuntimesRefusal: true });
}

/** What the app asks `run_stream` to load: a project folder. `streamFunction` as `tatolab run` takes it, `null` for the project's sole `@stream`; `displayName` to show it under, `null` for the function's own or the one a re-load keeps. */
export interface StreamRunRequest {
  projectDirectory: string;
  streamFunction: string | null;
  displayName: string | null;
}

/** A `run_stream` tool result read field for field; unknown fields are ignored. */
export function streamRunAnswerFromTheRunStreamToolResult(toolResultText: string): Result<StreamRunAnswer, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the run_stream result") : parsedToolResult;
  const streamRunAnswer = toolResult.ok ? streamRunAnswerOnTheWire(toolResult.value) : toolResult;
  return streamRunAnswer.ok ? streamRunAnswer : failedWith(`the runtime's run_stream result could not be read: ${streamRunAnswer.failure}`);
}

function streamRunAnswerOnTheWire(toolResult: JsonObjectOnTheWire): Result<StreamRunAnswer, string> {
  const stream = requiredText(toolResult, "stream");
  if (!stream.ok) return stream;
  const displayName = requiredText(toolResult, "display_name");
  if (!displayName.ok) return displayName;
  const streamInstance = requiredText(toolResult, "stream_instance");
  if (!streamInstance.ok) return streamInstance;
  const locationOnTheWire = requiredObject(toolResult, "location");
  if (!locationOnTheWire.ok) return locationOnTheWire;
  const location = streamLocationOnTheWire(locationOnTheWire.value);
  if (!location.ok) return location;
  const nodeCount = requiredUnsignedInteger(toolResult, "node_count");
  if (!nodeCount.ok) return nodeCount;
  const replacedARecordedStream = requiredTrueOrFalse(toolResult, "replaced_a_recorded_stream");
  if (!replacedARecordedStream.ok) return replacedARecordedStream;
  const compileWarningsOnTheWire = toolResult["compile_warnings"];
  if (compileWarningsOnTheWire === undefined) return failedWith("missing field `compile_warnings`");
  if (!Array.isArray(compileWarningsOnTheWire)) return failedWith("`compile_warnings` is not an array");
  const compileWarnings = everyOneRead(compileWarningsOnTheWire, (compileWarning: unknown) =>
    typeof compileWarning === "string" ? succeeded(compileWarning) : failedWith("a compile warning is not a string"),
  );
  if (!compileWarnings.ok) return compileWarnings;
  return succeeded({
    stream: stream.value,
    display_name: displayName.value,
    stream_instance: streamInstance.value,
    location: location.value,
    node_count: nodeCount.value,
    replaced_a_recorded_stream: replacedARecordedStream.value,
    compile_warnings: compileWarnings.value,
  });
}

/** A stream's `location` on the wire: `project_directory` and `stream_function` as `module:qualname`. */
function streamLocationOnTheWire(location: JsonObjectOnTheWire): Result<StreamLocation, string> {
  const projectDirectory = requiredText(location, "project_directory");
  if (!projectDirectory.ok) return projectDirectory;
  const streamFunction = requiredText(location, "stream_function");
  if (!streamFunction.ok) return streamFunction;
  return succeeded({ project_directory: projectDirectory.value, stream_function: streamFunction.value });
}

/** What `rename_stream` answers: the stream's id and the display name it is shown under now. */
export interface StreamRenameAnswer {
  stream: string;
  display_name: string;
}

/** A `rename_stream` tool result read field for field; unknown fields are ignored. */
export function streamRenameAnswerFromTheRenameStreamToolResult(toolResultText: string): Result<StreamRenameAnswer, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the rename_stream result") : parsedToolResult;
  if (!toolResult.ok) return failedWith(`the runtime's rename_stream result could not be read: ${toolResult.failure}`);
  const stream = requiredText(toolResult.value, "stream");
  const displayName = requiredText(toolResult.value, "display_name");
  if (!stream.ok) return failedWith(`the runtime's rename_stream result could not be read: ${stream.failure}`);
  if (!displayName.ok) return failedWith(`the runtime's rename_stream result could not be read: ${displayName.failure}`);
  return succeeded({ stream: stream.value, display_name: displayName.value });
}

/** A `describe_runtime` tool result read field for field; unknown fields are ignored. */
export function runtimeDescriptionFromTheDescribeRuntimeToolResult(toolResultText: string): Result<RuntimeDescription, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the describe_runtime result") : parsedToolResult;
  const runtimeDescription = toolResult.ok ? runtimeDescriptionOnTheWire(toolResult.value) : toolResult;
  return runtimeDescription.ok ? runtimeDescription : failedWith(`the runtime's describe_runtime result could not be read: ${runtimeDescription.failure}`);
}

function runtimeDescriptionOnTheWire(toolResult: JsonObjectOnTheWire): Result<RuntimeDescription, string> {
  const version = requiredText(toolResult, "version");
  if (!version.ok) return version;
  const buildId = requiredText(toolResult, "build_id");
  if (!buildId.ok) return buildId;
  const upForMs = requiredUnsignedInteger(toolResult, "up_for_ms");
  if (!upForMs.ok) return upForMs;
  const runtimeLogDirectory = optionalText(toolResult, "runtime_log_directory");
  if (!runtimeLogDirectory.ok) return runtimeLogDirectory;
  return succeeded({ version: version.value, build_id: buildId.value, up_for_ms: upForMs.value, runtime_log_directory: runtimeLogDirectory.value });
}

/** One HTTP response as the client read it. */
export interface LocalApiHttpResponse {
  statusCode: number;
  body: Buffer;
}

/** One HTTP request header, as name and value. */
type HttpRequestHeader = readonly [headerName: string, headerValue: string];

/** Every stream a `list_streams` tool result lists. A stream's unknown state is kept as spelled, a `null` location is an earlier runtime's record, and unknown fields are ignored. */
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
  const stream = requiredText(listedStream.value, "stream");
  if (!stream.ok) return stream;
  const displayName = requiredText(listedStream.value, "display_name");
  if (!displayName.ok) return displayName;
  const locationOnTheWire = optionalObject(listedStream.value, "location");
  if (!locationOnTheWire.ok) return locationOnTheWire;
  const location = locationOnTheWire.value === null ? succeeded(null) : streamLocationOnTheWire(locationOnTheWire.value);
  if (!location.ok) return location;
  const state = requiredText(listedStream.value, "state");
  if (!state.ok) return state;
  const nodeCount = optionalUnsignedInteger(listedStream.value, "node_count");
  if (!nodeCount.ok) return nodeCount;
  const failedBecause = optionalText(listedStream.value, "failed_because");
  if (!failedBecause.ok) return failedBecause;
  return succeeded({
    stream: stream.value,
    display_name: displayName.value,
    location: location.value,
    state: state.value,
    node_count: nodeCount.value,
    failed_because: failedBecause.value,
  });
}

/** What the runtime said beside a stream action it carried out: a `stop_stream` result's `not_recorded_because`; `start_stream` and `remove_stream` say nothing beside theirs. */
function streamActionNoticeFromTheToolResult(streamAction: TatolabStreamActionName, toolResultText: string): Result<string | null, string> {
  switch (streamAction) {
    case "stop_stream": {
      const parsedToolResult = parseJsonOnTheWire(toolResultText);
      const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the stop_stream result") : parsedToolResult;
      const notRecordedBecause = toolResult.ok ? optionalText(toolResult.value, "not_recorded_because") : toolResult;
      return notRecordedBecause.ok ? notRecordedBecause : failedWith(`the runtime's stop_stream result could not be read: ${notRecordedBecause.failure}`);
    }
    case "start_stream":
    case "remove_stream":
      return succeeded(null);
  }
}

/** `durationMs` as a timeout refusal spells it: whole seconds as `3s`, anything else as `200ms`. */
function durationAsTheTimeoutRefusalSpellsIt(durationMs: number): string {
  return durationMs % 1000 === 0 ? `${durationMs / 1000}s` : `${durationMs}ms`;
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

  /** How the running runtime describes itself, from its `describe_runtime` tool. */
  async describeRuntime(): Promise<Result<RuntimeDescription, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("describe_runtime", {});
    if (!toolResultText.ok) return toolResultText;
    const runtimeDescription = runtimeDescriptionFromTheDescribeRuntimeToolResult(toolResultText.value);
    return runtimeDescription.ok ? runtimeDescription : localApiRequestFailure(runtimeDescription.failure);
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
    const toolResultText = await this.callMcpTool(streamAction, { stream }, STREAM_ACTION_RESPONSE_TIMEOUT_MS);
    if (!toolResultText.ok) return toolResultText;
    const notice = streamActionNoticeFromTheToolResult(streamAction, toolResultText.value);
    return notice.ok ? notice : localApiRequestFailure(notice.failure);
  }

  /** Show the stream `stream` under `displayName` through the runtime's `rename_stream` tool, its id, address and broadcast as they are; refused in the runtime's own words. */
  async renameStream(stream: string, displayName: string): Promise<Result<void, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("rename_stream", { stream, display_name: displayName }, STREAM_ACTION_RESPONSE_TIMEOUT_MS);
    if (!toolResultText.ok) return toolResultText;
    const renamed = streamRenameAnswerFromTheRenameStreamToolResult(toolResultText.value);
    return renamed.ok ? succeeded(undefined) : localApiRequestFailure(renamed.failure);
  }

  /** Compile the project `streamRunRequest` names in its own `.venv` and load it, through the runtime's `run_stream` tool; refused in the runtime's own words. */
  async runStream(streamRunRequest: StreamRunRequest): Promise<Result<StreamRunAnswer, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool(
      "run_stream",
      {
        project_directory: streamRunRequest.projectDirectory,
        ...(streamRunRequest.streamFunction === null ? {} : { stream_function: streamRunRequest.streamFunction }),
        ...(streamRunRequest.displayName === null ? {} : { name: streamRunRequest.displayName }),
      },
      STREAM_LOAD_RESPONSE_TIMEOUT_MS,
    );
    if (!toolResultText.ok) return toolResultText;
    const streamRunAnswer = streamRunAnswerFromTheRunStreamToolResult(toolResultText.value);
    return streamRunAnswer.ok ? streamRunAnswer : localApiRequestFailure(streamRunAnswer.failure);
  }

  /** The graph of the loaded stream `stream` from the runtime's `graph` tool, the text `tatolab graph --stream` prints, its readable outputs' preview pages at `runtimeLoopbackHttpOrigin`. */
  async describeStreamGraph(stream: string, runtimeLoopbackHttpOrigin: string): Promise<Result<StreamGraphSummary, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("graph", { stream });
    if (!toolResultText.ok) return toolResultText;
    const summary = streamGraphSummaryFromTheGraphToolResult(stream, toolResultText.value, runtimeLoopbackHttpOrigin);
    return summary.ok ? summary : localApiRequestFailure(summary.failure);
  }

  /** Every relay the runtime holds, from its `list_relays` tool, and every adapter it can join one through, from `GET /api/relay-adapters`. */
  async describeRelays(): Promise<Result<RelaysDescription, LocalApiRequestFailure>> {
    const catalogBody = await this.getBodyOfAnOkAnswer("/api/relay-adapters");
    if (!catalogBody.ok) return catalogBody;
    const adapters = relayAdaptersFromTheRelayAdaptersAnswer(catalogBody.value.toString("utf8"));
    if (!adapters.ok) return localApiRequestFailure(adapters.failure);
    const toolResultText = await this.callMcpTool("list_relays", {});
    if (!toolResultText.ok) return toolResultText;
    const relays = listedRelaysFromTheListRelaysToolResult(toolResultText.value);
    return relays.ok ? succeeded({ relays: relays.value, adapters: adapters.value }) : localApiRequestFailure(relays.failure);
  }

  /** Add a relay of `adapter` with `settings`, its secrets among them, through the runtime's `add_relay` tool, answering the id it gave the relay; refused in the runtime's own words. */
  async addRelay(adapter: string, settings: Readonly<RelaySettingsByName>): Promise<Result<string, LocalApiRequestFailure>> {
    return this.callARelayTool("add_relay", { adapter, settings });
  }

  /** Replace the settings named in `settings` on the relay `relayId` through the runtime's `configure_relay` tool; refused in the runtime's own words. */
  async configureRelay(relayId: string, settings: Readonly<RelaySettingsByName>): Promise<Result<void, LocalApiRequestFailure>> {
    const configured = await this.callARelayTool("configure_relay", { relay_id: relayId, settings });
    return configured.ok ? succeeded(undefined) : configured;
  }

  /** Leave and forget the relay `relayId` through the runtime's `remove_relay` tool; refused in the runtime's own words. */
  async removeRelay(relayId: string): Promise<Result<void, LocalApiRequestFailure>> {
    const removed = await this.callARelayTool("remove_relay", { relay_id: relayId });
    return removed.ok ? succeeded(undefined) : removed;
  }

  /** Call the relay tool `toolName`, answering the `relay_id` its result names. */
  private async callARelayTool(toolName: RelayChangeToolName, toolArguments: Readonly<Record<string, unknown>>): Promise<Result<string, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool(toolName, toolArguments, RELAY_CHANGE_RESPONSE_TIMEOUT_MS);
    if (!toolResultText.ok) return toolResultText;
    const relayId = relayIdFromTheRelayToolResult(toolName, toolResultText.value);
    return relayId.ok ? relayId : localApiRequestFailure(relayId.failure);
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

  /** Call the MCP tool `toolName` with `toolArguments` in one stateless request, giving up after `responseTimeoutMs` without a byte, answering the text of its first content block; a tool that ran and failed is refused in its own words. */
  private async callMcpTool(
    toolName: string,
    toolArguments: Readonly<Record<string, unknown>>,
    responseTimeoutMs: number = this.requestTimeoutMs,
  ): Promise<Result<string, LocalApiRequestFailure>> {
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
      responseTimeoutMs,
    );
    if (!response.ok) return response;
    return firstTextBlockOfToolCallResponse(toolName, response.value);
  }

  private sendOneHttpRequestAndReadItsResponse(
    method: string,
    requestTarget: string,
    extraHeaders: readonly HttpRequestHeader[],
    requestBody: Buffer | null,
    responseTimeoutMs: number = this.requestTimeoutMs,
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
      connection.setTimeout(responseTimeoutMs);
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
          localApiRequestFailure(`${method} ${requestTarget} to ${socketText} did not answer within ${durationAsTheTimeoutRefusalSpellsIt(responseTimeoutMs)}`),
        );
      });
      connection.on("error", (connectionFailure) => {
        const failureText = describeCaughtFailure(connectionFailure);
        const failureDescription = !connected
          ? `no runtime answers at ${socketText}: ${failureText}`
          : requestSent
            ? `${method} ${requestTarget} to ${socketText} did not answer within ${durationAsTheTimeoutRefusalSpellsIt(responseTimeoutMs)}: ${failureText}`
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

function firstTextBlockOfToolCallResponse(toolName: string, response: LocalApiHttpResponse): Result<string, LocalApiRequestFailure> {
  const jsonRpcResponse = parseJsonOnTheWire(response.body.toString("utf8"));
  if (!jsonRpcResponse.ok) {
    return localApiRequestFailure(`\`${toolName}\` answered ${response.statusCode} with a body that is not JSON-RPC: ${jsonRpcResponse.failure}`);
  }
  const jsonRpcFields = isAJsonObject(jsonRpcResponse.value) ? jsonRpcResponse.value : {};
  const jsonRpcError = jsonRpcFields["error"];
  if (jsonRpcError !== undefined) {
    const message = isAJsonObject(jsonRpcError) && typeof jsonRpcError["message"] === "string" ? jsonRpcError["message"] : "no message";
    return theRuntimesRefusal(`the runtime refused \`${toolName}\` (${response.statusCode}): ${message}`);
  }
  const toolResult = jsonRpcFields["result"];
  if (toolResult === undefined) return localApiRequestFailure(`\`${toolName}\` answered with neither a result nor an error`);
  const toolResultFields = isAJsonObject(toolResult) ? toolResult : {};
  const content = toolResultFields["content"];
  const firstText = Array.isArray(content) ? content.map(textOfATextBlock).find((blockText) => blockText !== null) ?? null : null;
  const toolFailed = toolResultFields["isError"] === true;
  if (toolFailed) return theRuntimesRefusal(firstText ?? `\`${toolName}\` failed and gave no reason`);
  return firstText === null ? localApiRequestFailure(`\`${toolName}\` answered with no text`) : succeeded(firstText);
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
