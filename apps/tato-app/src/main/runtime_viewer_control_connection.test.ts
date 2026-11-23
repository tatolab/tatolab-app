import { Effect, Exit, Layer, ManagedRuntime, Result as EffectResult, Scope } from "effect";
import { afterEach, expect, test } from "vitest";
import { fakeRuntimeOfConnections, refusedByTheOperation } from "./control_connection_test_support.js";
import { fakeControlWebSocketRuntime as fakeControlWebSocketRuntimeOnASocket, resultLine, type FakeControlWebSocketAnswer } from "./fake_control_websocket_runtime.js";
import { RuntimeOfAnotherContract, RuntimeRefused, RuntimeTimedOut } from "./runtime_control_failures.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { answerOf, failureOf, recordedResponseBody } from "./runtime_operations_test_support.js";
import { resultOf } from "./result_as_effect.js";
import type { Result } from "./result.js";
import { closedViewerFromTheCloseViewerToolResult, openedRuntimeViewerFromTheOpenViewerToolResult, runtimeViewerConnectionOpenedIn, type RuntimeViewerConnection } from "./runtime_viewer_control_connection.js";
import { LINUX_VIEWER, OPEN_VIEWER_RESULT_ON_LINUX } from "./runtime_viewer_test_support.js";
import { RuntimeConnectionsForPortViewers, runtimeConnectionsForPortViewersLayerOver, tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { createTatolabAppLog, type TatolabAppLog } from "./tatolab_app_log.js";
import type { ControlOperationResult, RuntimeControl } from "./tatolab_runtime_control_operation_call.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

/** A fake `/control/ws` runtime answering each call after `discover` with `answerCall`, closed after the test. */
async function fakeControlWebSocketRuntime(answerCall: FakeControlWebSocketAnswer) {
  const runtime = await fakeControlWebSocketRuntimeOnASocket(answerCall);
  cleanUps.push(() => runtime.close());
  return runtime;
}

/** `OPEN_VIEWER_RESULT_ON_LINUX` as the contract types `open_viewer`'s answer: the same fields, as JSON carries them. */
const openViewerAnsweredOnLinux = (): ControlOperationResult<"open_viewer"> => JSON.parse(JSON.stringify(OPEN_VIEWER_RESULT_ON_LINUX));

const A_TARGET = { stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 4242 };

/** Why a call came back without an answer, as a port viewer reads it. */
type RuntimeViewerCallFailure = { words: string; theRuntimeRefusedIt: boolean };

/** `call` run to its answer, or its failure's words and whether the runtime refused it. */
function settled<Value>(call: Effect.Effect<Value, { readonly words: string; readonly theRuntimeRefusedIt: boolean }>): Promise<Result<Value, RuntimeViewerCallFailure>> {
  return Effect.runPromise(resultOf(Effect.mapError(call, ({ words, theRuntimeRefusedIt }) => ({ words, theRuntimeRefusedIt }))));
}

/** Each reason the connection gave for closing, as it closes, by `whyItClosed`. */
function whyEachClosed(connection: RuntimeViewerConnection, label = ""): string[] {
  const reasons: string[] = [];
  Effect.runFork(Effect.map(connection.whyItClosed, (why) => reasons.push(`${label}${why}`)));
  return reasons;
}

const isOpenNow = (connection: RuntimeViewerConnection) => Effect.runSync(connection.isOpen);

/** A connection port viewers are opened over, opened over `runtimeControl` in a scope closed after the test, which the test can close first. */
async function openedOver(runtimeControl: Layer.Layer<RuntimeControl>, appLog = createTatolabAppLog("error", () => {})) {
  const outerScope = await Effect.runPromise(Scope.make());
  cleanUps.push(() => Effect.runPromise(Scope.close(outerScope, Exit.void)));
  const opened = await Effect.runPromise(
    Effect.result(runtimeViewerConnectionOpenedIn(outerScope)).pipe(Effect.provide(Layer.merge(runtimeControl, tatolabAppLogAsEffectsLogger(appLog)))),
  );
  return { opened, outerScope };
}

async function connectionOver(runtimeControl: Layer.Layer<RuntimeControl>, appLog?: TatolabAppLog): Promise<{ connection: RuntimeViewerConnection; outerScope: Scope.Closeable }> {
  const { opened, outerScope } = await openedOver(runtimeControl, appLog);
  return EffectResult.isSuccess(opened) ? { connection: opened.success, outerScope } : expect.unreachable(opened.failure.words);
}

test("the_connection_upgrades_control_ws_by_the_apps_name_and_opens_a_viewer_with_open_viewer", async () => {
  const runtime = await fakeControlWebSocketRuntime((call) => [resultLine(call["id"], OPEN_VIEWER_RESULT_ON_LINUX)]);
  const { connection } = await connectionOver(runtimeControlLayer(runtime.localApiSocketPath, 2_000));

  const openedViewer = answerOf(await settled(connection.openViewer(A_TARGET)));

  expect(openedViewer).toEqual(LINUX_VIEWER);
  const upgradeHeadLines = (runtime.upgradeRequestsRead[0] ?? "").toLowerCase().split("\r\n");
  expect(upgradeHeadLines[0]).toBe("get /control/ws http/1.1");
  expect(upgradeHeadLines).toContain("tatolab-control-client-name: tatolab-app");
  expect(runtime.callsRead).toEqual([
    { jsonrpc: "2.0", id: expect.anything(), method: "open_viewer", params: { stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 4242 } },
  ]);
});

test("a_viewer_of_a_port_whose_open_viewer_answers_no_pin_type_opens_with_none", async () => {
  const { pin_type: _pinType, ...answeredWithNoPinType } = OPEN_VIEWER_RESULT_ON_LINUX;
  const runtime = await fakeControlWebSocketRuntime((call) => [resultLine(call["id"], answeredWithNoPinType)]);
  const { connection } = await connectionOver(runtimeControlLayer(runtime.localApiSocketPath, 2_000));

  expect(answerOf(await settled(connection.openViewer(A_TARGET)))).toEqual({ ...LINUX_VIEWER, pin_type: null });
});

test("a_viewer_whose_open_viewer_answers_a_pin_type_that_is_none_is_not_opened_and_is_not_the_runtimes_refusal", async () => {
  const answeredWithAnUnknownPinType = JSON.parse(JSON.stringify({ ...OPEN_VIEWER_RESULT_ON_LINUX, pin_type: { type: "colour_wheel" } }));
  const { connection } = await connectionOver(fakeRuntimeOfConnections({ open_viewer: () => Effect.succeed(answeredWithAnUnknownPinType) }).layer);

  const notOpened = failureOf(await settled(connection.openViewer(A_TARGET)));

  expect(notOpened.theRuntimeRefusedIt).toBe(false);
  expect(notOpened.words).toMatch(/the runtime's open_viewer result could not be read: its pin_type is not a pin type: /);
});

test("a_viewer_of_a_float_output_opens_with_the_pin_type_a_real_open_viewer_answered", async () => {
  const recorded: unknown = JSON.parse(await recordedResponseBody("control-ws-open-viewer-result-of-the-float-output-count-of-counter.json"));
  const recordedResult = typeof recorded === "object" && recorded !== null && "result" in recorded ? recorded.result : null;
  const runtime = await fakeControlWebSocketRuntime((call) => [resultLine(call["id"], recordedResult)]);
  const { connection } = await connectionOver(runtimeControlLayer(runtime.localApiSocketPath, 2_000));

  const openedViewer = answerOf(await settled(connection.openViewer({ stream: "facts-main-c8b289", node_id: "a8b2e1f2-21c8-48e1-89f8-de081cbdabc9", port: "count", viewer_process_id: 4242 })));

  expect(openedViewer).toMatchObject({ node_name: "counter", port: "count", pin_type: { type: "float" }, viewer_reads: "latest_message" });
});

test("a_viewer_and_a_close_are_called_on_the_one_connection_opened", async () => {
  const runtime = fakeRuntimeOfConnections({ open_viewer: () => Effect.succeed(openViewerAnsweredOnLinux()), close_viewer: ({ viewer }) => Effect.succeed({ viewer }) });
  const { connection } = await connectionOver(runtime.layer);

  const [openedViewer, closedViewer] = await Promise.all([settled(connection.openViewer(A_TARGET)), settled(connection.closeViewer("s/b/out"))]);

  expect(answerOf(openedViewer).viewer).toBe("pattern-main-1a2b3c/7f3a/video");
  expect(answerOf(closedViewer)).toBe("s/b/out");
  expect(runtime.connectionsOpened).toHaveLength(1);
  expect(runtime.connectionsOpened[0]?.callsMade).toEqual([
    ["open_viewer", { stream: "pattern-main-1a2b3c", node_id: "7f3a", port: "video", viewer_process_id: 4242 }],
    ["close_viewer", { viewer: "s/b/out" }],
  ]);
});

test("a_viewer_the_operation_refuses_is_the_runtimes_refusal_in_its_own_words", async () => {
  const refusal = "open_viewer failed: node `pattern` of stream `pattern-main-1a2b3c` is not running";
  const { connection } = await connectionOver(fakeRuntimeOfConnections({ open_viewer: () => Effect.fail(refusedByTheOperation("open_viewer", refusal)) }).layer);

  expect(failureOf(await settled(connection.openViewer(A_TARGET)))).toEqual<RuntimeViewerCallFailure>({ words: refusal, theRuntimeRefusedIt: true });
});

test("an_answer_that_cannot_be_read_and_a_runtime_that_does_not_answer_are_not_the_runtimes_refusal", async () => {
  const { connection } = await connectionOver(
    fakeRuntimeOfConnections({
      open_viewer: () => Effect.succeed(JSON.parse("{}")),
      close_viewer: () => Effect.fail(new RuntimeTimedOut({ operation: "close_viewer", words: "`close_viewer` did not answer within 5s" })),
    }).layer,
  );

  const unreadable = failureOf(await settled(connection.openViewer(A_TARGET)));
  expect(unreadable.theRuntimeRefusedIt).toBe(false);
  expect(unreadable.words).toMatch(/the runtime's open_viewer result could not be read/);
  expect(failureOf(await settled(connection.closeViewer("a/b/c")))).toEqual<RuntimeViewerCallFailure>({ words: "`close_viewer` did not answer within 5s", theRuntimeRefusedIt: false });
  expect(isOpenNow(connection)).toBe(true);
});

test("a_call_that_breaks_is_logged_and_answered_as_a_failure", async () => {
  const errorsLogged: string[] = [];
  const appLog = createTatolabAppLog("error", (line) => errorsLogged.push(line));
  const { connection } = await connectionOver(fakeRuntimeOfConnections({ close_viewer: () => Effect.die(new Error("the socket broke")) }).layer, appLog);

  const failure = failureOf(await settled(connection.closeViewer("a/b/c")));

  expect(failure).toEqual<RuntimeViewerCallFailure>({ words: "`close_viewer` broke: the socket broke", theRuntimeRefusedIt: false });
  expect(errorsLogged.join("\n")).toMatch(/a port viewer's close_viewer broke/);
});

test("no_runtime_answering_fails_to_open_in_the_words_of_why", async () => {
  const runtime = fakeRuntimeOfConnections({});
  runtime.runtime.answers = false;

  const { opened } = await openedOver(runtime.layer);

  expect(EffectResult.isFailure(opened) ? opened.failure.words : expect.unreachable("it opened")).toBe("no runtime answers at /tmp/local-api.sock");
});

test("the_runtime_closing_the_connection_tells_each_listener_once_and_closes_it", async () => {
  const runtime = fakeRuntimeOfConnections({});
  const { connection } = await connectionOver(runtime.layer);
  const whyItClosed = whyEachClosed(connection);

  runtime.connectionsOpened[0]?.closeFromTheRuntime();

  await expect.poll(() => runtime.connectionsOpened[0]?.closedByTheApp).toBe(true);
  expect(whyItClosed).toEqual(["the runtime closed the /control/ws connection"]);
  expect(isOpenNow(connection)).toBe(false);
  expect(await Effect.runPromise(connection.whyItClosed)).toBe("the runtime closed the /control/ws connection");
});

test("closing_the_connection_or_the_scope_it_was_opened_in_closes_it_and_tells_the_listeners", async () => {
  const runtime = fakeRuntimeOfConnections({});
  const closedByTheApp = await connectionOver(runtime.layer);
  const closedWithItsScope = await connectionOver(runtime.layer);
  const closedByTheAppBecause = whyEachClosed(closedByTheApp.connection, "by the app: ");
  const closedWithItsScopeBecause = whyEachClosed(closedWithItsScope.connection, "with its scope: ");

  await Effect.runPromise(closedByTheApp.connection.close);
  expect(isOpenNow(closedByTheApp.connection)).toBe(false);
  await expect.poll(() => closedByTheAppBecause).toEqual(["by the app: the port viewers' /control/ws connection was closed"]);
  await Effect.runPromise(Scope.close(closedWithItsScope.outerScope, Exit.void));

  await expect.poll(() => runtime.connectionsOpened.map((connection) => connection.closedByTheApp)).toEqual([true, true]);
  await expect.poll(() => closedWithItsScopeBecause).toEqual(["with its scope: the port viewers' /control/ws connection was closed"]);
  expect(isOpenNow(closedByTheApp.connection)).toBe(false);
  expect(isOpenNow(closedWithItsScope.connection)).toBe(false);
});

test("only_the_operations_own_refusal_is_the_runtimes_refusal_a_port_viewer_waits_out", async () => {
  const { connection } = await connectionOver(
    fakeRuntimeOfConnections({
      open_viewer: () => Effect.fail(new RuntimeRefused({ operation: "open_viewer", words: "invalid params", byTheOperation: false, refusal: undefined })),
      close_viewer: () => Effect.fail(new RuntimeOfAnotherContract({ operation: "close_viewer", words: "the runtime serves another contract", mismatch: JSON.parse("{}") })),
    }).layer,
  );

  expect(failureOf(await settled(connection.openViewer(A_TARGET)))).toEqual<RuntimeViewerCallFailure>({ words: "invalid params", theRuntimeRefusedIt: false });
  expect(failureOf(await settled(connection.closeViewer("a/b/c")))).toEqual<RuntimeViewerCallFailure>({ words: "the runtime serves another contract", theRuntimeRefusedIt: false });
});

test("a_call_awaiting_its_answer_and_a_call_after_the_runtime_closed_the_connection_fail_without_a_refusal", async () => {
  const runtime = await fakeControlWebSocketRuntime(() => null);
  const { connection } = await connectionOver(runtimeControlLayer(runtime.localApiSocketPath, 2_000));
  const whyItClosed = whyEachClosed(connection);

  const awaitingItsAnswer = settled(connection.openViewer(A_TARGET));
  await expect.poll(() => runtime.callsRead.length).toBe(1);
  runtime.closeEveryConnection();

  expect(failureOf(await awaitingItsAnswer).theRuntimeRefusedIt).toBe(false);
  await expect.poll(() => whyItClosed).toEqual([`the runtime at ${runtime.localApiSocketPath} closed the /control/ws connection`]);
  expect(isOpenNow(connection)).toBe(false);
  expect(failureOf(await settled(connection.closeViewer("s/n/p"))).theRuntimeRefusedIt).toBe(false);
});

test("the_studio_runtimes_connections_log_a_call_that_breaks_and_close_as_it_is_disposed", async () => {
  const linesLogged: string[] = [];
  const runtime = fakeRuntimeOfConnections({ close_viewer: () => Effect.die(new Error("the socket broke")) });
  const studioRuntime = ManagedRuntime.make(runtimeConnectionsForPortViewersLayerOver(runtime.layer, createTatolabAppLog("error", (line) => linesLogged.push(line))));
  cleanUps.push(() => studioRuntime.dispose());
  const connection = await studioRuntime.runPromise(RuntimeConnectionsForPortViewers.use((connections) => connections.open));
  const whyItClosed = whyEachClosed(connection);

  expect(failureOf(await settled(connection.closeViewer("a/b/c"))).words).toBe("`close_viewer` broke: the socket broke");
  expect(linesLogged.join("\n")).toMatch(/a port viewer's close_viewer broke/);
  await studioRuntime.dispose();

  await expect.poll(() => whyItClosed).toEqual(["the port viewers' /control/ws connection was closed"]);
  expect(whyItClosed).toEqual(["the port viewers' /control/ws connection was closed"]);
  expect(runtime.connectionsOpened[0]?.closedByTheApp).toBe(true);
});


test("an_open_viewer_result_on_macos_without_a_viewer_process_names_no_surface_share_address", () => {
  const { surface_share_address: _surfaceShareAddress, ...withoutSurfaceShareAddress } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(answerOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutSurfaceShareAddress))).toEqual({ ...LINUX_VIEWER, surface_share_address: null });
});

test("an_open_viewer_result_missing_its_channel_cannot_be_read", () => {
  const { channel: _channel, ...withoutChannel } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(failureOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutChannel))).toMatch(/^the runtime's open_viewer result could not be read: .*channel/);
  expect(failureOf(closedViewerFromTheCloseViewerToolResult({}))).toMatch(/^the runtime's close_viewer result could not be read: /);
});

test("an_open_viewer_result_missing_its_wake_service_cannot_be_read", () => {
  const { wake_service: _wakeService, ...withoutWakeService } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(failureOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutWakeService))).toMatch(/^the runtime's open_viewer result could not be read: .*wake_service/);
});
