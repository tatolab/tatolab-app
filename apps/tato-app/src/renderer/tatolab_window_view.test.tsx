// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenProjectReading, PoppedOutView, RecentProject, SystemMenuBarMenu, TatolabStatus } from "../shared/tatolab_backend_contract";
import { createMockTatolabBackend, readMockTatolabOptions } from "../../mock/mock_tatolab_backend";
import { mockStreamIdOf } from "../../mock/mock_stream_fixtures";
import type { TatolabBackend } from "./backend/tatolab_backend";
import { studioLayoutsStorageKey } from "./studio_shell/studio_layouts";
import { mountTatolabWindow } from "./tatolab_window_view";
import { drawTheCoreViewsInTheirFrames } from "./view_host/fake_core_view_frames";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

/** Stops drawing the core views of the window mounted last, unmounting each. */
let stopDrawingTheCoreViews: () => void = () => undefined;

/** The keydown listeners, and the load listeners that hand a view's frame one, each mounted window added to the document, removed after each test so a window from an earlier test never answers a shortcut. */
const documentShortcutListenersAdded: { eventName: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }[] = [];

function removeTheKeydownListenersOfEarlierWindows(): void {
  vi.restoreAllMocks();
  for (const { eventName, listener, options } of documentShortcutListenersAdded.splice(0)) document.removeEventListener(eventName, listener, options);
}

/** Hides every window mounted so far, so none starts another read, and lets the reads already in flight settle while the page is still here. */
async function hideTheWindowsOfEarlierTestsAndLetTheirReadsSettle(): Promise<void> {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
  await act(() => new Promise<void>((settled) => setTimeout(settled, 100)));
  Reflect.deleteProperty(document, "visibilityState");
}

afterEach(async () => {
  await hideTheWindowsOfEarlierTestsAndLetTheirReadsSettle();
  removeTheKeydownListenersOfEarlierWindows();
  stopDrawingTheCoreViews();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});

/** The real window over the mock backend opened with `pageQuery`, mounted the way `main.ts` mounts it. */
async function mountedWindowOverTheMock(pageQuery: string, backendChanges: Partial<TatolabBackend> = {}, onTheFirstStatusDrawn?: () => void) {
  removeTheKeydownListenersOfEarlierWindows();
  const backend: TatolabBackend = { ...createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams(pageQuery))), ...backendChanges };
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  stopDrawingTheCoreViews();
  stopDrawingTheCoreViews = drawTheCoreViewsInTheirFrames();
  let showTatolabStatus: ((status: TatolabStatus) => void) | null = null;
  await backend.onTatolabStatusChanged((status) => showTatolabStatus?.(status));
  const firstStatus = await backend.getTatolabStatus();
  vi.spyOn(document, "addEventListener").mockImplementation((eventName: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    if ((eventName === "keydown" || eventName === "load") && listener !== null) documentShortcutListenersAdded.push({ eventName, listener, options });
    EventTarget.prototype.addEventListener.call(document, eventName, listener, options);
  });
  await act(async () => {
    showTatolabStatus = mountTatolabWindow(rootElement, backend, firstStatus.platform, onTheFirstStatusDrawn);
    showTatolabStatus(firstStatus);
  });
  const showStatusAsTheBackendWould = (status: TatolabStatus) => act(() => showTatolabStatus?.(status));
  return { backend, windowContent: within(rootElement), showStatusAsTheBackendWould };
}

function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

/** Presses the element as a pointer does: a menu's trigger opens on the press. */
function pressAsAPointerDoes(element: HTMLElement): void {
  fireEvent.pointerDown(element, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.pointerUp(element, { button: 0, pointerType: "mouse" });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element);
}

/** The mock backend's changes that keep what the window shows in macOS's system menu bar, and choose from it as a person does. */
function systemMenuBarOverTheMock() {
  const menusShown: SystemMenuBarMenu[][] = [];
  const entryChosenListeners: ((entryId: string) => void)[] = [];
  const backendChanges: Partial<TatolabBackend> = {
    showTheMenusInTheSystemMenuBar: async (menus) => {
      menusShown.push(menus);
    },
    onSystemMenuBarEntryChosen: (listener) => {
      entryChosenListeners.push(listener);
      return () => {};
    },
  };
  const menusShownLast = () => menusShown.at(-1) ?? expect.unreachable("the window showed no menus in the system menu bar");
  const chooseFromTheSystemMenuBar = (entryId: string) =>
    act(() => {
      for (const entryChosenListener of entryChosenListeners) entryChosenListener(entryId);
    });
  return { backendChanges, menusShownLast, chooseFromTheSystemMenuBar };
}

/** Chooses `entryLabel` from the menu bar's `menuLabel` menu, as a person does. */
async function chooseFromTheMenuBar(menuLabel: string, entryLabel: RegExp): Promise<void> {
  pressAsAPointerDoes(await waitFor(() => document.querySelector<HTMLElement>(`[data-studio-menu="${menuLabel}"]`) ?? expect.unreachable(`no ${menuLabel} menu`)));
  fireEvent.click(await screen.findByRole("menuitem", { name: entryLabel }));
}

async function openSettingsOn(section: string): Promise<void> {
  await waitFor(() => expect(document.querySelector("[data-studio-window]")).not.toBeNull());
  fireEvent.keyDown(document, { key: ",", metaKey: true });
  fireEvent.keyDown(document, { key: ",", ctrlKey: true });
  const sectionButton = await waitFor(() => document.querySelector<HTMLElement>(`[data-settings-section="${section}"]`) ?? expect.unreachable(`no ${section} section`));
  fireEvent.click(sectionButton);
  await waitFor(() => expect(document.querySelector(`[data-settings-page="${section}"]`)).not.toBeNull());
}

