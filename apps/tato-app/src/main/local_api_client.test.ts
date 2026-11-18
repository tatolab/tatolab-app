import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { CONTROL_CONTRACT_REVISION, CONTROL_CONTRACT_VERSION, CONTROL_CONTRACT_VERSION_MISMATCH_ERROR_CODE } from "@tatolab/runtime-client";
import { Effect } from "effect";
import { afterEach, expect, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse, httpResponse, controlOperationFailedResponse, controlOperationResultResponse } from "./fake_local_api_server.js";
import { LocalApiClient, runtimeDescriptionFromTheDescribeRuntimeToolResult } from "./local_api_client.js";
import { httpRequestBytes, parseHttpResponse } from "./local_api_plain_http.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { describeNodeCatalog, describeStreamGraph, listProjectAssets, listProjectNodeTypes, readProjectLogRecords } from "./runtime_operations.js";
import { TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";
import { streamActionChangesConnectionOver } from "./stream_action_changes_followed_for_the_status.js";
import { answerOf, cleanUps, cleanUpWhatTheTestStarted, failureOf, fakeLocalApiServerAnswering, headAndBodyOf, recordedResponseBody } from "./local_api_client_test_support.js";

afterEach(cleanUpWhatTheTestStarted);

async function shortTemporarySocketPath(): Promise<string> {
  const socketDirectory = await mkdtemp("/tmp/tl-app-");
  cleanUps.push(() => rm(socketDirectory, { recursive: true, force: true }));
  return path.join(socketDirectory, "local-api.sock");
}

/** `describe_runtime`'s result as streamlib's wire-text test writes it, with and without the runtime's own log. */
const DESCRIBE_RUNTIME_WIRE_TEXT_WITH_A_LOG_FOLDER =
  '{"version":"0.55.1","build_id":"0.55.1+0123abc.9f8e7d","up_for_ms":266400000,"runtime_log_directory":"/home/u/.local/state/tatolab/logs"}';

const DESCRIBE_RUNTIME_WIRE_TEXT_WITHOUT_A_LOG_FOLDER =
  '{"version":"0.55.1","build_id":"0.55.1+0123abc.9f8e7d","up_for_ms":266400000,"runtime_log_directory":null}';

/** Against a real runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> npx vitest run src/main/local_api_client.test.ts`. */
const noLiveRuntimeSocketIsNamed = !process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"];

test("a_runtime_answering_ok_is_healthy", async () => {
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "text/plain; charset=utf-8", "ok")]);

  answerOf(await server.client().checkHealth());

  const request = server.receivedRequests()[0];
  expect(request?.startsWith("GET /health HTTP/1.1\r\nHost: localhost\r\n"), request).toBe(true);
  expect(request).toContain("Connection: close\r\n");
  expect(request).not.toContain("Content-Length");
});

test("nothing_listening_names_the_socket", async () => {
  const socketPath = await shortTemporarySocketPath();

  const failure = failureOf(await new LocalApiClient(socketPath, 1_000).checkHealth());

  expect(failure.failureDescription).toContain(socketPath);
});

test("a_runtime_that_never_answers_times_out", async () => {
  const socketPath = await shortTemporarySocketPath();
  const connectionsNeverAnswered: net.Socket[] = [];
  const listenerThatNeverAnswers = net.createServer((connection) => connectionsNeverAnswered.push(connection));
  await new Promise<void>((listening) => listenerThatNeverAnswers.listen(socketPath, listening));
  cleanUps.push(() => {
    connectionsNeverAnswered.forEach((connection) => connection.destroy());
    return new Promise<void>((closed) => listenerThatNeverAnswers.close(() => closed()));
  });

  const failure = failureOf(await new LocalApiClient(socketPath, 200).checkHealth());

  expect(failure.failureDescription).toContain("did not answer within");
});

test("listing_streams_posts_list_streams_to_control_with_the_contract_version_and_the_apps_name", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResultResponse({ streams: [] })]);

  expect(answerOf(await server.client().listStreams())).toEqual([]);

  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head.startsWith("POST /control HTTP/1.1\r\n"), head).toBe(true);
  const headLines = head.toLowerCase().split("\r\n");
  for (const requiredHeader of [
    "content-type: application/json",
    `tatolab-control-contract-version: ${CONTROL_CONTRACT_VERSION}`,
    "tatolab-control-client-name: tatolab-app",
    `content-length: ${Buffer.byteLength(body)}`,
  ]) {
    expect(headLines, `${requiredHeader} missing`).toContain(requiredHeader);
  }
  expect(JSON.parse(body)).toEqual({ jsonrpc: "2.0", id: 1, method: "list_streams", params: {} });
});

