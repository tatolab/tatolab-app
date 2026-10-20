// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// A stand-in for tatolabd's local API, for proof in a Linux container where no runtime runs: it
// answers on `<socket>` what the app reads — `GET /health`, the MCP tools `list_streams` and
// `logs`, and `GET /api/graph` — from the responses recorded from a real runtime under
// src-tauri/test-fixtures/. Usage: node tatolabd-local-api-stand-in.mjs <socket>
import { readFileSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RECORDED_RESPONSES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../src-tauri/test-fixtures");
const STAND_IN_MACHINE_NAME = "linux-container-stand-in";
const recorded = (fileName) => JSON.parse(readFileSync(path.join(RECORDED_RESPONSES, fileName), "utf8"));

const recordedGraphOfMain = { ...recorded("local-api-graph-of-the-stream-main.json"), machine: STAND_IN_MACHINE_NAME };
const recordedLogRecordsOfMain = [
  ...recorded("local-api-logs-tool-result-of-the-stream-main-after-0.json").records,
  ...recorded("local-api-logs-tool-result-of-the-stream-main-after-79.json").records,
].map((logRecord, index) => ({ ...logRecord, sequence: index + 1 }));
const listedStreams = {
  streams: [
    { name: "main", state: "kept", project_directory: "/root/streams/pattern", node_count: 4, failed_because: null },
    { name: "pattern-two", state: "stopped", project_directory: "/root/streams/pattern-two", node_count: 4, failed_because: null },
  ],
};

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
    const stream = url.searchParams.get("stream");
    if (stream === null) return httpResponse(200, "application/json", JSON.stringify({ machine: STAND_IN_MACHINE_NAME, streams: [] }));
    if (stream === "main") return httpResponse(200, "application/json", JSON.stringify(recordedGraphOfMain));
    return httpResponse(404, "application/json", JSON.stringify({ error: `stream \`${stream}\` is not loaded` }));
  }
  if (method === "POST" && url.pathname === "/mcp") {
    const toolCall = JSON.parse(requestBody);
    const { name, arguments: toolArguments } = toolCall.params;
    if (name === "list_streams") return toolResult(toolCall.id, JSON.stringify(listedStreams));
    if (name === "logs" && toolArguments.stream === "main") {
      const records = recordedLogRecordsOfMain.filter((logRecord) => logRecord.sequence > toolArguments.after).slice(0, toolArguments.count);
      const nextAfter = records.at(-1)?.sequence ?? toolArguments.after;
      return toolResult(toolCall.id, JSON.stringify({ stream: "main", stream_instance: "1", records, next_after: nextAfter, records_no_longer_held: 0 }));
    }
    return toolResult(toolCall.id, `stream \`${toolArguments.stream}\` is not loaded`, true);
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
