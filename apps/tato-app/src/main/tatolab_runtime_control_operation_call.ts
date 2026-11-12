// The one module that imports streamlib's generated `@tatolab/runtime-client`: it calls a control
// operation over the runtime's JSON-RPC adapter, in one `POST /control` or on the WebSocket at
// `/control/ws`, and settles every outcome as a `Result`. The client checks each call and answer
// against the control contract: it rejects params that do not match with `ControlRequestInvalid`
// before sending them, an answer that does not match with `ControlAnswerInvalid`, the runtime's
// JSON-RPC error with `ControlOperationError`, and with any other error when nothing answered.

import {
  CONTROL_OPERATION_FAILED_ERROR_CODE,
  CONTROL_OPERATION_REFUSED_ERROR_CODE,
  ControlAnswerInvalid,
  ControlOperationError,
  ControlPostTransport,
  ControlRequestInvalid,
  TatolabRuntimeClient,
  type ControlCallOptions,
  type ControlNotificationMethodName,
  type ControlNotifications,
  type ControlOperationMethodName,
  type ControlOperations,
} from "@tatolab/runtime-client";
import { TATO_STUDIO_MCP_CLIENT_NAME } from "../shared/tatolab_backend_contract.js";
import { localApiRequestFailure, theRuntimesRefusal, type LocalApiRequestFailure } from "./local_api_request_failure.js";
import { describeCaughtFailure, succeeded, type Result } from "./result.js";

export type { ControlNotifications, ControlOperationMethodName };

/** The params `method` takes, as the control contract declares them. */
export type ControlOperationParams<Method extends ControlOperationMethodName> = ControlOperations[Method]["params"];

/** What one control operation answered: its result, or the operation's own refusal in the runtime's words, with the structured refusal when the runtime gave one. */
export type ControlOperationAnswer =
  | { kind: "answered"; result: unknown }
  | { kind: "refused_by_the_operation"; words: string; refusal: unknown };

/** Socket error codes that mean no runtime listens on the local API socket. */
const NO_RUNTIME_LISTENING_ERROR_CODES: readonly string[] = ["ENOENT", "ECONNREFUSED"];

/** `durationMs` as a timeout failure spells it: whole seconds as `3s`, anything else as `200ms`. */
export function durationAsTheTimeoutFailureSpellsIt(durationMs: number): string {
  return durationMs % 1000 === 0 ? `${durationMs / 1000}s` : `${durationMs}ms`;
}

function isNoRuntimeListening(callFailure: unknown): boolean {
  return callFailure instanceof Error && "code" in callFailure && typeof callFailure.code === "string" && NO_RUNTIME_LISTENING_ERROR_CODES.includes(callFailure.code);
}

/** How the call to `method` that `sendTheCall` made settled, given up after `responseTimeoutMs`. */
async function controlOperationAnswerOfTheCall(
  method: ControlOperationMethodName,
  localApiSocketPath: string,
  responseTimeoutMs: number,
  sendTheCall: (callOptions: ControlCallOptions) => Promise<unknown>,
): Promise<Result<ControlOperationAnswer, LocalApiRequestFailure>> {
  const responseTimeout = AbortSignal.timeout(responseTimeoutMs);
  try {
    const result = await sendTheCall({ signal: responseTimeout });
    return succeeded({ kind: "answered", result });
  } catch (callFailure) {
    if (callFailure instanceof ControlOperationError) {
      if (callFailure.code === CONTROL_OPERATION_REFUSED_ERROR_CODE || callFailure.code === CONTROL_OPERATION_FAILED_ERROR_CODE) {
        return succeeded({ kind: "refused_by_the_operation", words: callFailure.message, refusal: callFailure.refusal ?? null });
      }
      return theRuntimesRefusal(`the runtime refused \`${method}\`: ${callFailure.message}`);
    }
    if (callFailure instanceof ControlRequestInvalid || callFailure instanceof ControlAnswerInvalid) {
      return localApiRequestFailure(callFailure.message);
    }
    if (responseTimeout.aborted) {
      return localApiRequestFailure(`\`${method}\` to ${localApiSocketPath} did not answer within ${durationAsTheTimeoutFailureSpellsIt(responseTimeoutMs)}`);
    }
    const failureText = describeCaughtFailure(callFailure);
    return localApiRequestFailure(
      isNoRuntimeListening(callFailure) ? `no runtime answers at ${localApiSocketPath}: ${failureText}` : `\`${method}\` to ${localApiSocketPath} got no answer: ${failureText}`,
    );
  }
}

