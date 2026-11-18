// The live `RuntimeControl`: each call one `POST /control` to the local API's Unix socket, `discover`
// and `connect` each one `/control/ws` connection, and each plain HTTP request one short `GET`. It lives apart from the
// service it implements because the plain `GET` needs `node:net`, and the window's mock build reads
// that service's module, which must import no Node module.

import { Duration, Effect, Layer, Queue, type Scope, Stream } from "effect";
import { getOverTheLocalApi } from "./local_api_plain_http.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import {
  closedWithoutWaitingForThePeer,
  controlClientConnectedOverAWebSocket,
  controlClientOfOnePost,
  controlOperationTimeLimitMs,
  RuntimeControl,
  runtimeControlFailureOfTheCall,
  runtimeTimedOut,
  type ControlConnection,
  type ControlOperationMethodName,
  type ControlOperationResult,
} from "./tatolab_runtime_control_operation_call.js";

/** A client connected over `/control/ws`, its `discover` answered. */
type ConnectedControlClient = Awaited<ReturnType<typeof controlClientConnectedOverAWebSocket>>;

/** `method` called with `params` by `sendTheCall`, given up after its operation's limit or `defaultTimeLimitMs`, which aborts it, as an interrupt does. */
function callWithinItsTimeLimit<Method extends ControlOperationMethodName>(
  localApiSocketPath: string,
  defaultTimeLimitMs: number,
  method: Method,
  sendTheCall: (signal: AbortSignal) => Promise<ControlOperationResult<Method>>,
): Effect.Effect<ControlOperationResult<Method>, RuntimeControlFailure> {
  const timeLimitMs = controlOperationTimeLimitMs(method, defaultTimeLimitMs);
  return Effect.tryPromise({
    try: sendTheCall,
    catch: (callFailure) => runtimeControlFailureOfTheCall(method, localApiSocketPath, callFailure),
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(timeLimitMs),
      orElse: () => Effect.fail(runtimeTimedOut(method, localApiSocketPath, timeLimitMs)),
    }),
  );
}

/** A client connected over `/control/ws` with its `discover` answered within `timeLimitMs`, closed without waiting for the runtime as the scope closes. */
function clientConnectedOverAWebSocket(localApiSocketPath: string, timeLimitMs: number): Effect.Effect<ConnectedControlClient, RuntimeControlFailure, Scope.Scope> {
  const connecting = Effect.tryPromise({
    try: (signal) => controlClientConnectedOverAWebSocket(localApiSocketPath, signal),
    catch: (connectFailure) => runtimeControlFailureOfTheCall("discover", localApiSocketPath, connectFailure),
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(timeLimitMs),
      orElse: () => Effect.fail(runtimeTimedOut("discover", localApiSocketPath, timeLimitMs)),
    }),
  );
  return Effect.uninterruptibleMask((restore) => restore(connecting).pipe(Effect.tap((connectedClient) => Effect.addFinalizer(() => closedWithoutWaitingForThePeer(connectedClient)))));
}

/** `connectedClient`, connected to the local API at `localApiSocketPath`, as a `ControlConnection` whose calls are given up after their limit or `defaultTimeLimitMs`. */
function controlConnectionOver(connectedClient: ConnectedControlClient, localApiSocketPath: string, defaultTimeLimitMs: number): ControlConnection {
  return {
    call: (method, params) => callWithinItsTimeLimit(localApiSocketPath, defaultTimeLimitMs, method, (signal) => connectedClient.call(method, params, { signal })),
    notifications: (method) =>
      Stream.callback((pushed) =>
        Effect.acquireRelease(
          Effect.sync(() => connectedClient.onNotification(method, (params) => void Queue.offerUnsafe(pushed, params))),
          (stopListening) => Effect.sync(stopListening),
        ),
      ),
    closedByTheRuntime: Effect.promise(() => connectedClient.closed).pipe(Effect.as(`the runtime at ${localApiSocketPath} closed the /control/ws connection`)),
  };
}

/**
 * `RuntimeControl` over the local API at `localApiSocketPath`: each `call` one `POST /control`, given up after its operation's limit
 * or `defaultTimeLimitMs`, which aborts the request, as an interrupt does; `discover` one `/control/ws` connection, given up after
 * `defaultTimeLimitMs` and closed without waiting for the runtime's answer to the close; `connect` one such connection held open for
 * its scope; `get` one plain HTTP request, given up once idle for `defaultTimeLimitMs`.
 */
export function runtimeControlLayer(localApiSocketPath: string, defaultTimeLimitMs: number): Layer.Layer<RuntimeControl> {
  return Layer.succeed(RuntimeControl, {
    get: (requestTarget) => getOverTheLocalApi(localApiSocketPath, requestTarget, defaultTimeLimitMs),
    discover: Effect.scoped(clientConnectedOverAWebSocket(localApiSocketPath, defaultTimeLimitMs).pipe(Effect.map((connectedClient) => connectedClient.discovered))),
    connect: clientConnectedOverAWebSocket(localApiSocketPath, defaultTimeLimitMs).pipe(Effect.map((connectedClient) => controlConnectionOver(connectedClient, localApiSocketPath, defaultTimeLimitMs))),
    call: (method, params) => callWithinItsTimeLimit(localApiSocketPath, defaultTimeLimitMs, method, (signal) => controlClientOfOnePost(localApiSocketPath).call(method, params, { signal })),
  });
}
