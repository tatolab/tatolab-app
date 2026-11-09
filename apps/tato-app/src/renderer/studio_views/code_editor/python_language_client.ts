// The code pane's side of the Language Server Protocol with Pyright: the handshake, each open
// document's text kept in step with the server (whole-document sync), the diagnostics it
// publishes, and completion and hover asked at a position. The server's own requests are answered
// here: its configuration with the project's `.venv` interpreter, everything else with null.

import type { JsonValue } from "../../view_host/studio_view_contract";
import type { CodeEditorCompletion, CodeEditorCompletionKind, CodeEditorDiagnostic, CodeEditorDiagnosticSeverity } from "@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_types";

type JsonObject = { [key: string]: JsonValue };

function isAJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldOf(value: JsonValue | undefined, fieldName: string): JsonValue | undefined {
  return isAJsonObject(value) ? value[fieldName] : undefined;
}

function textOf(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

/** `file`, an absolute POSIX path, as the `file:` URI the server names it by. */
export function fileUriOf(file: string): string {
  return `file://${file.split("/").map(encodeURIComponent).join("/")}`;
}

/** The absolute path a `file:` URI names; `null` for any other URI. */
export function fileOfUri(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;
  try {
    return decodeURIComponent(uri.slice("file://".length));
  } catch {
    return null;
  }
}

/** The interpreter of a project's venv, the one `run_project` makes, which Pyright resolves the project's imports with. */
export function projectVenvPythonOf(projectFolder: string): string {
  return `${projectFolder}/.venv/bin/python`;
}

const DIAGNOSTIC_SEVERITY_BY_LSP_NUMBER: Record<number, CodeEditorDiagnosticSeverity> = { 1: "error", 2: "warning", 3: "information", 4: "hint" };

/** A `textDocument/publishDiagnostics` diagnostic as the editor marks it, its LSP zero-based range made one-based; `null` for one that is not readable. */
export function codeEditorDiagnosticFrom(lspDiagnostic: JsonValue): CodeEditorDiagnostic | null {
  const range = fieldOf(lspDiagnostic, "range");
  const startLine = numberOf(fieldOf(fieldOf(range, "start"), "line"));
  const startCharacter = numberOf(fieldOf(fieldOf(range, "start"), "character"));
  const endLine = numberOf(fieldOf(fieldOf(range, "end"), "line"));
  const endCharacter = numberOf(fieldOf(fieldOf(range, "end"), "character"));
  const message = textOf(fieldOf(lspDiagnostic, "message"));
  if (startLine === null || startCharacter === null || endLine === null || endCharacter === null || message === null) return null;
  return {
    start_line: startLine + 1,
    start_column: startCharacter + 1,
    end_line: endLine + 1,
    end_column: endCharacter + 1,
    severity: DIAGNOSTIC_SEVERITY_BY_LSP_NUMBER[numberOf(fieldOf(lspDiagnostic, "severity")) ?? 1] ?? "error",
    message,
    source: textOf(fieldOf(lspDiagnostic, "source")),
  };
}

const COMPLETION_KIND_BY_LSP_NUMBER: Record<number, CodeEditorCompletionKind> = {
  2: "method",
  3: "function",
  4: "constructor",
  5: "field",
  6: "variable",
  7: "class",
  8: "interface",
  9: "module",
  10: "property",
  12: "value",
  13: "enum",
  14: "keyword",
  20: "enum_member",
  21: "constant",
  22: "struct",
  25: "type_parameter",
};

/** Markup the server sends, as plain text or Markdown alike: `MarkupContent`, a `MarkedString`, or a list of them. */
function markupText(markup: JsonValue | undefined): string | null {
  if (typeof markup === "string") return markup;
  if (Array.isArray(markup)) {
    const parts = markup.map((part) => markupText(part)).filter((part): part is string => part !== null && part !== "");
    return parts.length === 0 ? null : parts.join("\n\n");
  }
  const value = textOf(fieldOf(markup, "value"));
  if (value === null) return null;
  const language = textOf(fieldOf(markup, "language"));
  return language === null ? value : `\`\`\`${language}\n${value}\n\`\`\``;
}

/** A `textDocument/completion` item as the editor offers it; `null` for one that is not readable. */
export function codeEditorCompletionFrom(lspCompletionItem: JsonValue): CodeEditorCompletion | null {
  const label = textOf(fieldOf(lspCompletionItem, "label"));
  if (label === null) return null;
  const textEditText = textOf(fieldOf(fieldOf(lspCompletionItem, "textEdit"), "newText"));
  return {
    label,
    kind: COMPLETION_KIND_BY_LSP_NUMBER[numberOf(fieldOf(lspCompletionItem, "kind")) ?? 0] ?? "text",
    detail: textOf(fieldOf(lspCompletionItem, "detail")),
    documentation: markupText(fieldOf(lspCompletionItem, "documentation")),
    insert_text: textEditText ?? textOf(fieldOf(lspCompletionItem, "insertText")) ?? label,
    sort_text: textOf(fieldOf(lspCompletionItem, "sortText")),
    filter_text: textOf(fieldOf(lspCompletionItem, "filterText")),
  };
}

/** The items of a completion result: a `CompletionList`'s or the array itself. */
function completionItemsOf(result: JsonValue | undefined): JsonValue[] {
  if (Array.isArray(result)) return result;
  const items = fieldOf(result, "items");
  return Array.isArray(items) ? items : [];
}

/** What the client asks the server for at a position, and what each answers. */
interface PendingRequest {
  answer(result: JsonValue | undefined): void;
}

/** Where the client tells what the server says of the open documents, and how the session ended. */
export interface PythonLanguageClientListeners {
  /** The server's diagnostics for `file`, replacing any it published before. */
  onDiagnosticsPublished(file: string, diagnostics: CodeEditorDiagnostic[]): void;
}

/** One Pyright session as the code pane drives it, over `sendMessage`. Messages the server sends are handed to `receive`. */
export class PythonLanguageClient {
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly versionByOpenFile = new Map<string, number>();
  private isInitialized = false;
  private hasEnded = false;
  private readonly messagesUntilInitialized: JsonValue[] = [];

  constructor(
    private readonly sendMessage: (message: JsonValue) => void,
    private readonly projectFolder: string,
    private readonly listeners: PythonLanguageClientListeners,
  ) {}

  /** Open the session: `initialize` with the project folder as its LSP workspace; everything sent before the server answers waits for it. */
  start(): void {
    const projectUri = fileUriOf(this.projectFolder);
    const requestId = this.nextRequestId++;
    this.pendingRequests.set(requestId, {
      answer: () => {
        this.isInitialized = true;
        this.sendMessage({ jsonrpc: "2.0", method: "initialized", params: {} });
        for (const message of this.messagesUntilInitialized.splice(0)) this.sendMessage(message);
      },
    });
    this.sendMessage({
      jsonrpc: "2.0",
      id: requestId,
      method: "initialize",
      params: {
        processId: null,
        clientInfo: { name: "Tato Studio" },
        rootUri: projectUri,
        workspaceFolders: [{ uri: projectUri, name: this.projectFolder.split("/").at(-1) ?? this.projectFolder }],
        capabilities: {
          workspace: { configuration: true, workspaceFolders: true },
          textDocument: {
            synchronization: { didSave: true, dynamicRegistration: false },
            publishDiagnostics: { relatedInformation: false },
            completion: { completionItem: { snippetSupport: false, documentationFormat: ["markdown", "plaintext"] } },
            hover: { contentFormat: ["markdown", "plaintext"] },
          },
        },
      },
    });
  }

  /** Take one message the server sent. */
  receive(message: JsonValue): void {
    if (this.hasEnded) return;
    const method = textOf(fieldOf(message, "method"));
    const id = fieldOf(message, "id");
    if (method === null) {
      const pendingRequest = typeof id === "number" ? this.pendingRequests.get(id) : undefined;
      if (typeof id !== "number" || pendingRequest === undefined) return;
      this.pendingRequests.delete(id);
      pendingRequest.answer(fieldOf(message, "result"));
      return;
    }
    if (id !== undefined && id !== null && (typeof id === "number" || typeof id === "string")) {
      this.sendMessage({ jsonrpc: "2.0", id, result: this.answerToTheServersRequest(method, fieldOf(message, "params")) });
      return;
    }
    if (method === "textDocument/publishDiagnostics") this.takeThePublishedDiagnostics(fieldOf(message, "params"));
  }

  /** Tell the server `file` is open with `text`. */
  openDocument(file: string, text: string): void {
    if (this.versionByOpenFile.has(file)) {
      this.changeDocument(file, text);
      return;
    }
    this.versionByOpenFile.set(file, 1);
    this.sendOnceInitialized({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri: fileUriOf(file), languageId: "python", version: 1, text } } });
  }

  /** Tell the server `file` now holds `text`. */
  changeDocument(file: string, text: string): void {
    const version = this.versionByOpenFile.get(file);
    if (version === undefined) return;
    this.versionByOpenFile.set(file, version + 1);
    this.sendOnceInitialized({ jsonrpc: "2.0", method: "textDocument/didChange", params: { textDocument: { uri: fileUriOf(file), version: version + 1 }, contentChanges: [{ text }] } });
  }

  /** Tell the server `file` was saved. */
  noteDocumentSaved(file: string): void {
    if (!this.versionByOpenFile.has(file)) return;
    this.sendOnceInitialized({ jsonrpc: "2.0", method: "textDocument/didSave", params: { textDocument: { uri: fileUriOf(file) } } });
  }

  /** Tell the server `file` is no longer open. */
  closeDocument(file: string): void {
    if (!this.versionByOpenFile.delete(file)) return;
    this.sendOnceInitialized({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: fileUriOf(file) } } });
  }

  /** The completions at `line` and `character`, both zero-based, in `file`; none once the session ends. */
  completionsAt(file: string, line: number, character: number): Promise<CodeEditorCompletion[]> {
    return this.ask("textDocument/completion", { textDocument: { uri: fileUriOf(file) }, position: { line, character } }).then((result) =>
      completionItemsOf(result).flatMap((item) => {
        const completion = codeEditorCompletionFrom(item);
        return completion === null ? [] : [completion];
      }),
    );
  }

  /** What the server says of the symbol at `line` and `character`, both zero-based, in `file`, as Markdown; `null` when it says nothing. */
  hoverAt(file: string, line: number, character: number): Promise<string | null> {
    return this.ask("textDocument/hover", { textDocument: { uri: fileUriOf(file) }, position: { line, character } }).then((result) => markupText(fieldOf(result, "contents")));
  }

  /** The session ended: every question waiting is answered with nothing, and nothing more is sent. */
  end(): void {
    this.hasEnded = true;
    this.messagesUntilInitialized.splice(0);
    for (const pendingRequest of this.pendingRequests.values()) pendingRequest.answer(undefined);
    this.pendingRequests.clear();
  }

  private ask(method: string, params: JsonValue): Promise<JsonValue | undefined> {
    if (this.hasEnded) return Promise.resolve(undefined);
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, { answer: resolve });
      this.sendOnceInitialized({ jsonrpc: "2.0", id: requestId, method, params });
    });
  }

  private sendOnceInitialized(message: JsonValue): void {
    if (this.hasEnded) return;
    if (this.isInitialized) this.sendMessage(message);
    else this.messagesUntilInitialized.push(message);
  }

  private answerToTheServersRequest(method: string, params: JsonValue | undefined): JsonValue {
    if (method !== "workspace/configuration") return null;
    const items = fieldOf(params, "items");
    if (!Array.isArray(items)) return [];
    return items.map((item): JsonValue => {
      switch (textOf(fieldOf(item, "section"))) {
        case "python":
          return { pythonPath: projectVenvPythonOf(this.projectFolder) };
        case "python.analysis":
        case "pyright":
          return {};
        default:
          return null;
      }
    });
  }

  private takeThePublishedDiagnostics(params: JsonValue | undefined): void {
    const uri = textOf(fieldOf(params, "uri"));
    const file = uri === null ? null : fileOfUri(uri);
    const lspDiagnostics = fieldOf(params, "diagnostics");
    if (file === null || !Array.isArray(lspDiagnostics)) return;
    this.listeners.onDiagnosticsPublished(
      file,
      lspDiagnostics.flatMap((lspDiagnostic) => {
        const diagnostic = codeEditorDiagnosticFrom(lspDiagnostic);
        return diagnostic === null ? [] : [diagnostic];
      }),
    );
  }
}
