import type { ControlOperations, DescribeRuntimeToolResult, ListStreamsToolResult } from "@tatolab/runtime-client";
import { Effect } from "effect";
import { afterEach, expect, expectTypeOf, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse, controlOperationResultResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUpWhatTheTestStarted, fakeLocalApiServerAnswering, recordedResponseBody } from "./local_api_client_test_support.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import type { Result } from "./result.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import {
  callOneControlOperationOverAPost,
  controlContractTypeOf,
  RuntimeControl,
  runtimeControlLayer,
  type ControlOperationAnswer,
  type ControlOperationParams,
} from "./tatolab_runtime_control_operation_call.js";

afterEach(cleanUpWhatTheTestStarted);

/** How `RuntimeControl` over the local API at `localApiSocketPath` settled the call to `method` with `params`. */
function settledCall<Method extends keyof ControlOperations>(localApiSocketPath: string, method: Method, params: ControlOperationParams<Method>) {
  return Effect.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const runtimeControl = yield* RuntimeControl;
        return yield* runtimeControl.call(method, params);
      }),
    ).pipe(Effect.provide(runtimeControlLayer(localApiSocketPath, 2_000))),
  );
}

test("each call answers its operation's result in the contract's type, and a method the contract does not hold is a type error", () => {
  expectTypeOf(callOneControlOperationOverAPost<"describe_runtime">).returns.resolves.toEqualTypeOf<Result<ControlOperationAnswer<"describe_runtime">, LocalApiRequestFailure>>();
  expectTypeOf<Extract<ControlOperationAnswer<"list_streams">, { kind: "answered" }>["result"]>().toEqualTypeOf<ListStreamsToolResult>();
  const describeTheRuntime = Effect.gen(function* () {
    const runtimeControl = yield* RuntimeControl;
    return yield* runtimeControl.call("describe_runtime", {});
  });
  expectTypeOf<Effect.Success<typeof describeTheRuntime>>().toEqualTypeOf<DescribeRuntimeToolResult>();
  expectTypeOf<Effect.Error<typeof describeTheRuntime>>().toEqualTypeOf<RuntimeControlFailure>();
  // @ts-expect-error `no_such_operation` is no method of the contract.
  expectTypeOf(callOneControlOperationOverAPost<"no_such_operation">).toBeFunction();
});

test("a recorded describe_runtime answer is handed on as the contract's DescribeRuntimeToolResult, as the client read it", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-runtime-tool-result-of-a-test-root-runtime.json"))]);

  const answer = answerOf(await callOneControlOperationOverAPost(server.localApiSocketPath, "describe_runtime", {}, 2_000));

  if (answer.kind !== "answered") return expect.unreachable(answer.words);
  expect(typeof answer.result.version).toBe("string");
  expect(typeof answer.result.build_id).toBe("string");
});

test("an answer off the contract fails as a contract mismatch naming the contract type it is not, and where it is not", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResultResponse({ streams: [{ stream: "p-main-0a1b2c" }] })]);

  const settled = await settledCall(server.localApiSocketPath, "list_streams", {});

  expect(settled._tag).toBe("Failure");
  if (settled._tag !== "Failure") return;
  expect(settled.failure).toMatchObject({ _tag: "ContractMismatch", operation: "list_streams", contractType: "ListStreamsToolResult", direction: "answer" });
  expect(settled.failure.words).toMatch(/^the runtime's answer to `list_streams` is not the contract's `ListStreamsToolResult`: streams\.0\.display_name: /);
});

test("params off the contract are not sent, and fail as a contract mismatch naming the contract type of the params", async () => {
  const server = await fakeLocalApiServerAnswering([]);
  const paramsTheTypeCheckCannotSee: ControlOperationParams<"graph"> = JSON.parse('{"stream":5}');

  const settled = await settledCall(server.localApiSocketPath, "graph", paramsTheTypeCheckCannotSee);

  expect(settled._tag).toBe("Failure");
  if (settled._tag !== "Failure") return;
  expect(settled.failure).toMatchObject({ _tag: "ContractMismatch", operation: "graph", contractType: "GraphRequest", direction: "request" });
  expect(settled.failure.words).toMatch(/^`graph` was not sent: its params are not the contract's `GraphRequest`: stream: /);
  expect(server.receivedRequests()).toEqual([]);
});

test("the contract type of an operation's params or result is the name the contract gives it, or its place in the contract when it has none", () => {
  expect(controlContractTypeOf("transact", "result")).toBe("GraphTransactionToolResult");
  expect(controlContractTypeOf("describe_runtime", "params")).toBe("DescribeRuntimeRequest");
  expect(controlContractTypeOf("graph", "result")).toBe('ControlOperations["graph"]["result"]');
});
