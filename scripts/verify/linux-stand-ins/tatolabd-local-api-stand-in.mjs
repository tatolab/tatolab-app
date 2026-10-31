// A stand-in for tatolabd's local API, for proof in a Linux container where no runtime runs: it
// answers on `<socket>` what the app reads — `GET /health`, the MCP tools `list_streams`, `logs`
// and `graph`, and `GET /api/graph`'s machine name — and the queued stream actions `stop_stream`,
// `start_stream` and `remove_project`, changing its listing as the runtime does once an action
// finishes, from the responses recorded from a real runtime under src/main/test-fixtures/.
// Usage: node tatolabd-local-api-stand-in.mjs <socket>
import { readFileSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RECORDED_RESPONSES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../src/main/test-fixtures");
const STAND_IN_MACHINE_NAME = "linux-container-stand-in";
const RECORDED_PROJECTS_FOLDER = "/tmp/tatolab-proof-projects";
const STAND_IN_PROJECTS_FOLDER = "/root/streams";
const recordedText = (fileName) => readFileSync(path.join(RECORDED_RESPONSES, fileName), "utf8").replaceAll(RECORDED_PROJECTS_FOLDER, STAND_IN_PROJECTS_FOLDER);
const recordedToolText = (fileName) => JSON.parse(recordedText(fileName)).result.content[0].text;

/** The recorded graph of `main` as the `graph` tool's text, every number as the runtime wrote it. */
const recordedGraphTextOfMain = readFileSync(path.join(RECORDED_RESPONSES, "local-api-graph-of-the-stream-main.json"), "utf8").replace(
  '"machine": "jonathanf-macbook"',
  `"machine": "${STAND_IN_MACHINE_NAME}"`,
);
const listedStreams = JSON.parse(recordedToolText("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json"));
/** Every recorded log record, in the order recorded, by its project. */
const recordedProjectLogRecords = [
  "local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-first-4.json",
  "local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-3-python-records.json",
  "local-api-logs-tool-result-of-the-project-doorways-narrowed-to-one-load-first-12.json",
  "local-api-logs-tool-result-of-the-project-doorways-narrowed-to-its-failed-stream-back-door.json",
].flatMap((fileName) => {
  const recordsPage = JSON.parse(recordedToolText(fileName));
  return recordsPage.records.map((logRecord) => ({ projectDirectory: recordsPage.project_directory, logRecord }));
});
const listingOf = (streamId) => listedStreams.streams.find((listedStream) => listedStream.stream === streamId);
let standInActionCount = 100;
const nextStandInAction = () => `Rstandin-${(standInActionCount += 1)}`;
const STAND_IN_ACTION_MILLISECONDS = 1500;

/** Lists `listing` under `state` with its action at `step`, then, a beat later, as `finish` leaves it. */
function workOnTheStreamAction(listing, state, step, finish) {
  const action = nextStandInAction();
  Object.assign(listing, { state, node_count: null, failed_because: null, action, step });
  setTimeout(() => Object.assign(listing, { action: null, step: null }, finish()), STAND_IN_ACTION_MILLISECONDS);
  return action;
}

/** A stream action as the runtime queues it, answered as recorded, or refused in the words recorded for its case. */
function streamActionToolResult(requestId, toolName, toolArguments) {
  if (toolName === "remove_project") {
    const streamsOfTheProject = listedStreams.streams.filter((listedStream) => listedStream.location?.project_directory === toolArguments.project_directory);
    if (streamsOfTheProject.length === 0) return toolResult(requestId, recordedToolText("local-api-remove-project-refusal-for-a-project-the-runtime-holds-no-stream-of.json"), true);
    let action = "";
    for (const listing of streamsOfTheProject) {
      action = workOnTheStreamAction(listing, "stopping", "stopping", () => {
        listedStreams.streams = listedStreams.streams.filter((listedStream) => listedStream !== listing);
        return {};
      });
    }
    return toolResult(requestId, JSON.stringify({ action, project_directory: toolArguments.project_directory }, null, 2));
  }
  const listing = listingOf(toolArguments.stream);
  if (listing === undefined) return toolResult(requestId, `Resource not found: no stream with the id \`${toolArguments.stream}\` is loaded or recorded in this runtime`, true);
  const recordedRefusal = (fileName) => toolResult(requestId, recordedToolText(fileName).replaceAll("pattern-main-d76f70", listing.stream), true);
  if (toolName === "stop_stream") {
    if (listing.state !== "running") return recordedRefusal("local-api-stop-stream-refusal-for-the-stopped-stream-pattern-main.json");
    const action = workOnTheStreamAction(listing, "stopping", "stopping", () => ({ state: "stopped" }));
    return toolResult(requestId, JSON.stringify({ action, stream: listing.stream }, null, 2));
  }
  if (listing.state === "running") return recordedRefusal("local-api-start-stream-refusal-for-the-running-stream-pattern-main.json");
  const action = workOnTheStreamAction(listing, "preparing", "compiling", () => ({ state: "running", node_count: 4 }));
  return toolResult(requestId, JSON.stringify({ action, stream: listing.stream }, null, 2));
}

/** `logs` as the runtime answers it, over the recorded records of the project, cursored by their index. */
function logsToolResult(requestId, toolArguments) {
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
  return toolResult(requestId, JSON.stringify({ project_directory: toolArguments.project_directory, records, next_after: `1:${nextIndex}`, records_no_longer_held: false }));
}

function httpResponse(statusCode, contentType, bodyText) {
  const body = Buffer.from(bodyText, "utf8");
  return Buffer.concat([
    Buffer.from(`HTTP/1.1 ${statusCode} ${statusCode === 200 ? "OK" : "Not Found"}\r\nContent-Type: ${contentType}\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`),
    body,
  ]);
}

function toolResult(requestId, toolResultText, isError = false) {
  return httpResponse(200, "application/json", JSON.stringify({ jsonrpc: "2.0", id: requestId, result: { content: [{ type: "text", text: toolResultText }], isError } }));
}

function answer(method, requestTarget, requestBody) {
  const url = new URL(requestTarget, "http://local-api");
  if (method === "GET" && url.pathname === "/health") return httpResponse(200, "text/plain", "ok");
  if (method === "GET" && url.pathname === "/api/graph") {
    return httpResponse(200, "application/json", JSON.stringify({ machine: STAND_IN_MACHINE_NAME, streams: [] }));
  }
  if (method === "POST" && url.pathname === "/mcp") {
    const toolCall = JSON.parse(requestBody);
    const { name, arguments: toolArguments } = toolCall.params;
    if (name === "list_streams") return toolResult(toolCall.id, JSON.stringify(listedStreams));
    if (name === "stop_stream" || name === "start_stream" || name === "remove_project") return streamActionToolResult(toolCall.id, name, toolArguments);
    if (name === "graph") {
      const isTheStreamLoaded = listingOf(toolArguments.stream)?.node_count != null;
      if (isTheStreamLoaded) return toolResult(toolCall.id, recordedGraphTextOfMain);
      return toolResult(toolCall.id, recordedToolText("local-api-graph-tool-refusal-for-the-stopped-stream-front-door.json"), true);
    }
    if (name === "logs") return logsToolResult(toolCall.id, toolArguments);
    return toolResult(toolCall.id, `the stand-in does not answer \`${name}\``, true);
  }
  return httpResponse(404, "text/plain", "not found");
}

const socketPath = process.argv[2];
rmSync(socketPath, { force: true });
net
  .createServer((connection) => {
    let received = Buffer.alloc(0);
    connection.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      const headerEnd = received.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const head = received.subarray(0, headerEnd).toString("utf8");
      const contentLength = Number(/content-length:\s*(\d+)/i.exec(head)?.[1] ?? 0);
      if (received.length < headerEnd + 4 + contentLength) return;
      const [method, requestTarget] = head.split("\r\n")[0].split(" ");
      connection.end(answer(method, requestTarget, received.subarray(headerEnd + 4, headerEnd + 4 + contentLength).toString("utf8")));
    });
  })
  .listen(socketPath);