function settingsRow(rowName: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-settings-row="${rowName}"]`) ?? expect.unreachable(`no ${rowName} row`);
}

const PATTERN_PROJECT = "/Users/jonathanf/streams/pattern";
const CAMERA_PROJECT = "/Users/jonathanf/streams/camera";
const PATTERN_MAIN_STREAM = mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "main" });

/** The page of the core view `viewTypeId` drawn in its frame, in the area `areaId` when one is named. */
function coreViewPage(viewTypeId: string, areaId?: string): Document {
  const areaSelector = areaId === undefined ? "" : `[data-studio-area="${areaId}"] `;
  const frame = document.querySelector<HTMLIFrameElement>(`${areaSelector}iframe[data-tatolab-view="${viewTypeId}"]`) ?? expect.unreachable(`no ${viewTypeId} frame`);
  return frame.contentDocument ?? expect.unreachable(`the ${viewTypeId} frame has no page`);
}

function inTheCoreView(viewTypeId: string) {
  return within(coreViewPage(viewTypeId).body);
}

function outlinerRow(rowId: string): HTMLElement {
  return coreViewPage("outliner").querySelector<HTMLElement>(`[data-outliner] [data-tree-row-id="${CSS.escape(rowId)}"]`) ?? expect.unreachable(`no outliner row ${rowId}`);
}

function outlinerRowIds(): string[] {
  return [...coreViewPage("outliner").querySelectorAll<HTMLElement>("[data-outliner] [data-tree-row-id]")].map((row) => row.dataset.treeRowId ?? "");
}

/** Opens the row, which the Outliner keeps in its area's settings and draws open once Studio has kept them. */
async function openTheOutlinerRow(rowId: string): Promise<void> {
  const row = await waitFor(() => outlinerRow(rowId));
  fireEvent.click(row.querySelector<HTMLElement>("[data-tree-row-toggle]") ?? expect.unreachable(`no toggle on ${rowId}`));
  await waitFor(() => expect(outlinerRow(rowId).getAttribute("aria-expanded")).toBe("true"));
}

async function shownLayout(): Promise<string> {
  return waitFor(() => document.querySelector<HTMLElement>("[data-studio-layout]")?.dataset.studioLayout ?? expect.unreachable("no layout shown"));
}

describe("the studio", () => {
  it("opens the project in Build, the outliner showing the open project, its streams and its closed, read-only imports", async () => {
    await mountedWindowOverTheMock("state=running");

    expect(await shownLayout()).toBe("build");
    await waitFor(() => expect(outlinerRowIds()).toContain(`project:${PATTERN_PROJECT}`));
    expect(outlinerRowIds()).toEqual([
      "open_project_folder",
      `project:${PATTERN_PROJECT}`,
      `project:${PATTERN_PROJECT}/project_file`,
      `stream:${PATTERN_MAIN_STREAM}`,
      `stream:${mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "recorder" })}`,
      `stream:${mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "pattern_two" })}`,
      `project:${PATTERN_PROJECT}/node_types`,
      "imports",
    ]);
    expect(outlinerRow("open_project_folder").getAttribute("aria-level")).toBe("1");
    expect(outlinerRow(`project:${PATTERN_PROJECT}`).textContent).toBe("pattern");
    expect(outlinerRow(`project:${PATTERN_PROJECT}/project_file`).textContent).toBe("tatolab-project.json");
    expect(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`).textContent).toBe("main");
    expect(outlinerRow("imports").getAttribute("aria-expanded")).toBe("false");
    expect(outlinerRow("imports").textContent).toBe("Imports");
    expect(within(outlinerRow("imports")).getByRole("img", { name: "Read only" })).toBeTruthy();

    const outlinerFrame = document.querySelector<HTMLIFrameElement>('[data-studio-area="outliner"] iframe[data-tatolab-view="outliner"]') ?? expect.unreachable("no Outliner frame");
    expect(outlinerFrame.getAttribute("data-tatolab-view-access")).toBe("full");
    expect(outlinerFrame.getAttribute("src")).toMatch(/\/core_views\/outliner\/index\.html$/);
  });

  it("opens Imports on each import, read-only: its streams and node types, or an unreadable one's refusal", async () => {
    await mountedWindowOverTheMock("state=running");
    await waitFor(() => outlinerRow("imports"));
    await openTheOutlinerRow("imports");
    await openTheOutlinerRow(`project:${CAMERA_PROJECT}`);
    await openTheOutlinerRow(`project:${PATTERN_PROJECT}/imports/stage-lights`);

    expect(within(outlinerRow(`project:${CAMERA_PROJECT}`)).getByRole("img", { name: "Read only" })).toBeTruthy();
    expect(outlinerRow(`stream:${mockStreamIdOf({ project_directory: CAMERA_PROJECT, stream_name: "main" })}`).getAttribute("aria-level")).toBe("4");
    expect(outlinerRow(`project:${PATTERN_PROJECT}/imports/stage-lights/refusal`).textContent).toBe(
      `list_assets failed: ${PATTERN_PROJECT}/imports/stage-lights holds no project: it has no tatolab-project.json`,
    );
    await waitFor(() => outlinerRow(`project:${CAMERA_PROJECT}/node_types`));
    await openTheOutlinerRow(`project:${CAMERA_PROJECT}/node_types`);
    expect(outlinerRow(`project:${CAMERA_PROJECT}/node_types/category:Camera/node_type:camera.nodes:CameraTilt`).textContent).toBe("CameraTilt");
  });

  it("lists the open project's own node types in the outliner, and each module that does not parse in the parser's words", async () => {
    await mountedWindowOverTheMock("state=running");
    const nodeTypesRowId = `project:${PATTERN_PROJECT}/node_types`;
    await waitFor(() => outlinerRow(nodeTypesRowId));
    await openTheOutlinerRow(nodeTypesRowId);
    const invertingEffectRowId = `${nodeTypesRowId}/category:Effects/node_type:nodes.inverting_effect:InvertingEffect`;
    await waitFor(() => outlinerRow(invertingEffectRowId));
    expect(outlinerRow(`${nodeTypesRowId}/unreadable:nodes.half_written`).textContent).toBe("nodes/half_written.py:12:5: SyntaxError: expected ':'");

    expect(outlinerRow(invertingEffectRowId).textContent).toBe("InvertingEffect");
  });

  it("lists in the palette each source's node types by category and its generators, and says why a module does not parse", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Palette/ }));

    const paletteRow = (rowId: string) => coreViewPage("palette").querySelector<HTMLElement>(`[data-palette] [data-tree-row-id="${CSS.escape(rowId)}"]`) ?? expect.unreachable(`no palette row ${rowId}`);
    await waitFor(() => paletteRow("source:project"));
    expect(paletteRow("source:project").textContent).toBe("pattern");
    expect(paletteRow("source:project/graph_generators/nodes.scenes:two_cameras_side_by_side").textContent).toBe("two_cameras_side_by_side");
    expect(paletteRow("source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11").textContent).toBe("imports/hall-of-light");
    expect(paletteRow("source:distribution:tatolab-testpattern").getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(paletteRow("source:project/unreadable:nodes.half_written"));
    await waitFor(() => expect(coreViewPage("palette").querySelector('[data-palette-unreadable-why="nodes.half_written"]')?.textContent).toBe("SyntaxError: expected ':'"));
    fireEvent.click(paletteRow("source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11/category:Lighting/node_type:nodes.gripper:Gripper"));
    await waitFor(() => expect(coreViewPage("palette").querySelector('[data-palette-details="nodes.gripper:Gripper"]')).not.toBeNull());
    expect(coreViewPage("palette").querySelector('[data-palette-port="grip"]')?.textContent).toContain("grip");
    expect(inTheCoreView("palette").getByText("Outputs stated only by its native half")).toBeTruthy();
  });

  it("offers Transactions only in Developer mode, listing the open project's transactions with their author, stream and operations, and each one's detail", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    await screen.findByRole("menuitemradio", { name: /^Palette/ });
    expect(screen.queryByRole("menuitemradio", { name: /^Transactions/ })).toBeNull();

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&developer_mode=on");
    const developerViewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(developerViewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Transactions/ }));

    const transactionRows = () => [...coreViewPage("transactions").querySelectorAll<HTMLElement>("[data-record-table-row]")];
    await waitFor(() => expect(transactionRows().length).toBeGreaterThan(0));
    const rowWords = transactionRows().map((row) => [...row.querySelectorAll("td")].slice(1, 5).map((cell) => cell.textContent));
    expect(rowWords).toContainEqual(["agent · claude-code", "main", "add_node", "applied"]);
    expect(rowWords[0]?.[2]).toBe("undo · set_node_config");

    const addedRow = transactionRows().find((row) => row.textContent?.includes("add_node")) ?? expect.unreachable("no add_node row");
    fireEvent.click(addedRow);
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-transactions-detail]")).not.toBeNull());
    expect(coreViewPage("transactions").querySelector("[data-transactions-detail-operations]")?.textContent).toContain('"operation": "add_node"');
  });

  it("says an area left on Transactions shows it only in Developer mode once Developer mode is turned off", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&developer_mode=on");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Transactions/ }));
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-record-table-row]")).not.toBeNull());

    await act(async () => {
      await backend.setDeveloperMode(false);
    });
    await waitFor(() => expect(document.querySelector('[data-studio-area="viewer"] [data-studio-area-held-for-developer-mode]')?.textContent).toContain("Transactions shows only in Developer mode"));
  });

  it("says in the runtime's own words why the palette lists no node types", async () => {
    await mountedWindowOverTheMock("state=not-running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Palette/ }));

    await waitFor(() => expect(coreViewPage("palette").querySelector("[data-palette-not-listed-because]")?.textContent).toMatch(/^no runtime answers at /));
  });

  it("lists the project's edits in History, newest first, and choosing an earlier one undoes back to it by each edit's author", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^History/ }));

    const historyRows = () => [...coreViewPage("history").querySelectorAll<HTMLElement>("[data-history-row]")];
    await waitFor(() => expect(historyRows()).toHaveLength(5));
    expect(historyRows().map((row) => [row.getAttribute("aria-label")?.split(". ").slice(0, 2).join(". ").replace(/ · (\d+ (min|h) ago|just now|[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}\s[AP]M)/, ""), row.hasAttribute("data-undone")])).toEqual([
      ["Set displaywindow scaling to fit. Sam · undone", true],
      ["Added brightnessmeter and its link. claude-code (agent)", false],
      ["Renamed invert to invertingeffect. Sam", false],
      ["Refreshed mic_levels from its code. Runtime", false],
      ["Imported warm.cube. Sam", false],
    ]);

    fireEvent.click(historyRows()[2] ?? expect.unreachable("no rename row"));
    await waitFor(() => expect(historyRows()[1]?.hasAttribute("data-undone")).toBe(true));
    expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, true, false, false, false]);

    fireEvent.click(historyRows()[0] ?? expect.unreachable("no config row"));
    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([false, false, false, false, false]));

    fireEvent.click(historyRows()[4] ?? expect.unreachable("no import row"));
    await waitFor(() => expect(coreViewPage("history").querySelector('[role="alert"]')?.textContent).toBe("History can't go back there: The runtime's own edit after it (Refreshed mic_levels from its code) can't be undone."));
  });

  it("shows a project's streams waiting on the runtime while it lists none", async () => {
    await mountedWindowOverTheMock("state=not-running");
    await waitFor(() => outlinerRow(`project:${PATTERN_PROJECT}/waiting`));
    expect(outlinerRow(`project:${PATTERN_PROJECT}/waiting`).textContent).toBe("Streams and nodes not read yet");
  });

  it("moves through the outliner from the keyboard, opening and closing rows and selecting as it goes", async () => {
    await mountedWindowOverTheMock("state=running");
    await waitFor(() => outlinerRow("imports"));
    const tree = inTheCoreView("outliner").getByRole("tree", { name: "Outliner" });
    outlinerRow(`stream:${PATTERN_MAIN_STREAM}`).focus();

    fireEvent.keyDown(tree, { key: "End" });
    expect(outlinerRow("imports").getAttribute("aria-selected")).toBe("false");
    expect(coreViewPage("outliner").activeElement).toBe(outlinerRow("imports"));
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    await waitFor(() => expect(outlinerRow("imports").getAttribute("aria-expanded")).toBe("true"));
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    await waitFor(() => expect(outlinerRow("imports").getAttribute("aria-expanded")).toBe("false"));
    fireEvent.keyDown(tree, { key: "Home" });
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    await waitFor(() => expect(outlinerRow(`project:${PATTERN_PROJECT}`).getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(coreViewPage("outliner").activeElement).toBe(outlinerRow(`project:${PATTERN_PROJECT}`));
  });

  it("opens a stream's tab from the outliner and from the app's request, shows one tab per stream, and closes it", async () => {
    let askToShowAStream: (streamId: string) => void = () => expect.unreachable("the window did not listen for stream requests");
    await mountedWindowOverTheMock("state=running", {
      onStreamPageRequested: (listener) => {
        askToShowAStream = listener;
        return () => undefined;
      },
    });
    await waitFor(() => outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    await waitFor(() => expect(within(screen.getByRole("tablist", { name: "Open streams" })).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["pattern /main"]));

    fireEvent.doubleClick(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.keyDown(inTheCoreView("outliner").getByRole("tree", { name: "Outliner" }), { key: "Enter" });
    const cameraStream = mockStreamIdOf({ project_directory: CAMERA_PROJECT, stream_name: "main" });
    act(() => askToShowAStream(cameraStream));

    const streamTabs = within(screen.getByRole("tablist", { name: "Open streams" }));
    expect(streamTabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["pattern /main", "camera /camera"]);
    expect(streamTabs.getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    fireEvent.click(screen.getByRole("button", { name: "Close camera" }));
    expect(streamTabs.getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true"]);
  });

  it("switches layouts from Window › Layout and with ⌘1 to ⌘5, each keeping its own areas", async () => {
    await mountedWindowOverTheMock("state=running");
    expect(await shownLayout()).toBe("build");
    expect([...document.querySelectorAll("[data-studio-area]")].map((area) => area.getAttribute("data-studio-area"))).toEqual(["viewer", "stream-graph", "outliner", "properties"]);

    fireEvent.keyDown(document, { key: "2", metaKey: true });
    expect(await shownLayout()).toBe("compose");
    expect(document.querySelector('[data-studio-area="scene"]')).toBeNull();
    fireEvent.keyDown(document, { key: "5", metaKey: true });
    expect(await shownLayout()).toBe("perform");
    expect(document.querySelector('[data-studio-area="scene"]')).not.toBeNull();

  });

  it("on Linux, switches layouts from the window's own Window › Layout, ticking the one shown", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    fireEvent.keyDown(document, { key: "5", ctrlKey: true });
    expect(await shownLayout()).toBe("perform");

    pressAsAPointerDoes(await waitFor(() => document.querySelector<HTMLElement>('[data-studio-menu="Window"]') ?? expect.unreachable("no Window menu")));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Layout" }));
    expect((await screen.findByRole("menuitemcheckbox", { name: "Perform Ctrl 5" })).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Code Ctrl 4" }));
    expect(await shownLayout()).toBe("code");
  });

  it("on macOS, draws no menus of its own and shows them in the system menu bar, where Window › Layout ticks the layout shown and switches it", async () => {
    const { backendChanges, menusShownLast, chooseFromTheSystemMenuBar } = systemMenuBarOverTheMock();
    await mountedWindowOverTheMock("state=running", backendChanges);
    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-studio-run-live]")).not.toBeNull();
    expect(menusShownLast().map((menu) => [menu.label, menu.system_menu])).toEqual([
      ["Tato Studio", "app"],
      ["File", null],
      ["Edit", null],
      ["Add", null],
      ["Stream", null],
      ["Run", null],
      ["View", null],
      ["Window", "window"],
      ["Help", "help"],
    ]);

    fireEvent.keyDown(document, { key: "5", metaKey: true });
    expect(await shownLayout()).toBe("perform");
    await waitFor(() =>
      expect(menusShownLast().find((menu) => menu.label === "Window")?.entries[2]).toMatchObject({
        kind: "submenu",
        label: "Layout",
        entries: expect.arrayContaining([{ kind: "choice", entry_id: "Window › Layout › Perform", label: "Perform", shortcut_hint: "⌘5", is_chosen: true }]),
      }),
    );
    await chooseFromTheSystemMenuBar("Window › Layout › Code");
    expect(await shownLayout()).toBe("code");
  });

  it("plays the open stream's last picture in the Viewer's own frame, reading the port as a port viewer", async () => {
    await mountedWindowOverTheMock("state=running");
    await waitFor(() => outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.doubleClick(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));

    const playing = await waitFor(() => coreViewPage("viewer", "viewer").querySelector<HTMLElement>("[data-viewer-playing]") ?? expect.unreachable("the Viewer plays nothing"));
    expect(playing.getAttribute("data-viewer-playing")).toBe("invertingeffect/video_to_downstream");
    expect(playing.querySelector("canvas")?.getAttribute("aria-label")).toBe("Live picture of Inverting Effect › video_to_downstream");
    await waitFor(() => expect(playing.getAttribute("data-viewer-port-state")).toBe("ended"));
    expect(playing.textContent).toContain("This page has no WebCodecs VideoFrame to play the mock's frames.");
  });

  it("chooses the Viewer's port from its own header row, and keeps the choice in the area's settings", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerPage = await waitFor(() => (coreViewPage("viewer", "viewer").querySelector("[data-viewer-playing]") === null ? expect.unreachable("the Viewer plays nothing") : coreViewPage("viewer", "viewer")));
    pressAsAPointerDoes(viewerPage.querySelector<HTMLElement>("[data-viewer-port-chooser]") ?? expect.unreachable("no port chooser"));
    // The view's component draws in the test's own module graph, so its menu's popup goes to the window's document, not the frame's.
    const sourceChoice = await waitFor(
      () => [...document.querySelectorAll<HTMLElement>("[data-viewer-port-choice]")].find((choice) => choice.textContent === "Test Pattern Source › video") ?? expect.unreachable("no source port to choose"),
    );
    fireEvent.click(sourceChoice);

    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector("[data-viewer-playing]")?.getAttribute("data-viewer-playing")).toMatch(/\/video$/));
    expect(localStorage.getItem(studioLayoutsStorageKey(PATTERN_PROJECT))).toMatch(/"area_id":"viewer","view_type_id":"viewer","settings":\{"chosen_port":\{"stream":"[^"]+","node_id":"[^"]+","port":"[^"]+"\}\}/);
  });

  it("opens a node type's file in Code's own frame from the outliner, in the first layout with a Code area, its tab and the log's toggle in Code's header row, a closed tab staying closed as the frame loads again until the file is opened again, and the Code layout's own area left as it was", async () => {
    await mountedWindowOverTheMock("state=running");
    const nodeTypesRowId = `project:${PATTERN_PROJECT}/node_types`;
    await openTheOutlinerRow(nodeTypesRowId);
    const invertingEffectRowId = `${nodeTypesRowId}/category:Effects/node_type:nodes.inverting_effect:InvertingEffect`;
    fireEvent.doubleClick(await waitFor(() => outlinerRow(invertingEffectRowId)));

    await waitFor(async () => expect(await shownLayout()).toBe("compose"));
    const invertingEffectFile = `${PATTERN_PROJECT}/nodes/inverting_effect.py`;
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-document-state]")?.getAttribute("data-code-document-state")).toBe("read"));
    expect(coreViewPage("code").querySelector("[data-code-document-file]")?.getAttribute("data-code-document-file")).toBe(invertingEffectFile);
    expect(coreViewPage("code").querySelector(`[data-code-file-tab="${CSS.escape(invertingEffectFile)}"]`)?.textContent).toContain("inverting_effect.py");
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-project-log]")).not.toBeNull());

    fireEvent.click(coreViewPage("code").querySelector<HTMLElement>("[data-code-logs-toggle]") ?? expect.unreachable("no logs toggle"));
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-project-log]")).toBeNull());
    fireEvent.click(coreViewPage("code").querySelector<HTMLElement>(`[data-code-file-tab-close="${CSS.escape(invertingEffectFile)}"]`) ?? expect.unreachable("no close on the tab"));
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-document-state]")?.getAttribute("data-code-document-state")).toBe("none_open"));

    fireEvent.keyDown(document, { key: "1", metaKey: true });
    expect(await shownLayout()).toBe("build");
    fireEvent.keyDown(document, { key: "2", metaKey: true });
    expect(await shownLayout()).toBe("compose");
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-logs-toggle]")).not.toBeNull());
    // The opening the frame hears as it loads again crosses its port after its settings do.
    await act(() => new Promise<void>((settled) => setTimeout(settled, 100)));
    expect(coreViewPage("code").querySelector("[data-code-document-state]")?.getAttribute("data-code-document-state")).toBe("none_open");
    expect(coreViewPage("code").querySelector("[data-code-file-tab]")).toBeNull();

    fireEvent.keyDown(document, { key: "1", metaKey: true });
    expect(await shownLayout()).toBe("build");
    fireEvent.doubleClick(await waitFor(() => outlinerRow(invertingEffectRowId)));
    await waitFor(async () => expect(await shownLayout()).toBe("compose"));
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-document-file]")?.getAttribute("data-code-document-file")).toBe(invertingEffectFile));

    fireEvent.keyDown(document, { key: "4", metaKey: true });
    expect(await shownLayout()).toBe("code");
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-logs-toggle]")).not.toBeNull());
    await act(() => new Promise<void>((settled) => setTimeout(settled, 100)));
    expect(coreViewPage("code").querySelector("[data-code-document-state]")?.getAttribute("data-code-document-state")).toBe("none_open");
  });

  it("pops any area's view out into a window from its view-type menu, pinned to the stream shown and the selection, and says why where it is refused", async () => {
    const popOutsAsked: PoppedOutView[] = [];
    let popOutRefusal: string | null = null;
    await mountedWindowOverTheMock("state=running", {
      popOutView: async (target) => {
        popOutsAsked.push(target);
        if (popOutRefusal !== null) throw popOutRefusal;
      },
    });
    const popOutTheViewOf = async (areaId: string) => {
      const area = await waitFor(() => document.querySelector<HTMLElement>(`[data-studio-area="${areaId}"]`) ?? expect.unreachable(`no ${areaId} area`));
      pressAsAPointerDoes(area.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
      fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>(`[data-area-pop-out="${areaId}"]`) ?? expect.unreachable("no Pop out into a window")));
    };
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector("[data-viewer-playing]")).not.toBeNull());

    await popOutTheViewOf("viewer");
    const mainStreamTab = { stream: PATTERN_MAIN_STREAM, project_name: "pattern", display_name: "main" };
    await waitFor(() => expect(popOutsAsked).toEqual([{ view_type_id: "viewer", window_title: "main · Viewer", pinned_to: { stream_tab: mainStreamTab, selection: { kind: "nothing" }, settings: null } }]));
    await popOutTheViewOf("outliner");
    await waitFor(() => expect(popOutsAsked[1]).toMatchObject({ view_type_id: "outliner", window_title: "main · Outliner" }));
    expect(document.querySelector("[data-view-pop-out-refusal]")).toBeNull();

    popOutRefusal = "Only a project's studio window can pop out one of its views.";
    await popOutTheViewOf("viewer");
    await waitFor(() => expect(textOf("[data-view-pop-out-refusal]")).toContain("Only a project's studio window can pop out one of its views."));
  });

  it("draws a popped-out view's window as that view alone, pinned, in its own frame, with no menus, tabs or other areas", async () => {
    const mainStreamTab = { stream: PATTERN_MAIN_STREAM, project_name: "pattern", display_name: "main" };
    const poppedOutViewer: PoppedOutView = {
      view_type_id: "viewer",
      window_title: "main › invertingeffect · Viewer",
      pinned_to: { stream_tab: mainStreamTab, selection: { kind: "node", stream: PATTERN_MAIN_STREAM, node: "invertingeffect" }, settings: null },
    };
    await mountedWindowOverTheMock(`state=running&popped_out_view=${encodeURIComponent(JSON.stringify(poppedOutViewer))}`);

    const playing = await waitFor(() => coreViewPage("viewer").querySelector<HTMLElement>("[data-viewer-playing]") ?? expect.unreachable("the popped-out Viewer plays nothing"));
    expect(playing.getAttribute("data-viewer-playing")).toBe("invertingeffect/video_to_downstream");
    expect(document.querySelector('[data-popped-out-view="viewer"] iframe[data-tatolab-view="viewer"]')).not.toBeNull();
    expect(textOf("[data-popped-out-view-title]")).toBe("main › invertingeffect · Viewer");
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-studio-area]")).toBeNull();
    expect(document.querySelector("[data-projects]")).toBeNull();
  });

  it("draws a popped-out Outliner on its studio window's project", async () => {
    const poppedOutOutliner: PoppedOutView = { view_type_id: "outliner", window_title: "pattern · Outliner", pinned_to: { stream_tab: null, selection: { kind: "nothing" }, settings: null } };
    await mountedWindowOverTheMock(`state=running&popped_out_view=${encodeURIComponent(JSON.stringify(poppedOutOutliner))}`);

    await waitFor(() => expect(outlinerRowIds()).toContain(`stream:${PATTERN_MAIN_STREAM}`));
    expect(document.querySelector('[data-popped-out-view="outliner"]')).not.toBeNull();
  });

  it("shows the view an area's view-type menu chooses, each of the app's own views saying it comes with Tato Studio, and the project reopens with it", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector("[data-viewer-playing]")).not.toBeNull());

    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    expect(await screen.findByText("This project and its imports bring no views.")).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: /^Outliner/ }).textContent).toBe("OutlinerTato Studio");
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Outliner/ }));

    await waitFor(() => expect(coreViewPage("outliner", "viewer").querySelector("[data-outliner]")).not.toBeNull());
    expect(localStorage.getItem(studioLayoutsStorageKey(PATTERN_PROJECT))).toContain('"area_id":"viewer","view_type_id":"outliner"');
    document.body.replaceChildren();

    await mountedWindowOverTheMock("state=running");
    await waitFor(() => expect(coreViewPage("outliner", "viewer").querySelector("[data-outliner]")).not.toBeNull());
  });

  it("draws the open stream tab's graph in the Stream graph's own frame, and a node chosen there shows in Properties", async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    expect(streamGraph.querySelector('[aria-label="Graph of main"]')).not.toBeNull();
    const invertingEffectCard = await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="invertingeffect"]') ?? expect.unreachable("no Inverting Effect card"));
    fireEvent.click(invertingEffectCard);
    await waitFor(() => expect(inTheCoreView("properties").getByText("Inverting Effect")).toBeTruthy());
  });

  it("answers a studio shortcut pressed while a core view's frame holds the focus", async () => {
    await mountedWindowOverTheMock("state=running");
    expect(await shownLayout()).toBe("build");
    const outlinerPage = await waitFor(() => (coreViewPage("outliner").querySelector("[data-outliner]") === null ? expect.unreachable("no outliner drawn") : coreViewPage("outliner")));

    fireEvent.keyDown(outlinerPage, { key: "2", metaKey: true });
    expect(await shownLayout()).toBe("compose");
  });

  it("says in the Stream graph's frame that a stopped stream isn't running, and that no stream is open once its tab closes", async () => {
    await mountedWindowOverTheMock("state=running");
    const patternTwoStream = mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "pattern_two" });
    fireEvent.doubleClick(await waitFor(() => outlinerRow(`stream:${patternTwoStream}`)));

    await waitFor(() => expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-stream-graph-state="not_read"]')?.textContent).toMatch(/pattern-two isn't running/));

    for (const closeButton of document.querySelectorAll<HTMLElement>('[aria-label^="Close "]')) fireEvent.click(closeButton);
    await waitFor(() => expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-stream-graph-state="no_tab"]')).not.toBeNull());
  });

  it("lists a view the project brings, and draws it with full access in a frame of its own on the stream's node of its type", async () => {
    await mountedWindowOverTheMock("state=running&studio_views=fixture");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector("[data-viewer-playing]")).not.toBeNull());

    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Picture and fader/ }));

    const viewFrame = await waitFor(
      () => document.querySelector<HTMLIFrameElement>('[data-studio-area="viewer"] iframe[data-tatolab-view]') ?? expect.unreachable("no project view frame"),
    );
    expect(viewFrame.getAttribute("data-tatolab-view")).toBe("tatolab-fixture-views:picture-and-fader");
    expect(viewFrame.getAttribute("data-tatolab-view-access")).toBe("full");
    expect(viewFrame.hasAttribute("sandbox")).toBe(false);
    expect(viewFrame.getAttribute("allow")).toBe("camera; microphone");
    expect(viewFrame.getAttribute("src")).toMatch(/\/mock_studio_view\/picture_and_fader\/index\.html$/);
  });

  it("says in the view-type menu why a project's views are not listed", async () => {
    await mountedWindowOverTheMock("state=running", { listStudioViewsOfTheOpenProject: async () => Promise.reject("the runtime lists no views yet") });
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));

    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    expect(await screen.findByText("the runtime lists no views yet")).toBeTruthy();
  });

  it("opens a saved layout that does not parse on its default, and says when an area names a view this build lacks", async () => {
    localStorage.setItem(
      studioLayoutsStorageKey(PATTERN_PROJECT),
      JSON.stringify({ chosen_layout: "code", layouts: { code: { kind: "area", area_id: "venue", view_type_id: "venue-3d" }, build: { kind: "split", parts: [] } } }),
    );
    await mountedWindowOverTheMock("state=running");

    expect(await shownLayout()).toBe("code");
    expect(screen.getByText("This area's view, venue-3d, isn't in this build")).toBeTruthy();
    fireEvent.keyDown(document, { key: "1", metaKey: true });
    expect(await shownLayout()).toBe("build");
    expect(document.querySelector('[data-studio-area="viewer"]')).not.toBeNull();
  });

  it("shows the Projects window with no project open, its recent projects as cards, and opens the one chosen on its stream", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    const patternCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern card"));
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6);

    fireEvent.click(patternCard.querySelector<HTMLElement>("[data-project-open]") ?? expect.unreachable("no open button"));

    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-projects]")).toBeNull();
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => `${tab.textContent} ${tab.getAttribute("aria-selected")}`)).toEqual(["pattern /main true"]));
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector("[data-viewer-playing]")).not.toBeNull());
  });

  it("shows the Projects window with no menu bar, a bare strip for the window buttons on macOS only, and a gear that opens Preferences", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-projects-title-bar]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));

    await waitFor(() => expect(document.querySelector('[data-settings-page="general"]')).not.toBeNull());
  });

  it("shows the Linux Projects window under its own title bar, with no strip and no menu bar", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running&project=none");
    await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-projects-title-bar]")).toBeNull();
  });

  it("narrows the Projects window to the projects a search names, the search opening from its button and folding back when left empty", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    expect(screen.queryByRole("textbox", { name: "Search projects" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search projects" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search projects" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), { target: { value: "camera" } });
    expect([...document.querySelectorAll("[data-projects-project]")].map((card) => card.getAttribute("data-projects-project"))).toEqual([CAMERA_PROJECT]);
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), { target: { value: "nothing-like-it" } });
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(0);
    expect(textOf("[data-projects-empty]")).toContain("No project matches");

    const searchTextbox = screen.getByRole("textbox", { name: "Search projects" });
    fireEvent.keyDown(searchTextbox, { key: "Escape" });
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6);
    fireEvent.keyDown(searchTextbox, { key: "Escape" });
    fireEvent.blur(searchTextbox);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Search projects" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search projects" }));
  });

  it("switches the Projects window between grid and list from its View menu, and opens on the layout chosen last", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    expect(document.querySelector("[data-projects]")?.getAttribute("data-projects-layout")).toBe("grid");

    pressAsAPointerDoes(screen.getByRole("button", { name: "View: Grid" }));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-projects-view-choice="list"]') ?? expect.unreachable("no List choice")));

    await waitFor(() => expect(document.querySelector("[data-projects]")?.getAttribute("data-projects-layout")).toBe("list"));
    expect(screen.getByRole("button", { name: "View: List" })).toBeTruthy();
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6);
    const patternRow = document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern row");
    expect(patternRow.querySelector("[data-project-open]")?.getAttribute("title")).toBe("~/streams/pattern");
    expect(patternRow.textContent).toContain("The project tatolab new makes");
    expect(patternRow.textContent).toMatch(/(ago|just now)$/);

    await hideTheWindowsOfEarlierTestsAndLetTheirReadsSettle();
    removeTheKeydownListenersOfEarlierWindows();
    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    expect(document.querySelector("[data-projects]")?.getAttribute("data-projects-layout")).toBe("list");

    fireEvent.click(document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"] [data-project-open]`) ?? expect.unreachable("no pattern row"));

    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-projects]")).toBeNull();
  });

  it("orders the Projects window by last edited, or by name from its sort menu", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    const namesShown = () => [...document.querySelectorAll("[data-projects-project] [data-project-more-actions]")].map((moreActions) => (moreActions.getAttribute("aria-label") ?? "").replace(/^Actions for (.*), [^,]*$/, "$1"));
    const namesByLastOpened = namesShown();
    expect(namesByLastOpened.slice(0, 3)).toEqual(["pattern", "night-market-visuals", "camera"]);

    pressAsAPointerDoes(screen.getByRole("button", { name: "Sort: Last edited" }));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-projects-sort-choice="name"]') ?? expect.unreachable("no Name choice")));

    await waitFor(() => expect(screen.getByRole("button", { name: "Sort: Name" })).toBeTruthy());
    expect(namesShown()).toEqual([...namesByLastOpened].sort((first, second) => first.localeCompare(second, "en", { sensitivity: "base", numeric: true })));
    expect(namesShown()).not.toEqual(namesByLastOpened);
  });

  it("shows each project's description, or that it has none, and when it was edited, or opened for a project with no edit", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    const patternCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern card"));
    expect(patternCard.textContent).toContain("The project tatolab new makes: a test pattern through a halftone effect into a brightness meter.");
    expect(patternCard.textContent).toMatch(/Edited (\d+ minutes? ago|just now)/);
    const galleryCard = document.querySelector<HTMLElement>(`[data-projects-project$="/streams/gallery-wall"]`) ?? expect.unreachable("no gallery card");
    expect(galleryCard.textContent).toContain("No description yet");
    expect(galleryCard.textContent).toContain("Opened 2 weeks ago");
  });

  it("renames a project from its ⋯ menu through the runtime, refusing a blank name and keeping the dialog open with the runtime's words", async () => {
    const renameRecentProject = vi.fn(async (folder: string, name: string) => {
      if (name === "Refused") throw "rename_project failed: the project file is read-only";
      renamedNames.set(folder, name);
    });
    const renamedNames = new Map<string, string>();
    const { backend } = await mountedWindowOverTheMock("state=running&project=none", { renameRecentProject });
    const readRecentProjectsOfTheMock = backend.readRecentProjects.bind(backend);
    backend.readRecentProjects = async () => (await readRecentProjectsOfTheMock()).map((recent) => ({ ...recent, project_name: renamedNames.get(recent.folder) ?? recent.project_name }));
    const patternCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern card"));

    pressAsAPointerDoes(within(patternCard).getByRole("button", { name: /^Actions for pattern,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Rename…/ }));
    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-rename-project-name]") ?? expect.unreachable("no Rename dialog"));
    expect(nameField.value).toBe("pattern");
    fireEvent.change(nameField, { target: { value: "   " } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    expect(renameRecentProject).not.toHaveBeenCalled();

    fireEvent.change(nameField, { target: { value: "Refused" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(textOf("[data-rename-project-refusal]")).toContain("rename_project failed: the project file is read-only"));
    expect(document.querySelector("[data-rename-project-dialog]")).not.toBeNull();

    fireEvent.change(nameField, { target: { value: "Night Show" } });
    fireEvent.keyDown(nameField, { key: "Enter" });

    await waitFor(() => expect(document.querySelector("[data-rename-project-dialog]")).toBeNull());
    expect(renameRecentProject).toHaveBeenLastCalledWith(PATTERN_PROJECT, "Night Show");
    await waitFor(() => expect(within(patternCard).getByRole("button", { name: /^Actions for Night Show,/ })).toBeTruthy());
  });

  it("duplicates a project from its ⋯ menu into a card of its own, and says why in a notice when the runtime refuses", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    const patternCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern card"));

    pressAsAPointerDoes(within(patternCard).getByRole("button", { name: /^Actions for pattern,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Duplicate/ }));

    await waitFor(() => expect(document.querySelector(`[data-projects-project="${PATTERN_PROJECT} copy"]`)).not.toBeNull());
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(7);
    expect(screen.getByRole("button", { name: /^Actions for pattern copy,/ })).toBeTruthy();

    const goneCard = document.querySelector<HTMLElement>(`[data-projects-project$="/Desktop/old-sketch"]`) ?? expect.unreachable("no card of the project gone from disk");
    pressAsAPointerDoes(within(goneCard).getByRole("button", { name: /^Actions for old-sketch,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Duplicate/ }));

    await waitFor(() => expect(document.querySelector('[data-recent-project-change-refusal="duplicate"]')).not.toBeNull());
    expect(textOf('[data-recent-project-change-refusal="duplicate"]')).toContain("The project wasn't duplicated");
    expect(textOf('[data-recent-project-change-refusal="duplicate"]')).toContain("holds no project: it has no tatolab-project.json");
  });

  it("deletes a project from its ⋯ menu only once the question is answered, and its card leaves", async () => {
    const deleteRecentProject = vi.fn<(folder: string) => Promise<void>>();
    const { backend } = await mountedWindowOverTheMock("state=running&project=none");
    const deleteRecentProjectOfTheMock = backend.deleteRecentProject.bind(backend);
    backend.deleteRecentProject = async (folder) => {
      deleteRecentProject(folder);
      await deleteRecentProjectOfTheMock(folder);
    };
    const patternCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern card"));

    pressAsAPointerDoes(within(patternCard).getByRole("button", { name: /^Actions for pattern,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete…/ }));
    await waitFor(() => expect(screen.getByText("Delete “pattern”?")).toBeTruthy());
    expect(screen.getByText("Its streams stop, and Tato Studio moves its folder to the Trash, where you can put it back.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Delete “pattern”?")).toBeNull());
    expect(deleteRecentProject).not.toHaveBeenCalled();

    pressAsAPointerDoes(within(patternCard).getByRole("button", { name: /^Actions for pattern,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete…/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Move to Trash" }));
    await waitFor(() => expect(within(patternCard).getByText("Moving to Trash…")).toBeTruthy());
    expect(patternCard.querySelector<HTMLButtonElement>("[data-project-open]")?.disabled).toBe(true);
    expect(patternCard.querySelector("[data-project-more-actions]")).toBeNull();

    await waitFor(() => expect(document.querySelector(`[data-projects-project="${PATTERN_PROJECT}"]`)).toBeNull());
    expect(deleteRecentProject).toHaveBeenCalledExactlyOnceWith(PATTERN_PROJECT);
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(5);
  });

  it("imports a project .zip from New project's menu on a sheet named after the zip, and opens the project made", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    pressAsAPointerDoes(await screen.findByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project \.zip…/ }));

    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no Import project sheet"));
    expect(screen.getByText("Import project")).toBeTruthy();
    expect(screen.getByText("Tato Studio makes a project of its own from halftone-webcam-main.zip, in a new folder. It keeps the name it was saved with.")).toBeTruthy();
    expect(screen.getByLabelText("Folder name")).toBe(nameField);
    expect(nameField.value).toBe("halftone-webcam-main");
    expect(textOf("[data-new-project-folder]")).toBe("~/Documents/Tato Studio/halftone-webcam-main");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-new-project-sheet]")).toBeNull();
    expect(document.querySelector("[data-projects]")).toBeNull();
  });

  it("keeps the Import project sheet open with the runtime's words when it refuses the zip, and a cancelled dialog opens no sheet", async () => {
    const chosenArchives = [null, { archive: "/Users/jonathanf/Downloads/notes.zip", location: "/Users/jonathanf/Documents/Tato Studio", name: "notes" }];
    await mountedWindowOverTheMock("state=running&project=none", {
      chooseProjectArchiveToImport: async () => chosenArchives.shift() ?? null,
      importProjectArchive: () => Promise.reject("import_project failed: /Users/jonathanf/Downloads/notes.zip holds no tatolab-project.json"),
    });
    pressAsAPointerDoes(await screen.findByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project \.zip…/ }));
    await act(() => new Promise<void>((settled) => setTimeout(settled, 50)));
    expect(document.querySelector("[data-new-project-sheet]")).toBeNull();

    pressAsAPointerDoes(await screen.findByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project \.zip…/ }));
    await waitFor(() => expect(document.querySelector("[data-new-project-sheet]")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(textOf("[data-new-project-refusal]")).toContain("The project wasn't imported:"));
    expect(textOf("[data-new-project-refusal]")).toContain("holds no tatolab-project.json");
    expect(document.querySelector("[data-projects]")).not.toBeNull();
  });

  it("opens New project from ⌘N on the Projects window, and leaves an open sheet as it is", async () => {
    const readNewProjectDefaults = vi.fn(async () => ({ location: "/Users/jonathanf/Documents/Tato Studio", name: "Untitled project 2" }));
    await mountedWindowOverTheMock("state=running&project=none", { readNewProjectDefaults });
    await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());

    fireEvent.keyDown(document, { key: "n", metaKey: true });

    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no New project sheet"));
    fireEvent.change(nameField, { target: { value: "Night Show" } });
    fireEvent.keyDown(document, { key: "n", metaKey: true });
    await act(() => new Promise<void>((settled) => setTimeout(settled, 50)));
    expect(document.querySelector<HTMLInputElement>("[data-new-project-name]")?.value).toBe("Night Show");
    expect(readNewProjectDefaults).toHaveBeenCalledTimes(1);
  });

  it("shows a project opened from another window once the Projects window is focused again", async () => {
    const recentProjectsOnDisk: RecentProject[] = [];
    await mountedWindowOverTheMock("state=running&project=none&recent=none", { readRecentProjects: () => Promise.resolve([...recentProjectsOnDisk]) });
    await waitFor(() => expect(textOf("[data-projects-empty]")).toContain("No projects yet"));

    recentProjectsOnDisk.push({ folder: PATTERN_PROJECT, project_name: "pattern", project_description: null, last_edited_at_wall_clock_ms: null, last_opened_at_wall_clock_ms: Date.now() });
    act(() => {
      window.dispatchEvent(new FocusEvent("focus"));
    });

    await waitFor(() => expect(document.querySelector(`[data-projects-project="${PATTERN_PROJECT}"]`)).not.toBeNull());
    expect(document.querySelector("[data-projects-empty]")).toBeNull();
  });

  it("opens first run on the empty Projects window, its banner a still picture where WebGL is not offered, and Import project folder… opens the one chosen", async () => {
    await mountedWindowOverTheMock("state=running&project=none&recent=none");
    await waitFor(() => expect(textOf("[data-projects-empty]")).toContain("No projects yet"));
    expect(document.querySelector('[data-projects-banner="still"] img')).not.toBeNull();
    expect(screen.getByText("v0.45.0")).toBeTruthy();

    pressAsAPointerDoes(screen.getByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project folder…/ }));

    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-projects]")).toBeNull();
  });

  it("says why an unreadable project can't be read, in the reader's words", async () => {
    await mountedWindowOverTheMock("state=running&project=unreadable");
    await waitFor(() => expect(inTheCoreView("outliner").getByText(`${PATTERN_PROJECT} can't be read`)).toBeTruthy());
    expect(inTheCoreView("outliner").getByText(/holds no project: it has no tatolab-project\.json/)).toBeTruthy();
  });

  it("shows a refused project choice in its own words, and the open project stays as it was", async () => {
    const reading: OpenProjectReading = { kind: "none_open" };
    await mountedWindowOverTheMock("state=running&project=none", {
      readOpenProject: async () => reading,
      chooseProjectFolder: () => Promise.reject("The project dialog did not open: no window"),
    });
    pressAsAPointerDoes(await screen.findByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project folder…/ }));

    await waitFor(() => expect(textOf("[data-project-opening-refusal]")).toContain("The project dialog did not open: no window"));
    expect(document.querySelector("[data-projects]")).not.toBeNull();
  });

  it("opens New project on a sheet with an untitled name in Documents/Tato Studio, its full path following the name and Browse…, and Create opens the project made", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    fireEvent.click(await screen.findByRole("button", { name: "New project" }));
    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no New project sheet"));
    expect(nameField.value).toBe("Untitled project 2");
    expect(textOf("[data-new-project-location]")).toBe("~/Documents/Tato Studio");
    expect(textOf("[data-new-project-folder]")).toBe("~/Documents/Tato Studio/Untitled project 2");

    fireEvent.change(nameField, { target: { value: "Night Show" } });
    expect(textOf("[data-new-project-folder]")).toBe("~/Documents/Tato Studio/Night Show");
    fireEvent.click(screen.getByRole("button", { name: "Browse…" }));
    await waitFor(() => expect(textOf("[data-new-project-location]")).toBe("~/Shows"));
    expect(textOf("[data-new-project-folder]")).toBe("~/Shows/Night Show");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-new-project-sheet]")).toBeNull();
    expect(document.querySelector("[data-projects]")).toBeNull();
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true"]));
    expect(streamTabs.getByRole("tab").textContent).toMatch(/^Night Show \//);
  });

  it("refuses a name that is no folder name before Create, and a folder already there in the sheet, which stays open", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    fireEvent.click(await screen.findByRole("button", { name: "New project" }));
    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no New project sheet"));

    fireEvent.change(nameField, { target: { value: "lights/left" } });
    expect(screen.getByRole("alert").textContent).toBe("A project's name can't hold a /.");
    expect(document.querySelector('[data-new-project-action="create"]')?.getAttribute("aria-disabled")).toBe("true");

    fireEvent.change(nameField, { target: { value: "Untitled project" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(textOf("[data-new-project-refusal]")).toBe("The project wasn't created: /Users/jonathanf/Documents/Tato Studio/Untitled project already exists. Choose another name or location."),
    );
    expect(document.querySelector("[data-new-project-sheet]")).not.toBeNull();
    expect(document.querySelector("[data-projects]")).not.toBeNull();
  });

  it("shows the runtime's refusal to create a project in the sheet, in its own words, and Cancel closes it with nothing opened", async () => {
    await mountedWindowOverTheMock("state=running&project=none", { createNewProject: () => Promise.reject("the folder already holds a project") });
    fireEvent.click(await screen.findByRole("button", { name: "New project" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));

    await waitFor(() => expect(textOf("[data-new-project-refusal]")).toBe("The project wasn't created: the folder already holds a project"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(document.querySelector("[data-new-project-sheet]")).toBeNull());
    expect(document.querySelector("[data-projects]")).not.toBeNull();
  });
});

describe("Module manager", () => {
  function moduleManagerRow(rowId: string): HTMLElement {
    return document.querySelector<HTMLElement>(`[data-module-manager-row="${rowId}"]`) ?? expect.unreachable(`no ${rowId} row`);
  }
  function pressed(selector: string): void {
    fireEvent.click(document.querySelector<HTMLElement>(selector) ?? expect.unreachable(`nothing at ${selector}`));
  }

  it("lists the project's modules as the runtime does, each saying where it was copied from, and opens one to edit by its folder", async () => {
    let foldersOpenedToEdit: string[] = [];
    await mountedWindowOverTheMock("state=running&module_manager=open", {
      openImportToEdit: async (folder) => {
        foldersOpenedToEdit = [...foldersOpenedToEdit, folder];
      },
    });

    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(textOf('[data-module-manager-detail="lobby-wall"]')).toContain("Copied from");
    expect(textOf('[data-module-manager-detail="lobby-wall"]')).toContain("imports/lobby-wall");
    pressed('[data-module-manager-open-to-edit="lobby-wall"]');
    await waitFor(() => expect(foldersOpenedToEdit).toEqual(["lobby-wall"]));
  });

  it("adds a project's folder chosen in the dialog, or one dropped on the window, and lists it", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());

    pressed('[data-module-manager-add="folder"]');
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="doorways"]')).not.toBeNull());

    const moduleManagerWindow = document.querySelector<HTMLElement>("[data-module-manager-window]") ?? expect.unreachable("no window");
    fireEvent.drop(moduleManagerWindow, { dataTransfer: { files: [new File(["zip"], "night-lights.zip")], types: ["Files"] } });
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="night-lights"]')).not.toBeNull());
  });

  it("shows the runtime's refusal of an import in its own words", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open", { addDependencyToTheWorkspace: () => Promise.reject("/Users/jonathanf/streams/doorways is not a project: it holds no tatolab-project.json") });
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());

    pressed('[data-module-manager-add="folder"]');
    await waitFor(() => expect(document.body.textContent).toContain("/Users/jonathanf/streams/doorways is not a project: it holds no tatolab-project.json"));
  });

  it("asks before an Update overwrites files edited since the copy, and Keep my edits leaves them", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=edited_files");
    await waitFor(() => expect(moduleManagerRow("lobby-wall").textContent).toContain("Edited"));
    expect(textOf("[data-module-manager-edited-files]")).toContain("nodes/wall_mapping.py");

    pressed('[data-module-manager-update="lobby-wall"]');
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")?.textContent).toContain("nodes/wall_mapping.py"));
    pressed("[data-module-manager-keep-my-edits]");
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")).toBeNull());
    expect(moduleManagerRow("lobby-wall").textContent).toContain("Edited");

    pressed('[data-module-manager-update="lobby-wall"]');
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-overwrite]") === null ? expect.unreachable("no Overwrite") : "[data-module-manager-overwrite]")));
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")).toBeNull());
    await waitFor(() => expect(document.querySelector("[data-module-manager-edited-files]")).toBeNull());
  });

  it("marks a module whose source holds a newer version once checked, and Update takes it", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=newer");
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());
    expect(document.querySelector("[data-module-manager-newer-version]")).toBeNull();

    pressed("[data-module-manager-check-for-newer]");
    await waitFor(() => expect(moduleManagerRow("lobby-wall").textContent).toContain("Newer version"));
    pressed('[data-module-manager-update="lobby-wall"]');
    await waitFor(() => expect(moduleManagerRow("lobby-wall").textContent).not.toContain("Newer version"));
  });

  it("lists the Marketplace's projects, narrows to a search, and imports one into the project", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");
    pressed(await waitFor(() => (document.querySelector('[data-module-manager-tab="marketplace"]') === null ? expect.unreachable("no Marketplace tab") : '[data-module-manager-tab="marketplace"]')));

    await waitFor(() => expect(document.querySelector('[data-module-manager-row="tatolab-camera"]')).not.toBeNull());
    expect(moduleManagerRow("camera-halftone")).toBeTruthy();
    fireEvent.click(moduleManagerRow("tatolab-compositor"));
    expect(textOf('[data-module-manager-detail="tatolab-compositor"]')).toContain("LowerThird");

    const searchField = document.querySelector<HTMLInputElement>("[data-module-manager-search] input") ?? document.querySelector<HTMLInputElement>("input[data-module-manager-search]") ?? expect.unreachable("no search");
    fireEvent.change(searchField, { target: { value: "opusdecoder" } });
    await waitFor(() => expect(document.querySelectorAll("[data-module-manager-row]").length).toBe(1));
    fireEvent.change(searchField, { target: { value: "" } });

    fireEvent.click(moduleManagerRow("tatolab-camera"));
    pressed('[data-module-manager-import="tatolab-camera"]');
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="tatolab-camera-0.68.29"]')).not.toBeNull());
  });

  it("says the catalog didn't load and what it waits on", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&catalog=unserved");
    pressed(await waitFor(() => (document.querySelector('[data-module-manager-tab="marketplace"]') === null ? expect.unreachable("no Marketplace tab") : '[data-module-manager-tab="marketplace"]')));

    await waitFor(() => expect(document.querySelector('[data-module-manager-state="not_read"]')).not.toBeNull());
    expect(textOf('[data-module-manager-state="not_read"]')).toContain("HTTP 404 Not Found");
    expect(textOf('[data-module-manager-state="not_read"]')).toContain("tatolab/streamlib#3216");
  });
});

