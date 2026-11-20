// @vitest-environment happy-dom
import { fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountedWindowOverTheMock, coreViewPage, outlinerRow, PULSE_STAGE_FOLDER, PULSE_STAGE_MAIN_STREAM, theAreasShownAre, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

/**
 * What the Monaco stand-in was asked to do: the editors it made, and each line an editor put its cursor on and brought to
 * the middle, by the file it showed then.
 */
const monacoStandIn = vi.hoisted(() => {
  const asked: { editorsMade: number; linesBroughtIntoView: { file: string; line: number }[] } = { editorsMade: 0, linesBroughtIntoView: [] };
  return asked;
});

// Monaco draws nothing in happy-dom, so the window's Code runs over a stand-in that holds each file's text as a model and
// records where an editor puts its cursor.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  const models = new Map<string, ReturnType<typeof modelOf>>();
  const uriOf = (path: string) => ({ path, toString: () => `file://${path}` });
  function modelOf(text: string, languageId: string, uri: ReturnType<typeof uriOf>) {
    let value = text;
    let language = languageId;
    return {
      uri,
      getValue: () => value,
      getLanguageId: () => language,
      setLanguageId: (changed: string) => (language = changed),
      getLineCount: () => value.split("\n").length,
      getLineFirstNonWhitespaceColumn: (lineNumber: number) => {
        const lineText = value.split("\n")[lineNumber - 1] ?? "";
        const firstNonBlank = lineText.search(/\S/);
        return firstNonBlank === -1 ? 0 : firstNonBlank + 1;
      },
      getFullModelRange: () => ({}),
      pushEditOperations: (_selections: unknown, edits: { text: string }[]) => (value = edits[0]?.text ?? value),
      dispose: () => models.delete(uri.toString()),
    };
  }
  return {
    CODE_EDITOR_THEME_NAME: "stand-in",
    LANGUAGE_SERVER_MARKER_OWNER: "stand-in",
    MARKER_SEVERITY_OF: { error: 8, warning: 4, information: 2, hint: 1 },
    setUpMonacoOnce: () => undefined,
    keepTheLanguageHelpOfTheDocument: () => undefined,
    monaco: {
      KeyMod: { CtrlCmd: 2048 },
      KeyCode: { KeyS: 49 },
      Uri: { file: uriOf },
      editor: {
        getModel: (uri: ReturnType<typeof uriOf>) => models.get(uri.toString()) ?? null,
        createModel: (text: string, language: string, uri: ReturnType<typeof uriOf>) => {
          const model = modelOf(text, language, uri);
          models.set(uri.toString(), model);
          return model;
        },
        setModelLanguage: (model: ReturnType<typeof modelOf>, language: string) => model.setLanguageId(language),
        setModelMarkers: () => undefined,
        create: () => {
          monacoStandIn.editorsMade += 1;
          let shown: ReturnType<typeof modelOf> | null = null;
          return {
            addCommand: () => undefined,
            onDidChangeModelContent: () => ({ dispose: () => undefined }),
            updateOptions: () => undefined,
            getModel: () => shown,
            setModel: (model: ReturnType<typeof modelOf>) => (shown = model),
            setPosition: () => undefined,
            revealLineInCenter: (line: number) => monacoStandIn.linesBroughtIntoView.push({ file: shown?.uri.path ?? "", line }),
            dispose: () => undefined,
          };
        },
      },
    },
  };
});

beforeEach(() => {
  monacoStandIn.editorsMade = 0;
  monacoStandIn.linesBroughtIntoView = [];
});

afterEach(cleanUpTheWindowsOfEarlierTests);

const KALEIDOSCOPE_FILE = `${PULSE_STAGE_FOLDER}/nodes/stage_shaders.py`;
const AREAS_OF_THE_CODE_LAYOUT = ["code-files", "code", "code-stream-graph", "code-viewer"];

const editCodeChoice = (page: Document, selector: string) => waitFor(() => page.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>(selector) ?? expect.unreachable(`no ${selector}`));

/** Whether the window still shows the default layout's areas, which a refused Create new node leaves as they were. */
function areaIdsOfTheDefaultLayoutStillShown(): boolean {
  return ["outliner", "stream-graph", "viewer", "properties"].every((areaId) => document.querySelector(`[data-studio-area="${areaId}"]`) !== null);
}

