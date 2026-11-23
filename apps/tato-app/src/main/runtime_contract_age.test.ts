import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { CONTROL_CONTRACT_REVISION, CONTROL_CONTRACT_VERSION, CONTROL_CONTRACT_VERSION_MISMATCH_ERROR_CODE, type ControlContractVersionMismatch } from "@tatolab/runtime-client";
import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";
import type { RuntimeOfAnotherAge } from "../shared/tatolab_backend_contract.js";
import { fakeControlWebSocketRuntime, resultLine, type FakeControlWebSocketAnswer } from "./fake_control_websocket_runtime.js";
import { controlOperationResponseOfTheRecordedToolResponse, controlOperationResultResponse, httpResponse } from "./fake_local_api_server.js";
import { readTheAnsweringRuntime, readTheRuntimesContractAge, remedyForTheOlderSide, type HowTheRunningRuntimeRuns, type RuntimeContractAgeReading } from "./runtime_contract_age.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { cleanUps, cleanUpWhatTheTestStarted, fakeLocalApiServerAnswering, recordedResponseBody } from "./runtime_operations_test_support.js";

afterEach(cleanUpWhatTheTestStarted);

/** The record a runtime of release 0.68.90 at revision `runtimeRevision` of `runtimeVersion` refuses this Studio with, naming `olderSide`. */
function mismatchRecord(olderSide: "runtime" | "client", runtimeVersion: number, runtimeRevision: number): ControlContractVersionMismatch {
  return {
    client_contract_version: CONTROL_CONTRACT_VERSION,
    runtime_contract_version: runtimeVersion,
    client_contract_revision: CONTROL_CONTRACT_REVISION,
    runtime_contract_revision: runtimeRevision,
    older_side: olderSide,
    runtime_version: "0.68.90",
  };
}

/** The contract age read from the local API at `localApiSocketPath`, for a runtime that runs as `howTheRuntimeRuns` says. */
function contractAgeReadAt(localApiSocketPath: string, howTheRuntimeRuns: HowTheRunningRuntimeRuns = "not_started_by_the_app"): Promise<RuntimeContractAgeReading> {
  return Effect.runPromise(readTheRuntimesContractAge(howTheRuntimeRuns).pipe(Effect.provide(runtimeControlLayer(localApiSocketPath, 2_000))));
}

async function controlWebSocketRuntime(answerCall: FakeControlWebSocketAnswer, answerDiscover?: FakeControlWebSocketAnswer, answersTheClose = true) {
  const runtime = await fakeControlWebSocketRuntime(answerCall, answerDiscover, { answersTheClose });
  cleanUps.push(() => runtime.close());
  return runtime;
}

function runtimeOfAnotherAgeIn(reading: RuntimeContractAgeReading): RuntimeOfAnotherAge {
  if (reading.kind !== "of_another_age") return expect.unreachable(`expected a runtime of another age, read ${JSON.stringify(reading)}`);
  return reading.runtimeOfAnotherAge;
}

test("a runtime serving this Studio's contract agrees, and its connection is closed again", async () => {
  const runtime = await controlWebSocketRuntime(() => null);

  expect(await contractAgeReadAt(runtime.localApiSocketPath)).toEqual({ kind: "agrees" });
  const upgradeHeadLines = (runtime.upgradeRequestsRead[0] ?? "").toLowerCase().split("\r\n");
  expect(upgradeHeadLines).toContain(`tatolab-control-contract-revision: ${CONTROL_CONTRACT_REVISION}`);
});

test("a runtime that never answers the close still answers the reading at once, so the status round is not held up", async () => {
  const runtime = await controlWebSocketRuntime(() => null, undefined, false);

  const readingStartedAtMs = performance.now();
  expect(await contractAgeReadAt(runtime.localApiSocketPath)).toEqual({ kind: "agrees" });
  expect(performance.now() - readingStartedAtMs).toBeLessThan(1_000);
});

test("an older runtime refusing the upgrade with its record in the 409 body is the runtime of another age that record names", async () => {
  const server = await fakeLocalApiServerAnswering([httpResponse("409 Conflict", "application/json", JSON.stringify(mismatchRecord("runtime", CONTROL_CONTRACT_VERSION - 1, 4)))]);

  const reading = await contractAgeReadAt(server.localApiSocketPath);

  expect(runtimeOfAnotherAgeIn(reading)).toEqual<RuntimeOfAnotherAge>({
    older_side: "runtime",
    runtime_version: "0.68.90",
    runtime_contract: { version: CONTROL_CONTRACT_VERSION - 1, revision: 4 },
    studio_contract: { version: CONTROL_CONTRACT_VERSION, revision: CONTROL_CONTRACT_REVISION },
    remedy: "quit_the_running_runtime",
  });
  expect(reading.kind === "of_another_age" && reading.runtimeWords).toMatch(/^the runtime is older than this client: .*release 0\.68\.90/);
});

test("a newer runtime refusing discover with its record names this Studio the older side, to be updated", async () => {
  const runtime = await controlWebSocketRuntime(
    () => null,
    (call) => [JSON.stringify({ jsonrpc: "2.0", id: call["id"], error: { code: CONTROL_CONTRACT_VERSION_MISMATCH_ERROR_CODE, message: "refused", data: mismatchRecord("client", CONTROL_CONTRACT_VERSION + 1, 0) } })],
  );

  expect(runtimeOfAnotherAgeIn(await contractAgeReadAt(runtime.localApiSocketPath))).toEqual<RuntimeOfAnotherAge>({
    older_side: "studio",
    runtime_version: "0.68.90",
    runtime_contract: { version: CONTROL_CONTRACT_VERSION + 1, revision: 0 },
    studio_contract: { version: CONTROL_CONTRACT_VERSION, revision: CONTROL_CONTRACT_REVISION },
    remedy: "update_studio",
  });
});

