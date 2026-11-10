import { describe, expect, it } from "vitest";
import type { JsonValue } from "@tatolab/tato-app-view-sdk";
import { fileOfUri, fileUriOf, PythonLanguageClient } from "./python_language_client";

const PROJECT_FOLDER = "/home/jonathanf/streams/pattern";
const STREAM_PY = `${PROJECT_FOLDER}/stream.py`;

function methodOf(message: JsonValue | undefined): JsonValue | undefined {
  return typeof message === "object" && message !== null && !Array.isArray(message) ? message.method : undefined;
}

function startedClient() {
  const sent: JsonValue[] = [];
  const publishedDiagnostics: { file: string; messages: string[] }[] = [];
  const client = new PythonLanguageClient((message) => sent.push(message), PROJECT_FOLDER, {
    onDiagnosticsPublished: (file, diagnostics) => publishedDiagnostics.push({ file, messages: diagnostics.map((diagnostic) => diagnostic.message) }),
  });
  client.start();
  return { client, sent, publishedDiagnostics };
}

describe("the code pane's Pyright client", () => {
  it("names a file by its file URI and back, spaces included", () => {
    const file = "/home/jonathanf/my streams/stream.py";
    expect(fileUriOf(file)).toBe("file:///home/jonathanf/my%20streams/stream.py");
    expect(fileOfUri(fileUriOf(file))).toBe(file);
    expect(fileOfUri("untitled:Untitled-1")).toBeNull();
  });

  it("opens the session on the project folder and holds every document message until the server answers", () => {
    const { client, sent } = startedClient();
    client.openDocument(STREAM_PY, "import os\n");
    expect(sent.map(methodOf)).toEqual(["initialize"]);
    expect(sent[0]).toMatchObject({ params: { rootUri: `file://${PROJECT_FOLDER}`, workspaceFolders: [{ uri: `file://${PROJECT_FOLDER}`, name: "pattern" }] } });
    client.receive({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    expect(sent.map(methodOf)).toEqual(["initialize", "initialized", "textDocument/didOpen"]);
  });

  it("answers the server's configuration with the project's venv interpreter, and its other requests with null", () => {
    const { client, sent } = startedClient();
    client.receive({ jsonrpc: "2.0", id: 7, method: "workspace/configuration", params: { items: [{ section: "python" }, { section: "pyright" }, { section: "editor" }] } });
    client.receive({ jsonrpc: "2.0", id: 8, method: "client/registerCapability", params: {} });
    expect(sent.slice(1)).toEqual([
      { jsonrpc: "2.0", id: 7, result: [{ pythonPath: `${PROJECT_FOLDER}/.venv/bin/python` }, {}, null] },
      { jsonrpc: "2.0", id: 8, result: null },
    ]);
  });

  it("sends each edit as the whole text under the next version, and the save and close", () => {
    const { client, sent } = startedClient();
    client.receive({ jsonrpc: "2.0", id: 1, result: {} });
    client.openDocument(STREAM_PY, "a");
    client.changeDocument(STREAM_PY, "ab");
    client.noteDocumentSaved(STREAM_PY);
    client.closeDocument(STREAM_PY);
    client.changeDocument(STREAM_PY, "abc");
    expect(sent.slice(2)).toEqual([
      { jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri: fileUriOf(STREAM_PY), languageId: "python", version: 1, text: "a" } } },
      { jsonrpc: "2.0", method: "textDocument/didChange", params: { textDocument: { uri: fileUriOf(STREAM_PY), version: 2 }, contentChanges: [{ text: "ab" }] } },
      { jsonrpc: "2.0", method: "textDocument/didSave", params: { textDocument: { uri: fileUriOf(STREAM_PY) } } },
      { jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: fileUriOf(STREAM_PY) } } },
    ]);
  });

  it("hands on published diagnostics with their lines counted from 1", () => {
    const { client, publishedDiagnostics } = startedClient();
    const diagnosticsSeen: JsonValue[] = [];
    const clientSeeingRanges = new PythonLanguageClient(() => undefined, PROJECT_FOLDER, { onDiagnosticsPublished: (_file, diagnostics) => diagnosticsSeen.push(...diagnostics.map((diagnostic) => ({ ...diagnostic }))) });
    const published: JsonValue = {
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: fileUriOf(STREAM_PY),
        diagnostics: [{ range: { start: { line: 3, character: 4 }, end: { line: 3, character: 10 } }, severity: 1, source: "Pyright", message: '"conect" is not a known attribute' }, { message: "no range" }],
      },
    };
    client.receive(published);
    clientSeeingRanges.receive(published);
    expect(publishedDiagnostics).toEqual([{ file: STREAM_PY, messages: ['"conect" is not a known attribute'] }]);
    expect(diagnosticsSeen).toEqual([{ start_line: 4, start_column: 5, end_line: 4, end_column: 11, severity: "error", message: '"conect" is not a known attribute', source: "Pyright" }]);
  });

  it("asks completion and hover at a position and reads the answers", async () => {
    const { client, sent } = startedClient();
    client.receive({ jsonrpc: "2.0", id: 1, result: {} });
    const completions = client.completionsAt(STREAM_PY, 9, 19);
    const hover = client.hoverAt(STREAM_PY, 9, 20);
    expect(sent.slice(2)).toMatchObject([
      { id: 2, method: "textDocument/completion", params: { position: { line: 9, character: 19 } } },
      { id: 3, method: "textDocument/hover" },
    ]);
    client.receive({ jsonrpc: "2.0", id: 2, result: { isIncomplete: false, items: [{ label: "connect", kind: 2, detail: "(method)", documentation: { kind: "markdown", value: "Record a link" } }, { kind: 2 }] } });
    client.receive({ jsonrpc: "2.0", id: 3, result: { contents: { kind: "markdown", value: "```python\ndef connect()\n```" } } });
    expect(await completions).toEqual([{ label: "connect", kind: "method", detail: "(method)", documentation: "Record a link", insert_text: "connect", sort_text: null, filter_text: null }]);
    expect(await hover).toBe("```python\ndef connect()\n```");
  });

  it("answers every question still waiting with nothing once the session ends, and sends nothing after", async () => {
    const { client, sent } = startedClient();
    client.receive({ jsonrpc: "2.0", id: 1, result: {} });
    const completions = client.completionsAt(STREAM_PY, 0, 0);
    client.end();
    expect(await completions).toEqual([]);
    expect(await client.hoverAt(STREAM_PY, 0, 0)).toBeNull();
    const sentBefore = sent.length;
    client.openDocument(STREAM_PY, "x");
    expect(sent).toHaveLength(sentBefore);
  });
});
