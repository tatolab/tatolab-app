import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import type { CodeEditorDiagnostic, CodeEditorLanguage, CodeEditorLanguageHelp } from "./support/code_text_editor_types";

type CodeTextEditorMonaco = typeof import("./support/code_text_editor_monaco");

let monacoLoading: Promise<CodeTextEditorMonaco> | null = null;
let monacoLoaded: CodeTextEditorMonaco | null = null;

/** Monaco, loaded and set up the first time a code editor is drawn, so a window without one never loads it. */
function loadMonacoOnce(): Promise<CodeTextEditorMonaco> {
  monacoLoading ??= import("./support/code_text_editor_monaco").then((loaded) => {
    loaded.setUpMonacoOnce();
    monacoLoaded = loaded;
    return loaded;
  });
  return monacoLoading;
}

/** Drop the text Monaco holds for `documentKey`, its undo history with it; nothing when Monaco never loaded. */
export function forgetCodeEditorDocument(documentKey: string): void {
  if (monacoLoaded === null) return;
  const uri = monacoLoaded.monaco.Uri.file(documentKey);
  monacoLoaded.keepTheLanguageHelpOfTheDocument(uri.toString(), null);
  monacoLoaded.monaco.editor.getModel(uri)?.dispose();
}

export interface CodeTextEditorProps extends ControlDataAttributes {
  /** The document's absolute path, which names its text and undo history across every editor showing it. */
  documentKey: string;
  language: CodeEditorLanguage;
  /** The document's text as its owner holds it; the editor takes it whenever it differs from what it shows. */
  text: string;
  isReadOnly: boolean;
  diagnostics: readonly CodeEditorDiagnostic[];
  languageHelp: CodeEditorLanguageHelp | null;
  onTextEdited(text: string): void;
  /** ⌘S on macOS, Ctrl+S on Linux. */
  onSaveAsked(): void;
  /** The line to bring to the middle and put the cursor on, once for each `asked_id`; `null` or left out brings none. */
  lineBroughtIntoView?: CodeTextEditorLineAskedFor | null;
  /** Told the `asked_id` of the line just brought into view, so the asker can stop asking for it before an editor shown again would bring it again. */
  onLineBroughtIntoView?(askedId: string): void;
}

/** A line of the document asked to be brought into view, by the ask's own id, so the same line asked again is a new ask. */
export interface CodeTextEditorLineAskedFor {
  line: number;
  asked_id: string;
}

