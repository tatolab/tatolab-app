// A stand-in for tatolabd's local API, for proof in a Linux container where no runtime runs: it
// answers on `<socket>` what the app reads, from the responses recorded from a real runtime under
// src/main/test-fixtures/: `GET /health`, `GET /api/graph`'s machine name, and the control
// operations over the control WebSocket `/control/ws` (and `POST /control`) — `describe_runtime`,
// `list_streams`, `graph`, `logs`, what opening a project reads, and the graph and change
// subscriptions — and the queued project actions `stop_playback` and `remove_project`, changing its
// listing as the runtime does once an action finishes. It sends no notification. The WebSocket is
// served by the tests' fake runtime, which node runs as TypeScript with its types stripped.
// Usage: node tatolabd-local-api-stand-in.mjs <socket>
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DISCOVERED_AT_THIS_STUDIOS_CONTRACT, fakeControlWebSocketRuntime, resultLine } from "../../../src/main/fake_control_websocket_runtime.ts";

const RECORDED_RESPONSES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../src/main/test-fixtures");
const STAND_IN_MACHINE_NAME = "linux-container-stand-in";
/** The folders the projects were recorded in: the listing's on one machine, the logs' and refusals' on another. */
const RECORDED_PROJECTS_FOLDERS = ["/home/jonathan-fontanez/scratch/app176/projects", "/tmp/tatolab-proof-projects"];
const STAND_IN_PROJECTS_FOLDER = "/root/streams";
const recordedText = (fileName) =>
  RECORDED_PROJECTS_FOLDERS.reduce((text, recordedFolder) => text.replaceAll(recordedFolder, STAND_IN_PROJECTS_FOLDER), readFileSync(path.join(RECORDED_RESPONSES, fileName), "utf8"));
const recordedToolText = (fileName) => JSON.parse(recordedText(fileName)).result.content[0].text;

/** The recorded graph result as the runtime wrote it, every number with its digits, lifted out of its JSON-RPC answer. */
const recordedGraphResultText = (() => {
  const answerText = recordedText("local-api-graph-result-of-the-stream-test-pattern-halftone-lens-main.json").trimEnd();
  const resultStart = '{"jsonrpc":"2.0","id":1,"result":';
  return answerText.slice(resultStart.length, -1).replace('"machine":"vm"', `"machine":"${STAND_IN_MACHINE_NAME}"`);
})();
/** The runtime the recording describes, which `discover` names too, serving this Studio's contract. */
const recordedRuntime = JSON.parse(recordedToolText("local-api-describe-runtime-tool-result-of-a-test-root-runtime.json"));
const RECORDED_GRAPH_STREAM = "test-pattern-halftone-lens-main-66e784";
const listedStreams = JSON.parse(recordedToolText("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json"));
const listingOf = (streamId) => listedStreams.streams.find((listedStream) => listedStream.stream === streamId);
/** The listed stream id a recorded stream id stands for: the same project and name, loaded on another day under another suffix. */
const listedStreamIdOf = (recordedStreamId) =>
  listedStreams.streams.find((listedStream) => listedStream.stream.replace(/-[0-9a-f]{6}$/, "") === recordedStreamId.replace(/-[0-9a-f]{6}$/, ""))?.stream ?? recordedStreamId;
/** Every recorded log record, in the order recorded, by its project, naming the listed stream it was recorded from. */
const recordedProjectLogRecords = [
  "local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-first-4.json",
  "local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-3-python-records.json",
  "local-api-logs-tool-result-of-the-project-doorways-narrowed-to-one-load-first-12.json",
  "local-api-logs-tool-result-of-the-project-doorways-narrowed-to-its-failed-stream-back-door.json",
].flatMap((fileName) => {
  const recordsPage = JSON.parse(recordedToolText(fileName));
  return recordsPage.records.map((logRecord) => ({
    projectDirectory: recordsPage.project_directory,
    logRecord: typeof logRecord.stream === "string" ? { ...logRecord, stream: listedStreamIdOf(logRecord.stream) } : logRecord,
  }));
});
/** The recorded `list_assets` answer, its one stream asset the shape each listed stream's asset is given. */
const recordedAssetsOfAProject = JSON.parse(recordedToolText("local-api-list-assets-tool-result-of-the-project-night-show.json"));