test("describing_the_runtime_calls_describe_runtime_with_no_arguments_and_reads_its_four_fields", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResultResponse(JSON.parse(DESCRIBE_RUNTIME_WIRE_TEXT_WITH_A_LOG_FOLDER))]);

  expect(answerOf(await server.client().describeRuntime())).toEqual({
    version: "0.55.1",
    build_id: "0.55.1+0123abc.9f8e7d",
    up_for_ms: 266_400_000,
    runtime_log_directory: "/home/u/.local/state/tatolab/logs",
  });
  const [, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(JSON.parse(body).method).toBe("describe_runtime");
  expect(JSON.parse(body)).toMatchObject({ jsonrpc: "2.0", method: "describe_runtime", params: {} });
});

test("a_real_describe_runtime_result_reads_its_version_build_uptime_and_log_folder", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-runtime-tool-result-of-a-test-root-runtime.json")),
  ]);

  expect(answerOf(await server.client().describeRuntime())).toEqual({
    version: "0.55.2",
    build_id: "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60",
    up_for_ms: 10_007,
    runtime_log_directory: "/tmp/tatolab-proof/state/logs",
  });
});

test("a_runtime_keeping_no_own_log_describes_its_log_folder_as_null", () => {
  expect(answerOf(runtimeDescriptionFromTheDescribeRuntimeToolResult(JSON.parse(DESCRIBE_RUNTIME_WIRE_TEXT_WITHOUT_A_LOG_FOLDER))).runtime_log_directory).toBeNull();
});

test("a_describe_runtime_result_missing_a_field_is_refused_naming_it", () => {
  expect(failureOf(runtimeDescriptionFromTheDescribeRuntimeToolResult(JSON.parse('{"version":"0.55.1","up_for_ms":5,"runtime_log_directory":null}')))).toBe(
    "the runtime's describe_runtime result could not be read: missing field `build_id`",
  );
});

test("an_operation_the_runtime_does_not_serve_is_refused_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-control-refusal-for-an-operation-this-runtime-does-not-serve.json")),
  ]);

  expect(failureOf(await server.client().describeRuntime())).toEqual({
    failureDescription: "the runtime refused `describe_runtime`: the runtime serves no operation named `describe_runtime_of_a_later_runtime`",
    isTheRuntimesRefusal: true,
  });
});

test("a_refused_rest_request_carries_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("500 Internal Server Error", "application/json", '{"error":"graph export failed: the engine is shutting down"}'),
  ]);

  expect(failureOf(await server.client().machineName()).failureDescription).toBe("graph export failed: the engine is shutting down");
});

test("a_runtime_serving_another_contract_version_is_refused_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-control-refusal-for-a-client-of-contract-version-1.json")),
  ]);

  expect(failureOf(await server.client().listStreams())).toEqual({
    failureDescription: "the runtime refused `list_streams`: the client was built against control contract version 1, and this runtime serves version 2",
    isTheRuntimesRefusal: true,
  });
});

test("a_runtime_refusing_the_studios_contract_with_its_record_is_refused_in_the_words_of_that_record", async () => {
  const mismatch = {
    client_contract_version: CONTROL_CONTRACT_VERSION,
    runtime_contract_version: CONTROL_CONTRACT_VERSION,
    client_contract_revision: CONTROL_CONTRACT_REVISION,
    runtime_contract_revision: CONTROL_CONTRACT_REVISION + 1,
    older_side: "client",
    runtime_version: "0.70.1",
  };
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: CONTROL_CONTRACT_VERSION_MISMATCH_ERROR_CODE, message: "refused", data: mismatch } })),
  ]);

  const failure = failureOf(await server.client().listStreams());

  expect(failure.isTheRuntimesRefusal).toBe(true);
  expect(failure.failureDescription).toBe(
    `this client is older than the runtime: it was built against control contract version ${CONTROL_CONTRACT_VERSION} revision ${CONTROL_CONTRACT_REVISION}, and the runtime (release 0.70.1) serves version ${CONTROL_CONTRACT_VERSION} revision ${CONTROL_CONTRACT_REVISION + 1}; take the client the runtime carries`,
  );
});

test("an_operation_that_ran_and_failed_is_reported_with_its_words", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationFailedResponse("the stream action did not finish")]);

  expect(failureOf(await server.client().listStreams()).failureDescription).toBe("the stream action did not finish");
});

test("a_chunked_response_is_dechunked", async () => {
  const server = await fakeLocalApiServerAnswering([Buffer.from("HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n1\r\no\r\n1;ext=1\r\nk\r\n0\r\n\r\n")]);

  answerOf(await server.client().checkHealth());
});

