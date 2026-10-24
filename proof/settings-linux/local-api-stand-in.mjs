// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// A stand-in for tatolabd's local API, not the runtime: it answers GET /health, GET /api/graph and the MCP tools
// list_streams and describe_runtime on the socket it is given, its uptime counted from its own start, so a restart
// through the systemctl stand-in starts it again from 0. Usage: node local-api-stand-in.mjs <socket> <log folder>
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const [, , localApiSocket, runtimeLogDirectory] = process.argv;
const startedAtMs = performance.now();
mkdirSync(path.dirname(localApiSocket), { recursive: true });
mkdirSync(runtimeLogDirectory, { recursive: true });
rmSync(localApiSocket, { force: true });

const toolResults = {
  list_streams: () => ({ streams: [] }),
  describe_runtime: () => ({
    version: "0.55.2",
    build_id: "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.stand-in",
    up_for_ms: Math.round(performance.now() - startedAtMs),
    runtime_log_directory: runtimeLogDirectory,
  }),
};

http
  .createServer((request, response) => {
    let requestBody = "";
    request.on("data", (bodyChunk) => (requestBody += bodyChunk));
    request.on("end", () => {
      if (request.method === "GET" && request.url === "/health") return response.end("ok");
      if (request.method === "GET" && request.url === "/api/graph") return response.end(JSON.stringify({ machine: os.hostname(), streams: [] }));
      const toolName = JSON.parse(requestBody || "{}")?.params?.name;
      const toolResult = toolResults[toolName];
      response.setHeader("content-type", "application/json");
      if (toolResult === undefined) return response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: `tool not found: ${toolName}` } }));
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(toolResult(), null, 2) }], isError: false } }));
    });
  })
  .listen(localApiSocket);