/** The project the listing holds streams of in `projectDirectory`, as the runtime names it, or `null` for a folder it holds none of. */
function projectListedIn(projectDirectory) {
  const streams = listedStreams.streams.filter((listedStream) => listedStream.location?.project_directory === projectDirectory);
  const [firstStream] = streams;
  if (firstStream === undefined) return null;
  return { identity: { project_directory: projectDirectory, project: firstStream.location.project, project_name: path.basename(projectDirectory) }, streams };
}

/** The words of a recorded refusal, whether recorded as an MCP tool's error or as the control operation's. */
function recordedRefusalWords(fileName) {
  const recorded = JSON.parse(recordedText(fileName));
  return recorded.error?.message ?? recorded.result.content[0].text;
}

/** The refusal recorded for each project read of a folder that holds no project; a read with none recorded takes `list_assets`' words. */
const REFUSALS_OF_A_FOLDER_THAT_IS_NOT_A_PROJECT = {
  list_assets: "local-api-list-assets-refusal-for-a-folder-that-is-not-a-project.json",
  list_node_types: "local-api-list-node-types-refusal-for-a-folder-that-is-not-a-project.json",
  list_project_views: "local-api-list-project-views-refusal-for-a-folder-that-is-not-a-project.json",
};

/** A project read as the runtime answers it for a project the listing holds streams of, or as recorded refused for a folder that holds no project. */
function projectReadAnswer(requestId, operation, projectDirectory, resultOfTheProject) {
  const listedProject = projectListedIn(projectDirectory);
  if (listedProject !== null) return answerLine(requestId, JSON.stringify(resultOfTheProject(listedProject)));
  const recordedRefusal = recordedRefusalWords(REFUSALS_OF_A_FOLDER_THAT_IS_NOT_A_PROJECT[operation] ?? REFUSALS_OF_A_FOLDER_THAT_IS_NOT_A_PROJECT.list_assets);
  return answerLine(requestId, recordedRefusal.replace(/^\w+ failed: \S+ holds/, `${operation} failed: ${projectDirectory} holds`), true);
}

/** `list_assets`'s answer for a listed project: the recorded answer, with one stream asset, shaped as recorded, per listed stream. */
function assetsOfTheProject({ identity, streams }) {
  const [recordedStreamAsset] = recordedAssetsOfAProject.assets;
  const assets = streams.map((listedStream) => ({ ...recordedStreamAsset, asset: listedStream.location.stream_asset, path: `streams/${listedStream.display_name}.graph.json` }));
  return { ...recordedAssetsOfAProject, ...identity, assets, transactions_resource_uri: `streamlib://project/${identity.project}/transactions` };
}

/** What each project read answers for a listed project: the recorded answer where one was recorded, otherwise the project with nothing in it. */
const PROJECT_READS = {
  list_assets: assetsOfTheProject,
  list_dependencies: () => JSON.parse(recordedToolText("local-api-list-dependencies-tool-result-of-the-project-night-show-importing-nothing.json")),
  list_node_types: ({ identity }) => ({ ...JSON.parse(recordedText("local-api-list-node-types-result-of-every-pin-kind.json")).result, ...identity }),
  list_project_views: ({ identity }) => ({ ...identity, views: [] }),
  read_project_changes: ({ identity }) => ({ project: identity.project, project_directory: identity.project_directory, transactions: [] }),
};

/** The node types the runtime described as recorded. */
const recordedNodeTypeDescriptions = JSON.parse(recordedText("local-api-describe-node-types-result-of-every-pin-kind-describing-glow-and-channels-to-records.json")).result.node_types;

/** `describe_node_types`' answer: each node type asked for that was recorded described, in the order asked. */
function nodeTypesDescribed(requestId, nodeTypes) {
  const described = nodeTypes.flatMap((nodeType) => recordedNodeTypeDescriptions.filter((description) => description.node_type === nodeType));
  return answerLine(requestId, JSON.stringify({ node_types: described }));
}

