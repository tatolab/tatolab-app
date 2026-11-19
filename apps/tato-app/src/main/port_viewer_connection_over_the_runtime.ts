// The port viewers' `/control/ws` connection opened over `RuntimeControl`, held in a scope of its own: the
// frame lane meets no Effect, so its calls settle as Promises of a `Result`, its close is a plain call, and the
// runtime's close of it is told to plain listeners.

import { Effect, Exit, Scope } from "effect";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import {
  closedViewerFromTheCloseViewerToolResult,
  openedRuntimeViewerFromTheOpenViewerToolResult,
  type RuntimeViewerCallFailure,
  type RuntimeViewerConnection,
} from "./runtime_viewer_control_connection.js";
import {
  controlOperationOnTheConnectionReadWith,
  RuntimeControl,
  type ControlOperationParams,
  type ControlOperationResult,
} from "./tatolab_runtime_control_operation_call.js";

/** Why the connection closed when the app closed it, or the scope it was opened in closed. */
const CLOSED_BY_THE_APP = "the port viewers' /control/ws connection was closed";

/**
 * A connection port viewers are opened over, opened with `RuntimeControl.connect` in a scope of its own forked from
 * `outerScope`: closed by `close`, by the runtime, or as `outerScope` closes. Its calls run on the services this effect runs
 * on, so a call that breaks is logged through their logger.
 */
export function runtimeViewerConnectionOpenedIn(outerScope: Scope.Scope): Effect.Effect<RuntimeViewerConnection, RuntimeControlFailure, RuntimeControl> {
  return Effect.gen(function* () {
    const runtimeControl = yield* RuntimeControl;
    const connectionScope = yield* Scope.fork(outerScope);
    const connection = yield* runtimeControl.connect.pipe(
      Scope.provide(connectionScope),
      Effect.onError(() => Scope.close(connectionScope, Exit.void)),
    );
    const services = yield* Effect.context<never>();
    let whyItClosed: string | null = null;
    const listenersToTheClose: ((whyItClosed: string) => void)[] = [];
    /** Mark the connection closed because of `why`, telling each listener once; a second close keeps the first why. */
    const markClosedBecause = (why: string) => {
      if (whyItClosed !== null) return;
      whyItClosed = why;
      for (const listener of listenersToTheClose.splice(0)) listener(why);
    };
    yield* Scope.addFinalizer(connectionScope, Effect.sync(() => markClosedBecause(CLOSED_BY_THE_APP)));
    yield* connection.closedByTheRuntime.pipe(
      Effect.flatMap((why) => Effect.sync(() => markClosedBecause(why))),
      // Detached, as closing the scope interrupts this fiber, which runs in it.
      Effect.andThen(Effect.forkDetach(Scope.close(connectionScope, Exit.void))),
      Effect.forkIn(connectionScope),
    );

    /** `method`'s answer read with `readTheAnswer`, settled as a `Result`: a failure in its words, a call that broke logged and answered as one. */
    const answerOf = <Method extends "open_viewer" | "close_viewer", Value>(
      method: Method,
      params: ControlOperationParams<Method>,
      readTheAnswer: (answered: ControlOperationResult<Method>) => Result<Value, string>,
    ): Promise<Result<Value, RuntimeViewerCallFailure>> =>
      Effect.runPromiseWith(services)(
        controlOperationOnTheConnectionReadWith(connection, method, params, readTheAnswer).pipe(
          Effect.match({
            onSuccess: (value): Result<Value, RuntimeViewerCallFailure> => succeeded(value),
            onFailure: (failure): Result<Value, RuntimeViewerCallFailure> =>
              failedWith({ words: failure.words, theRuntimeRefusedIt: failure._tag === "RuntimeRefused" && failure.byTheOperation }),
          }),
          Effect.catchDefect((defect) =>
            Effect.logError(`a port viewer's ${method} broke`, defect).pipe(Effect.as(failedWith({ words: `\`${method}\` broke: ${describeCaughtFailure(defect)}`, theRuntimeRefusedIt: false }))),
          ),
        ),
      );

    return {
      openViewer: (target) =>
        answerOf(
          "open_viewer",
          { stream: target.stream, node_id: target.node_id, port: target.port, viewer_process_id: target.viewer_process_id },
          openedRuntimeViewerFromTheOpenViewerToolResult,
        ),
      closeViewer: (viewer) => answerOf("close_viewer", { viewer }, closedViewerFromTheCloseViewerToolResult),
      onClosed: (whenTheConnectionCloses) => {
        if (whyItClosed === null) listenersToTheClose.push(whenTheConnectionCloses);
        else whenTheConnectionCloses(whyItClosed);
      },
      isOpen: () => whyItClosed === null,
      close: () => {
        markClosedBecause(CLOSED_BY_THE_APP);
        Effect.runForkWith(services)(Scope.close(connectionScope, Exit.void));
      },
    };
  });
}