describe("the window's first status", () => {
  it("is announced once, when the first contentful paint is presented after it is in the page, and never again for a later status", async () => {
    let presentTheFirstContentfulPaint: () => void = () => expect.unreachable("nothing observed the paints");
    vi.stubGlobal(
      "PerformanceObserver",
      class {
        constructor(paintCallback: (paintEntries: { getEntriesByName(paintName: string): unknown[] }) => void) {
          presentTheFirstContentfulPaint = () => paintCallback({ getEntriesByName: (paintName) => (paintName === "first-contentful-paint" ? [{}] : []) });
        }
        observe() {}
        disconnect() {
          presentTheFirstContentfulPaint = () => undefined;
        }
      },
    );
    const studioShownAtEachAnnouncement: boolean[] = [];
    const { showStatusAsTheBackendWould, backend } = await mountedWindowOverTheMock("state=running", {}, () =>
      studioShownAtEachAnnouncement.push(document.querySelector("[data-studio-window]") !== null),
    );

    expect(studioShownAtEachAnnouncement).toEqual([]);
    presentTheFirstContentfulPaint();
    expect(studioShownAtEachAnnouncement).toEqual([true]);
    await showStatusAsTheBackendWould(await backend.getTatolabStatus());
    presentTheFirstContentfulPaint();

    expect(studioShownAtEachAnnouncement).toEqual([true]);
  });
});

