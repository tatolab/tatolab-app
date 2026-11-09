// Monaco as the code editor uses it, loaded only once a code editor is drawn: Python and TOML
// colouring, one theme read from the window's tokens, and one completion and hover provider for
// Python that asks the help of the document it is asked about.

import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/languages/definitions/ini/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import type { CodeEditorCompletionKind, CodeEditorDiagnosticSeverity, CodeEditorLanguageHelp } from "./code_text_editor_types";

export { monaco };

/** The theme every code editor is drawn in. */
export const CODE_EDITOR_THEME_NAME = "tato-studio";

/** The marker owner a document's language-server diagnostics are kept under. */
export const LANGUAGE_SERVER_MARKER_OWNER = "language-server";

const languageHelpByModelUri = new Map<string, CodeEditorLanguageHelp>();

/** Answer completion and hover in the document at `modelUri` with `languageHelp`, or with nothing for `null`. */
export function keepTheLanguageHelpOfTheDocument(modelUri: string, languageHelp: CodeEditorLanguageHelp | null): void {
  if (languageHelp === null) languageHelpByModelUri.delete(modelUri);
  else languageHelpByModelUri.set(modelUri, languageHelp);
}

/** A CSS colour as Monaco takes it, `#rrggbb` or `#rrggbbaa`; `rgba()` and `rgb()` are written out in hex. */
export function monacoColorOf(cssColor: string): string {
  const trimmed = cssColor.trim();
  if (trimmed.startsWith("#")) return trimmed;
  const channels = /^rgba?\(([^)]*)\)$/.exec(trimmed)?.[1]?.split(",").map((channel) => Number.parseFloat(channel.trim()));
  if (channels === undefined || channels.length < 3 || channels.some(Number.isNaN)) return "#00000000";
  const [red = 0, green = 0, blue = 0, alpha = 1] = channels;
  const twoHexDigits = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
  return `#${twoHexDigits(red)}${twoHexDigits(green)}${twoHexDigits(blue)}${alpha >= 1 ? "" : twoHexDigits(alpha * 255)}`;
}

function windowToken(tokenName: string): string {
  return monacoColorOf(getComputedStyle(document.documentElement).getPropertyValue(tokenName));
}

function tokenForeground(tokenName: string): string {
  return windowToken(tokenName).slice(1, 7);
}

const COMPLETION_ITEM_KIND_OF: Record<CodeEditorCompletionKind, monaco.languages.CompletionItemKind> = {
  method: monaco.languages.CompletionItemKind.Method,
  function: monaco.languages.CompletionItemKind.Function,
  constructor: monaco.languages.CompletionItemKind.Constructor,
  field: monaco.languages.CompletionItemKind.Field,
  variable: monaco.languages.CompletionItemKind.Variable,
  class: monaco.languages.CompletionItemKind.Class,
  interface: monaco.languages.CompletionItemKind.Interface,
  module: monaco.languages.CompletionItemKind.Module,
  property: monaco.languages.CompletionItemKind.Property,
  value: monaco.languages.CompletionItemKind.Value,
  enum: monaco.languages.CompletionItemKind.Enum,
  keyword: monaco.languages.CompletionItemKind.Keyword,
  enum_member: monaco.languages.CompletionItemKind.EnumMember,
  constant: monaco.languages.CompletionItemKind.Constant,
  struct: monaco.languages.CompletionItemKind.Struct,
  type_parameter: monaco.languages.CompletionItemKind.TypeParameter,
  text: monaco.languages.CompletionItemKind.Text,
};

/** How a diagnostic of each severity is marked. */
export const MARKER_SEVERITY_OF: Record<CodeEditorDiagnosticSeverity, monaco.MarkerSeverity> = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  information: monaco.MarkerSeverity.Info,
  hint: monaco.MarkerSeverity.Hint,
};

let isMonacoSetUp = false;

/** Give Monaco its worker, the studio's theme and the Python providers, once. */
export function setUpMonacoOnce(): void {
  if (isMonacoSetUp) return;
  isMonacoSetUp = true;
  globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };
  monaco.editor.defineTheme(CODE_EDITOR_THEME_NAME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: tokenForeground("--studio-code-text") },
      { token: "keyword", foreground: tokenForeground("--studio-code-keyword") },
      { token: "string", foreground: tokenForeground("--studio-code-string") },
      { token: "string.escape", foreground: tokenForeground("--studio-code-number") },
      { token: "number", foreground: tokenForeground("--studio-code-number") },
      { token: "comment", foreground: tokenForeground("--studio-code-comment"), fontStyle: "italic" },
      { token: "tag", foreground: tokenForeground("--studio-code-decorator") },
      { token: "metatag", foreground: tokenForeground("--studio-code-keyword") },
      { token: "key", foreground: tokenForeground("--studio-code-decorator") },
      { token: "delimiter", foreground: tokenForeground("--fg-3") },
    ],
    colors: {
      "editor.background": windowToken("--studio-area"),
      "editor.foreground": windowToken("--studio-code-text"),
      "editorLineNumber.foreground": windowToken("--studio-code-line-number"),
      "editorLineNumber.activeForeground": windowToken("--fg-2"),
      "editor.lineHighlightBackground": windowToken("--studio-code-current-line"),
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": windowToken("--studio-code-selection"),
      "editorCursor.foreground": windowToken("--fg"),
      "editorIndentGuide.background1": windowToken("--line"),
      "editorIndentGuide.activeBackground1": windowToken("--line-strong"),
      "editorWidget.background": windowToken("--popover"),
      "editorWidget.border": windowToken("--line-strong"),
      "editorSuggestWidget.background": windowToken("--popover"),
      "editorSuggestWidget.border": windowToken("--line-strong"),
      "editorSuggestWidget.selectedBackground": windowToken("--studio-tree-selected"),
      "editorHoverWidget.background": windowToken("--popover"),
      "editorHoverWidget.border": windowToken("--line-strong"),
      "editorError.foreground": windowToken("--danger"),
      "editorWarning.foreground": windowToken("--warn"),
      "scrollbarSlider.background": "#ffffff14",
      "scrollbarSlider.hoverBackground": "#ffffff24",
      "scrollbarSlider.activeBackground": "#ffffff30",
      focusBorder: "#00000000",
    },
  });
  monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: ["."],
    provideCompletionItems: async (model, position) => {
      const languageHelp = languageHelpByModelUri.get(model.uri.toString());
      if (languageHelp === undefined) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const completions = await languageHelp.completionsAt(position.lineNumber - 1, position.column - 1);
      return {
        suggestions: completions.map((completion) => ({
          label: completion.label,
          kind: COMPLETION_ITEM_KIND_OF[completion.kind],
          detail: completion.detail ?? undefined,
          documentation: completion.documentation === null ? undefined : { value: completion.documentation },
          insertText: completion.insert_text,
          sortText: completion.sort_text ?? undefined,
          filterText: completion.filter_text ?? undefined,
          range,
        })),
      };
    },
  });
  monaco.languages.registerHoverProvider("python", {
    provideHover: async (model, position) => {
      const languageHelp = languageHelpByModelUri.get(model.uri.toString());
      if (languageHelp === undefined) return null;
      const hoverMarkdown = await languageHelp.hoverAt(position.lineNumber - 1, position.column - 1);
      return hoverMarkdown === null ? null : { contents: [{ value: hoverMarkdown }] };
    },
  });
}
