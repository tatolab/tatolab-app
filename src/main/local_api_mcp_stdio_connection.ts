// One long-lived `/mcp/stdio` connection to the runtime's local API: an HTTP/1.1 `GET /mcp/stdio`
// with `Upgrade: mcp-stdio` that the runtime answers `101`, after which the socket carries
// newline-delimited JSON-RPC both ways. Every request carries the same per-request `_meta` as a
// `POST /mcp` one, so no handshake comes first. The runtime ties a viewer to the connection that
// opened it: `open_viewer` and `close_viewer` are served only here, and closing the connection
// closes every viewer it opened.

import net from "node:net";
import {
  localApiRequestFailure,
  mcpToolAnswerFromTheJsonRpcResponse,
  mcpToolCallRequestBody,
  parseHttpResponse,
  theRuntimesRefusal,
  type LocalApiRequestFailure,
  type McpToolAnswer,
} from "./local_api_client.js";
import { isAJsonObject, jsonObject, optionalText, parseJsonOnTheWire, requiredText, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** The request target and upgrade token of the runtime's `/mcp/stdio` route (`local_api_wire_contract.rs`). */
const MCP_STDIO_UPGRADE_REQUEST_TARGET = "/mcp/stdio";
const MCP_STDIO_UPGRADE_PROTOCOL_TOKEN = "mcp-stdio";

/** The JSON-RPC error code for a method the receiver does not serve. */
const JSON_RPC_METHOD_NOT_FOUND = -32601;

/** The most bytes one JSON-RPC line from the runtime may carry before the connection gives up on it. */
const LARGEST_MCP_STDIO_LINE_BYTES = 8 * 1024 * 1024;

/** What `open_viewer` answers (`OpenViewerToolResult`): where the viewer's own process subscribes to read the port. */
export interface OpenedRuntimeViewer {
  /** The id `close_viewer` takes: `<stream>/<node>/<port>`. */
  viewer: string;
  stream: string;
  node: string;
  port: string;
  /** The root of the iceoryx2 domain the port's channel lives in. */
  iceoryx2_domain_root: string;
  /** The iceoryx2 service whose reserved subscriber slot the viewer takes. */
  channel: string;
  /** The surface-sharing socket's path on Linux, its Mach service's name on macOS; `null` on macOS when the open named no `viewer_process_id`. */
  surface_share_address: string | null;
}

/** The output port of a running node a viewer reads, and the process that imports its Image frames. */
export interface RuntimeViewerTarget {
  stream: string;
  node: string;
  port: string;
  /** The pid of the process that imports the frames; the runtime's surface-sharing service on macOS admits only that process. */
  viewer_process_id: number;
}

/** An `open_viewer` tool result read field for field; unknown fields are ignored. */
export function openedRuntimeViewerFromTheOpenViewerToolResult(toolResultText: string): Result<OpenedRuntimeViewer, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the open_viewer result") : parsedToolResult;
  const openedViewer = toolResult.ok ? openedRuntimeViewerOnTheWire(toolResult.value) : toolResult;
  return openedViewer.ok ? openedViewer : failedWith(`the runtime's open_viewer result could not be read: ${openedViewer.failure}`);
}

function openedRuntimeViewerOnTheWire(toolResult: JsonObjectOnTheWire): Result<OpenedRuntimeViewer, string> {
  const viewer = requiredText(toolResult, "viewer");
  if (!viewer.ok) return viewer;
  const stream = requiredText(toolResult, "stream");
  if (!stream.ok) return stream;
  const node = requiredText(toolResult, "node");
  if (!node.ok) return node;
  const port = requiredText(toolResult, "port");
  if (!port.ok) return port;
  const iceoryx2DomainRoot = requiredText(toolResult, "iceoryx2_domain_root");
  if (!iceoryx2DomainRoot.ok) return iceoryx2DomainRoot;
  const channel = requiredText(toolResult, "channel");
  if (!channel.ok) return channel;
  const surfaceShareAddress = optionalText(toolResult, "surface_share_address");
  if (!surfaceShareAddress.ok) return surfaceShareAddress;
  return succeeded({
    viewer: viewer.value,
    stream: stream.value,
    node: node.value,
    port: port.value,
    iceoryx2_domain_root: iceoryx2DomainRoot.value,
    channel: channel.value,
    surface_share_address: surfaceShareAddress.value,
  });
}