describe("Preferences", () => {
  it("opens on macOS from Tato Studio › Settings… in the system menu bar, after About and Check for Updates…, on General", async () => {
    const { backendChanges, menusShownLast, chooseFromTheSystemMenuBar } = systemMenuBarOverTheMock();
    await mountedWindowOverTheMock("state=running", backendChanges);
    await waitFor(() =>
      expect(menusShownLast()[0]?.entries).toEqual([
        { kind: "command", entry_id: "Tato Studio › About Tato Studio", label: "About Tato Studio", shortcut_hint: null, unavailable_because: null },
        { kind: "command", entry_id: "Tato Studio › Check for Updates…", label: "Check for Updates…", shortcut_hint: null, unavailable_because: null },
        { kind: "separator" },
        { kind: "command", entry_id: "Tato Studio › Settings…", label: "Settings…", shortcut_hint: "⌘,", unavailable_because: null },
        { kind: "separator" },
        { kind: "system_items", system_items: "app_services_hide_and_quit" },
      ]),
    );

    await chooseFromTheSystemMenuBar("Tato Studio › Settings…");
    await waitFor(() => expect(document.querySelector(`[data-settings-page="general"]`)).not.toBeNull());
  });

  it("opens on Linux from Edit › Preferences… on General, listing every section under its group beside it", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    await chooseFromTheMenuBar("Edit", /^Preferences…/);

    await waitFor(() => expect(document.querySelector(`[data-settings-page="general"]`)).not.toBeNull());
    const sectionList = within(screen.getByRole("navigation", { name: "Preferences" }));
    expect(sectionList.getByRole("button", { name: "General" }).getAttribute("aria-current")).toBe("page");
    expect(sectionList.getAllByRole("button").map((sectionButton) => sectionButton.textContent)).toEqual(["General", "Developer", "Runtime", "Command line", "About"]);
    expect(sectionList.getByText("This machine")).toBeTruthy();
  });

  it("names the running runtime's version and uptime and its local API socket, and restarts it through Starting", { timeout: 10_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("runtime");

    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Running · tatolabd 0.55.2 · up 3d 2h"));
    expect(within(settingsRow("runtime-logs")).getByText("/Users/jonathanf/Library/Application Support/Tatolab/logs")).toBeTruthy();
    expect(screen.getByText("/tmp/streamlib-501/local-api.sock")).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>("[data-settings-page]") ?? document.body).getByText("jonathanf-macbook")).toBeTruthy();

    fireEvent.click(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }));
    expect(within(settingsRow("runtime-status")).getByRole("button", { name: "Restarting…" })).toBeTruthy();
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Starting"), { timeout: 3_000 });
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Running · tatolabd 0.55.2 · up less than a minute"), { timeout: 5_000 });
  });

  it("offers no Python to choose: the runtime sets up each project's Python", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("runtime");

    const settingsPage = document.querySelector<HTMLElement>("[data-settings-page]") ?? expect.unreachable("no Settings page");
    expect(document.querySelector('[data-settings-row="python-for-new-environments"]')).toBeNull();
    expect(settingsPage.textContent).not.toMatch(/Python/);
  });

  it("shows a refused restart in the app's words, and offers none while the runtime starts", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running&restart=refused");
    await openSettingsOn("runtime");

    fireEvent.click(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }));

    await waitFor(() =>
      expect(within(settingsRow("runtime-status")).getByRole("alert").textContent).toContain(
        "The runtime running now was not started by Tato Studio, so Tato Studio leaves it alone.",
      ),
    );
    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=starting");
    await openSettingsOn("runtime");
    expect(textOf("[data-runtime-status-words]")).toBe("Starting");
    expect(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }).hasAttribute("disabled")).toBe(true);
  });

  it("opens the runtime's log folder, and offers none for a runtime that keeps no log of its own", async () => {
    let logFolderOpenings = 0;
    await mountedWindowOverTheMock("state=running", {
      openRuntimeLogFolder: async () => {
        logFolderOpenings += 1;
      },
    });
    await openSettingsOn("runtime");
    const openLogsFolder = await waitFor(() => {
      const button = within(settingsRow("runtime-logs")).getByRole("button", { name: "Open logs folder" });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(openLogsFolder);
    await waitFor(() => expect(logFolderOpenings).toBe(1));

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&runtime_log=none");
    await openSettingsOn("runtime");
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toContain("tatolabd 0.55.2"));
    expect(within(settingsRow("runtime-logs")).getByRole("button", { name: "Open logs folder" }).hasAttribute("disabled")).toBe(true);
  });

  it("switches stream-failure notifications and opening at login through the backend, and says why where a build can't open at login", async () => {
    const switchesAsked: string[] = [];
    await mountedWindowOverTheMock("state=running", {
      setStreamFailureNotifications: async (enabled) => {
        switchesAsked.push(`notifications ${enabled}`);
      },
      setOpenTatolabAtLogin: async () => {
        throw "Tato Studio could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied";
      },
    });
    await openSettingsOn("general");

    fireEvent.click(within(settingsRow("stream-failure-notifications")).getByRole("switch", { name: "When a stream fails" }));
    await waitFor(() => expect(switchesAsked).toEqual(["notifications false"]));
    const openAtLoginSwitch = within(settingsRow("open-at-login")).getByRole("switch", { name: "Open Tato Studio at login" });
    fireEvent.click(openAtLoginSwitch);
    await waitFor(() =>
      expect(within(settingsRow("open-at-login")).getByRole("alert").textContent).toContain(
        "Tato Studio could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied",
      ),
    );
    expect(openAtLoginSwitch.getAttribute("aria-checked")).toBe("false");

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&open_at_login=not_offered");
    await openSettingsOn("general");
    expect(within(settingsRow("open-at-login")).queryByRole("switch")).toBeNull();
    expect(within(settingsRow("open-at-login")).getByText("Only a packaged Tato Studio opens at login.")).toBeTruthy();
  });

  it("lists Developer under App and switches Developer mode on through the backend, off by default", async () => {
    const switchesAsked: boolean[] = [];
    await mountedWindowOverTheMock("state=running", {
      setDeveloperMode: async (enabled) => {
        switchesAsked.push(enabled);
      },
    });
    await openSettingsOn("developer");

    const developerModeSwitch = within(settingsRow("developer-mode")).getByRole("switch", { name: "Developer mode" });
    expect(developerModeSwitch.getAttribute("aria-checked")).toBe("false");
    expect(within(settingsRow("developer-mode")).getByText(/Adds the Transactions view/)).toBeTruthy();
    fireEvent.click(developerModeSwitch);
    await waitFor(() => expect(switchesAsked).toEqual([true]));

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&developer_mode=on");
    await openSettingsOn("developer");
    expect(within(settingsRow("developer-mode")).getByRole("switch", { name: "Developer mode" }).getAttribute("aria-checked")).toBe("true");
  });

  it("goes back to the status's position when the backend accepts a switch and no status follows", { timeout: 8_000 }, async () => {
    await mountedWindowOverTheMock("state=running", { setStreamFailureNotifications: async () => {} });
    await openSettingsOn("general");
    const notificationsSwitch = within(settingsRow("stream-failure-notifications")).getByRole("switch", { name: "When a stream fails" });

    fireEvent.click(notificationsSwitch);
    await waitFor(() => expect(notificationsSwitch.getAttribute("aria-checked")).toBe("false"));

    await waitFor(() => expect(notificationsSwitch.getAttribute("aria-checked")).toBe("true"), { timeout: 5_000 });
  });

  it("colours a runtime that is not running and says why in the app's words", async () => {
    await mountedWindowOverTheMock("state=not-running");
    await openSettingsOn("runtime");

    const statusWords = document.querySelector<HTMLElement>("[data-runtime-status-words]") ?? expect.unreachable("no status words");
    expect(statusWords.textContent).toBe("Not running");
    expect(statusWords.classList.contains("text-danger-text")).toBe(true);
    expect(within(settingsRow("runtime-status")).getByText("The runtime stopped: it exited with status 1. Tato Studio starts it again shortly.")).toBeTruthy();
  });

  it("names the tatolab command's path and version, and how a coding agent starts tatolab mcp", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("command-line");

    expect(within(settingsRow("command-line-tool")).getByText("~/.local/bin/tatolab")).toBeTruthy();
    expect(within(settingsRow("command-line-tool")).getByText("0.55.2")).toBeTruthy();
    expect(textOf("[data-command-line-path-line]")).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(textOf("[data-coding-agent-command]")).toContain("tatolab mcp");
    expect(textOf("[data-coding-agent-config]")).toContain('"args": ["mcp"]');
  });

  it("names the app's and the runtime's versions and the runtime's licence in About", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("about");

    await waitFor(() => expect(within(document.querySelector<HTMLElement>("[data-settings-about]") ?? document.body).getByText("Version 0.45.0 · tatolabd 0.55.2")).toBeTruthy());
    expect(screen.getByText(/Runtime licensed BUSL-1\.1\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check for Updates…" })).toBeTruthy();
  });
});

