// One long-lived `/mcp/stdio` connection to the runtime's local API, which follows the MCP resources
// the control contract serves no operation for: a project's change feed and the stream-actions
// feed. An HTTP/1.1 `GET /mcp/stdio` with `Upgrade: mcp-stdio` that the runtime answers `101` makes
// the socket carry newline-delimited JSON-RPC both ways. Every request carries the per-request
// `_meta` the runtime requires, so no handshake comes first. A `subscriptions/listen` request stays
// unanswered while it holds, and the runtime writes a `notifications/resources/updated` line naming
// the resource each time it changes.

import net from "node:net";
import { TATO_STUDIO_MCP_CLIENT_NAME } from "../shared/tatolab_backend_contract.js";
import { parseHttpResponse } from "./local_api_client.js";
import { localApiRequestFailure, theRuntimesRefusal, type LocalApiRequestFailure } from "./local_api_request_failure.js";
import { isAJsonObject, parseJsonOnTheWire } from "./json_on_the_wire.js";
import { describeCaughtFailure, succeeded, type Result } from "./result.js";

/** The MCP protocol revision the runtime serves, and the only one. */
export const LOCAL_API_MCP_PROTOCOL_VERSION = "2026-07-28";

/** The request target and upgrade token of the runtime's `/mcp/stdio` route (`local_api_wire_contract.rs`). */
const MCP_STDIO_UPGRADE_REQUEST_TARGET = "/mcp/stdio";
const MCP_STDIO_UPGRADE_PROTOCOL_TOKEN = "mcp-stdio";

/** The JSON-RPC error code for a method the receiver does not serve. */
const JSON_RPC_METHOD_NOT_FOUND = -32601;

/** The most bytes one JSON-RPC line from the runtime may carry before the connection gives up on it. */
const LARGEST_MCP_STDIO_LINE_BYTES = 8 * 1024 * 1024;

/** A request sent on the connection and not yet answered: what it asked, how its answer line settles it, and how it fails unanswered. */
interface McpStdioRequestAwaitingItsAnswer {
  askedFor: string;
  settleWithTheAnswerLine: (answerLineText: string) => void;
  failUnanswered: (failure: LocalApiRequestFailure) => void;
  answerTimeout: NodeJS.Timeout | null;
}

/** The JSON-RPC `method` and `params` of one request the connection sends. */
/** The JSON-RPC request line for `method` with `params`, under request id `requestId`. */
function jsonRpcRequestLine(requestId: number, method: string, params: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params });
}