/** A `close_viewer` tool result's `viewer`, the id of the viewer it closed. */
export function closedViewerFromTheCloseViewerToolResult(toolResultText: string): Result<string, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the close_viewer result") : parsedToolResult;
  const viewer = toolResult.ok ? requiredText(toolResult.value, "viewer") : toolResult;
  return viewer.ok ? viewer : failedWith(`the runtime's close_viewer result could not be read: ${viewer.failure}`);
}

/** A request sent on the connection and not yet answered. */
interface McpStdioRequestAwaitingItsAnswer {
  toolName: string;
  settle: (answer: Result<McpToolAnswer, LocalApiRequestFailure>) => void;
  answerTimeout: NodeJS.Timeout;
}

/** One upgraded `/mcp/stdio` connection to the runtime, carrying any number of tool calls at once until it closes. */
export class LocalApiMcpStdioConnection {
  private nextRequestId = 1;
  private readonly requestsAwaitingTheirAnswers = new Map<number, McpStdioRequestAwaitingItsAnswer>();
  private bytesAfterTheLastWholeLine = Buffer.alloc(0);
  private whyTheConnectionClosed: string | null = null;
  private readonly listenersToTheConnectionClosing: ((whyItClosed: string) => void)[] = [];

  private constructor(
    private readonly localApiSocketPath: string,
    private readonly upgradedConnection: net.Socket,
    private readonly requestTimeoutMs: number,
    private readonly appVersion: string,
  ) {}

  /** Upgrade a fresh connection to the local API at `localApiSocketPath` to `/mcp/stdio`, giving up on the upgrade and on any later answer after `requestTimeoutMs`, and naming itself in requests as `appVersion`. */
  static open(localApiSocketPath: string, requestTimeoutMs: number, appVersion: string): Promise<Result<LocalApiMcpStdioConnection, LocalApiRequestFailure>> {
    return new Promise((settle) => {
      const responseHeadChunks: Buffer[] = [];
      let connected = false;
      let settled = false;
      const connection = net.createConnection(localApiSocketPath);
      const settleWithFailure = (failure: { ok: false; failure: LocalApiRequestFailure }) => {
        if (settled) return;
        settled = true;
        connection.destroy();
        settle(failure);
      };
      connection.setTimeout(requestTimeoutMs);
      connection.on("connect", () => {
        connected = true;
        connection.write(
          `GET ${MCP_STDIO_UPGRADE_REQUEST_TARGET} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: ${MCP_STDIO_UPGRADE_PROTOCOL_TOKEN}\r\n\r\n`,
        );
      });
      let refusingStatusLine: string | null = null;
      const readTheUpgradeResponse = (responseChunk: Buffer) => {
        responseHeadChunks.push(responseChunk);
        if (refusingStatusLine !== null) return;
        const responseBytes = Buffer.concat(responseHeadChunks);
        const headEnd = responseBytes.indexOf("\r\n\r\n");
        if (headEnd === -1) {
          if (responseBytes.length > LARGEST_MCP_STDIO_LINE_BYTES) {
            settleWithFailure(localApiRequestFailure(`${MCP_STDIO_UPGRADE_REQUEST_TARGET} at ${localApiSocketPath} answered a response head that never ended`));
          }
          return;
        }
        const statusLine = responseBytes.subarray(0, responseBytes.indexOf("\r\n")).toString("utf8");
        if (statusLine.split(" ")[1] !== "101") {
          refusingStatusLine = statusLine;
          return;
        }
        settled = true;
        connection.off("data", readTheUpgradeResponse);
        connection.setTimeout(0);
        connection.removeAllListeners("timeout");
        connection.removeAllListeners("error");
        const upgraded = new LocalApiMcpStdioConnection(localApiSocketPath, connection, requestTimeoutMs, appVersion);
        upgraded.readFromTheUpgradedConnection(responseBytes.subarray(headEnd + 4));
        settle(succeeded(upgraded));
      };
      connection.on("data", readTheUpgradeResponse);
      connection.on("timeout", () => {
        settleWithFailure(localApiRequestFailure(`the runtime at ${localApiSocketPath} did not open ${MCP_STDIO_UPGRADE_REQUEST_TARGET} within ${requestTimeoutMs}ms`));
      });
      connection.on("error", (connectionFailure) => {
        const failureText = describeCaughtFailure(connectionFailure);
        settleWithFailure(
          localApiRequestFailure(
            connected
              ? `the runtime at ${localApiSocketPath} did not open ${MCP_STDIO_UPGRADE_REQUEST_TARGET}: ${failureText}`
              : `no runtime answers at ${localApiSocketPath}: ${failureText}`,
          ),
        );
      });
      connection.on("end", () => {
        if (refusingStatusLine === null) {
          settleWithFailure(localApiRequestFailure(`the runtime at ${localApiSocketPath} closed the connection before answering ${MCP_STDIO_UPGRADE_REQUEST_TARGET}`));
          return;
        }
        const refusal = parseHttpResponse(Buffer.concat(responseHeadChunks));
        const refusalWords = refusal.ok ? refusal.value.body.toString("utf8").trim() : refusingStatusLine;
        settleWithFailure(theRuntimesRefusal(`the runtime at ${localApiSocketPath} refused ${MCP_STDIO_UPGRADE_REQUEST_TARGET} (${refusingStatusLine}): ${refusalWords}`));
      });
    });
  }

