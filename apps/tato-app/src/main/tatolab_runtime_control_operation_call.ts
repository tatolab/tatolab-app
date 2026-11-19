// The main process's one importer of streamlib's generated `@tatolab/runtime-client`, and the one
// module that calls the runtime through it: it calls a control operation over the runtime's
// JSON-RPC adapter, in one `POST /control` or on the WebSocket at `/control/ws`. `RuntimeControl`
// makes the call as an Effect failing with a `RuntimeControlFailure`. The client checks each call and answer against the control
// contract: it rejects params that do not match with `ControlRequestInvalid` before sending them,
// an answer that does not match with `ControlAnswerInvalid`, the runtime's JSON-RPC error with
// `ControlOperationError`, the runtime's refusal of the client's contract with `ControlContractMismatch`, and with any other
// error when nothing answered. An answer is checked
// once, by the client, and handed on as the contract's type for its operation; a hand-written
// reader still walks it, typed, until its operation is next touched. The contract types and the
// checker the rest of the main process reads with are re-exported from here.

import {
  CONTROL_OPERATION_FAILED_ERROR_CODE,
  CONTROL_OPERATION_REFUSED_ERROR_CODE,
  ControlAnswerInvalid,
  ControlContractMismatch,
  ControlOperationError,
  ControlPostTransport,
  ControlRequestInvalid,
  CONTROL_CONTRACT_SCHEMAS,
  readControlContractValue,
  TatolabRuntimeClient,
  type ControlCallOptions,
  type ControlContractIssue,
  type ControlNotificationMethodName,
  type ControlNotifications,
  type ControlOperationMethodName,
  type ControlOperations,
  type DiscoverResult,
  type ProjectActionRefusalOnTheWire,
} from "@tatolab/runtime-client";
import { Context, Effect, type Scope, type Stream } from "effect";
import { TATO_STUDIO_MCP_CLIENT_NAME, type ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import { ContractMismatch, RuntimeOfAnotherContract, RuntimeRefused, RuntimeTimedOut, RuntimeUnreachable, type RuntimeControlFailure } from "./runtime_control_failures.js";
import { fromResult } from "./result_as_effect.js";

export type { ControlNotificationMethodName, ControlNotifications, ControlOperationMethodName, ControlOperations };
export type {
  ControlContractComponents,
  ControlContractIssue,
  ControlContractVersionMismatch,
  DiscoverResult,
  GraphTransactionToolResult,
  NodeUiManifest,
  PinFlow,
  ProjectActionRefusalOnTheWire,
  SuggestedOperationCall,
} from "@tatolab/runtime-client";
export { readControlContractValue } from "@tatolab/runtime-client";

/** The params `method` takes, as the control contract declares them. */
export type ControlOperationParams<Method extends ControlOperationMethodName> = ControlOperations[Method]["params"];

/** What `method` answers, as the control contract declares it. */
export type ControlOperationResult<Method extends ControlOperationMethodName> = ControlOperations[Method]["result"];

/** How an issue at the root of a call's params or answer names where it is. */
const THE_WHOLE_VALUE = "(the whole value)";

/** Each of `issues` as where in the value it is, `whole` for the value itself, and what is wrong there. */
export function describeTheContractIssues(issues: readonly ControlContractIssue[], whole: string): string {
  return issues.map((issue) => `${issue.path.length === 0 ? whole : issue.path.map(String).join(".")}: ${issue.message}`).join("; ");
}

/** `sent` read as the contract's refusal by the generated client, a refusal code it does not know read as `refused`; or where and why it is not one. */
export function controlContractRefusalOf(sent: unknown): Result<ProjectActionRefusalOnTheWire, string> {
  const refusal = readControlContractValue("ProjectActionRefusalOnTheWire", sent);
  return refusal.read ? succeeded(refusal.value) : failedWith(describeTheContractIssues(refusal.issues, "the refusal"));
}

/**
 * The contract type of `method`'s params or result, by the name the contract gives it, as `GraphTransactionToolResult`;
 * one the contract writes out in place, with no name, as `ControlOperations["<method>"]["<part>"]`.
 */
export function controlContractTypeOf(method: ControlOperationMethodName, part: "params" | "result"): string {
  const schema = CONTROL_CONTRACT_SCHEMAS.operations[method][part];
  const reference = typeof schema === "object" ? schema["$ref"] : undefined;
  const componentName = typeof reference === "string" ? /^#\/components\/schemas\/(.+)$/.exec(reference)?.[1] : undefined;
  return componentName ?? `ControlOperations["${method}"]["${part}"]`;
}

/** That the answer to `method` does not read as the contract's type for it, for `why`. */
function answerContractMismatch(method: ControlOperationMethodName, why: string): ContractMismatch {
  const contractType = controlContractTypeOf(method, "result");
  return new ContractMismatch({ operation: method, contractType, direction: "answer", words: `the runtime's answer to \`${method}\` is not the contract's \`${contractType}\`: ${why}` });
}

/** That the params for `method` are not the contract's type for them, for `why`, so they were not sent. */
function requestContractMismatch(method: ControlOperationMethodName, why: string): ContractMismatch {
  const contractType = controlContractTypeOf(method, "params");
  return new ContractMismatch({ operation: method, contractType, direction: "request", words: `\`${method}\` was not sent: its params are not the contract's \`${contractType}\`: ${why}` });
}

/** How long one local API request may go without its answer before the runtime reads as not answering, unless its operation has a limit of its own. */
export const LOCAL_API_REQUEST_TIMEOUT_MS = 3_000;

/**
 * The time limit of each operation that takes longer than a call's default: `list_node_types` runs the project's
 * interpreter over its source, which the runtime bounds at 60 seconds and refuses soon after, and `describe_node_types`
 * reads that source again for each project node type no loaded stream has described; a dependency tool locks the
 * project's Python requirements with uv, which may resolve them over the network, and a check for newer versions reads
 * every source; a tool that copies files copies a whole project or asset, or unpacks a `.zip`.
 */
const CONTROL_OPERATION_TIME_LIMITS_MS: Partial<Readonly<Record<ControlOperationMethodName, number>>> = {
  list_node_types: 65_000,
  describe_node_types: 65_000,
  add_dependency: 180_000,
  update_dependency: 180_000,
  remove_dependency: 180_000,
  list_dependencies: 180_000,
  import_asset: 120_000,
  duplicate_project: 120_000,
  import_project: 120_000,
  // Two programs over a folder, each bounded at 120 s by the runtime, and the declarations at 60 s.
  check_project_code: 330_000,
};

/** How long a call to `method` may go without its answer: its own limit when it has one, else `defaultTimeLimitMs`. */
export function controlOperationTimeLimitMs(method: ControlOperationMethodName, defaultTimeLimitMs: number): number {
  return CONTROL_OPERATION_TIME_LIMITS_MS[method] ?? defaultTimeLimitMs;
}

/** Socket error codes that mean no runtime listens on the local API socket. */
const NO_RUNTIME_LISTENING_ERROR_CODES: readonly string[] = ["ENOENT", "ECONNREFUSED"];

/** `durationMs` as a timeout failure spells it: whole seconds as `3s`, anything else as `200ms`. */
export function durationAsTheTimeoutFailureSpellsIt(durationMs: number): string {
  return durationMs % 1000 === 0 ? `${durationMs / 1000}s` : `${durationMs}ms`;
}

function isNoRuntimeListening(callFailure: unknown): boolean {
  return callFailure instanceof Error && "code" in callFailure && typeof callFailure.code === "string" && NO_RUNTIME_LISTENING_ERROR_CODES.includes(callFailure.code);
}

/** `author` as the runtime's tools take it: its kind and name, nothing else. */
export function authorOnTheWire(author: ProjectTransactionAuthor): { kind: ProjectTransactionAuthor["kind"]; name: string } {
  return { kind: author.kind, name: author.name };
}

/** A client of the local API at `localApiSocketPath` whose calls each go in one `POST /control`. */
export function controlClientOfOnePost(localApiSocketPath: string): TatolabRuntimeClient {
  return new TatolabRuntimeClient(new ControlPostTransport({ socketPath: localApiSocketPath, clientName: TATO_STUDIO_MCP_CLIENT_NAME }));
}

/** That `method` to `localApiSocketPath` did not answer within `timeLimitMs`. */
export function runtimeTimedOut(method: ControlOperationMethodName, localApiSocketPath: string, timeLimitMs: number): RuntimeTimedOut {
  return new RuntimeTimedOut({ operation: method, words: `\`${method}\` to ${localApiSocketPath} did not answer within ${durationAsTheTimeoutFailureSpellsIt(timeLimitMs)}` });
}

/** The failure `callFailure`, thrown by the client calling `method` on the local API at `localApiSocketPath`, stands for; the one reading of a failed call, for every path that calls. */
export function runtimeControlFailureOfTheCall(method: ControlOperationMethodName, localApiSocketPath: string, callFailure: unknown): RuntimeControlFailure {
  if (callFailure instanceof ControlOperationError) {
    const byTheOperation = callFailure.code === CONTROL_OPERATION_REFUSED_ERROR_CODE || callFailure.code === CONTROL_OPERATION_FAILED_ERROR_CODE;
    return new RuntimeRefused({
      operation: method,
      words: byTheOperation ? callFailure.message : `the runtime refused \`${method}\`: ${callFailure.message}`,
      byTheOperation,
      refusal: callFailure.refusal,
    });
  }
  if (callFailure instanceof ControlContractMismatch) return new RuntimeOfAnotherContract({ operation: method, words: callFailure.message, mismatch: callFailure.mismatch });
  if (callFailure instanceof ControlRequestInvalid) return requestContractMismatch(method, describeTheContractIssues(callFailure.issues, THE_WHOLE_VALUE));
  if (callFailure instanceof ControlAnswerInvalid) return answerContractMismatch(method, describeTheContractIssues(callFailure.issues, THE_WHOLE_VALUE));
  const failureText = describeCaughtFailure(callFailure);
  return new RuntimeUnreachable({
    operation: method,
    words: isNoRuntimeListening(callFailure) ? `no runtime answers at ${localApiSocketPath}: ${failureText}` : `\`${method}\` to ${localApiSocketPath} got no answer: ${failureText}`,
  });
}

/** One answer to a plain HTTP request of the local API: its status and its body as UTF-8 text. */
export interface LocalApiHttpResponse {
  readonly statusCode: number;
  readonly body: string;
}

/** The one service that calls the runtime: each control operation by its method, typed by the contract both ways, within the operation's time limit. */
export class RuntimeControl extends Context.Service<
  RuntimeControl,
  {
    readonly call: <Method extends ControlOperationMethodName>(
      method: Method,
      params: ControlOperationParams<Method>,
    ) => Effect.Effect<ControlOperationResult<Method>, RuntimeControlFailure>;
    /**
     * Open a `/control/ws` connection, `discover` on it naming this Studio's contract, and close it: what the runtime answered,
     * or `RuntimeOfAnotherContract` when it refused that contract, on the upgrade or on `discover`, or is a runtime from before
     * the contract had a revision.
     */
    readonly discover: Effect.Effect<DiscoverResult, RuntimeControlFailure>;
    /** `GET requestTarget`, one of the local API's plain HTTP requests, given up once the connection sits idle for the default time limit: its whole response, whatever its status. */
    readonly get: (requestTarget: string) => Effect.Effect<LocalApiHttpResponse, RuntimeControlFailure>;
    /**
     * Open a `/control/ws` connection, its `discover` answered within the default time limit, held open until the scope closes;
     * `RuntimeOfAnotherContract` when the runtime refused this Studio's contract.
     */
    readonly connect: Effect.Effect<ControlConnection, RuntimeControlFailure, Scope.Scope>;
  }
>()("tatolab-app/RuntimeControl") {}

/** One `/control/ws` connection to the runtime, carrying any number of calls at once, open while the scope that opened it is. */
export interface ControlConnection {
  /** `method` called with `params` on this connection, within the operation's time limit; a call once the connection closed fails unsent. */
  readonly call: <Method extends ControlOperationMethodName>(method: Method, params: ControlOperationParams<Method>) => Effect.Effect<ControlOperationResult<Method>, RuntimeControlFailure>;
  /** The params of each `method` notification the runtime sends on this connection from now on. */
  readonly notifications: <Method extends ControlNotificationMethodName>(method: Method) => Stream.Stream<ControlNotifications[Method]>;
  /** Why the runtime closed the connection, once it does; never, while the runtime keeps it open. */
  readonly closedByTheRuntime: Effect.Effect<string>;
}

/**
 * `method` called with `params` and its answer read with `readTheAnswer`, a reader that walks the contract's type into the one
 * Studio keeps; an answer it cannot read fails as not the contract's type, in the reader's words.
 */
export function controlOperationReadWith<Method extends ControlOperationMethodName, Value>(
  method: Method,
  params: ControlOperationParams<Method>,
  readTheAnswer: (answered: ControlOperationResult<Method>) => Result<Value, string>,
): Effect.Effect<Value, RuntimeControlFailure, RuntimeControl> {
  return RuntimeControl.use((runtimeControl) => answerReadWith(runtimeControl.call(method, params), method, readTheAnswer));
}

/** `method` called with `params` on `connection` and its answer read with `readTheAnswer`, as `controlOperationReadWith` reads one. */
export function controlOperationOnTheConnectionReadWith<Method extends ControlOperationMethodName, Value>(
  connection: ControlConnection,
  method: Method,
  params: ControlOperationParams<Method>,
  readTheAnswer: (answered: ControlOperationResult<Method>) => Result<Value, string>,
): Effect.Effect<Value, RuntimeControlFailure> {
  return answerReadWith(connection.call(method, params), method, readTheAnswer);
}

function answerReadWith<Method extends ControlOperationMethodName, Value, Services>(
  answering: Effect.Effect<ControlOperationResult<Method>, RuntimeControlFailure, Services>,
  method: Method,
  readTheAnswer: (answered: ControlOperationResult<Method>) => Result<Value, string>,
): Effect.Effect<Value, RuntimeControlFailure, Services> {
  return answering.pipe(Effect.flatMap((answered) => fromResult(readTheAnswer(answered), (why) => answerContractMismatch(method, why))));
}

/** A client connected to the local API at `localApiSocketPath` over `/control/ws`, its `discover` answered; aborting `signal` gives up on it. */
export function controlClientConnectedOverAWebSocket(localApiSocketPath: string, signal: ControlCallOptions["signal"]) {
  return TatolabRuntimeClient.connect(
    signal === undefined ? { socketPath: localApiSocketPath, clientName: TATO_STUDIO_MCP_CLIENT_NAME } : { socketPath: localApiSocketPath, clientName: TATO_STUDIO_MCP_CLIENT_NAME, signal },
  );
}

/**
 * Close `connectedClient` without waiting for the runtime to answer the close, as the persistent connection does: a runtime that
 * never answers it must not hold up the status round that read its contract. Closing cannot fail.
 */
export function closedWithoutWaitingForThePeer(connectedClient: TatolabRuntimeClient): Effect.Effect<void> {
  return Effect.sync(() => {
    connectedClient.close().catch(() => {});
  });
}