test.skipIf(noLiveRuntimeSocketIsNamed)("a_real_runtime_answers_health_its_description_its_streams_their_graphs_and_node_catalogs_logs_node_types_assets_and_dependencies_and_its_machine_name", async () => {
  const liveLocalApiSocketPath = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "";
  const client = new LocalApiClient(liveLocalApiSocketPath, 5_000);
  const liveRuntimeControl = runtimeControlLayer(liveLocalApiSocketPath, 5_000);

  answerOf(await client.checkHealth());
  const runtimeDescription = answerOf(await client.describeRuntime());
  expect(runtimeDescription.build_id.startsWith(`${runtimeDescription.version}+`)).toBe(true);
  expect(runtimeDescription.up_for_ms).toBeGreaterThan(0);
  const streams = answerOf(await client.listStreams());
  expect(answerOf(await client.machineName())).not.toBe("");
  for (const loadedStream of streams.filter((listedStream) => listedStream.node_count !== null)) {
    const graph = await Effect.runPromise(describeStreamGraph(loadedStream.stream).pipe(Effect.provide(liveRuntimeControl)));
    expect(graph.stream).toBe(loadedStream.stream);
    expect(graph.graph_document_text.startsWith("{\n")).toBe(true);
    const nodeCatalog = await Effect.runPromise(describeNodeCatalog(loadedStream.stream).pipe(Effect.provide(liveRuntimeControl)));
    expect(nodeCatalog.node_types.length).toBeGreaterThan(0);
  }
  for (const projectDirectory of new Set(streams.flatMap((listedStream) => (listedStream.location === null ? [] : [listedStream.location.project_directory])))) {
    const projectStreams = streams.filter((listedStream) => listedStream.location?.project_directory === projectDirectory);
    const nodeTypeListing = await Effect.runPromise(listProjectNodeTypes(projectDirectory).pipe(Effect.provide(liveRuntimeControl)));
    answerOf(await client.listDependencies(projectDirectory, false));
    expect(nodeTypeListing.sources[0]?.origin).toEqual({ source: "project" });
    const assetListing = await Effect.runPromise(listProjectAssets(projectDirectory).pipe(Effect.provide(liveRuntimeControl)));
    expect(assetListing.assets.filter((asset) => asset.kind === "stream").length).toBeGreaterThanOrEqual(projectStreams.length);
    for (const previewedAsset of assetListing.assets.filter((asset) => asset.preview !== null)) {
      const picture = answerOf(await client.readAssetPreview(projectDirectory, previewedAsset.asset));
      expect([picture.pixel_width, picture.pixel_height, picture.media_type]).toEqual([previewedAsset.preview?.pixel_width, previewedAsset.preview?.pixel_height, previewedAsset.preview?.media_type]);
    }
    const wholeLog = await Effect.runPromise(readProjectLogRecords(projectDirectory, { stream: null, action: null }, null, null).pipe(Effect.provide(liveRuntimeControl)));
    expect(wholeLog.project_directory).toBe(projectDirectory);
    expect(wholeLog.records.length).toBeGreaterThan(0);
    for (const projectStream of projectStreams) {
      const streamLog = await Effect.runPromise(readProjectLogRecords(projectDirectory, { stream: projectStream.stream, action: null }, null, null).pipe(Effect.provide(liveRuntimeControl)));
      expect(streamLog.records.every((record) => record.stream === projectStream.stream)).toBe(true);
    }
  }

  const expectedStreamCount = process.env["TATOLAB_APP_LIVE_EXPECTED_STREAM_COUNT"];
  if (expectedStreamCount !== undefined) expect(streams.length).toBe(Number(expectedStreamCount));
});

test.skipIf(noLiveRuntimeSocketIsNamed)("a_real_runtime_names_its_stream_actions_under_way_on_subscribing_and_describes_each_on_the_same_connection", async () => {
  const opened = await TatolabRuntimeControlWebSocketConnection.open(process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "", 5_000);
  const connection = streamActionChangesConnectionOver(answerOf(opened));
  try {
    const actionsUnderWay = answerOf(await connection.subscribeToTheStreamActionChanges());
    for (const action of actionsUnderWay) expect(answerOf(await connection.describeTheStreamAction(action)).action).toBe(action);
    const finishedAction = process.env["TATOLAB_APP_LIVE_FINISHED_STREAM_ACTION"];
    if (finishedAction !== undefined) expect(answerOf(await connection.describeTheStreamAction(finishedAction)).action).toBe(finishedAction);
  } finally {
    connection.close();
  }
});

test("a_plain_request_is_one_get_with_no_body_on_a_connection_the_runtime_closes", () => {
  expect(httpRequestBytes("GET", "/health").toString("utf8")).toBe("GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
});

test("a_truncated_body_is_malformed", () => {
  expect(failureOf(parseHttpResponse(Buffer.from("HTTP/1.1 200 OK\r\ncontent-length: 10\r\n\r\nok")))).toContain("2 of its 10 bytes");
  expect(parseHttpResponse(Buffer.from("HTTP/1.1 200 OK\r\n")).ok).toBe(false);
});