/** Call `method` with `params` in one `POST /control` to the local API at `localApiSocketPath`, giving up after `responseTimeoutMs`. */
export function callOneControlOperationOverAPost<Method extends ControlOperationMethodName>(
  localApiSocketPath: string,
  method: Method,
  params: ControlOperationParams<Method>,
  responseTimeoutMs: number,
): Promise<Result<ControlOperationAnswer, LocalApiRequestFailure>> {
  const controlClientOfOnePost = new TatolabRuntimeClient(new ControlPostTransport({ socketPath: localApiSocketPath, clientName: TATO_STUDIO_MCP_CLIENT_NAME }));
  return controlOperationAnswerOfTheCall(method, localApiSocketPath, responseTimeoutMs, (callOptions) => controlClientOfOnePost.call(method, params, callOptions));
}

/** One WebSocket to the runtime's control API at `/control/ws`, carrying any number of calls at once until it closes. */
export class TatolabRuntimeControlWebSocketConnection {
  private whyTheConnectionClosed: string | null = null;
  private readonly listenersToTheConnectionClosing: ((whyItClosed: string) => void)[] = [];

  private constructor(
    private readonly localApiSocketPath: string,
    private readonly controlClient: TatolabRuntimeClient,
    private readonly requestTimeoutMs: number,
  ) {
    void controlClient.closed.then(() => this.closeBecause(`the runtime at ${localApiSocketPath} closed the /control/ws connection`));
  }

  /** Open a fresh WebSocket to the local API at `localApiSocketPath`, giving up on it and on any later answer after `requestTimeoutMs`; refused when the runtime serves another contract version. */
  static async open(localApiSocketPath: string, requestTimeoutMs: number): Promise<Result<TatolabRuntimeControlWebSocketConnection, LocalApiRequestFailure>> {
    let controlClient: TatolabRuntimeClient | null = null;
    const connected = await controlOperationAnswerOfTheCall(
      "discover",
      localApiSocketPath,
      requestTimeoutMs,
      async ({ signal }) => {
        const connectedClient = await TatolabRuntimeClient.connect(
          signal === undefined ? { socketPath: localApiSocketPath, clientName: TATO_STUDIO_MCP_CLIENT_NAME } : { socketPath: localApiSocketPath, clientName: TATO_STUDIO_MCP_CLIENT_NAME, signal },
        );
        controlClient = connectedClient;
        return connectedClient.discovered;
      },
    );
    if (!connected.ok) return connected;
    if (connected.value.kind === "refused_by_the_operation" || controlClient === null) {
      return theRuntimesRefusal(`the runtime at ${localApiSocketPath} refused the control connection: ${connected.value.kind === "refused_by_the_operation" ? connected.value.words : "it opened no connection"}`);
    }
    return succeeded(new TatolabRuntimeControlWebSocketConnection(localApiSocketPath, controlClient, requestTimeoutMs));
  }

  /** Call `method` with `params` on this connection, giving up after the request timeout; a call on a closed connection is not sent. */
  async callControlOperation<Method extends ControlOperationMethodName>(method: Method, params: ControlOperationParams<Method>): Promise<Result<ControlOperationAnswer, LocalApiRequestFailure>> {
    if (this.whyTheConnectionClosed !== null) return localApiRequestFailure(`\`${method}\` was not sent: ${this.whyTheConnectionClosed}`);
    return controlOperationAnswerOfTheCall(method, this.localApiSocketPath, this.requestTimeoutMs, (callOptions) => this.controlClient.call(method, params, callOptions));
  }

  /** Call `listener` with the params of each `method` notification the runtime sends on this connection until it closes; the returned function stops it. */
  onNotification<Method extends ControlNotificationMethodName>(method: Method, listener: (params: ControlNotifications[Method]) => void): () => void {
    return this.controlClient.onNotification(method, listener);
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

  /** Close the connection, which closes every viewer it opened; every call still awaiting its answer fails. */
  close(): void {
    this.closeBecause(`the app closed its /control/ws connection to the runtime at ${this.localApiSocketPath}`);
    void this.controlClient.close();
  }

  private closeBecause(whyItClosed: string): void {
    if (this.whyTheConnectionClosed !== null) return;
    this.whyTheConnectionClosed = whyItClosed;
    for (const whenTheConnectionCloses of this.listenersToTheConnectionClosing.splice(0)) whenTheConnectionCloses(whyItClosed);
  }
}
