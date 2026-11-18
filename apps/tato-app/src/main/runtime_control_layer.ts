// The live `RuntimeControl`: each call one `POST /control` to the local API's Unix socket, `discover`
// one `/control/ws` connection, and each plain HTTP request one short `GET`. It lives apart from the
// service it implements because the plain `GET` needs `node:net`, and the window's mock build reads
// that service's module, which must import no Node module.

import { Duration, Effect, Layer } from "effect";
import { getOverTheLocalApi } from "./local_api_plain_http.js";
import {
  closedWithoutWaitingForThePeer,
  controlClientConnectedOverAWebSocket,
  controlClientOfOnePost,
  controlOperationTimeLimitMs,
  RuntimeControl,
  runtimeControlFailureOfTheCall,
  runtimeTimedOut,
  type ControlOperationMethodName,
  type ControlOperationParams,
} from "./tatolab_runtime_control_operation_call.js";

/**
 * `RuntimeControl` over the local API at `localApiSocketPath`: each `call` one `POST /control`, given up after its operation's limit
 * or `defaultTimeLimitMs`, which aborts the request, as an interrupt does; `discover` one `/control/ws` connection, given up after
 * `defaultTimeLimitMs` and closed without waiting for the runtime's answer to the close; `get` one plain HTTP request, given up once
 * idle for `defaultTimeLimitMs`.
 */
export function runtimeControlLayer(localApiSocketPath: string, defaultTimeLimitMs: number): Layer.Layer<RuntimeControl> {
  return Layer.succeed(RuntimeControl, {
    get: (requestTarget) => getOverTheLocalApi(localApiSocketPath, requestTarget, defaultTimeLimitMs),
    discover: Effect.acquireUseRelease(
      Effect.tryPromise({
        try: (signal) => controlClientConnectedOverAWebSocket(localApiSocketPath, signal),
        catch: (connectFailure) => runtimeControlFailureOfTheCall("discover", localApiSocketPath, connectFailure),
      }),
      (connectedClient) => Effect.succeed(connectedClient.discovered),
      (connectedClient) => closedWithoutWaitingForThePeer(connectedClient),
    ).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(defaultTimeLimitMs),
        orElse: () => Effect.fail(runtimeTimedOut("discover", localApiSocketPath, defaultTimeLimitMs)),
      }),
    ),
    call: <Method extends ControlOperationMethodName>(method: Method, params: ControlOperationParams<Method>) => {
      const timeLimitMs = controlOperationTimeLimitMs(method, defaultTimeLimitMs);
      return Effect.tryPromise({
        try: (signal) => controlClientOfOnePost(localApiSocketPath).call(method, params, { signal }),
        catch: (callFailure) => runtimeControlFailureOfTheCall(method, localApiSocketPath, callFailure),
      }).pipe(
        Effect.timeoutOrElse({
          duration: Duration.millis(timeLimitMs),
          orElse: () => Effect.fail(runtimeTimedOut(method, localApiSocketPath, timeLimitMs)),
        }),
      );
    },
  });
}