test("a runtime from before the contract had a revision is named older, at revision 0 of this Studio's version, with the release it describes", async () => {
  const runtime = await controlWebSocketRuntime(
    (call) => (call["method"] === "describe_runtime" ? [resultLine(call["id"], { version: "0.68.82", build_id: "0.68.82+abc.1", up_for_ms: 1 })] : null),
    (call) => [
      JSON.stringify({
        jsonrpc: "2.0",
        id: call["id"],
        error: {
          code: -32602,
          message: "unknown field `contract_revision`, expected `contract_version`",
          data: { refusal_code: "params_do_not_match_schema", action: "discover", runtime_words: "unknown field `contract_revision`, expected `contract_version`", refused_params_pointer: "/contract_revision" },
        },
      }),
    ],
  );

  expect(runtimeOfAnotherAgeIn(await contractAgeReadAt(runtime.localApiSocketPath, "the_app_carries_none"))).toEqual<RuntimeOfAnotherAge>({
    older_side: "runtime",
    runtime_version: "0.68.82",
    runtime_contract: { version: CONTROL_CONTRACT_VERSION, revision: 0 },
    studio_contract: { version: CONTROL_CONTRACT_VERSION, revision: CONTROL_CONTRACT_REVISION },
    remedy: "update_the_runtime",
  });
});

test("an upgrade refused with words alone is not read as an age, so it is read again", async () => {
  const server = await fakeLocalApiServerAnswering([httpResponse("409 Conflict", "text/plain", "contract version 2 is not served")]);

  const reading = await contractAgeReadAt(server.localApiSocketPath);

  expect(reading.kind).toBe("unread");
  expect(reading.kind === "unread" && reading.why).toMatch(/HTTP 409\): contract version 2 is not served/);
});

test("no runtime at the socket leaves the age unread", async () => {
  const socketDirectory = await mkdtemp("/tmp/tl-app-");
  cleanUps.push(() => rm(socketDirectory, { recursive: true, force: true }));

  const reading = await contractAgeReadAt(path.join(socketDirectory, "local-api.sock"));

  expect(reading.kind).toBe("unread");
  expect(reading.kind === "unread" && reading.why).toMatch(/^no runtime answers at /);
});

test("the answering runtime is named by its build and its machine by describe_runtime, in one POST /control", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-runtime-tool-result-of-a-test-root-runtime.json")),
  ]);

  expect(await server.run(readTheAnsweringRuntime())).toEqual({
    ok: true,
    value: { identity: "build 0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60", machineName: { ok: true, value: "vm" } },
  });
  expect(server.receivedRequests().map((request) => request.split("\r\n")[0])).toEqual(["POST /control HTTP/1.1"]);
  expect(server.receivedRequests()[0]).toContain('"method":"describe_runtime"');
});

test("a describe_runtime answer naming no machine is not the contract's answer, in the client's words, and names no runtime", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResultResponse({ version: "0.55.1", build_id: "0.55.1+0123abc.9f8e7d", up_for_ms: 5, runtime_log_directory: null })]);

  const read = await server.run(readTheAnsweringRuntime());

  expect(read).toMatchObject({
    ok: true,
    value: {
      identity: null,
      machineName: {
        ok: false,
        failure: {
          _tag: "ContractMismatch",
          operation: "describe_runtime",
          words: expect.stringMatching(/^the runtime's answer to `describe_runtime` is not the contract's `DescribeRuntimeToolResult`: .*machine/),
        },
      },
    },
  });
  expect(server.receivedRequests().map((request) => request.split("\r\n")[0])).toEqual(["POST /control HTTP/1.1"]);
});

test("a runtime refusing this Studio's contract is named by its release and contract, and names no machine", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse(
      "200 OK",
      "application/json",
      JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: CONTROL_CONTRACT_VERSION_MISMATCH_ERROR_CODE, message: "refused", data: mismatchRecord("runtime", CONTROL_CONTRACT_VERSION, 0) } }),
    ),
  ]);

  const read = await server.run(readTheAnsweringRuntime());

  expect(read).toMatchObject({
    ok: true,
    value: { identity: `release 0.68.90 at contract ${CONTROL_CONTRACT_VERSION}.0`, machineName: { ok: false, failure: { _tag: "RuntimeOfAnotherContract" } } },
  });
});

describe("remedyForTheOlderSide", () => {
  test("an older Studio is updated, however the runtime runs", () => {
    for (const howTheRuntimeRuns of ["started_by_the_app", "not_started_by_the_app", "the_app_carries_none"] as const) {
      expect(remedyForTheOlderSide("studio", howTheRuntimeRuns)).toBe("update_studio");
    }
  });

  test("an older runtime is quit when the app did not start it, updated with the Studio when it did, and updated itself when the app carries none", () => {
    expect(remedyForTheOlderSide("runtime", "not_started_by_the_app")).toBe("quit_the_running_runtime");
    expect(remedyForTheOlderSide("runtime", "started_by_the_app")).toBe("update_studio");
    expect(remedyForTheOlderSide("runtime", "the_app_carries_none")).toBe("update_the_runtime");
  });
});