/** The runtime's refusal of `operation` for the stream `streamId`, not loaded: the words recorded for `graph`'s, naming them and the streams loaded. */
function notLoadedRefusal(requestId, operation, streamId) {
  const recordedRefusal = recordedRefusalWords("local-api-graph-tool-refusal-for-the-stopped-stream-front-door.json");
  const loadedStreams = listedStreams.streams.filter((listedStream) => listedStream.node_count != null).map((listedStream) => listedStream.stream).join(", ");
  return answerLine(requestId, recordedRefusal.replace(/^graph failed/, `${operation} failed`).replace("`front-door`", `\`${streamId}\``).replace(/Loaded: none$/, `Loaded: ${loadedStreams || "none"}`), true);
}

/** A graph subscription's answer: the streams asked for, each loaded, or the refusal naming the one that is not. */
function streamSubscriptionAnswer(requestId, operation, streams) {
  const notLoaded = streams.find((streamId) => listingOf(streamId)?.node_count == null);
  if (notLoaded !== undefined) return notLoadedRefusal(requestId, operation, notLoaded);
  return answerLine(requestId, JSON.stringify({ streams }));
}

/** Lists `listing` under `state` with its action at `step`, then, a beat later, as `finish` leaves it. */
function workOnTheStreamAction(listing, state, step, finish) {
  const action = nextStandInAction();
  Object.assign(listing, { state, node_count: null, failed_because: null, action, step });
  setTimeout(() => Object.assign(listing, { action: null, step: null }, finish()), STAND_IN_ACTION_MILLISECONDS);
  return action;
}

/** A project action as the runtime queues it, answered as recorded, or refused in the words recorded for its case. */
function projectActionAnswer(requestId, toolName, toolArguments) {
  const streamsOfTheProject = listedStreams.streams.filter((listedStream) => listedStream.location?.project_directory === toolArguments.project_directory);
  if (toolName === "remove_project") {
    if (streamsOfTheProject.length === 0) return answerLine(requestId, recordedToolText("local-api-remove-project-refusal-for-a-project-the-runtime-holds-no-stream-of.json"), true);
    let action = "";
    for (const listing of streamsOfTheProject) {
      action = workOnTheStreamAction(listing, "stopping", "stopping", () => {
        listedStreams.streams = listedStreams.streams.filter((listedStream) => listedStream !== listing);
        return {};
      });
    }
    return answerLine(requestId, JSON.stringify({ action, project_directory: toolArguments.project_directory }, null, 2));
  }
  const runningStreamsOfTheProject = streamsOfTheProject.filter((listedStream) => listedStream.state === "running");
  if (runningStreamsOfTheProject.length === 0) {
    const recordedRefusal = recordedToolText("local-api-stop-playback-refusal-for-the-stopped-project-pattern.json");
    return answerLine(requestId, recordedRefusal.replaceAll(`${STAND_IN_PROJECTS_FOLDER}/pattern`, toolArguments.project_directory), true);
  }
  let action = "";
  for (const listing of runningStreamsOfTheProject) action = workOnTheStreamAction(listing, "stopping", "stopping", () => ({ state: "stopped" }));
  return answerLine(requestId, JSON.stringify({ action, project_directory: toolArguments.project_directory }, null, 2));
}

/** `logs` as the runtime answers it, over the recorded records of the project, cursored by their index. */
function logsAnswer(requestId, toolArguments) {
  const afterIndex = toolArguments.after === undefined ? 0 : Number(String(toolArguments.after).split(":")[1] ?? 0);
  const records = [];
  let nextIndex = afterIndex;
  for (; nextIndex < recordedProjectLogRecords.length && records.length < toolArguments.count; nextIndex++) {
    const { projectDirectory, logRecord } = recordedProjectLogRecords[nextIndex];
    const isAsked =
      projectDirectory === toolArguments.project_directory &&
      (toolArguments.stream === undefined || logRecord.stream === toolArguments.stream) &&
      (toolArguments.action === undefined || logRecord.action === toolArguments.action);
    if (isAsked) records.push(logRecord);
  }
  return answerLine(requestId, JSON.stringify({ project_directory: toolArguments.project_directory, records, next_after: `1:${nextIndex}`, records_no_longer_held: false }));
}

