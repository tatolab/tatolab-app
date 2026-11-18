// Tests' stand-in for the runtime's `/control/ws` connections: a `RuntimeControl` whose `connect`
// opens a fake connection answering each call as the test says, pushing what the test hands it,
// and closed by the runtime when the test says. Never imported by shipped code.

import { Deferred, Effect, Layer, ManagedRuntime, Queue, type Scope, Stream } from "effect";
import { TestClock } from "effect/testing";
import { RuntimeRefused, RuntimeUnreachable, type RuntimeControlFailure } from "./runtime_control_failures.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { runtimePushesFollowedLayerOver } from "./studio_runtime.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import {
  RuntimeControl,
  type ControlConnection,
  type ControlNotificationMethodName,
  type ControlNotifications,
  type ControlOperationMethodName,
  type ControlOperationParams,
  type ControlOperationResult,
} from "./tatolab_runtime_control_operation_call.js";

/** How a fake connection answers each call of a method: with its result, or failing as the runtime would; a method missing is a call the test does not expect. */
export type FakeCallAnswers = {
  readonly [Method in ControlOperationMethodName]?: (params: ControlOperationParams<Method>) => Effect.Effect<ControlOperationResult<Method>, RuntimeControlFailure>;
};

/** Each listener to a notification method, by method. */
type NotificationListeners = { readonly [Method in ControlNotificationMethodName]: Set<(params: ControlNotifications[Method]) => void> };

/** The runtime's refusal of `method` by the operation itself, in `words`. */
export function refusedByTheOperation(method: string, words: string): RuntimeRefused {
  return new RuntimeRefused({ operation: method, words, byTheOperation: true, refusal: undefined });
}

/** One fake `/control/ws` connection: each call recorded and answered as `answers` says, each push the test hands it sent to its listeners. */
export class FakeControlConnection implements ControlConnection {
  readonly callsMade: [ControlOperationMethodName, unknown][] = [];
  closedByTheApp = false;
  private readonly listeners: NotificationListeners = {
    project_changed: new Set(),
    stream_graph_changed: new Set(),
    input_value_changed: new Set(),
    stream_action_changed: new Set(),
    project_log_records_written: new Set(),
  };
  private readonly closed = Deferred.makeUnsafe<string>();

  constructor(private readonly answers: FakeCallAnswers) {}

  call<Method extends ControlOperationMethodName>(method: Method, params: ControlOperationParams<Method>): Effect.Effect<ControlOperationResult<Method>, RuntimeControlFailure> {
    return Effect.suspend(() => {
      this.callsMade.push([method, params]);
      const answer = this.answers[method];
      return answer === undefined ? Effect.die(`these tests expect no ${method} call`) : answer(params);
    });
  }

  notifications<Method extends ControlNotificationMethodName>(method: Method): Stream.Stream<ControlNotifications[Method]> {
    return Stream.callback<ControlNotifications[Method]>((pushed) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const listener = (params: ControlNotifications[Method]) => void Queue.offerUnsafe(pushed, params);
          this.listeners[method].add(listener);
          return listener;
        }),
        (listener) => Effect.sync(() => this.listeners[method].delete(listener)),
      ),
    );
  }

  get closedByTheRuntime(): Effect.Effect<string> {
    return Deferred.await(this.closed);
  }

  /** Send each listener to `method` the push `params`, as the runtime would. */
  push<Method extends ControlNotificationMethodName>(method: Method, params: ControlNotifications[Method]): void {
    for (const listener of this.listeners[method]) listener(params);
  }

  /** Close the connection from the runtime's end. */
  closeFromTheRuntime(): void {
    Deferred.doneUnsafe(this.closed, Effect.succeed("the runtime closed the /control/ws connection"));
  }
}

/** A runtime whose connections answer each call as `answers` says, every one opened recorded; it refuses to connect while `answers` is false, and breaks on the next connect while `breaksOnTheNextConnect` is true. */
export function fakeRuntimeOfConnections(answers: FakeCallAnswers) {
  const connectionsOpened: FakeControlConnection[] = [];
  const runtime = { answers: true, breaksOnTheNextConnect: false };
  const layer = Layer.succeed(RuntimeControl, {
    call: (method) => Effect.die(`these tests make no ${method} call outside a connection`),
    discover: Effect.die("these tests make no discover call"),
    get: (requestTarget) => Effect.die(`these tests make no GET ${requestTarget}`),
    connect: Effect.suspend(() => {
      if (runtime.breaksOnTheNextConnect) {
        runtime.breaksOnTheNextConnect = false;
        return Effect.die(new Error("the connect broke"));
      }
      return runtime.answers
        ? Effect.acquireRelease(
            Effect.sync(() => {
              const connection = new FakeControlConnection(answers);
              connectionsOpened.push(connection);
              return connection;
            }),
            (connection) =>
              Effect.sync(() => {
                connection.closedByTheApp = true;
              }),
          )
        : Effect.fail(new RuntimeUnreachable({ operation: "discover", words: "no runtime answers at /tmp/local-api.sock" }));
    }),
  });
  return { connectionsOpened, runtime, layer };
}

/** Turns of the test clock's scheduler that let a follower connect, subscribe and hand on a push: each stage of it waits a turn on the one before, and the deepest takes under ten. */
const SCHEDULER_TURNS_TO_SETTLE = 20;

/** Let every fiber the test started run as far as it can at the test clock's time: the clock's scheduler flushed, a turn at a time. */
export const settle = Effect.forEach(Array.from({ length: SCHEDULER_TURNS_TO_SETTLE }), () => TestClock.adjust(0), { discard: true });

/** `program` run to its end on `runtimeControl` and a test clock, its scope closed after. */
export function runOnATestClock<Value>(program: Effect.Effect<Value, never, RuntimeControl | Scope.Scope>, runtimeControl: Layer.Layer<RuntimeControl>): Promise<Value> {
  return Effect.runPromise(Effect.scoped(program).pipe(Effect.provide(Layer.merge(runtimeControl, TestClock.layer()))));
}

/** The stream graphs and project logs followed over the real runtime at `localApiSocketPath`, beside its `RuntimeControl`; dispose it once the test ends. */
export function pushesFollowedOverALiveRuntime(localApiSocketPath: string) {
  const runtimeControl = runtimeControlLayer(localApiSocketPath, 5_000);
  return ManagedRuntime.make(Layer.merge(runtimeControl, runtimePushesFollowedLayerOver(runtimeControl, createTatolabAppLog("error", () => {}))));
}