/** A document's text in Monaco, coloured, marked with its diagnostics, completing and describing symbols through `languageHelp`. */
export function CodeTextEditor({ documentKey, language, text, isReadOnly, diagnostics, languageHelp, onTextEdited, onSaveAsked, lineBroughtIntoView = null, onLineBroughtIntoView, ...controlDataAttributes }: CodeTextEditorProps) {
  const editorHostRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{ monacoModule: CodeTextEditorMonaco; editor: import("./support/code_text_editor_monaco").monaco.editor.IStandaloneCodeEditor } | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const latestCallbacks = useRef({ onTextEdited, onSaveAsked, onLineBroughtIntoView });
  const isTakingTheOwnersText = useRef(false);
  const lineAskBroughtIntoView = useRef<string | null>(null);
  useLayoutEffect(() => {
    latestCallbacks.current = { onTextEdited, onSaveAsked, onLineBroughtIntoView };
  });

  useEffect(() => {
    let isUnmounted = false;
    let disposeTheEditor = () => {};
    loadMonacoOnce().then(
      (monacoModule) => {
        const editorHost = editorHostRef.current;
        if (isUnmounted || editorHost === null) return;
        const { monaco } = monacoModule;
        const styleOfTheWindow = getComputedStyle(document.documentElement);
        const editor = monaco.editor.create(editorHost, {
          model: null,
          theme: monacoModule.CODE_EDITOR_THEME_NAME,
          automaticLayout: true,
          minimap: { enabled: false },
          fontFamily: styleOfTheWindow.getPropertyValue("--font-mono"),
          fontSize: 12.5,
          lineHeight: 19,
          lineNumbersMinChars: 3,
          glyphMargin: false,
          folding: true,
          renderLineHighlight: "line",
          scrollBeyondLastLine: false,
          padding: { top: 8, bottom: 8 },
          tabSize: 4,
          insertSpaces: true,
          fixedOverflowWidgets: true,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
          stickyScroll: { enabled: false },
        });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => latestCallbacks.current.onSaveAsked());
        const contentChange = editor.onDidChangeModelContent(() => {
          if (isTakingTheOwnersText.current) return;
          const model = editor.getModel();
          if (model !== null) latestCallbacks.current.onTextEdited(model.getValue());
        });
        disposeTheEditor = () => {
          contentChange.dispose();
          editor.dispose();
        };
        setLoaded({ monacoModule, editor });
      },
      (failure: unknown) => {
        if (!isUnmounted) setLoadFailure(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      isUnmounted = true;
      disposeTheEditor();
    };
  }, []);

  useEffect(() => {
    if (loaded === null) return;
    const { monaco } = loaded.monacoModule;
    const uri = monaco.Uri.file(documentKey);
    const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(text, language, uri);
    if (model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language);
    if (model.getValue() !== text) {
      isTakingTheOwnersText.current = true;
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
      isTakingTheOwnersText.current = false;
    }
    if (loaded.editor.getModel() !== model) loaded.editor.setModel(model);
  }, [loaded, documentKey, language, text]);

  useEffect(() => {
    if (loaded === null || lineBroughtIntoView === null || lineAskBroughtIntoView.current === lineBroughtIntoView.asked_id) return;
    const model = loaded.editor.getModel();
    if (model === null || model.uri.toString() !== loaded.monacoModule.monaco.Uri.file(documentKey).toString()) return;
    lineAskBroughtIntoView.current = lineBroughtIntoView.asked_id;
    const lineNumber = Math.min(Math.max(1, Math.round(lineBroughtIntoView.line)), model.getLineCount());
    loaded.editor.setPosition({ lineNumber, column: model.getLineFirstNonWhitespaceColumn(lineNumber) || 1 });
    loaded.editor.revealLineInCenter(lineNumber);
    latestCallbacks.current.onLineBroughtIntoView?.(lineBroughtIntoView.asked_id);
  }, [loaded, documentKey, text, lineBroughtIntoView]);

  useEffect(() => {
    loaded?.editor.updateOptions({ readOnly: isReadOnly, readOnlyMessage: { value: "This file belongs to an imported project, which the studio opens read-only." } });
  }, [loaded, isReadOnly]);

  useEffect(() => {
    if (loaded === null) return;
    const { monaco, MARKER_SEVERITY_OF, LANGUAGE_SERVER_MARKER_OWNER } = loaded.monacoModule;
    const model = monaco.editor.getModel(monaco.Uri.file(documentKey));
    if (model === null) return;
    monaco.editor.setModelMarkers(
      model,
      LANGUAGE_SERVER_MARKER_OWNER,
      diagnostics.map((diagnostic) => ({
        startLineNumber: diagnostic.start_line,
        startColumn: diagnostic.start_column,
        endLineNumber: diagnostic.end_line,
        endColumn: diagnostic.end_column,
        severity: MARKER_SEVERITY_OF[diagnostic.severity],
        message: diagnostic.message,
        source: diagnostic.source ?? undefined,
      })),
    );
  }, [loaded, documentKey, diagnostics, text]);

  useEffect(() => {
    if (loaded === null) return;
    const modelUri = loaded.monacoModule.monaco.Uri.file(documentKey).toString();
    loaded.monacoModule.keepTheLanguageHelpOfTheDocument(modelUri, languageHelp);
  }, [loaded, documentKey, languageHelp]);

  return (
    <div className="relative min-h-0 flex-1" {...controlDataAttributes}>
      <div ref={editorHostRef} className="absolute inset-0" data-code-text-editor-ready={loaded !== null} />
      {loadFailure !== null && <p className="absolute inset-x-3 top-3 text-xs text-danger-text">The editor did not load: {loadFailure}</p>}
    </div>
  );
}
