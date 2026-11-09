// A scripted stand-in for Pyright in the mock window: it answers the handshake, keeps each open
// document's text, publishes a diagnostic for each call of a `StreamBuilder` method that does not
// exist, completes `stream_builder.` with its methods and anything else with the document's own
// words, and describes those methods on hover.

import type { JsonValue } from "../../shared/tatolab_backend_contract";

type JsonObject = { [key: string]: JsonValue };

function fieldOf(value: JsonValue | undefined, fieldName: string): JsonValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value[fieldName] : undefined;
}

const STREAM_BUILDER_METHODS: Record<string, string> = {
  add: "(method) def add(node_class: type, *, name: str | None = None, config: Mapping[str, Any] | None = None) -> NodeReference",
  connect: "(method) def connect(source: NodeOutputPortReference, destination: NodeInputPortReference) -> None",
};

const LSP_COMPLETION_KIND_METHOD = 2;
const LSP_COMPLETION_KIND_VARIABLE = 6;
const LSP_DIAGNOSTIC_SEVERITY_ERROR = 1;

/** The mock's language server for one session, each reply handed to `sendToTheWindow`. */
export class MockPythonLanguageServer {
  private readonly textByUri = new Map<string, string>();

  constructor(private readonly sendToTheWindow: (message: JsonValue) => void) {}

  receive(message: JsonValue): void {
    const method = fieldOf(message, "method");
    const id = fieldOf(message, "id");
    const params = fieldOf(message, "params");
    const uri = fieldOf(fieldOf(params, "textDocument"), "uri");
    switch (method) {
      case "initialize":
        this.answer(id, { capabilities: { textDocumentSync: 1, completionProvider: { triggerCharacters: ["."] }, hoverProvider: true }, serverInfo: { name: "Pyright (mock)" } });
        this.sendToTheWindow({ jsonrpc: "2.0", id: "mock-configuration", method: "workspace/configuration", params: { items: [{ section: "python" }, { section: "pyright" }] } });
        return;
      case "textDocument/didOpen": {
        const text = fieldOf(fieldOf(params, "textDocument"), "text");
        if (typeof uri === "string" && typeof text === "string") this.takeTheText(uri, text);
        return;
      }
      case "textDocument/didChange": {
        const changes = fieldOf(params, "contentChanges");
        const text = Array.isArray(changes) ? fieldOf(changes.at(-1), "text") : undefined;
        if (typeof uri === "string" && typeof text === "string") this.takeTheText(uri, text);
        return;
      }
      case "textDocument/didClose":
        if (typeof uri === "string") this.textByUri.delete(uri);
        return;
      case "textDocument/completion":
        this.answer(id, typeof uri === "string" ? this.completionsAt(uri, fieldOf(params, "position")) : []);
        return;
      case "textDocument/hover":
        this.answer(id, typeof uri === "string" ? this.hoverAt(uri, fieldOf(params, "position")) : null);
        return;
      default:
        if (typeof method === "string" && id !== undefined) this.answer(id, null);
    }
  }

  private answer(id: JsonValue | undefined, result: JsonValue): void {
    if (id === undefined) return;
    this.sendToTheWindow({ jsonrpc: "2.0", id, result });
  }

  private takeTheText(uri: string, text: string): void {
    this.textByUri.set(uri, text);
    const diagnostics: JsonObject[] = [];
    text.split("\n").forEach((lineText, line) => {
      for (const call of lineText.matchAll(/stream_builder\.([A-Za-z_]\w*)\(/g)) {
        const methodName = call[1] ?? "";
        if (methodName in STREAM_BUILDER_METHODS) continue;
        const character = (call.index ?? 0) + "stream_builder.".length;
        diagnostics.push({
          range: { start: { line, character }, end: { line, character: character + methodName.length } },
          severity: LSP_DIAGNOSTIC_SEVERITY_ERROR,
          source: "Pyright",
          message: `Cannot access attribute "${methodName}" for class "StreamBuilder"\n  Attribute "${methodName}" is unknown`,
        });
      }
    });
    this.sendToTheWindow({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri, diagnostics } });
  }

  private lineBefore(uri: string, position: JsonValue | undefined): { lineText: string; character: number } {
    const line = fieldOf(position, "line");
    const character = fieldOf(position, "character");
    const lineText = (this.textByUri.get(uri) ?? "").split("\n")[typeof line === "number" ? line : 0] ?? "";
    return { lineText, character: typeof character === "number" ? character : 0 };
  }

  private completionsAt(uri: string, position: JsonValue | undefined): JsonValue {
    const { lineText, character } = this.lineBefore(uri, position);
    if (/stream_builder\.\w*$/.test(lineText.slice(0, character))) {
      return Object.entries(STREAM_BUILDER_METHODS).map(([label, detail]) => ({ label, kind: LSP_COMPLETION_KIND_METHOD, detail }));
    }
    const words = new Set((this.textByUri.get(uri) ?? "").match(/[A-Za-z_]\w{2,}/g) ?? []);
    return [...words].sort().map((label) => ({ label, kind: LSP_COMPLETION_KIND_VARIABLE }));
  }

  private hoverAt(uri: string, position: JsonValue | undefined): JsonValue {
    const { lineText, character } = this.lineBefore(uri, position);
    for (const call of lineText.matchAll(/stream_builder\.([A-Za-z_]\w*)/g)) {
      const methodName = call[1] ?? "";
      const start = (call.index ?? 0) + "stream_builder.".length;
      const signature = STREAM_BUILDER_METHODS[methodName];
      if (signature !== undefined && character >= start && character <= start + methodName.length) {
        return { contents: { kind: "markdown", value: `\`\`\`python\n${signature}\n\`\`\`` } };
      }
    }
    return null;
  }
}