/** The `_meta` every request carries, so no handshake comes first. */
function perRequestMeta(appVersion: string): Record<string, unknown> {
  return {
    "io.modelcontextprotocol/protocolVersion": LOCAL_API_MCP_PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientInfo": { name: TATO_STUDIO_MCP_CLIENT_NAME, version: appVersion },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

/** The text of a `resources/read` result's first contents block, read from its JSON-RPC answer line. */
export function resourceTextFromTheResourcesReadAnswer(uri: string, answerLineText: string): Result<string, LocalApiRequestFailure> {
  const answer = parseJsonOnTheWire(answerLineText);
  if (!answer.ok || !isAJsonObject(answer.value)) return localApiRequestFailure(`reading ${uri} answered a line that is not JSON-RPC`);
  const jsonRpcError = answer.value["error"];
  if (jsonRpcError !== undefined) {
    const message = isAJsonObject(jsonRpcError) && typeof jsonRpcError["message"] === "string" ? jsonRpcError["message"] : "no message";
    return theRuntimesRefusal(message);
  }
  const readResult = answer.value["result"];
  const contents = isAJsonObject(readResult) ? readResult["contents"] : undefined;
  const firstContents: unknown = Array.isArray(contents) ? contents[0] : undefined;
  const text = isAJsonObject(firstContents) ? firstContents["text"] : undefined;
  return typeof text === "string" ? succeeded(text) : localApiRequestFailure(`reading ${uri} answered no text`);
}

/** Why a `subscriptions/listen` ended, read from the final answer the runtime gave it. */
function whyTheListenEnded(answerLineText: string): string {
  const answer = parseJsonOnTheWire(answerLineText);
  const jsonRpcError = answer.ok && isAJsonObject(answer.value) ? answer.value["error"] : undefined;
  if (isAJsonObject(jsonRpcError) && typeof jsonRpcError["message"] === "string") return `the runtime ended the listen: ${jsonRpcError["message"]}`;
  return "the runtime ended the listen";
}

/** A `subscriptions/listen` the connection holds; stop it to cancel the request. */
export interface McpStdioResourceListen {
  stop(): void;
}

/** One upgraded `/mcp/stdio` connection to the runtime, carrying any number of resource reads and listens at once until it closes. */
export class LocalApiMcpStdioConnection {
  private nextRequestId = 1;
  private readonly requestsAwaitingTheirAnswers = new Map<number, McpStdioRequestAwaitingItsAnswer>();
  private bytesAfterTheLastWholeLine = Buffer.alloc(0);
  private whyTheConnectionClosed: string | null = null;
  private readonly listenersToTheConnectionClosing: ((whyItClosed: string) => void)[] = [];
  private readonly resourceUpdateListenersByUri = new Map<string, Set<() => void>>();

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

  /** The text of the resource `uri`, read with `resources/read`; refused in the runtime's own words, as for a project no tool has opened. */
  readResourceText(uri: string): Promise<Result<string, LocalApiRequestFailure>> {
    return new Promise((settle) => {
      this.sendRequest(
        (requestId) => jsonRpcRequestLine(requestId, "resources/read", { uri, _meta: perRequestMeta(this.appVersion) }),
        { askedFor: `reading ${uri}`, settleWithTheAnswerLine: (answerLineText) => settle(resourceTextFromTheResourcesReadAnswer(uri, answerLineText)), failUnanswered: (failure) => settle({ ok: false, failure }) },
        true,
      );
    });
  }

  /**
   * Hold a `subscriptions/listen` for `uri`, calling `whenUpdated` for each `notifications/resources/updated` naming it, and `whenEnded`
   * once, with why, when the runtime ends the listen or the connection closes; never after `stop`.
   */
  listenForUpdatesOfTheResource(uri: string, whenUpdated: () => void, whenEnded: (whyItEnded: string) => void): McpStdioResourceListen {
    let isListening = true;
    const listenersOfTheUri = this.resourceUpdateListenersByUri.get(uri) ?? new Set<() => void>();
    this.resourceUpdateListenersByUri.set(uri, listenersOfTheUri);
    const updated = () => {
      if (isListening) whenUpdated();
    };
    listenersOfTheUri.add(updated);
    const forgetTheListener = () => {
      isListening = false;
      listenersOfTheUri.delete(updated);
      if (listenersOfTheUri.size === 0 && this.resourceUpdateListenersByUri.get(uri) === listenersOfTheUri) this.resourceUpdateListenersByUri.delete(uri);
    };
    const endWith = (whyItEnded: string) => {
      if (!isListening) return;
      forgetTheListener();
      whenEnded(whyItEnded);
    };
    const requestId = this.sendRequest(
      (listenRequestId) => jsonRpcRequestLine(listenRequestId, "subscriptions/listen", { notifications: { resourceSubscriptions: [uri] }, _meta: perRequestMeta(this.appVersion) }),
      { askedFor: `listening to ${uri}`, settleWithTheAnswerLine: (answerLineText) => endWith(whyTheListenEnded(answerLineText)), failUnanswered: (failure) => endWith(failure.failureDescription) },
      false,
    );
    return {
      stop: () => {
        if (!isListening) return;
        forgetTheListener();
        this.requestsAwaitingTheirAnswers.delete(requestId);
        this.writeLine({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId, reason: "the app stopped listening" } });
      },
    };
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

  /** Close the connection; every request still awaiting its answer fails. */
  close(): void {
    this.closeBecause(`the app closed its ${MCP_STDIO_UPGRADE_REQUEST_TARGET} connection to the runtime at ${this.localApiSocketPath}`);
  }

  /** Send the request line `requestLineOf` makes for its id, its answer settling `awaiting`; one that `timesOut` fails after the request timeout. Answers the request's id. */
  private sendRequest(requestLineOf: (requestId: number) => string, awaiting: Omit<McpStdioRequestAwaitingItsAnswer, "answerTimeout">, timesOut: boolean): number {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    if (this.whyTheConnectionClosed !== null) {
      awaiting.failUnanswered(localApiRequestFailure(`${awaiting.askedFor} was not sent: ${this.whyTheConnectionClosed}`).failure);
      return requestId;
    }
    const answerTimeout = timesOut
      ? setTimeout(() => {
          this.requestsAwaitingTheirAnswers.delete(requestId);
          this.writeLine({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId, reason: "the app stopped waiting for the answer" } });
          awaiting.failUnanswered(localApiRequestFailure(`${awaiting.askedFor} to the runtime at ${this.localApiSocketPath} did not answer within ${this.requestTimeoutMs}ms`).failure);
        }, this.requestTimeoutMs)
      : null;
    this.requestsAwaitingTheirAnswers.set(requestId, { ...awaiting, answerTimeout });
    this.upgradedConnection.write(`${requestLineOf(requestId)}\n`);
    return requestId;
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
    const method = message.value["method"];
    if (method === "notifications/resources/updated") {
      const params = message.value["params"];
      const uri = isAJsonObject(params) ? params["uri"] : undefined;
      if (typeof uri === "string") for (const whenUpdated of [...(this.resourceUpdateListenersByUri.get(uri) ?? [])]) whenUpdated();
      return;
    }
    const isARequestFromTheRuntime = typeof method === "string";
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
    if (awaitingItsAnswer.answerTimeout !== null) clearTimeout(awaitingItsAnswer.answerTimeout);
    awaitingItsAnswer.settleWithTheAnswerLine(lineText);
  }

  private writeLine(message: Readonly<Record<string, unknown>>): void {
    if (this.whyTheConnectionClosed === null) this.upgradedConnection.write(`${JSON.stringify(message)}\n`);
  }

  private closeBecause(whyItClosed: string): void {
    if (this.whyTheConnectionClosed !== null) return;
    this.whyTheConnectionClosed = whyItClosed;
    this.upgradedConnection.destroy();
    const awaitingAtTheClose = [...this.requestsAwaitingTheirAnswers.values()];
    this.requestsAwaitingTheirAnswers.clear();
    for (const awaitingItsAnswer of awaitingAtTheClose) {
      if (awaitingItsAnswer.answerTimeout !== null) clearTimeout(awaitingItsAnswer.answerTimeout);
      awaitingItsAnswer.failUnanswered(localApiRequestFailure(`${awaitingItsAnswer.askedFor} was not answered: ${whyItClosed}`).failure);
    }
    for (const whenTheConnectionCloses of this.listenersToTheConnectionClosing.splice(0)) whenTheConnectionCloses(whyItClosed);
  }
}