  /** Open a viewer of `target`'s output port, held open until `closeViewer` or this connection closes; refused in the runtime's own words. */
  async openViewer(target: RuntimeViewerTarget): Promise<Result<OpenedRuntimeViewer, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("open_viewer", {
      stream: target.stream,
      node: target.node,
      port: target.port,
      viewer_process_id: target.viewer_process_id,
    });
    if (!toolResultText.ok) return toolResultText;
    const openedViewer = openedRuntimeViewerFromTheOpenViewerToolResult(toolResultText.value);
    return openedViewer.ok ? openedViewer : localApiRequestFailure(openedViewer.failure);
  }

  /** Close the viewer `viewer` this connection opened, answering the id the runtime closed; refused in the runtime's own words. */
  async closeViewer(viewer: string): Promise<Result<string, LocalApiRequestFailure>> {
    const toolResultText = await this.callMcpTool("close_viewer", { viewer });
    if (!toolResultText.ok) return toolResultText;
    const closedViewer = closedViewerFromTheCloseViewerToolResult(toolResultText.value);
    return closedViewer.ok ? closedViewer : localApiRequestFailure(closedViewer.failure);
  }

  /** Call `toolName` with `toolArguments` on this connection, answering the text of its result's first text block; a tool's own failure is the runtime's refusal. */
  async callMcpTool(toolName: string, toolArguments: Readonly<Record<string, unknown>>): Promise<Result<string, LocalApiRequestFailure>> {
    const toolAnswer = await this.sendToolCallAndAwaitItsAnswer(toolName, toolArguments);
    if (!toolAnswer.ok) return toolAnswer;
    return toolAnswer.value.kind === "answered" ? succeeded(toolAnswer.value.text) : theRuntimesRefusal(toolAnswer.value.words);
  }

  /** Call `whenTheConnectionCloses` once, with why, when the connection closes from either end; at once if it already has. */
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void {
    if (this.whyTheConnectionClosed !== null) {
      whenTheConnectionCloses(this.whyTheConnectionClosed);
      return;
    }
    this.listenersToTheConnectionClosing.push(whenTheConnectionCloses);
  }

  /** Whether the connection is still open. */
  isOpen(): boolean {
    return this.whyTheConnectionClosed === null;
  }

  /** Close the connection, which closes every viewer it opened; every request still awaiting its answer fails. */
  close(): void {
    this.closeBecause(`the app closed its ${MCP_STDIO_UPGRADE_REQUEST_TARGET} connection to the runtime at ${this.localApiSocketPath}`);
  }

  private sendToolCallAndAwaitItsAnswer(toolName: string, toolArguments: Readonly<Record<string, unknown>>): Promise<Result<McpToolAnswer, LocalApiRequestFailure>> {
    if (this.whyTheConnectionClosed !== null) return Promise.resolve(localApiRequestFailure(`\`${toolName}\` was not sent: ${this.whyTheConnectionClosed}`));
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((settle) => {
      const answerTimeout = setTimeout(() => {
        this.requestsAwaitingTheirAnswers.delete(requestId);
        this.writeLine({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId, reason: "the app stopped waiting for the answer" } });
        settle(localApiRequestFailure(`\`${toolName}\` to the runtime at ${this.localApiSocketPath} did not answer within ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
      this.requestsAwaitingTheirAnswers.set(requestId, { toolName, settle, answerTimeout });
      this.upgradedConnection.write(`${mcpToolCallRequestBody(requestId, toolName, toolArguments, this.appVersion)}\n`);
    });
  }

  private readFromTheUpgradedConnection(bytesStreamedBehindTheResponseHead: Buffer): void {
    this.upgradedConnection.on("data", (chunk: Buffer) => this.readLines(chunk));
    this.upgradedConnection.on("error", (connectionFailure) => {
      this.closeBecause(`the ${MCP_STDIO_UPGRADE_REQUEST_TARGET} connection to the runtime at ${this.localApiSocketPath} failed: ${describeCaughtFailure(connectionFailure)}`);
    });
    this.upgradedConnection.on("close", () => {
      this.closeBecause(`the runtime at ${this.localApiSocketPath} closed the ${MCP_STDIO_UPGRADE_REQUEST_TARGET} connection`);
    });
    if (bytesStreamedBehindTheResponseHead.length > 0) this.readLines(bytesStreamedBehindTheResponseHead);
  }

  private readLines(chunk: Buffer): void {
    let unread = Buffer.concat([this.bytesAfterTheLastWholeLine, chunk]);
    for (let lineEnd = unread.indexOf(0x0a); lineEnd !== -1; lineEnd = unread.indexOf(0x0a)) {
      this.answerOneLine(unread.subarray(0, lineEnd).toString("utf8"));
      unread = unread.subarray(lineEnd + 1);
    }
    this.bytesAfterTheLastWholeLine = Buffer.from(unread);
    if (this.bytesAfterTheLastWholeLine.length > LARGEST_MCP_STDIO_LINE_BYTES) {
      this.closeBecause(`the runtime at ${this.localApiSocketPath} wrote a line of more than ${LARGEST_MCP_STDIO_LINE_BYTES} bytes on ${MCP_STDIO_UPGRADE_REQUEST_TARGET}`);
    }
  }

  private answerOneLine(lineText: string): void {
    if (lineText.trim() === "") return;
    const message = parseJsonOnTheWire(lineText);
    if (!message.ok || !isAJsonObject(message.value)) return;
    const messageId = message.value["id"];
    const isARequestFromTheRuntime = typeof message.value["method"] === "string";
    if (isARequestFromTheRuntime) {
      if (messageId !== undefined && messageId !== null) {
        this.writeLine({ jsonrpc: "2.0", id: messageId, error: { code: JSON_RPC_METHOD_NOT_FOUND, message: "the app serves no requests" } });
      }
      return;
    }
    if (typeof messageId !== "number") return;
    const awaitingItsAnswer = this.requestsAwaitingTheirAnswers.get(messageId);
    if (awaitingItsAnswer === undefined) return;
    this.requestsAwaitingTheirAnswers.delete(messageId);
    clearTimeout(awaitingItsAnswer.answerTimeout);
    awaitingItsAnswer.settle(mcpToolAnswerFromTheJsonRpcResponse(awaitingItsAnswer.toolName, lineText, MCP_STDIO_UPGRADE_REQUEST_TARGET));
  }

  private writeLine(message: Readonly<Record<string, unknown>>): void {
    if (this.whyTheConnectionClosed === null) this.upgradedConnection.write(`${JSON.stringify(message)}\n`);
  }

  private closeBecause(whyItClosed: string): void {
    if (this.whyTheConnectionClosed !== null) return;
    this.whyTheConnectionClosed = whyItClosed;
    this.upgradedConnection.destroy();
    for (const [, awaitingItsAnswer] of this.requestsAwaitingTheirAnswers) {
      clearTimeout(awaitingItsAnswer.answerTimeout);
      awaitingItsAnswer.settle(localApiRequestFailure(`\`${awaitingItsAnswer.toolName}\` was not answered: ${whyItClosed}`));
    }
    this.requestsAwaitingTheirAnswers.clear();
    for (const whenTheConnectionCloses of this.listenersToTheConnectionClosing.splice(0)) whenTheConnectionCloses(whyItClosed);
  }
}