describe("opening the window", () => {
  it("opens on the Projects window, with no setup screen, while the runtime runs, starts or is not running", async () => {
    for (const pageQuery of ["state=running&project=none", "state=starting&project=none", "state=not-running&project=none", "platform=linux&state=starting&project=none"]) {
      await mountedWindowOverTheMock(pageQuery);
      await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());
      expect(document.body.textContent).not.toContain("Getting set up");
      expect(document.body.textContent).not.toContain("Install the Tatolab runtime");
      document.body.replaceChildren();
    }
  });
});

describe("Preferences › Command line › tatolab", () => {
  it("links ~/.local/bin/tatolab with no password, then shows the link and the PATH line", async () => {
    await mountedWindowOverTheMock("state=running&cli_link=not_linked");
    await openSettingsOn("command-line");

    expect(settingsRow("command-line-tool").textContent).toContain("No password is asked.");
    expect(document.querySelector("[data-command-line-path-line]")).toBeNull();
    fireEvent.click(within(settingsRow("command-line-tool")).getByRole("button", { name: "Link tatolab" }));
    await waitFor(() => expect(within(settingsRow("command-line-tool")).getByText("~/.local/bin/tatolab")).toBeTruthy());
    expect(textOf("[data-command-line-path-line]")).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(within(settingsRow("command-line-tool")).queryByRole("button", { name: "Link tatolab" })).toBeNull();
  });

  it("leaves a name something else holds alone and offers no link", async () => {
    await mountedWindowOverTheMock("state=running&cli_link=taken");
    await openSettingsOn("command-line");

    expect(settingsRow("command-line-tool").textContent).toContain("is not a link to Tatolab, so Tato Studio leaves it alone.");
    expect(within(settingsRow("command-line-tool")).queryByRole("button", { name: "Link tatolab" })).toBeNull();
  });
});
