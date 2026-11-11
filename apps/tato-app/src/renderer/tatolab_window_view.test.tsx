// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenProjectReading, PoppedOutView, ProjectTransaction, RecentProject, SystemMenuBarMenu, TatolabStatus } from "../shared/tatolab_backend_contract";
import { createMockTatolabBackend, readMockTatolabOptions } from "../../mock/mock_tatolab_backend";
import { mockStreamIdOf } from "../../mock/mock_stream_fixtures";
import type { TatolabBackend } from "./backend/tatolab_backend";
import type { ModulesShown } from "../shared/tatolab_electron_bridge_contract";
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

/** Chooses `shown` in the Library's Show menu. */
async function showInTheLibrary(shown: string): Promise<void> {
  const library = coreViewPage("library");
  pressAsAPointerDoes(await waitFor(() => library.querySelector<HTMLElement>("[data-library-shown]") ?? expect.unreachable("no Show menu")));
  // A fake core view frame is drawn by the window's own React, so its menu's portal opens in the window's document.
  const shownChoice = `[data-library-shown-choice="${shown}"]`;
  fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>(shownChoice) ?? expect.unreachable(`no Show choice ${shown}`)));
}

function libraryRow(rowId: string): HTMLElement {
  return coreViewPage("library").querySelector<HTMLElement>(`[data-library-declarations] [data-tree-row-id="${CSS.escape(rowId)}"]`) ?? expect.unreachable(`no Library row ${rowId}`);
}

/** Chooses the Library in the Build layout's viewer area's view-type menu, and waits for the menu to close. */
async function showTheLibraryInTheViewerArea(): Promise<void> {
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await waitFor(() => expect(screen.queryByRole("menuitemradio", { name: /^Library/ })).toBeNull());
}

function outlinerRow(rowId: string): HTMLElement {
  return coreViewPage("outliner").querySelector<HTMLElement>(`[data-outliner] [data-tree-row-id="${CSS.escape(rowId)}"]`) ?? expect.unreachable(`no outliner row ${rowId}`);
}

function outlinerRowIds(): string[] {
  return [...coreViewPage("outliner").querySelectorAll<HTMLElement>("[data-outliner] [data-tree-row-id]")].map((row) => row.dataset.treeRowId ?? "");
}

async function shownLayout(): Promise<string> {
  return waitFor(() => document.querySelector<HTMLElement>("[data-studio-layout]")?.dataset.studioLayout ?? expect.unreachable("no layout shown"));
}

