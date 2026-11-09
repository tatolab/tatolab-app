// What the code editor shows and asks for beside a document's text, apart from the editor itself so
// a view's model can name them without loading the editor.

/** How serious a diagnostic is, as a language server grades it. */
export type CodeEditorDiagnosticSeverity = "error" | "warning" | "information" | "hint";

/** A problem a language server found in a document, its lines and columns counted from 1. */
export interface CodeEditorDiagnostic {
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  severity: CodeEditorDiagnosticSeverity;
  message: string;
  /** Who found it, such as `Pyright`. */
  source: string | null;
}

/** What a completion completes, which picks its icon in the suggestion list. */
export type CodeEditorCompletionKind =
  | "method"
  | "function"
  | "constructor"
  | "field"
  | "variable"
  | "class"
  | "interface"
  | "module"
  | "property"
  | "value"
  | "enum"
  | "keyword"
  | "enum_member"
  | "constant"
  | "struct"
  | "type_parameter"
  | "text";

/** One suggestion offered at the cursor. */
export interface CodeEditorCompletion {
  label: string;
  kind: CodeEditorCompletionKind;
  detail: string | null;
  /** Markdown. */
  documentation: string | null;
  insert_text: string;
  sort_text: string | null;
  filter_text: string | null;
}

/** The language a document is coloured as. */
export type CodeEditorLanguage = "python" | "ini" | "plaintext";

/** Where the editor asks what to suggest and what a symbol is, at a line and character both counted from 0. */
export interface CodeEditorLanguageHelp {
  completionsAt(line: number, character: number): Promise<CodeEditorCompletion[]>;
  /** Markdown, or `null` when there is nothing to say. */
  hoverAt(line: number, character: number): Promise<string | null>;
}

/** The language a file's name says it is written in. */
export function codeEditorLanguageOfFile(file: string): CodeEditorLanguage {
  if (file.endsWith(".py") || file.endsWith(".pyi")) return "python";
  if (file.endsWith(".toml") || file.endsWith(".ini") || file.endsWith(".cfg")) return "ini";
  return "plaintext";
}
