import { Effect, Fiber, type Scope, Stream } from "effect";
import { afterEach, expect, test } from "vitest";
import { fakeControlWebSocketRuntime, resultLine, type FakeControlWebSocketAnswer } from "./fake_control_websocket_runtime.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

/** A fake `/control/ws` runtime answering each call after `discover` with `answerCall`, closed after the test. */
async function fakeRuntime(answerCall: FakeControlWebSocketAnswer) {
  const runtime = await fakeControlWebSocketRuntime(answerCall);
  cleanUps.push(() => runtime.close());
  return runtime;
}

/** `program` run on the live `RuntimeControl` over the local API at `localApiSocketPath`, its scope closed after. */
function runOnTheLiveRuntimeControl<Value, Failure>(localApiSocketPath: string, program: Effect.Effect<Value, Failure, RuntimeControl | Scope.Scope>) {
  return Effect.runPromiseExit(Effect.scoped(program).pipe(Effect.provide(runtimeControlLayer(localApiSocketPath, 2_000))));
}

test("a_connection_carries_a_call_and_hands_on_each_push_after_it_until_its_scope_closes_it", async () => {
  const runtime = await fakeRuntime((call) => [
    resultLine(call["id"], { streams: ["pattern-main-bcd55b"] }),
    JSON.stringify({ jsonrpc: "2.0", method: "stream_graph_changed", params: { stream: "pattern-main-bcd55b", change: "missed" } }),
  ]);

  const pushed = await runOnTheLiveRuntimeControl(
    runtime.localApiSocketPath,
    Effect.gen(function* () {
      const connection = yield* (yield* RuntimeControl).connect;
      const firstPush = yield* connection.notifications("stream_graph_changed").pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped);
      yield* Effect.yieldNow;
      const subscribed = yield* connection.call("subscribe_stream_graph_changes", { streams: ["pattern-main-bcd55b"] });
      return { subscribed, firstPush: yield* Fiber.join(firstPush) };
    }),
  );

  expect(pushed._tag === "Success" ? pushed.value : pushed.cause).toEqual({ subscribed: { streams: ["pattern-main-bcd55b"] }, firstPush: [{ stream: "pattern-main-bcd55b", change: "missed" }] });
  expect(runtime.upgradeRequestsRead).toHaveLength(1);
  expect(runtime.callsRead.map((call) => call["method"])).toEqual(["subscribe_stream_graph_changes"]);
});

test("a_call_the_operation_refuses_fails_as_the_runtimes_refusal_by_the_operation", async () => {
  const runtime = await fakeRuntime((call) => [JSON.stringify({ jsonrpc: "2.0", id: call["id"], error: { code: 2, message: "no stream with the id `gone` is loaded in this runtime" } })]);

  const refused = await runOnTheLiveRuntimeControl(
    runtime.localApiSocketPath,
    RuntimeControl.use((runtimeControl) => runtimeControl.connect.pipe(Effect.flatMap((connection) => connection.call("subscribe_stream_graph_changes", { streams: ["gone"] })))),
  );

  expect(refused._tag === "Failure" ? refused.cause.reasons.map((reason) => (reason._tag === "Fail" ? reason.error : reason)) : refused.value).toMatchObject([
    { _tag: "RuntimeRefused", byTheOperation: true, words: "no stream with the id `gone` is loaded in this runtime" },
  ]);
});

test("a_connection_the_runtime_closes_says_so", async () => {
  const runtime = await fakeRuntime(() => null);

  const whyItClosed = await runOnTheLiveRuntimeControl(
    runtime.localApiSocketPath,
    Effect.gen(function* () {
      const connection = yield* (yield* RuntimeControl).connect;
      runtime.closeEveryConnection();
      return yield* connection.closedByTheRuntime;
    }),
  );

  expect(whyItClosed._tag === "Success" ? whyItClosed.value : whyItClosed.cause).toBe(`the runtime at ${runtime.localApiSocketPath} closed the /control/ws connection`);
});

test("nothing_listening_fails_the_connect_naming_the_socket", async () => {
  const unanswered = await runOnTheLiveRuntimeControl("/tmp/tl-app-nothing-listens/local-api.sock", RuntimeControl.use((runtimeControl) => runtimeControl.connect));

  expect(unanswered._tag === "Failure" ? unanswered.cause.reasons.map((reason) => (reason._tag === "Fail" ? reason.error : reason)) : unanswered.value).toMatchObject([
    { _tag: "RuntimeUnreachable", words: expect.stringContaining("/tmp/tl-app-nothing-listens/local-api.sock") },
  ]);
});