/** The file Code shows once it has read it, and the editor is drawn over it. */
async function codeShowsTheFile(file: string): Promise<void> {
  await waitFor(() => expect(coreViewPage("code", "code").querySelector("[data-code-document-file]")?.getAttribute("data-code-document-file")).toBe(file));
  await waitFor(() => expect(coreViewPage("code", "code").querySelector('[data-code-text-editor-ready="true"]')).not.toBeNull());
}

/** Waits for the Outliner to have read the project's node types: Edit code on the Kaleidoscope's row, opened again until it does, offers to open its file. */
async function theOutlinerHasReadTheNodeTypes(): Promise<void> {
  const outliner = coreViewPage("outliner", "outliner");
  await waitFor(() => outlinerRow(`node:${PULSE_STAGE_MAIN_STREAM}/kaleidoscope`));
  await waitFor(
    async () => {
      fireEvent.contextMenu(outlinerRow(`node:${PULSE_STAGE_MAIN_STREAM}/kaleidoscope`));
      const editCode = await editCodeChoice(outliner, '[data-outliner-choice="edit_code"]');
      const isOffered = editCode.getAttribute("aria-disabled") !== "true";
      fireEvent.keyDown(editCode, { key: "Escape" });
      await waitFor(() => expect(editCode.isConnected).toBe(false));
      expect(isOffered).toBe(true);
    },
    { timeout: 8000 },
  );
}