describe("the studio", () => {
  it("opens the project in Build, the outliner showing the project's streams, the open tab's stream open on its nodes, each with its type", async () => {
    await mountedWindowOverTheMock("state=running");

    expect(await shownLayout()).toBe("build");
    const mainNodeRowId = (node: string) => `node:${PATTERN_MAIN_STREAM}/${node}`;
    await waitFor(() => expect(outlinerRowIds()).toContain(mainNodeRowId("testpatternsource")));
    expect(outlinerRowIds()).toEqual([
      `stream:${PATTERN_MAIN_STREAM}`,
      mainNodeRowId("testpatternsource"),
      mainNodeRowId("invertingeffect"),
      mainNodeRowId("displaywindow"),
      mainNodeRowId("brightnessmeter"),
      `stream:${mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "recorder" })}`,
      `stream:${mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "pattern_two" })}`,
    ]);
    expect(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`).getAttribute("aria-level")).toBe("1");
    expect(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`).textContent).toBe("main");
    expect(outlinerRow(mainNodeRowId("testpatternsource")).getAttribute("aria-level")).toBe("2");
    expect(outlinerRow(mainNodeRowId("testpatternsource")).textContent).toBe("Test Pattern SourceTestPatternSource");
    expect(coreViewPage("outliner").body.textContent).not.toContain("pattern-two pattern");

    fireEvent.click(outlinerRow(mainNodeRowId("invertingeffect")));
    await waitFor(() => expect(outlinerRow(mainNodeRowId("invertingeffect")).getAttribute("aria-selected")).toBe("true"));
    await waitFor(() => expect(coreViewPage("properties").body.textContent).toContain("InvertingEffect"));

    const outlinerFrame = document.querySelector<HTMLIFrameElement>('[data-studio-area="outliner"] iframe[data-tatolab-view="outliner"]') ?? expect.unreachable("no Outliner frame");
    expect(outlinerFrame.hasAttribute("sandbox")).toBe(false);
    expect(outlinerFrame.getAttribute("src")).toMatch(/\/core_views\/outliner\/index\.html$/);
  });

  it("titles the window with the project's name once, centred in the toolbar on macOS, never on a stream tab", async () => {
    await mountedWindowOverTheMock("state=running");
    await waitFor(() => expect(document.querySelector("[data-studio-window-title]")?.textContent).toBe("pattern"));
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["main"]));
  });

  it("leaves the project's name to the window's title bar on Linux", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    await screen.findByRole("tablist", { name: "Open streams" });
    expect(document.querySelector("[data-studio-window-title]")).toBeNull();
  });

  it("closes the view-type menu on a choice, and lists in the Library each source's node types by category, its generators under Show, and says why a module does not parse", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();

    await waitFor(() => libraryRow("source:project"));
    expect(libraryRow("source:project").textContent).toBe("This project");
    expect(coreViewPage("library").querySelector('[data-tree-row-id="source:project/graph_generators"]')).toBeNull();
    expect(libraryRow("source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11").textContent).toBe("imports/hall-of-light");
    expect(libraryRow("source:distribution:tatolab-testpattern").getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(libraryRow("source:project/unreadable:nodes.half_written"));
    await waitFor(() => expect(coreViewPage("library").querySelector('[data-library-unreadable-why="nodes.half_written"]')?.textContent).toBe("SyntaxError: expected ':'"));
    fireEvent.click(libraryRow("source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11/category:Lighting/node_type:nodes.gripper:Gripper"));
    await waitFor(() => expect(coreViewPage("library").querySelector('[data-library-details="nodes.gripper:Gripper"]')).not.toBeNull());
    expect(coreViewPage("library").querySelector('[data-library-port="grip"]')?.textContent).toContain("grip");
    expect(inTheCoreView("library").getByText("Outputs stated only by its native half")).toBeTruthy();

    await showInTheLibrary("graph_generators");
    await waitFor(() => expect(libraryRow("source:project/graph_generators/nodes.scenes:two_cameras_side_by_side").textContent).toBe("two_cameras_side_by_side"));
    expect(coreViewPage("library").querySelector('[data-tree-row-id="source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11"]')).toBeNull();
  });

  it("shows the project's assets in the Library by folder, narrowed by the search, with the chosen asset's details, its graph documents left out", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    const assetCardPaths = () => [...library.querySelectorAll<HTMLElement>("[data-library-asset]")].map((card) => card.dataset.libraryAsset);
    await waitFor(() => expect(assetCardPaths()).toEqual(["luts/warm.cube", "media/lobby-intro.mp4", "media/poster.png", "scenes/stage.usdz"]));
    expect([...library.querySelectorAll<HTMLElement>("[data-library-asset-folder]")].map((folder) => folder.textContent)).toEqual(["All assets4", "luts1", "media2", "scenes1"]);
    expect(library.querySelector('[data-library-asset="media/lobby-intro.mp4"]')?.textContent).toBe("MP4lobby-intro.mp4media · 40 MB");

    fireEvent.click(library.querySelector<HTMLElement>('[data-library-asset-folder="folder:media"]') ?? expect.unreachable("no media folder"));
    await waitFor(() => expect(assetCardPaths()).toEqual(["media/lobby-intro.mp4", "media/poster.png"]));
    fireEvent.change(library.querySelector<HTMLInputElement>("[data-library-asset-search]") ?? expect.unreachable("no search field"), { target: { value: "POSTER" } });
    await waitFor(() => expect(assetCardPaths()).toEqual(["media/poster.png"]));

    fireEvent.click(library.querySelector<HTMLElement>('[data-library-asset="media/poster.png"]') ?? expect.unreachable("no poster card"));
    const details = await waitFor(() => library.querySelector<HTMLElement>('[data-library-asset-details="baaf9e5a-0aff-45f7-a7ea-b83db51e5a3b"]') ?? expect.unreachable("no details"));
    expect(details.textContent).toContain("poster.png");
    expect(details.textContent).toContain("sha256 c59c…fa05");
    expect(details.textContent).toContain("11 KB");
  });

  it("imports the file the person chooses, which the runtime places in its kind's folder, shows it at once and opens its details", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    await waitFor(() => library.querySelector('[data-library-asset="luts/warm.cube"]') ?? expect.unreachable("no assets listed"));
    fireEvent.click(library.querySelector<HTMLElement>("[data-library-import-asset]") ?? expect.unreachable("no Import asset button"));

    const imported = await waitFor(() => library.querySelector<HTMLElement>('[data-library-asset="media/night-sky.jpg"]') ?? expect.unreachable("the imported file is not shown"));
    expect(imported.textContent).toBe("JPGnight-sky.jpgmedia · 2.2 MB");
    const details = await waitFor(() => library.querySelector<HTMLElement>("[data-library-asset-details]") ?? expect.unreachable("no details"));
    expect(details.textContent).toContain("media/night-sky.jpg");
    expect(library.querySelector("[data-library-import-refused]")).toBeNull();
  });

  it("shows each file the runtime refused to import in its words, beside the file it imported, the search cleared so the import shows", async () => {
    await mountedWindowOverTheMock("state=running&asset_import=refuses_one");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    await waitFor(() => library.querySelector('[data-library-asset="luts/warm.cube"]') ?? expect.unreachable("no assets listed"));
    fireEvent.change(library.querySelector<HTMLInputElement>("[data-library-asset-search]") ?? expect.unreachable("no search field"), { target: { value: "cube" } });
    fireEvent.click(library.querySelector<HTMLElement>("[data-library-import-asset]") ?? expect.unreachable("no Import asset button"));

    const refusal = await waitFor(() => library.querySelector<HTMLElement>("[data-library-import-refused]") ?? expect.unreachable("no refusal"));
    expect(refusal.textContent).toBe("Didn't import main.graph.json: import_asset failed: `data/main.graph.json` is not an asset path: it names a stream's graph document, which only the stream verbs write");
    expect(library.querySelector<HTMLInputElement>("[data-library-asset-search]")?.value).toBe("");
    await waitFor(() => library.querySelector('[data-library-asset="media/night-sky.jpg"]') ?? expect.unreachable("the imported file is not shown"));
    expect(library.querySelector("[data-library-asset-details]")?.textContent).toContain("media/night-sky.jpg");
  });

  it("lists in an area's view-type menu each view with who brought it, and a view that does not open as a row that cannot be chosen, with why", async () => {
    await mountedWindowOverTheMock("state=running&studio_views=fixture");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));

    expect((await screen.findByRole("menuitemradio", { name: /^Outliner/ })).textContent).toBe("OutlinerTato Studio");
    expect((await screen.findByRole("menuitemradio", { name: /^Picture and fader/ })).textContent).toBe("Picture and faderpattern");
    const stageRigRow = document.querySelector<HTMLElement>('[data-view-type-not-opened="lobby-wall:stage_rig"]') ?? expect.unreachable("no row for the view that does not open");
    expect(stageRigRow.textContent).toBe("Stage riglobby-wall");
    expect(stageRigRow.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(stageRigRow.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Stage rig doesn't open: `contract`: this runtime reads view contract 1.0.");
  });

  it("offers Transactions only in Developer mode, listing the open project's transactions with their author, stream and operations, and each one's detail", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    await screen.findByRole("menuitemradio", { name: /^Library/ });
    expect(screen.queryByRole("menuitemradio", { name: /^Transactions/ })).toBeNull();

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&developer_mode=on");
    const developerViewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(developerViewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Transactions/ }));

    const transactionRows = () => [...coreViewPage("transactions").querySelectorAll<HTMLElement>("[data-record-table-row]")];
    await waitFor(() => expect(transactionRows().length).toBeGreaterThan(0));
    const rowWords = transactionRows().map((row) => [...row.querySelectorAll("td")].slice(1, 6).map((cell) => cell.textContent));
    expect(rowWords).toContainEqual(["agent · claude-code", "main", "commit", "add_node", "applied"]);
    expect(rowWords[0]?.[3]).toBe("undo · set_node_config");

    const addedRow = transactionRows().find((row) => row.textContent?.includes("add_node")) ?? expect.unreachable("no add_node row");
    fireEvent.click(addedRow);
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-transactions-detail]")).not.toBeNull());
    expect(coreViewPage("transactions").querySelector("[data-transactions-detail-operations]")?.textContent).toContain('"operation": "add_node"');

    const refusedRow = transactionRows().find((row) => row.dataset.recordTableRowTone === "danger") ?? expect.unreachable("no refused row");
    expect([...refusedRow.querySelectorAll("td")].slice(1, 7).map((cell) => cell.textContent)).toEqual(["agent · claude-code", "project", "commit", "redo", "refused", "none"]);
    expect(refusedRow.querySelector('[data-status-chip-tone="danger"]')?.textContent).toBe("refused");
    fireEvent.click(refusedRow);
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-transactions-detail-refusal]")).not.toBeNull());
    expect(coreViewPage("transactions").querySelector("[data-transactions-detail-refusal]")?.textContent).toContain("claude-code has undone nothing that is left to redo");

    pressAsAPointerDoes(coreViewPage("transactions").querySelector<HTMLElement>("[data-transactions-log-menu]") ?? expect.unreachable("no log menu"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Pause the log" }));
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-transactions-paused-chip]")?.textContent).toBe("Paused"));
    pressAsAPointerDoes(coreViewPage("transactions").querySelector<HTMLElement>("[data-transactions-log-menu]") ?? expect.unreachable("no log menu"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Clear the view" }));
    await waitFor(() => expect(coreViewPage("transactions").querySelector('[data-transactions-state="cleared"]')).not.toBeNull());
    expect(transactionRows()).toEqual([]);
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

  it("says in the runtime's own words why the Library lists no node types", async () => {
    await mountedWindowOverTheMock("state=not-running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));

    await waitFor(() => expect(coreViewPage("library").querySelector("[data-library-not-listed-because]")?.textContent).toMatch(/^no runtime answers at /));
  });

  it("lists the project's edits in History, newest first, and choosing an earlier one undoes back to it by each edit's author", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^History/ }));

    const historyRows = () => [...coreViewPage("history").querySelectorAll<HTMLElement>("[data-history-row]")];
    await waitFor(() =>
      expect(historyRows().map((row) => [row.getAttribute("aria-label")?.split(". ").slice(0, 2).join(". ").replace(/ · (?!undone)[^·]*?(?= · |$)/g, ""), row.hasAttribute("data-undone")])).toEqual([
        ["Set displaywindow scaling to fit. Sam · undone", true],
        ["Added brightnessmeter and its link. claude-code (agent)", false],
        ["Renamed invert to invertingeffect. Sam", false],
        ["Refreshed mic_levels from its code. Runtime", false],
        ["Imported warm.cube. Sam", false],
      ]),
    );

    fireEvent.click(historyRows()[2] ?? expect.unreachable("no rename row"));
    await waitFor(() => expect(historyRows()[1]?.hasAttribute("data-undone")).toBe(true));
    expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, true, false, false, false]);

    fireEvent.click(historyRows()[0] ?? expect.unreachable("no config row"));
    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([false, false, false, false, false]));

    fireEvent.click(historyRows()[4] ?? expect.unreachable("no import row"));
    await waitFor(() => expect(coreViewPage("history").querySelector('[role="alert"]')?.textContent).toBe("History can't go back there: The runtime's own edit after it (Refreshed mic_levels from its code) can't be undone."));
  });

  it("follows a ⌘Z in the window in History, and scrolls the edit the project is at into view as it moves", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^History/ }));
    const historyRows = () => [...coreViewPage("history").querySelectorAll<HTMLElement>("[data-history-row]")];
    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, false, false, false, false]));
    const historyPageElement = coreViewPage("history").defaultView?.Element ?? expect.unreachable("the History frame has no window");
    const rowsScrolledIntoView: (string | null)[] = [];
    historyPageElement.prototype.scrollIntoView = function scrollIntoViewRecorded(this: Element) {
      rowsScrolledIntoView.push(this.getAttribute("data-history-row"));
    };

    fireEvent.keyDown(document, { key: "z", metaKey: true });

    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, false, true, false, false]));
    expect(historyRows()[2]?.getAttribute("aria-label")).toContain("undone");

    fireEvent.click(historyRows()[3] ?? expect.unreachable("no runtime row"));
    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, true, true, false, false]));
    await waitFor(() => expect(rowsScrolledIntoView.at(-1)).toBe(historyRows()[3]?.getAttribute("data-history-row")));
    expect(coreViewPage("history").querySelector("[data-history]")?.textContent).toContain("Each row is one transaction from the project's change feed");
  });

  it("shows a project's streams waiting on the runtime while it lists none", async () => {
    await mountedWindowOverTheMock("state=not-running");
    await waitFor(() => outlinerRow("streams-waiting"));
    expect(outlinerRow("streams-waiting").textContent).toBe("Streams not read yet");
  });

  it("moves through the outliner from the keyboard, opening and closing rows and selecting as it goes", async () => {
    await mountedWindowOverTheMock("state=running");
    const mainStreamRowId = `stream:${PATTERN_MAIN_STREAM}`;
    const patternTwoRowId = `stream:${mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "pattern_two" })}`;
    await waitFor(() => outlinerRow(`node:${PATTERN_MAIN_STREAM}/testpatternsource`));
    const tree = inTheCoreView("outliner").getByRole("tree", { name: "Outliner" });
    outlinerRow(mainStreamRowId).focus();

    fireEvent.keyDown(tree, { key: "End" });
    expect(coreViewPage("outliner").activeElement).toBe(outlinerRow(patternTwoRowId));
    await waitFor(() => expect(outlinerRow(patternTwoRowId).getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(tree, { key: "Home" });
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    await waitFor(() => expect(outlinerRow(mainStreamRowId).getAttribute("aria-expanded")).toBe("false"));
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    await waitFor(() => expect(outlinerRow(mainStreamRowId).getAttribute("aria-expanded")).toBe("true"));
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    await waitFor(() => expect(outlinerRow(`node:${PATTERN_MAIN_STREAM}/testpatternsource`).getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(coreViewPage("outliner").activeElement).toBe(outlinerRow(mainStreamRowId));
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
    await waitFor(() => expect(within(screen.getByRole("tablist", { name: "Open streams" })).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["main"]));

    fireEvent.doubleClick(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.keyDown(inTheCoreView("outliner").getByRole("tree", { name: "Outliner" }), { key: "Enter" });
    const cameraStream = mockStreamIdOf({ project_directory: CAMERA_PROJECT, stream_name: "main" });
    act(() => askToShowAStream(cameraStream));

    const streamTabs = within(screen.getByRole("tablist", { name: "Open streams" }));
    expect(streamTabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["main", "camera"]);
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
    expect(document.querySelector('[data-studio-area="controls"]')).toBeNull();
    fireEvent.keyDown(document, { key: "5", metaKey: true });
    expect(await shownLayout()).toBe("perform");
    expect(document.querySelector('[data-studio-area="controls"]')).not.toBeNull();

  });

  it("undoes and redoes the person's last edit with ⌘Z and ⇧⌘Z, and leaves ⌘Z to a text field holding the focus", async () => {
    const asked: string[] = [];
    const transactionAnswered = (undoOrRedo: string): ProjectTransaction => ({
      format_version: 2,
      transaction: `${undoOrRedo}-1`,
      commit: "c1",
      parent_commit: null,
      author_kind: "person",
      author_name: "sam",
      operations: [],
      inverse_operations: [],
      undoes: undoOrRedo === "undo" ? "t1" : null,
      redoes: undoOrRedo === "redo" ? "t1" : null,
      idempotency_key: null,
      undo_state: null,
      applied_at: "2026-11-10T12:00:00Z",
    });
    await mountedWindowOverTheMock("state=running", {
      readThePersonEditingInStudio: async () => ({ kind: "person", name: "sam" }),
      undoInTheOpenProject: async (author) => {
        asked.push(`undo by ${author.name}`);
        return transactionAnswered("undo");
      },
      redoInTheOpenProject: async (author) => {
        asked.push(`redo by ${author.name}`);
        return transactionAnswered("redo");
      },
    });
    expect(await shownLayout()).toBe("build");

    fireEvent.keyDown(document, { key: "z", metaKey: true });
    await waitFor(() => expect(asked).toEqual(["undo by sam"]));
    fireEvent.keyDown(document, { key: "Z", metaKey: true, shiftKey: true });
    await waitFor(() => expect(asked).toEqual(["undo by sam", "redo by sam"]));

    const textField = document.createElement("input");
    document.body.append(textField);
    fireEvent.keyDown(textField, { key: "z", metaKey: true });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.append(checkbox);
    fireEvent.keyDown(checkbox, { key: "z", metaKey: true });
    await waitFor(() => expect(asked).toEqual(["undo by sam", "redo by sam", "undo by sam"]));
    textField.remove();
    checkbox.remove();
  });

  it("says in the runtime's words that nothing was undone when ⌘Z finds nothing left to undo", async () => {
    await mountedWindowOverTheMock("state=running", {
      readThePersonEditingInStudio: async () => ({ kind: "person", name: "Sam" }),
      undoInTheOpenProject: () => Promise.reject(new Error("undo failed: Sam has no transaction left to undo")),
    });
    expect(await shownLayout()).toBe("build");

    fireEvent.keyDown(document, { key: "z", metaKey: true });
    const notice = await waitFor(() => document.querySelector<HTMLElement>("[data-project-edit-refusal]") ?? expect.unreachable("no notice"));
    expect(notice.textContent).toContain("Nothing was undone");
    expect(notice.textContent).toContain("Sam has no transaction left to undo");
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
    expect(document.querySelector("[data-studio-play-or-stop]")).not.toBeNull();
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

  it("opens a node type's file in Code's own frame from the Library, in the first layout with a Code area, its tab and the log's toggle in Code's header row, a closed tab staying closed as the frame loads again until the file is opened again, and the Code layout's own area left as it was", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();
    const invertingEffectRowId = "source:project/category:Effects/node_type:nodes.inverting_effect:InvertingEffect";
    fireEvent.doubleClick(await waitFor(() => libraryRow(invertingEffectRowId)));

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
    fireEvent.doubleClick(await waitFor(() => libraryRow(invertingEffectRowId)));
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
    await waitFor(() => expect(inTheCoreView("properties").getByRole("textbox", { name: "Node name" })).toHaveProperty("value", "Inverting Effect"));
  });

  it("shows each entry of a list config as its own fields in Properties, and edits, adds and removes an entry as the node's whole config", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running&compositor=layered");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="alphaovercompositor"]') ?? expect.unreachable("no compositor card")));
    const properties = () => coreViewPage("properties");
    const entryLabels = () => [...properties().querySelectorAll("[data-config-list-entry]")].map((entry) => entry.getAttribute("data-config-list-entry"));
    await waitFor(() => expect(entryLabels()).toEqual(["layers:0", "layers:1"]));
    expect(properties().querySelector('[data-config-field="layers"] output')?.textContent).toBe("2 entries");
    const secondX = () => properties().querySelector<HTMLInputElement>('[data-config-field="layers:1:x"] input') ?? expect.unreachable("no x field on the second entry");
    expect(secondX().value).toBe("640");
    expect(properties().querySelector('[data-config-field="layers:0:opacity"]')?.getAttribute("data-config-field-value-source")).toBe("default");

    fireEvent.change(secondX(), { target: { value: "100" } });
    secondX().focus();
    fireEvent.keyDown(secondX(), { key: "Enter" });
    await waitFor(() => expect(secondX().value).toBe("100"), { timeout: 5000 });
    expect(properties().querySelector('[data-config-field="layers:1:y"] input')).toHaveProperty("value", "360");

    fireEvent.click(properties().querySelector<HTMLElement>('[data-config-field="layers"] [data-property-list-entry-add]') ?? expect.unreachable("no add"));
    await waitFor(() => expect(entryLabels()).toEqual(["layers:0", "layers:1", "layers:2"]), { timeout: 5000 });
    expect(properties().querySelector('[data-config-field="layers:2:opacity"]')?.getAttribute("data-config-field-value-source")).toBe("default");

    fireEvent.click(properties().querySelector<HTMLElement>('[data-config-list-entry="layers:0"] [data-property-list-entry-remove]') ?? expect.unreachable("no remove"));
    await waitFor(() => expect(entryLabels()).toEqual(["layers:0", "layers:1"]), { timeout: 5000 });
    expect(secondX().value).toBe("0");
    expect(properties().querySelector<HTMLInputElement>('[data-config-field="layers:0:x"] input')?.value).toBe("100");
  });

  it("draws the Stream graph's Add node, Frame, Note and Subgraph in the window's toolbar, says why one can't be pressed, and a press opens the node search in the graph", async () => {
    await mountedWindowOverTheMock("state=running");
    const toolInTheToolbar = (tool: string) => document.querySelector<HTMLElement>(`[data-studio-graph-tool="${tool}"]`) ?? expect.unreachable(`no ${tool} in the toolbar`);
    await waitFor(() => expect(document.querySelector("[data-studio-graph-tools]")?.getAttribute("data-studio-graph-tools")).toBe("stream-graph"));
    await waitFor(() => expect(toolInTheToolbar("add_node").getAttribute("aria-disabled")).toBeNull());
    expect(toolInTheToolbar("frame_selection").getAttribute("aria-label")).toBe("Frame the selected nodes: Select the nodes to frame first");
    expect(toolInTheToolbar("add_subgraph").getAttribute("aria-disabled")).toBe("true");
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    await waitFor(() => expect(streamGraph.querySelector('[data-node-graph-tool="add_node"]')).toBeNull());

    fireEvent.click(toolInTheToolbar("add_node"));
    await waitFor(() => expect(within(streamGraph.body).getByRole("dialog", { name: "Add a node" })).toBeTruthy());
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
    expect(viewFrame.getAttribute("data-tatolab-view")).toBe("pattern:picture_and_fader");
    expect(viewFrame.hasAttribute("sandbox")).toBe(false);
    expect(viewFrame.getAttribute("allow")).toBe("camera 'none'; microphone 'none'");
    expect(viewFrame.getAttribute("src")).toMatch(/\/mock_studio_view\/picture_and_fader\/index\.html$/);
    expect(viewerArea.querySelector("[data-node-view-whereabouts]")?.textContent).toBe("on the pictureandfader node in main");
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
      JSON.stringify({ chosen_layout: "code", layouts: { code: { kind: "area", area_id: "venue", view_type_id: "venue-3d" }, build: { kind: "split", parts: [] } }, default_revisions: { code: 2 } }),
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
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => `${tab.textContent} ${tab.getAttribute("aria-selected")}`)).toEqual(["main true"]));
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

  it("shows a project covered by a chosen image by that image, one with none by its initial's tile, and ends the grid with New project", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&project=none");
    const createAProject = vi.spyOn(backend, "readNewProjectDefaults");
    const patternCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern card"));
    await waitFor(() => expect(patternCard.querySelector('[data-project-cover="image"] img')?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/));
    const galleryCard = document.querySelector<HTMLElement>(`[data-projects-project$="/streams/gallery-wall"]`) ?? expect.unreachable("no gallery card");
    expect(galleryCard.querySelector('[data-project-cover="plain"]')?.textContent).toBe("G");

    const listItems = [...document.querySelectorAll('[role="list"][aria-label="Projects"] > [role="listitem"]')];
    expect(listItems.at(-1)?.querySelector('[data-projects-action="new-card"]')).not.toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-projects-action="new-card"]') ?? expect.unreachable("no New project card"));
    await waitFor(() => expect(createAProject).toHaveBeenCalled());
  });

  it("shows the first project in Project details, another chosen from its ⋯ menu, and saves a description and a name as their fields lose focus", async () => {
    const setRecentProjectDescription = vi.fn<(folder: string, description: string) => Promise<void>>(async () => undefined);
    const renameRecentProject = vi.fn<(folder: string, name: string) => Promise<void>>(async () => undefined);
    await mountedWindowOverTheMock("state=running&project=none", { setRecentProjectDescription, renameRecentProject });
    const detailsPanel = () => document.querySelector<HTMLElement>("[data-project-details]") ?? expect.unreachable("no Project details");
    await waitFor(() => expect(detailsPanel().getAttribute("data-project-details")).toBe(PATTERN_PROJECT));
    expect(detailsPanel().querySelector<HTMLInputElement>("[data-project-details-name]")?.value).toBe("pattern");

    const cameraCard = document.querySelector<HTMLElement>(`[data-projects-project$="/streams/camera"]`) ?? expect.unreachable("no camera card");
    pressAsAPointerDoes(within(cameraCard).getByRole("button", { name: /^Actions for camera,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Details/ }));
    await waitFor(() => expect(detailsPanel().getAttribute("data-project-details")).toMatch(/\/streams\/camera$/));
    const cameraFolder = detailsPanel().getAttribute("data-project-details") ?? "";
    const descriptionField = detailsPanel().querySelector<HTMLTextAreaElement>("[data-project-details-description]") ?? expect.unreachable("no description field");
    expect(descriptionField.value).toBe("Camera test bench for the new capture cards.");

    fireEvent.blur(descriptionField);
    expect(setRecentProjectDescription).not.toHaveBeenCalled();
    fireEvent.change(descriptionField, { target: { value: "The capture-card bench." } });
    fireEvent.blur(descriptionField);
    await waitFor(() => expect(setRecentProjectDescription).toHaveBeenCalledWith(cameraFolder, "The capture-card bench."));

    const nameField = detailsPanel().querySelector<HTMLInputElement>("[data-project-details-name]") ?? expect.unreachable("no name field");
    fireEvent.change(nameField, { target: { value: "  " } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    await waitFor(() => expect(detailsPanel().textContent).toContain("Give the project a name."));
    fireEvent.change(nameField, { target: { value: "Capture bench" } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    await waitFor(() => expect(renameRecentProject).toHaveBeenCalledWith(cameraFolder, "Capture bench"));

    fireEvent.click(within(detailsPanel()).getByRole("button", { name: "Hide project details" }));
    await waitFor(() => expect(document.querySelector("[data-project-details]")).toBeNull());
  });

  it("keeps Project details on a project renamed from it under the Name sort, and renames it once for an Enter then a blur", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&project=none");
    const renameRecentProject = vi.spyOn(backend, "renameRecentProject");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    pressAsAPointerDoes(screen.getByRole("button", { name: "Sort: Last edited" }));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-projects-sort-choice="name"]') ?? expect.unreachable("no Name choice")));
    const detailsPanel = () => document.querySelector<HTMLElement>("[data-project-details]") ?? expect.unreachable("no Project details");
    await waitFor(() => expect(detailsPanel().getAttribute("data-project-details")).toMatch(/\/streams\/camera$/));
    const cameraFolder = detailsPanel().getAttribute("data-project-details") ?? "";

    const nameField = detailsPanel().querySelector<HTMLInputElement>("[data-project-details-name]") ?? expect.unreachable("no name field");
    fireEvent.focus(nameField);
    fireEvent.change(nameField, { target: { value: "zebra" } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    fireEvent.blur(nameField);

    await waitFor(() => expect(within(document.querySelector<HTMLElement>(`[data-projects-project="${cameraFolder}"]`) ?? expect.unreachable("no camera card")).getByRole("button", { name: /^Actions for zebra,/ })).toBeTruthy());
    expect(renameRecentProject).toHaveBeenCalledTimes(1);
    expect(renameRecentProject).toHaveBeenCalledWith(cameraFolder, "zebra");
    expect(detailsPanel().getAttribute("data-project-details")).toBe(cameraFolder);
  });

  it("covers a project by an image chosen in Project details, removes it again, and says why when the runtime refuses", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&project=none");
    const setRecentProjectCover = vi.spyOn(backend, "setRecentProjectCover");
    const detailsPanel = () => document.querySelector<HTMLElement>("[data-project-details]") ?? expect.unreachable("no Project details");
    const galleryCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project$="/streams/gallery-wall"]`) ?? expect.unreachable("no gallery card"));
    pressAsAPointerDoes(within(galleryCard).getByRole("button", { name: /^Actions for gallery-wall,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Details/ }));
    await waitFor(() => expect(detailsPanel().getAttribute("data-project-details")).toMatch(/\/streams\/gallery-wall$/));
    expect(detailsPanel().querySelector('[data-project-details-action="remove-image"]')).toBeNull();

    fireEvent.click(detailsPanel().querySelector<HTMLElement>('[data-project-details-action="choose-image"]') ?? expect.unreachable("no Choose image…"));
    await waitFor(() => expect(setRecentProjectCover).toHaveBeenCalledWith(expect.stringMatching(/\/streams\/gallery-wall$/), expect.stringMatching(/night-market-poster\.png$/)));
    await waitFor(() => expect(galleryCard.querySelector('[data-project-cover="image"] img')).not.toBeNull());
    expect(detailsPanel().querySelector('[data-project-cover="image"] img')).not.toBeNull();

    setRecentProjectCover.mockImplementationOnce(async () => {
      throw "set_project_cover failed: the project file is read-only";
    });
    fireEvent.click(detailsPanel().querySelector<HTMLElement>('[data-project-details-action="remove-image"]') ?? expect.unreachable("no Remove"));
    await waitFor(() => expect(detailsPanel().textContent).toContain("The cover wasn't removed: set_project_cover failed: the project file is read-only"));

    fireEvent.click(detailsPanel().querySelector<HTMLElement>('[data-project-details-action="remove-image"]') ?? expect.unreachable("no Remove"));
    await waitFor(() => expect(galleryCard.querySelector('[data-project-cover="plain"]')).not.toBeNull());
    expect(detailsPanel().querySelector('[data-project-details-action="remove-image"]')).toBeNull();
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

    recentProjectsOnDisk.push({ folder: PATTERN_PROJECT, project_name: "pattern", project_description: null, last_edited_at_wall_clock_ms: null, has_a_chosen_cover: false, last_opened_at_wall_clock_ms: Date.now() });
    act(() => {
      window.dispatchEvent(new FocusEvent("focus"));
    });

    await waitFor(() => expect(document.querySelector(`[data-projects-project="${PATTERN_PROJECT}"]`)).not.toBeNull());
    expect(document.querySelector("[data-projects-empty]")).toBeNull();
  });

  it("opens first run on the empty Projects window, All projects in its sidebar beside the app's version, and Import project folder… opens the one chosen", async () => {
    await mountedWindowOverTheMock("state=running&project=none&recent=none");
    await waitFor(() => expect(textOf("[data-projects-empty]")).toContain("No projects yet"));
    expect(screen.getByRole("heading", { level: 1, name: "All projects" })).toBeTruthy();
    expect(document.querySelector('[data-projects-section="all_projects"]')?.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("v0.45.0")).toBeTruthy();
    expect(document.querySelector("[data-project-details]")).toBeNull();

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
    await waitFor(() => expect(streamTabs.getByRole("tab").textContent).toBe("main"));
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
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project", {
      openImportToEdit: async (folder) => {
        foldersOpenedToEdit = [...foldersOpenedToEdit, folder];
      },
    });

    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(moduleManagerRow("lobby-wall").textContent).toContain("Added");
    fireEvent.click(moduleManagerRow("lobby-wall"));
    expect(textOf('[data-module-manager-detail="lobby-wall"]')).toContain("/Users/jonathanf/streams/lobby-wall");
    expect(textOf('[data-module-manager-detail="lobby-wall"]')).toContain("imports/lobby-wall");
    pressed('[data-module-manager-open-to-edit="lobby-wall"]');
    await waitFor(() => expect(foldersOpenedToEdit).toEqual(["lobby-wall"]));
  });

  it("opens on the section File › Modules… asked for, and shows each section asked of it once open", async () => {
    let askTheOpenWindowToShow: ((shows: ModulesShown) => void) | null = null;
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project", {
      onModuleManagerSectionAsked: (listener) => {
        askTheOpenWindowToShow = listener;
        return () => undefined;
      },
    });
    const shownSection = () => document.querySelector('[data-module-manager-show][aria-current="page"]')?.getAttribute("data-module-manager-show");

    await waitFor(() => expect(shownSection()).toBe("added_to_this_project"));
    pressed('[data-module-manager-show="marketplace"]');
    expect(shownSection()).toBe("marketplace");
    act(() => askTheOpenWindowToShow?.("added_to_this_project"));
    expect(shownSection()).toBe("added_to_this_project");
    pressed('[data-module-manager-show="marketplace"]');
    act(() => askTheOpenWindowToShow?.("added_to_this_project"));
    expect(shownSection()).toBe("added_to_this_project");
  });

  it("keeps a section asked of it while it was still reading the one it opened on", async () => {
    let askTheOpenWindowToShow: ((shows: ModulesShown) => void) | null = null;
    let answerTheSectionLastAsked: ((shows: ModulesShown) => void) | null = null;
    await mountedWindowOverTheMock("state=running&module_manager=open", {
      onModuleManagerSectionAsked: (listener) => {
        askTheOpenWindowToShow = listener;
        return () => undefined;
      },
      readModuleManagerSectionLastAsked: () =>
        new Promise((resolve) => {
          answerTheSectionLastAsked = resolve;
        }),
    });
    const shownSection = () => document.querySelector('[data-module-manager-show][aria-current="page"]')?.getAttribute("data-module-manager-show");

    act(() => askTheOpenWindowToShow?.("marketplace"));
    await act(async () => answerTheSectionLastAsked?.("added_to_this_project"));

    await waitFor(() => expect(shownSection()).toBe("marketplace"));
  });

  it("adds a project's folder chosen in the dialog, or one dropped on the window, and lists it", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project");
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());

    pressed('[data-module-manager-add="folder"]');
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="doorways"]')).not.toBeNull());

    const moduleManagerWindow = document.querySelector<HTMLElement>("[data-module-manager-window]") ?? expect.unreachable("no window");
    fireEvent.drop(moduleManagerWindow, { dataTransfer: { files: [new File(["zip"], "night-lights.zip")], types: ["Files"] } });
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="night-lights"]')).not.toBeNull());
  });

  it("shows a folder dropped on the Marketplace in Modules, picked, and clears the search on each section change", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=marketplace");
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="tatolab-camera"]')).not.toBeNull());
    const searchField = document.querySelector<HTMLInputElement>("[data-module-manager-search] input") ?? document.querySelector<HTMLInputElement>("input[data-module-manager-search]") ?? expect.unreachable("no search");
    fireEvent.change(searchField, { target: { value: "camera" } });

    const moduleManagerWindow = document.querySelector<HTMLElement>("[data-module-manager-window]") ?? expect.unreachable("no window");
    fireEvent.drop(moduleManagerWindow, { dataTransfer: { files: [new File(["zip"], "night-lights.zip")], types: ["Files"] } });

    await waitFor(() => expect(document.querySelector('[data-module-manager-show][aria-current="page"]')?.getAttribute("data-module-manager-show")).toBe("added_to_this_project"));
    await waitFor(() => expect(document.querySelector('[data-module-manager-detail="night-lights"]')).not.toBeNull());
    expect((document.querySelector<HTMLInputElement>("[data-module-manager-search] input") ?? document.querySelector<HTMLInputElement>("input[data-module-manager-search]"))?.value).toBe("");
  });

  it("shows the first card's details in a section the picked card is not in", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project");
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());
    fireEvent.click(moduleManagerRow("lobby-wall"));

    pressed('[data-module-manager-show="marketplace"]');

    await waitFor(() => expect(document.querySelector("[data-module-manager-detail]")?.getAttribute("data-module-manager-detail")).toBe(document.querySelector("[data-module-manager-row]")?.getAttribute("data-module-manager-row")));
  });

  it("shows the runtime's refusal of an import in its own words", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project", { addDependencyToTheWorkspace: () => Promise.reject("/Users/jonathanf/streams/doorways is not a project: it holds no tatolab-project.json") });
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());

    pressed('[data-module-manager-add="folder"]');
    await waitFor(() => expect(document.body.textContent).toContain("/Users/jonathanf/streams/doorways is not a project: it holds no tatolab-project.json"));
  });

  it("asks before an Update overwrites files edited since the copy, and Keep my edits leaves them", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=edited_files&module_manager_section=added_to_this_project");
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());
    fireEvent.click(moduleManagerRow("lobby-wall"));
    expect(textOf("[data-module-manager-edited-files]")).toContain("nodes/wall_mapping.py");

    pressed('[data-module-manager-update="lobby-wall"]');
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")?.textContent).toContain("nodes/wall_mapping.py"));
    pressed("[data-module-manager-keep-my-edits]");
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")).toBeNull());
    expect(textOf("[data-module-manager-edited-files]")).toContain("nodes/wall_mapping.py");

    pressed('[data-module-manager-update="lobby-wall"]');
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-overwrite]") === null ? expect.unreachable("no Overwrite") : "[data-module-manager-overwrite]")));
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")).toBeNull());
    await waitFor(() => expect(document.querySelector("[data-module-manager-edited-files]")).toBeNull());
  });

  it("marks a module with an update where it was copied from once checked, and Update takes it", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=newer&module_manager_section=added_to_this_project");
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());
    fireEvent.click(moduleManagerRow("lobby-wall"));
    expect(document.querySelector("[data-module-manager-update-available]")).toBeNull();

    pressed("[data-module-manager-check-for-updates]");
    await waitFor(() => expect(document.querySelector("[data-module-manager-update-available]")).not.toBeNull());
    pressed('[data-module-manager-update="lobby-wall"]');
    await waitFor(() => expect(document.querySelector("[data-module-manager-update-available]")).toBeNull());
  });

  it("lists the catalog's packages and samples in the Marketplace, not a module it does not list, narrows to a search, and adds one to the project", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");

    await waitFor(() => expect(document.querySelector('[data-module-manager-row="tatolab-camera"]')).not.toBeNull());
    expect(moduleManagerRow("camera-halftone")).toBeTruthy();
    expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).toBeNull();
    expect(document.querySelector("[data-module-manager-add]")).toBeNull();
    fireEvent.click(moduleManagerRow("tatolab-compositor"));
    expect(textOf('[data-module-manager-detail="tatolab-compositor"]')).toContain("LowerThird");

    const searchField = document.querySelector<HTMLInputElement>("[data-module-manager-search] input") ?? document.querySelector<HTMLInputElement>("input[data-module-manager-search]") ?? expect.unreachable("no search");
    fireEvent.change(searchField, { target: { value: "opusdecoder" } });
    await waitFor(() => expect(document.querySelectorAll("[data-module-manager-row]").length).toBe(1));
    fireEvent.change(searchField, { target: { value: "" } });

    await waitFor(() => expect(document.querySelector('[data-module-manager-row="tatolab-camera"]')).not.toBeNull());
    fireEvent.click(moduleManagerRow("tatolab-camera"));
    expect(textOf('[data-module-manager-import="tatolab-camera"]')).toBe("Add to this project");
    pressed('[data-module-manager-import="tatolab-camera"]');
    await waitFor(() => expect(document.querySelector('[data-module-manager-update]')).not.toBeNull());
  });

  it("says the catalog didn't load and what it waits on, and still lists the project's modules", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&catalog=unserved");

    await waitFor(() => expect(document.querySelector('[data-module-manager-state="not_read"]')).not.toBeNull());
    expect(textOf('[data-module-manager-state="not_read"]')).toContain("HTTP 404 Not Found");
    expect(textOf('[data-module-manager-state="not_read"]')).toContain("tatolab/streamlib#3216");
    pressed('[data-module-manager-show="added_to_this_project"]');
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="lobby-wall"]')).not.toBeNull());
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

describe("the update dialog", () => {
  it("says a downloaded version is ready over the Projects window, holds focus on Cancel, and Install Update answers it and opens Settings › About", async () => {
    const answersGiven: string[] = [];
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&project=none&update=ready")));
    await mountedWindowOverTheMock("state=running&project=none&update=ready", {
      answerTheAppUpdateAnnouncement: (kind, version, answer) => {
        answersGiven.push(`${kind} ${version} ${answer}`);
        return mockBackend.answerTheAppUpdateAnnouncement(kind, version, answer);
      },
    });

    const updateDialog = await screen.findByRole("dialog", { name: "Tato Studio 0.46.0 is ready to install" });
    expect(within(updateDialog).getByText("Installing it restarts Tato Studio, which stops every stream it runs until you run it again.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Cancel"));
    fireEvent.click(within(updateDialog).getByRole("button", { name: "Install Update" }));

    expect(answersGiven).toEqual(["update_ready 0.46.0 take_its_action"]);
    await waitFor(() => expect(document.querySelector("[data-settings-about]")).not.toBeNull());
  });

  it("says which version the app is now after an update, and OK closes it at once, before the next status", async () => {
    const answersGiven: string[] = [];
    await mountedWindowOverTheMock("state=running&project=none&update=landed", {
      answerTheAppUpdateAnnouncement: async (kind, version, answer) => {
        answersGiven.push(`${kind} ${version} ${answer}`);
      },
    });

    const updateDialog = await screen.findByRole("dialog", { name: "Tato Studio is now version 0.45.0" });
    expect(within(updateDialog).getByText("Each project's dependencies are brought up to date automatically the next time it runs.")).toBeTruthy();
    expect(within(updateDialog).getByRole("button", { name: "Release Notes" })).toBeTruthy();
    fireEvent.click(within(updateDialog).getByRole("button", { name: "OK" }));

    expect(answersGiven).toEqual(["update_landed 0.45.0 dismiss"]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tato Studio is now version 0.45.0" })).toBeNull());
  });

  it("shows the window's refusal of an answer in its own words", async () => {
    await mountedWindowOverTheMock("state=running&project=none&update=landed", {
      answerTheAppUpdateAnnouncement: () => Promise.reject("The release notes did not open: no browser"),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Release Notes" }));

    await waitFor(() => expect(textOf("[data-app-update-choice-refusal]")).toContain("The release notes did not open: no browser"));
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