function httpResponse(statusCode, contentType, bodyText) {
  const body = Buffer.from(bodyText, "utf8");
  return Buffer.concat([
    Buffer.from(`HTTP/1.1 ${statusCode} ${statusCode === 200 ? "OK" : "Not Found"}\r\nContent-Type: ${contentType}\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`),
    body,
  ]);
}

/** A call's JSON-RPC answer: the result's text spliced in whole, so its numbers keep their digits, or a failure (code 2) in its words. */
function answerLine(requestId, toolResultText, isError = false) {
  if (isError) return JSON.stringify({ jsonrpc: "2.0", id: requestId, error: { code: 2, message: toolResultText } });
  return `{"jsonrpc":"2.0","id":${JSON.stringify(requestId)},"result":${toolResultText}}`;
}

/** The answer to one control call, as the runtime gives it over the WebSocket or `POST /control`. */
function answerTheCall({ id: requestId, method: name, params: toolArguments = {} }) {
  if (name === "list_streams") return answerLine(requestId, JSON.stringify(listedStreams));
  if (name === "stop_playback" || name === "remove_project") return projectActionAnswer(requestId, name, toolArguments);
  if (name === "graph") {
    const isTheStreamLoaded = listingOf(toolArguments.stream)?.node_count != null;
    if (isTheStreamLoaded) return answerLine(requestId, recordedGraphResultText.replace(`"stream":"${RECORDED_GRAPH_STREAM}"`, `"stream":${JSON.stringify(toolArguments.stream)}`));
    return notLoadedRefusal(requestId, "graph", toolArguments.stream);
  }
  if (name === "logs") return logsAnswer(requestId, toolArguments);
  if (name in PROJECT_READS) return projectReadAnswer(requestId, name, toolArguments.project_directory, PROJECT_READS[name]);
  if (name === "describe_node_types") return nodeTypesDescribed(requestId, toolArguments.node_types);
  if (name === "subscribe_project_changes") return answerLine(requestId, JSON.stringify({ projects: toolArguments.projects }));
  if (name === "subscribe_stream_graph_changes" || name === "subscribe_input_value_changes") return streamSubscriptionAnswer(requestId, name, toolArguments.streams);
  if (name === "describe_runtime") return answerLine(requestId, JSON.stringify(recordedRuntime));
  // Its actions finish on a timer, seen in the listing, so it tells a subscriber of none under way and sends no change.
  if (name === "subscribe_stream_action_changes") return answerLine(requestId, JSON.stringify({ actions_under_way: [] }));
  console.error(`the stand-in does not answer \`${name}\``, JSON.stringify(toolArguments));
  return answerLine(requestId, `the stand-in does not answer \`${name}\``, true);
}

function answerTheHttpRequest(request) {
  const [head, requestBody] = request.split("\r\n\r\n");
  const [method, requestTarget] = head.split("\r\n")[0].split(" ");
  const url = new URL(requestTarget, "http://local-api");
  if (method === "GET" && url.pathname === "/health") return httpResponse(200, "text/plain", "ok");
  if (method === "GET" && url.pathname === "/api/graph") {
    return httpResponse(200, "application/json", JSON.stringify({ machine: STAND_IN_MACHINE_NAME, streams: [] }));
  }
  if (method === "POST" && url.pathname === "/control") return httpResponse(200, "application/json", answerTheCall(JSON.parse(requestBody)));
  return httpResponse(404, "text/plain", "not found");
}

const discovered = { ...DISCOVERED_AT_THIS_STUDIOS_CONTRACT, runtime_version: recordedRuntime.version, build_id: recordedRuntime.build_id };
await fakeControlWebSocketRuntime((call) => [answerTheCall(call)], (call) => [resultLine(call.id, discovered)], { answerHttpRequest: answerTheHttpRequest, listenAt: process.argv[2] });