describe("a node's own code", () => {
  it("opens from a node's Outliner row on a double-click, in the Code layout Studio ships, at the line its class is declared at, and the cursor stays where it is as the editor is drawn again", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running&outliner=open");
    await theOutlinerHasReadTheNodeTypes();
    fireEvent.doubleClick(outlinerRow(`node:${PULSE_STAGE_MAIN_STREAM}/kaleidoscope`));

    await theAreasShownAre(AREAS_OF_THE_CODE_LAYOUT);
    await codeShowsTheFile(KALEIDOSCOPE_FILE);
    await waitFor(() => expect(monacoStandIn.linesBroughtIntoView).toEqual([{ file: KALEIDOSCOPE_FILE, line: 196 }]));

    const editorsBefore = monacoStandIn.editorsMade;
    fireEvent.click(coreViewPage("code", "code").querySelector<HTMLElement>("[data-code-logs-toggle]") ?? expect.unreachable("no logs toggle"));
    await waitFor(() => expect(monacoStandIn.editorsMade).toBeGreaterThan(editorsBefore));
    await codeShowsTheFile(KALEIDOSCOPE_FILE);
    expect(monacoStandIn.linesBroughtIntoView).toEqual([{ file: KALEIDOSCOPE_FILE, line: 196 }]);
  });

  it("offers Edit code on a node's Outliner row, and Edit code dimmed with why on a node whose type has no file of the project", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running&outliner=open");
    const outliner = coreViewPage("outliner", "outliner");
    await theOutlinerHasReadTheNodeTypes();

    fireEvent.contextMenu(outlinerRow(`node:${PULSE_STAGE_MAIN_STREAM}/speaker`));
    const dimmed = await editCodeChoice(outliner, '[data-outliner-choice="edit_code"]');
    expect(dimmed.getAttribute("aria-disabled")).toBe("true");
    expect(dimmed.ownerDocument.getElementById(dimmed.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "tatolab.speaker:SpeakerSink comes from tatolab-speaker 0.68.82, installed with the runtime, not from a file of the project.",
    );
    fireEvent.keyDown(dimmed, { key: "Escape" });
    await waitFor(() => expect(dimmed.isConnected).toBe(false));

    fireEvent.contextMenu(outlinerRow(`node:${PULSE_STAGE_MAIN_STREAM}/kaleidoscope`));
    const editCode = await editCodeChoice(outliner, '[data-outliner-choice="edit_code"]');
    expect(editCode.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(editCode);
    await theAreasShownAre(AREAS_OF_THE_CODE_LAYOUT);
    await codeShowsTheFile(KALEIDOSCOPE_FILE);
  });

  it("opens from Edit code on a node's card in the Stream graph", async () => {
    await mountedWindowOverTheMock("state=running&outliner=open");
    fireEvent.doubleClick(await waitFor(() => outlinerRow(`stream:${PULSE_STAGE_MAIN_STREAM}`)));
    const streamGraph = coreViewPage("stream_graph", "stream-graph");

    fireEvent.contextMenu(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="kaleidoscope"]') ?? expect.unreachable("no Kaleidoscope card")));
    fireEvent.click(await editCodeChoice(streamGraph, '[data-node-graph-choice="edit_code"]'));

    await theAreasShownAre(AREAS_OF_THE_CODE_LAYOUT);
    await codeShowsTheFile(KALEIDOSCOPE_FILE);
    expect(monacoStandIn.linesBroughtIntoView).toEqual([{ file: KALEIDOSCOPE_FILE, line: 196 }]);
  });

  it("makes a new node from Create new node beside the Add node search: its file from the runtime's template, its node in the graph, and the Code layout on its file, and one undo takes the node back and leaves the file", { timeout: 20_000 }, async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&outliner=open");
    fireEvent.doubleClick(await waitFor(() => outlinerRow(`stream:${PULSE_STAGE_MAIN_STREAM}`)));
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    await waitFor(() => streamGraph.querySelector('[data-node-graph-card="kaleidoscope"]') ?? expect.unreachable("no Kaleidoscope card"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-tool="add_node"]') ?? expect.unreachable("no Add node in the ribbon")));
    const nodeSearch = await waitFor(() => within(streamGraph.body).getByRole("dialog", { name: "Add a node" }));

    fireEvent.click(within(nodeSearch).getByRole("button", { name: "Create new node" }));
    const newNode = await waitFor(() => within(document.body).getByRole("dialog", { name: "Create new node" }));
    expect(within(streamGraph.body).queryByRole("dialog", { name: "Add a node" })).toBeNull();
    const pathField = newNode.querySelector<HTMLInputElement>("[data-new-node-file-path]") ?? expect.unreachable("no path field");
    expect(pathField.value).toBe("nodes/");

    fireEvent.change(pathField, { target: { value: "nodes/looks.py" } });
    fireEvent.keyDown(pathField, { key: "Enter" });
    await waitFor(() => expect(newNode.querySelector("[data-new-node-file-refusal]")?.textContent).toContain("the project already holds `nodes/looks.py`"));
    expect(areaIdsOfTheDefaultLayoutStillShown()).toBe(true);

    fireEvent.change(pathField, { target: { value: "nodes/sparkle.py" } });
    fireEvent.keyDown(pathField, { key: "Enter" });
    await theAreasShownAre(AREAS_OF_THE_CODE_LAYOUT);
    await codeShowsTheFile(`${PULSE_STAGE_FOLDER}/nodes/sparkle.py`);
    const codeLayoutsGraph = coreViewPage("stream_graph", "code-stream-graph");
    const cardsOfTheCodeLayoutsGraph = () => [...codeLayoutsGraph.querySelectorAll("[data-node-graph-card]")].map((card) => card.getAttribute("data-node-graph-card"));
    await waitFor(() => expect(cardsOfTheCodeLayoutsGraph()).toContain("sparkle"));

    fireEvent.keyDown(document, { key: "z", metaKey: true });
    await waitFor(() => expect(cardsOfTheCodeLayoutsGraph()).not.toContain("sparkle"));
    await expect(backend.readProjectFile(`${PULSE_STAGE_FOLDER}/nodes/sparkle.py`)).resolves.toMatchObject({ text: expect.stringContaining("class Sparkle:") });
  });

  it("keeps the new node's file, shows why, and stays on the layout it was on, when the runtime refuses to place its node", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running&outliner=open", {
      createNodeFile: async (file) => ({ file, node_type: "nodes.unread:Unread" }),
    });
    fireEvent.doubleClick(await waitFor(() => outlinerRow(`stream:${PULSE_STAGE_MAIN_STREAM}`)));
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    await waitFor(() => streamGraph.querySelector('[data-node-graph-card="kaleidoscope"]') ?? expect.unreachable("no Kaleidoscope card"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-tool="add_node"]') ?? expect.unreachable("no Add node in the ribbon")));
    fireEvent.click(within(await waitFor(() => within(streamGraph.body).getByRole("dialog", { name: "Add a node" }))).getByRole("button", { name: "Create new node" }));
    const pathField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-node-file-path]") ?? expect.unreachable("no path field"));
    fireEvent.change(pathField, { target: { value: "nodes/unread.py" } });
    fireEvent.keyDown(pathField, { key: "Enter" });

    await waitFor(() => expect(streamGraph.body.textContent).toContain("the recorded node types describe no node type `nodes.unread:Unread`"));
    await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Create new node" })).toBeNull());
    expect(areaIdsOfTheDefaultLayoutStillShown()).toBe(true);
    expect(document.querySelector('[data-studio-area="code"]')).toBeNull();
  });

});
