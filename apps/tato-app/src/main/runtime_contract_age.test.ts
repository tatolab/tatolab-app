import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { CONTROL_CONTRACT_REVISION, CONTROL_CONTRACT_VERSION, CONTROL_CONTRACT_VERSION_MISMATCH_ERROR_CODE, type ControlContractVersionMismatch } from "@tatolab/runtime-client";
import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";
import type { RuntimeOfAnotherAge } from "../shared/tatolab_backend_contract.js";
import { fakeControlWebSocketRuntime, resultLine, type FakeControlWebSocketAnswer } from "./fake_control_websocket_runtime.js";
import { FakeLocalApiServer, httpResponse } from "./fake_local_api_server.js";
import { readTheRuntimesContractAge, remedyForTheOlderSide, type HowTheRunningRuntimeRuns, type RuntimeContractAgeReading } from "./runtime_contract_age.js";
import { runtimeControlLayer } from "./tatolab_runtime_control_operation_call.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

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

async function controlWebSocketRuntime(answerCall: FakeControlWebSocketAnswer, answerDiscover?: FakeControlWebSocketAnswer) {
  const runtime = await fakeControlWebSocketRuntime(answerCall, answerDiscover);
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

test("an older runtime refusing the upgrade with its record in the 409 body is the runtime of another age that record names", async () => {
  const server = await FakeLocalApiServer.answering([httpResponse("409 Conflict", "application/json", JSON.stringify(mismatchRecord("runtime", CONTROL_CONTRACT_VERSION - 1, 4)))]);
  cleanUps.push(() => server.close());

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
  const server = await FakeLocalApiServer.answering([httpResponse("409 Conflict", "text/plain", "contract version 2 is not served")]);
  cleanUps.push(() => server.close());

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
