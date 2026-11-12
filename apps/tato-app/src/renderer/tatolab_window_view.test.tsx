// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonValue, OpenProjectReading, PoppedOutView, ProjectTransaction, RecentProject, SystemMenuBarMenu, TatolabStatus } from "../shared/tatolab_backend_contract";
import { createMockTatolabBackend, readMockTatolabOptions } from "../../mock/mock_tatolab_backend";
import { mockStreamIdOf } from "../../mock/mock_stream_fixtures";
import type { TatolabBackend } from "./backend/tatolab_backend";
import type { ModulesShown } from "../shared/tatolab_electron_bridge_contract";
import { studioLayoutStorageKey } from "./studio_shell/studio_layout";
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

/** Chooses the Library in the default layout's viewer area's view-type menu, and waits for the menu to close. */
async function showTheLibraryInTheViewerArea(): Promise<void> {
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await waitFor(() => expect(screen.queryByRole("menuitemradio", { name: /^Library/ })).toBeNull());
}

/** The Projects window's New project button, beside its view and sort menus; the grid's last card is another. */
async function projectsWindowNewProjectButton(): Promise<HTMLElement> {
  return waitFor(() => document.querySelector<HTMLElement>('[data-projects-action="new"]') ?? expect.unreachable("no New project button"));
}

function outlinerRow(rowId: string): HTMLElement {
  return coreViewPage("outliner").querySelector<HTMLElement>(`[data-outliner] [data-tree-row-id="${CSS.escape(rowId)}"]`) ?? expect.unreachable(`no outliner row ${rowId}`);
}

function outlinerRowIds(): string[] {
  return [...coreViewPage("outliner").querySelectorAll<HTMLElement>("[data-outliner] [data-tree-row-id]")].map((row) => row.dataset.treeRowId ?? "");
}

const AREAS_OF_THE_DEFAULT_LAYOUT = ["outliner", "stream-graph", "viewer", "properties"];

function areaIdsShown(): (string | null)[] {
  return [...document.querySelectorAll<HTMLElement>("[data-studio-layout] [data-studio-area]")].map((area) => area.getAttribute("data-studio-area"));
}

/** Waits for the studio to show the areas `areaIds` names, in their order. */
async function theAreasShownAre(areaIds: readonly string[]): Promise<void> {
  await waitFor(() => expect(areaIdsShown()).toEqual(areaIds));
}

/** Keeps `saved` as the pattern project's layout, for the studio to open on. */
function keepThePatternProjectsLayout(saved: unknown): void {
  localStorage.setItem(studioLayoutStorageKey(PATTERN_PROJECT), JSON.stringify(saved));
}

describe("the studio", () => {
  it("opens the project on its default layout, the outliner showing the project's streams, the open tab's stream open on its nodes, each with its type", async () => {
    await mountedWindowOverTheMock("state=running");

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
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

  it("selects nodes together with ⌘ in the outliner, the graph and Properties showing the same nodes, and groups them from the + menu", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    const mainNodeRowId = (node: string) => `node:${PATTERN_MAIN_STREAM}/${node}`;
    await waitFor(() => expect(outlinerRowIds()).toContain(mainNodeRowId("invertingeffect")));

    fireEvent.click(outlinerRow(mainNodeRowId("invertingeffect")));
    await waitFor(() => expect(outlinerRow(mainNodeRowId("invertingeffect")).getAttribute("aria-selected")).toBe("true"));
    fireEvent.click(outlinerRow(mainNodeRowId("displaywindow")), { metaKey: true });
    await waitFor(() => expect(outlinerRow(mainNodeRowId("displaywindow")).getAttribute("aria-selected")).toBe("true"));
    expect(outlinerRow(mainNodeRowId("invertingeffect")).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(coreViewPage("properties").body.textContent).toContain("Inverting Effect, Display Window. Select one node to edit its config."));
    expect(coreViewPage("properties").body.textContent).toContain("2 nodes selected");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    await waitFor(() => expect([...streamGraph.querySelectorAll<HTMLElement>("[data-node-graph-card][data-selected]")].map((card) => card.dataset.nodeGraphCard).sort()).toEqual(["displaywindow", "invertingeffect"]));

    pressAsAPointerDoes(coreViewPage("outliner").querySelector<HTMLElement>("[data-outliner-add-menu]") ?? expect.unreachable("no + menu"));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>("[data-outliner-group-selected-nodes]") ?? expect.unreachable("no Group selected nodes")));
    await waitFor(() => expect(outlinerRowIds().some((rowId) => rowId.startsWith(`group:${PATTERN_MAIN_STREAM}/`))).toBe(true), { timeout: 5000 });
  });

  it("groups the nodes selected in the outliner on F, and leaves F alone while nothing can be grouped", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    const mainNodeRowId = (node: string) => `node:${PATTERN_MAIN_STREAM}/${node}`;
    await waitFor(() => expect(outlinerRowIds()).toContain(mainNodeRowId("testpatternsource")));
    expect(fireEvent.keyDown(outlinerRow(mainNodeRowId("testpatternsource")), { key: "f" })).toBe(true);

    fireEvent.click(outlinerRow(mainNodeRowId("testpatternsource")));
    await waitFor(() => expect(outlinerRow(mainNodeRowId("testpatternsource")).getAttribute("aria-selected")).toBe("true"));
    fireEvent.click(outlinerRow(mainNodeRowId("brightnessmeter")), { metaKey: true });
    await waitFor(() => expect(outlinerRow(mainNodeRowId("brightnessmeter")).getAttribute("aria-selected")).toBe("true"));
    await waitFor(() => expect(coreViewPage("properties").body.textContent).toContain("2 nodes selected"));
    expect(fireEvent.keyDown(outlinerRow(mainNodeRowId("brightnessmeter")), { key: "f" })).toBe(false);
    await waitFor(() => expect(outlinerRowIds().some((rowId) => rowId.startsWith(`group:${PATTERN_MAIN_STREAM}/`))).toBe(true), { timeout: 5000 });
  });

  it("names the project once on macOS, at the start of the title row before the stream tabs, never on a tab", async () => {
    await mountedWindowOverTheMock("state=running");
    await waitFor(() => expect(document.querySelector("[data-studio-window-title]")?.textContent).toBe("pattern"));
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["main"]));
  });

  it("on Linux, draws the menus in a row of their own with the stream tabs under them, and leaves the project's name to the window's title bar", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    const streamTabs = await screen.findByRole("tablist", { name: "Open streams" });
    expect(document.querySelector("[data-studio-window-title]")).toBeNull();
    const menuRow = document.querySelector("[data-studio-menu-row]") ?? expect.unreachable("no menu row");
    expect(menuRow.querySelector("[data-studio-menu]")).not.toBeNull();
    expect(menuRow.contains(streamTabs)).toBe(false);
    expect(menuRow.compareDocumentPosition(streamTabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("shows the project's assets in the Library by folder, narrowed by the search, the card pressed outlined and no details beside it, its graph documents left out", async () => {
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

    const folderMenu = library.querySelector<HTMLElement>("[data-library-asset-folder-menu]") ?? expect.unreachable("no Folder menu");
    pressAsAPointerDoes(folderMenu);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^scenes/ }));
    await waitFor(() => expect(assetCardPaths()).toEqual(["scenes/stage.usdz"]));
    expect(folderMenu.getAttribute("aria-label")).toBe("Folder: scenes");

    fireEvent.click(library.querySelector<HTMLElement>('[data-library-asset-folder="folder:media"]') ?? expect.unreachable("no media folder"));
    await waitFor(() => expect(assetCardPaths()).toEqual(["media/lobby-intro.mp4", "media/poster.png"]));
    expect(folderMenu.getAttribute("aria-label")).toBe("Folder: media");
    fireEvent.change(library.querySelector<HTMLInputElement>("[data-library-asset-search]") ?? expect.unreachable("no search field"), { target: { value: "POSTER" } });
    await waitFor(() => expect(assetCardPaths()).toEqual(["media/poster.png"]));

    const posterCard = library.querySelector<HTMLElement>('[data-library-asset="media/poster.png"]') ?? expect.unreachable("no poster card");
    fireEvent.click(posterCard);
    await waitFor(() => expect(posterCard.getAttribute("aria-pressed")).toBe("true"));
    expect(posterCard.textContent).toBe("PNGposter.pngmedia · 11 KB");
    expect(library.querySelector("aside")).toBeNull();
  });

  it("shows each asset's preview picture on its card, an asset with none keeping its tinted card", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    const cardPicture = (assetPath: string) =>
      library.querySelector<HTMLElement>(`[data-library-asset="${assetPath}"] [data-project-asset-picture]`) ?? expect.unreachable(`no picture on ${assetPath}`);
    await waitFor(() => expect(cardPicture("media/lobby-intro.mp4").dataset.projectAssetPicture).toBe("preview"));
    await waitFor(() => expect(cardPicture("media/poster.png").dataset.projectAssetPicture).toBe("preview"));
    expect(cardPicture("media/lobby-intro.mp4").querySelector("img")?.getAttribute("src")).toMatch(/^data:image\//);
    expect(cardPicture("luts/warm.cube").dataset.projectAssetPicture).toBe("tinted");
    expect(cardPicture("scenes/stage.usdz").dataset.projectAssetPicture).toBe("tinted");
  });

  it("keeps an asset's card tinted when the runtime refuses its preview picture, the runtime's words under it", async () => {
    const refusal = "read_asset_preview failed: no file is at asset 207ef246-3d00-4167-b394-bb591f7c4b8f's path";
    await mountedWindowOverTheMock("state=running", {
      readAssetPreviewOfTheOpenProject: async () => {
        throw refusal;
      },
    });
    await showTheLibraryInTheViewerArea();
    await showInTheLibrary("assets");
    const library = coreViewPage("library");
    const videoCard = await waitFor(() => library.querySelector<HTMLElement>('[data-library-asset="media/lobby-intro.mp4"]') ?? expect.unreachable("no video card"));
    await waitFor(() => expect(videoCard.parentElement?.querySelector("[data-project-asset-preview-refusal]")?.textContent).toContain(refusal));
    expect(videoCard.querySelector<HTMLElement>("[data-project-asset-picture]")?.dataset.projectAssetPicture).toBe("tinted");
  });

  it("lists in the Library the views the project and its imports bring by who brought them, Studio's own last, with the chosen view's ports or why it does not open", async () => {
    await mountedWindowOverTheMock("state=running&studio_views=fixture");
    await showTheLibraryInTheViewerArea();
    await showInTheLibrary("views");

    const library = coreViewPage("library");
    const viewRowIds = () => [...library.querySelectorAll<HTMLElement>("[data-library-view]")].map((row) => row.dataset.libraryView);
    await waitFor(() => expect(viewRowIds().slice(0, 2)).toEqual(["pattern/pattern:picture_and_fader", "lobby-wall/lobby-wall:stage_rig"]));
    expect(viewRowIds()).toContain("Tato Studio/outliner");
    expect(viewRowIds()).not.toContain("Tato Studio/transactions");
    expect(library.querySelector('[data-library-view="pattern/pattern:picture_and_fader"]')?.textContent).toContain("Picture and fader · 1 in · 1 out");
    const details = () => library.querySelector<HTMLElement>("[data-library-view-details]") ?? expect.unreachable("no view details");
    expect(details().dataset.libraryViewDetails).toBe("pattern/pattern:picture_and_fader");
    expect([...details().querySelectorAll<HTMLElement>("[data-library-view-port]")].map((port) => port.dataset.libraryViewPort)).toEqual(["picture", "fader"]);

    fireEvent.click(library.querySelector<HTMLElement>('[data-library-view="lobby-wall/lobby-wall:stage_rig"]') ?? expect.unreachable("no Stage rig row"));
    await waitFor(() => expect(details().dataset.libraryViewDetails).toBe("lobby-wall/lobby-wall:stage_rig"));
    expect(details().textContent).toContain("`contract`: this runtime reads view contract 1.0.");

    fireEvent.change(library.querySelector<HTMLInputElement>("[data-library-view-search]") ?? expect.unreachable("no search field"), { target: { value: "fader" } });
    await waitFor(() => expect(viewRowIds()).toEqual(["pattern/pattern:picture_and_fader"]));
  });

  it("imports the file the person chooses, which the runtime places in its kind's folder, shows it at once and outlines its card", async () => {
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
    await waitFor(() => expect(imported.getAttribute("aria-pressed")).toBe("true"));
    expect(library.querySelector("[data-library-import-refused]")).toBeNull();
  });

  it("renames, moves and deletes an asset from its card's ⋯ menu through the runtime, a path another asset takes refused in its words", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    const chooseFromTheCardsMenu = async (assetPath: string, change: string) => {
      const card = await waitFor(() => library.querySelector<HTMLElement>(`[data-library-asset="${assetPath}"]`) ?? expect.unreachable(`no card for ${assetPath}`));
      pressAsAPointerDoes(card.parentElement?.querySelector<HTMLElement>("[data-project-asset-more-actions]") ?? expect.unreachable(`no ⋯ menu on ${assetPath}`));
      // A fake core view frame is drawn by the window's own React, so its menu's portal opens in the window's document.
      fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>(`[data-library-asset-change="${change}"]`) ?? expect.unreachable(`no ${change} in the ⋯ menu`)));
    };
    const formField = () => library.querySelector<HTMLInputElement>("[data-library-asset-change-field]") ?? expect.unreachable("no form field");
    const pressTheForms = (action: string) => fireEvent.click(library.querySelector<HTMLElement>(`[data-library-asset-change-action="${action}"]`) ?? expect.unreachable(`no ${action} button`));

    await chooseFromTheCardsMenu("media/poster.png", "rename");
    await waitFor(() => expect(formField().value).toBe("poster.png"));
    fireEvent.change(formField(), { target: { value: "lobby-intro.mp4" } });
    pressTheForms("rename");
    const refusal = await waitFor(() => library.querySelector<HTMLElement>("[data-library-asset-change-refusal]") ?? expect.unreachable("no refusal"));
    expect(refusal.textContent).toContain("relocate_asset failed: `media/lobby-intro.mp4` is already the path of the asset 207ef246-3d00-4167-b394-bb591f7c4b8f");
    fireEvent.change(formField(), { target: { value: "harbour-poster.png" } });
    pressTheForms("rename");
    await waitFor(() => expect(library.querySelector('[data-library-asset="media/harbour-poster.png"]')).not.toBeNull());
    await waitFor(() => expect(library.querySelector("[data-library-asset-change-form]")).toBeNull());
    await waitFor(() => expect(library.activeElement?.closest("[data-project-asset-more-actions]")?.parentElement?.parentElement?.querySelector("[data-library-asset]")?.getAttribute("data-library-asset")).toBe("media/harbour-poster.png"));

    await chooseFromTheCardsMenu("media/harbour-poster.png", "move");
    await waitFor(() => expect(formField().value).toBe("media"));
    fireEvent.change(formField(), { target: { value: "media/posters" } });
    expect(library.querySelector("[data-library-asset-change-lands-at]")?.textContent).toBe("media/posters/harbour-poster.png");
    pressTheForms("move");
    await waitFor(() => expect(library.querySelector('[data-library-asset="media/posters/harbour-poster.png"]')).not.toBeNull());
    await waitFor(() => expect(library.querySelector("[data-library-asset-change-form]")).toBeNull());

    await chooseFromTheCardsMenu("media/posters/harbour-poster.png", "delete");
    await waitFor(() => library.querySelector('[data-library-asset-change-action="delete"]') ?? expect.unreachable("no Delete button"));
    pressTheForms("delete");
    await waitFor(() => expect(library.querySelector('[data-library-asset="media/posters/harbour-poster.png"]')).toBeNull());
    expect(library.querySelector("[data-library-asset-change-form]")).toBeNull();
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
    const imported = await waitFor(() => library.querySelector<HTMLElement>('[data-library-asset="media/night-sky.jpg"]') ?? expect.unreachable("the imported file is not shown"));
    await waitFor(() => expect(imported.getAttribute("aria-pressed")).toBe("true"));
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

  it("on Linux, makes a stream from Stream › New stream… and opens its tab, renames it, and deletes it once the question naming it is answered", async () => {
    await mountedWindowOverTheMock("state=running&platform=linux");
    const streamTabNames = () => within(screen.getByRole("tablist", { name: "Open streams" })).getAllByRole("tab").map((tab) => tab.textContent);
    await waitFor(() => expect(streamTabNames()).toEqual(["main"]));

    await chooseFromTheMenuBar("Stream", /^New stream…/);
    const newStreamName = await waitFor(() => document.querySelector<HTMLInputElement>("[data-name-form-dialog=\"new_stream\"] [data-naming-dialog-name]") ?? expect.unreachable("no New stream dialog"));
    fireEvent.change(newStreamName, { target: { value: "  " } });
    fireEvent.keyDown(newStreamName, { key: "Enter" });
    expect(document.querySelector("[data-name-form-dialog]")).not.toBeNull();
    fireEvent.change(newStreamName, { target: { value: "Lobby preview" } });
    fireEvent.keyDown(newStreamName, { key: "Enter" });
    await waitFor(() => expect(document.querySelector("[data-name-form-dialog]")).toBeNull());
    await waitFor(() => expect(streamTabNames()).toEqual(["main", "Lobby preview"]));
    await waitFor(() => expect(coreViewPage("outliner").querySelector("[data-tree-row-current]")?.textContent).toBe("Lobby preview"));

    await chooseFromTheMenuBar("Stream", /^Rename stream…/);
    const newName = await waitFor(() => document.querySelector<HTMLInputElement>("[data-name-form-dialog=\"rename_stream\"] [data-naming-dialog-name]") ?? expect.unreachable("no Rename stream dialog"));
    expect(newName.value).toBe("Lobby preview");
    fireEvent.change(newName, { target: { value: "Lobby loop" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(streamTabNames()).toEqual(["main", "Lobby loop"]));

    await chooseFromTheMenuBar("Stream", /^Delete stream…/);
    await waitFor(() => expect(textOf("[data-delete-stream-dialog]")).toContain("Delete “Lobby loop”?"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(streamTabNames()).toEqual(["main"]));
    expect(document.querySelector(`[data-outliner-row-name="Lobby loop"]`)).toBeNull();
  });

  it("says in the runtime's words why New stream made no stream, and keeps the dialog open", async () => {
    await mountedWindowOverTheMock("state=running&platform=linux", {
      createStreamInTheOpenProject: async () => {
        throw "create_stream failed: streams/lobby_preview.json already holds a stream asset";
      },
    });
    await chooseFromTheMenuBar("Stream", /^New stream…/);
    const newStreamName = await waitFor(() => document.querySelector<HTMLInputElement>("[data-naming-dialog-name]") ?? expect.unreachable("no New stream dialog"));
    fireEvent.change(newStreamName, { target: { value: "Lobby preview" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(textOf("[data-naming-dialog-refusal]")).toContain("streams/lobby_preview.json already holds a stream asset"));
    expect(document.querySelector("[data-name-form-dialog]")).not.toBeNull();
  });

  it("closes the shown tab with ⌘W, reopens it with ⇧⌘T, and moves between tabs with ⌃Tab and ⌃⇧Tab, none of them behind a dialog", async () => {
    let askToShowAStream: (streamId: string) => void = () => expect.unreachable("the window did not listen for stream requests");
    await mountedWindowOverTheMock("state=running", {
      onStreamPageRequested: (listener) => {
        askToShowAStream = listener;
        return () => undefined;
      },
    });
    const streamTabs = () => within(screen.getByRole("tablist", { name: "Open streams", hidden: true })).getAllByRole("tab", { hidden: true });
    const shownTabName = () => streamTabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
    await waitFor(() => expect(streamTabs().map((tab) => tab.textContent)).toEqual(["main"]));
    act(() => askToShowAStream(mockStreamIdOf({ project_directory: CAMERA_PROJECT, stream_name: "main" })));
    expect(shownTabName()).toBe("camera");

    fireEvent.keyDown(document, { key: "Tab", ctrlKey: true });
    expect(shownTabName()).toBe("main");
    fireEvent.keyDown(document, { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(shownTabName()).toBe("camera");

    fireEvent.keyDown(document, { key: "w", metaKey: true });
    expect(streamTabs().map((tab) => tab.textContent)).toEqual(["main"]);
    fireEvent.keyDown(document, { key: "T", metaKey: true, shiftKey: true });
    expect(streamTabs().map((tab) => tab.textContent)).toEqual(["main", "camera"]);
    expect(shownTabName()).toBe("camera");

    fireEvent.keyDown(document, { key: ",", metaKey: true });
    await waitFor(() => expect(document.querySelector("[role=dialog]")).not.toBeNull());
    fireEvent.keyDown(document, { key: "w", metaKey: true });
    fireEvent.keyDown(document, { key: "Tab", ctrlKey: true });
    expect(streamTabs().map((tab) => tab.textContent)).toEqual(["main", "camera"]);
    expect(shownTabName()).toBe("camera");
  });

  it("on macOS, offers the Stream menu in the system menu bar with ⌘W, ⇧⌘T, ⌃Tab and ⌃⇧Tab, its tab entries unavailable until there is a tab to act on", async () => {
    const { backendChanges, menusShownLast, chooseFromTheSystemMenuBar } = systemMenuBarOverTheMock();
    await mountedWindowOverTheMock("state=running", backendChanges);
    await waitFor(() => expect(within(screen.getByRole("tablist", { name: "Open streams" })).getAllByRole("tab")).toHaveLength(1));
    const streamMenu = () => menusShownLast().find((menu) => menu.label === "Stream") ?? expect.unreachable("no Stream menu");
    const streamEntry = (label: string) => streamMenu().entries.find((entry) => entry.kind === "command" && entry.label === label) ?? expect.unreachable(`no ${label}`);
    await waitFor(() => expect(streamEntry("Close tab")).toMatchObject({ shortcut_hint: "⌘W", unavailable_because: null }));
    expect(streamEntry("New stream…")).toMatchObject({ shortcut_hint: null, unavailable_because: null });
    expect(streamEntry("Reopen closed tab")).toMatchObject({ shortcut_hint: "⇧⌘T", unavailable_because: "No tab has been closed" });
    expect(streamEntry("Next tab")).toMatchObject({ shortcut_hint: "⌃Tab" });
    expect(streamEntry("Previous tab")).toMatchObject({ shortcut_hint: "⌃⇧Tab" });

    chooseFromTheSystemMenuBar("Stream › Close tab");
    await waitFor(() => expect(streamEntry("Reopen closed tab")).toMatchObject({ unavailable_because: null }));
    expect(streamEntry("Close tab")).toMatchObject({ unavailable_because: "Open a stream's tab first" });
    chooseFromTheSystemMenuBar("Stream › New stream…");
    await waitFor(() => expect(document.querySelector("[data-name-form-dialog=\"new_stream\"]")).not.toBeNull());
  });

  it("applies the saved presets with ⌘1 to ⌘9 in their order, and leaves the layout as it is on a digit with no preset", async () => {
    keepThePatternProjectsLayout({
      presets_saved: [
        { title: "Graph alone", layout: { kind: "area", area_id: "stream-graph", view_type_id: "stream_graph" } },
        { title: "Viewer alone", layout: { kind: "area", area_id: "viewer", view_type_id: "viewer" } },
      ],
    });
    await mountedWindowOverTheMock("state=running");
    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);

    fireEvent.keyDown(document, { key: "2", metaKey: true });
    await theAreasShownAre(["viewer"]);
    fireEvent.keyDown(document, { key: "1", metaKey: true });
    await theAreasShownAre(["stream-graph"]);
    fireEvent.keyDown(document, { key: "3", metaKey: true });
    await act(() => new Promise<void>((settled) => setTimeout(settled, 50)));
    expect(areaIdsShown()).toEqual(["stream-graph"]);
  });

  it("expands the Node visualizer to fill the window from its toolbar, and puts the layout back with Esc or Expand again", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = () => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area");
    const expand = () => coreViewPage("viewer", "viewer").querySelector<HTMLElement>("[data-viewer-expand]") ?? expect.unreachable("no Expand in the visualizer's toolbar");
    await waitFor(() => expect(expand().closest('[role="toolbar"]')?.getAttribute("aria-label")).toBe("Node visualizer tools"));
    expect(viewerArea().hasAttribute("data-studio-area-expanded")).toBe(false);

    fireEvent.click(expand());
    await waitFor(() => expect(viewerArea().hasAttribute("data-studio-area-expanded")).toBe(true));
    await waitFor(() => expect(expand().getAttribute("aria-pressed")).toBe("true"));
    expect(document.querySelectorAll("[data-studio-area-expanded]")).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(viewerArea().hasAttribute("data-studio-area-expanded")).toBe(false));

    await waitFor(() => expect(expand().getAttribute("aria-pressed")).toBe("false"));
    fireEvent.click(expand());
    await waitFor(() => expect(viewerArea().hasAttribute("data-studio-area-expanded")).toBe(true));
    // The view toggles from the expansion it last heard, which crosses its port after the area expands.
    await waitFor(() => expect(expand().getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(expand());
    await waitFor(() => expect(viewerArea().hasAttribute("data-studio-area-expanded")).toBe(false));
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
    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);

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
    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);

    fireEvent.keyDown(document, { key: "z", metaKey: true });
    const notice = await waitFor(() => document.querySelector<HTMLElement>("[data-project-edit-refusal]") ?? expect.unreachable("no notice"));
    expect(notice.textContent).toContain("Nothing was undone");
    expect(notice.textContent).toContain("Sam has no transaction left to undo");
  });

  it("on Linux, reshapes the layout from the window's own Window › Layout", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);

    pressAsAPointerDoes(await waitFor(() => document.querySelector<HTMLElement>('[data-studio-menu="Window"]') ?? expect.unreachable("no Window menu")));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Layout" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Single" }));
    await theAreasShownAre(["stream-graph"]);
  });

  it("hides the layout's left and right areas from the title row's buttons, reshapes it from the layout menu, and saves it as a preset", async () => {
    await mountedWindowOverTheMock("state=running");
    const edgeButton = (edge: string) => document.querySelector<HTMLElement>(`[data-studio-layout-edge="${edge}"]`) ?? expect.unreachable(`no ${edge} edge button`);
    await waitFor(() => expect(areaIdsShown()).toEqual(["outliner", "stream-graph", "viewer", "properties"]));
    expect(document.querySelector("[data-studio-layout-edge=bottom]")).toBeNull();

    fireEvent.click(edgeButton("left"));
    await waitFor(() => expect(areaIdsShown()).toEqual(["stream-graph", "viewer", "properties"]));
    expect(edgeButton("left").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(edgeButton("right"));
    await waitFor(() => expect(areaIdsShown()).toEqual(["stream-graph"]));
    fireEvent.click(edgeButton("left"));
    fireEvent.click(edgeButton("right"));
    await waitFor(() => expect(areaIdsShown()).toEqual(["outliner", "stream-graph", "viewer", "properties"]));

    pressAsAPointerDoes(document.querySelector<HTMLElement>("[data-studio-layout-menu]") ?? expect.unreachable("no layout menu button"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Two rows" }));
    await waitFor(() => expect(areaIdsShown()).toEqual(["stream-graph", "outliner"]));
    await waitFor(() => expect(edgeButton("bottom")).not.toBeNull());

    pressAsAPointerDoes(document.querySelector<HTMLElement>("[data-studio-layout-menu]") ?? expect.unreachable("no layout menu button"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Save layout as preset…" }));
    const presetDialog = await waitFor(() => document.querySelector<HTMLElement>('[data-name-form-dialog="save_layout_preset"]') ?? expect.unreachable("no Save layout as preset dialog"));
    fireEvent.change(within(presetDialog).getByRole("textbox"), { target: { value: "Show night" } });
    fireEvent.click(within(presetDialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(document.querySelector('[data-name-form-dialog="save_layout_preset"]')).toBeNull());

    pressAsAPointerDoes(document.querySelector<HTMLElement>("[data-studio-layout-menu]") ?? expect.unreachable("no layout menu button"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Single" }));
    await theAreasShownAre(["stream-graph"]);
    pressAsAPointerDoes(document.querySelector<HTMLElement>("[data-studio-layout-menu]") ?? expect.unreachable("no layout menu button"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Show night ⌘1" }));
    await theAreasShownAre(["stream-graph", "outliner"]);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "1", metaKey: true });
    await theAreasShownAre(["stream-graph", "outliner"]);
  });

  it("on macOS, draws no menus of its own and shows them in the system menu bar, where Window › Layout reshapes the layout", async () => {
    const { backendChanges, menusShownLast, chooseFromTheSystemMenuBar } = systemMenuBarOverTheMock();
    await mountedWindowOverTheMock("state=running", backendChanges);
    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-studio-title-row]")).not.toBeNull();
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

    expect(menusShownLast().find((menu) => menu.label === "Window")?.entries[2]).toMatchObject({
      kind: "submenu",
      label: "Layout",
      entries: expect.arrayContaining([{ kind: "command", entry_id: "Window › Layout › Single", label: "Single", shortcut_hint: null, unavailable_because: null }]),
    });
    await chooseFromTheSystemMenuBar("Window › Layout › Single");
    await theAreasShownAre(["stream-graph"]);
  });

  it("asks for a node while nothing is selected, then plays the node clicked, reading its port as a port viewer", async () => {
    await mountedWindowOverTheMock("state=running&outliner=open");
    await waitFor(() => outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.doubleClick(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));

    const askingForANode = await waitFor(() => coreViewPage("viewer", "viewer").querySelector<HTMLElement>('[data-viewer-state="nothing_selected"]') ?? expect.unreachable("no placeholder asking for a node"));
    expect(askingForANode.textContent).toContain("Select a node to visualize it");
    expect(coreViewPage("viewer", "viewer").querySelector("[data-viewer-port-chooser]")).toBeNull();

    fireEvent.click(await waitFor(() => outlinerRow(`node:${PATTERN_MAIN_STREAM}/invertingeffect`)));
    const playing = await waitFor(() => coreViewPage("viewer", "viewer").querySelector<HTMLElement>("[data-viewer-playing]") ?? expect.unreachable("the Node visualizer plays nothing"));
    expect(playing.getAttribute("data-viewer-playing")).toBe("invertingeffect/video_to_downstream");
    expect(playing.querySelector("canvas")?.getAttribute("aria-label")).toBe("Live picture of Inverting Effect › video_to_downstream");
    await waitFor(() => expect(playing.getAttribute("data-viewer-port-state")).toBe("ended"));
    expect(playing.textContent).toContain("This page has no WebCodecs VideoFrame to play the mock's frames.");

    fireEvent.click(outlinerRow(`node:${PATTERN_MAIN_STREAM}/displaywindow`));
    const withoutOutput = await waitFor(() => coreViewPage("viewer", "viewer").querySelector<HTMLElement>('[data-viewer-state="node_without_output"]') ?? expect.unreachable("no placeholder for a node with no output"));
    expect(withoutOutput.textContent).toContain("Display Window");
  });

  it("shows a stopped node's port as its family's placeholder in the Node visualizer, opening no read of it", async () => {
    await mountedWindowOverTheMock("state=running&node_states=stopped&outliner=open");
    await waitFor(() => outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.doubleClick(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.click(await waitFor(() => outlinerRow(`node:${PATTERN_MAIN_STREAM}/invertingeffect`)));

    const placeholder = await waitFor(() => coreViewPage("viewer", "viewer").querySelector<HTMLElement>('[data-viewer-state="node_not_running"]') ?? expect.unreachable("no placeholder for the stopped node"));
    expect(placeholder.getAttribute("data-viewer-node-state")).toBe("Stopped");
    expect(placeholder.getAttribute("data-family")).toBe("image");
    expect(placeholder.textContent).toContain("Inverting Effect › video_to_downstream");
    expect(placeholder.textContent).toContain("Not running. It shows here live once the stream plays.");
    expect(coreViewPage("viewer", "viewer").querySelector("[data-viewer-playing]")).toBeNull();
  });

  it("opens a node type's file in Code's own frame from the Library, its tab and the log's toggle in Code's header row, a closed tab staying closed as the frame loads again until the file is opened again", async () => {
    keepThePatternProjectsLayout({
      layout: {
        kind: "split",
        split_id: "library-and-code",
        direction: "row",
        parts: [
          { size_percent: 40, part: { kind: "area", area_id: "library-area", view_type_id: "library" } },
          { size_percent: 60, part: { kind: "area", area_id: "code-area", view_type_id: "code" } },
        ],
      },
    });
    await mountedWindowOverTheMock("state=running");
    await theAreasShownAre(["library-area", "code-area"]);
    const invertingEffectRowId = "source:project/category:Effects/node_type:nodes.inverting_effect:InvertingEffect";
    fireEvent.doubleClick(await waitFor(() => libraryRow(invertingEffectRowId)));

    const invertingEffectFile = `${PATTERN_PROJECT}/nodes/inverting_effect.py`;
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-document-state]")?.getAttribute("data-code-document-state")).toBe("read"));
    expect(coreViewPage("code").querySelector("[data-code-document-file]")?.getAttribute("data-code-document-file")).toBe(invertingEffectFile);
    expect(coreViewPage("code").querySelector(`[data-code-file-tab="${CSS.escape(invertingEffectFile)}"]`)?.textContent).toContain("inverting_effect.py");
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-project-log]")).not.toBeNull());

    fireEvent.click(coreViewPage("code").querySelector<HTMLElement>("[data-code-logs-toggle]") ?? expect.unreachable("no logs toggle"));
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-project-log]")).toBeNull());
    fireEvent.click(coreViewPage("code").querySelector<HTMLElement>(`[data-code-file-tab-close="${CSS.escape(invertingEffectFile)}"]`) ?? expect.unreachable("no close on the tab"));
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-document-state]")?.getAttribute("data-code-document-state")).toBe("none_open"));

    const rightEdgeButton = () => document.querySelector<HTMLElement>('[data-studio-layout-edge="right"]') ?? expect.unreachable("no right edge button");
    fireEvent.click(rightEdgeButton());
    await theAreasShownAre(["library-area"]);
    fireEvent.click(rightEdgeButton());
    await theAreasShownAre(["library-area", "code-area"]);
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-logs-toggle]")).not.toBeNull());
    // The opening the frame hears as it loads again crosses its port after its settings do.
    await act(() => new Promise<void>((settled) => setTimeout(settled, 100)));
    expect(coreViewPage("code").querySelector("[data-code-document-state]")?.getAttribute("data-code-document-state")).toBe("none_open");
    expect(coreViewPage("code").querySelector("[data-code-file-tab]")).toBeNull();

    fireEvent.doubleClick(await waitFor(() => libraryRow(invertingEffectRowId)));
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-document-file]")?.getAttribute("data-code-document-file")).toBe(invertingEffectFile));
  });

  it("says why a node type's file isn't opened from the Library while no area shows Code", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();
    fireEvent.doubleClick(await waitFor(() => libraryRow("source:project/category:Effects/node_type:nodes.inverting_effect:InvertingEffect")));

    expect(await inTheCoreView("library").findByText(/No area shows code\. Choose it in an area's view menu, then open it again\./)).toBeTruthy();
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
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector('[data-viewer-state="nothing_selected"]')).not.toBeNull());

    await popOutTheViewOf("viewer");
    const mainStreamTab = { stream: PATTERN_MAIN_STREAM, project_name: "pattern", display_name: "main" };
    await waitFor(() => expect(popOutsAsked).toEqual([{ view_type_id: "viewer", window_title: "main · Node visualizer", pinned_to: { stream_tab: mainStreamTab, selection: { kind: "nothing" }, settings: null } }]));
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
      window_title: "main › invertingeffect · Node visualizer",
      pinned_to: { stream_tab: mainStreamTab, selection: { kind: "node", stream: PATTERN_MAIN_STREAM, node: "invertingeffect" }, settings: null },
    };
    await mountedWindowOverTheMock(`state=running&popped_out_view=${encodeURIComponent(JSON.stringify(poppedOutViewer))}`);

    const playing = await waitFor(() => coreViewPage("viewer").querySelector<HTMLElement>("[data-viewer-playing]") ?? expect.unreachable("the popped-out Node visualizer plays nothing"));
    expect(playing.getAttribute("data-viewer-playing")).toBe("invertingeffect/video_to_downstream");
    expect(document.querySelector('[data-popped-out-view="viewer"] iframe[data-tatolab-view="viewer"]')).not.toBeNull();
    expect(textOf("[data-popped-out-view-title]")).toBe("main › invertingeffect · Node visualizer");
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
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector('[data-viewer-state="nothing_selected"]')).not.toBeNull());

    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    expect(await screen.findByText("This project and its imports bring no views.")).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: /^Outliner/ }).textContent).toBe("OutlinerTato Studio");
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Outliner/ }));

    await waitFor(() => expect(coreViewPage("outliner", "viewer").querySelector("[data-outliner]")).not.toBeNull());
    expect(localStorage.getItem(studioLayoutStorageKey(PATTERN_PROJECT))).toContain('"area_id":"viewer","view_type_id":"outliner"');
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

  it("narrows Properties to the matching properties from its toolbar's search field, and shows them all again once cleared", async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="invertingeffect"]') ?? expect.unreachable("no Inverting Effect card")));
    const properties = () => coreViewPage("properties");
    const portsListed = () => [...properties().querySelectorAll("[data-properties-port]")].map((port) => port.getAttribute("data-properties-port"));
    await waitFor(() => expect(portsListed()).toEqual(["video_from_upstream", "video_to_downstream"]));
    const search = properties().querySelector<HTMLInputElement>("[data-properties-search]") ?? expect.unreachable("no search field in Properties' toolbar");
    expect(search.closest('[role="toolbar"]')?.getAttribute("aria-label")).toBe("Properties tools");

    fireEvent.change(search, { target: { value: "UPSTREAM" } });
    await waitFor(() => expect(portsListed()).toEqual(["video_from_upstream"]));
    expect(properties().querySelector("[data-properties-listed-count]")?.textContent).toMatch(/^1 of \d+ propert/);
    expect(properties().querySelector('[data-properties-port="video_from_upstream"] [data-matched-words]')?.textContent).toBe("upstream");
    expect(properties().querySelector('[data-properties-section="outputs"]')).toBeNull();

    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(portsListed()).toEqual(["video_from_upstream", "video_to_downstream"]));
    expect(properties().querySelector("[data-properties-listed-count]")).toBeNull();
  });

  it("filters the Outliner's tree in place from its toolbar's search field, keeping each match's stream", async () => {
    await mountedWindowOverTheMock("state=running");
    const outliner = () => coreViewPage("outliner");
    const rowLabels = () => [...outliner().querySelectorAll('[role="treeitem"]')].map((row) => row.textContent);
    await waitFor(() => expect(rowLabels().some((label) => label?.startsWith("Brightness Meter"))).toBe(true));
    const search = outliner().querySelector<HTMLInputElement>("[data-outliner-search]") ?? expect.unreachable("no search field in the Outliner's toolbar");
    fireEvent.change(search, { target: { value: "bright" } });
    await waitFor(() => expect(rowLabels().slice(0, 2).map((label) => label?.replace(/BrightnessMeter$/, ""))).toEqual(["main", "Brightness Meter"]));
    expect(rowLabels().some((label) => label?.startsWith("Test Pattern Source"))).toBe(false);
    expect(outliner().querySelector("[data-matched-words]")?.textContent).toBe("Bright");
    fireEvent.change(search, { target: { value: "nothing-is-called-this" } });
    await waitFor(() => expect(outliner().querySelector('[data-outliner-state="no_row_matches"]')).not.toBeNull());
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(rowLabels().length).toBeGreaterThan(2));
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

  it("chooses an image for Image File's asset field in the asset picker over the window, sends its UUID, undoes it with one ⌘Z, imports one that is chosen at once, and shows a refusal in the runtime's words under the field", { timeout: 30_000 }, async () => {
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running")));
    const assetsSent: JsonValue[] = [];
    const mediaTheImportOffered: (readonly string[] | null)[] = [];
    let refusesTheNextAssetSet = false;
    await mountedWindowOverTheMock("state=running", {
      ...mockBackend,
      importAssetsIntoTheOpenProject: (media) => {
        mediaTheImportOffered.push(media);
        return mockBackend.importAssetsIntoTheOpenProject(media);
      },
      transactInTheOpenProject: async (operations, mode, idempotencyKey) => {
        const assetSet = operations.find((operation) => operation.operation === "set_node_config" && "asset" in operation.config);
        if (assetSet !== undefined && assetSet.operation === "set_node_config") {
          assetsSent.push(assetSet.config["asset"] ?? null);
          if (refusesTheNextAssetSet)
            return { kind: "refused", refusal: { action: "transact", refused_operation_index: 0, refused_node: assetSet.node, refused_link: null, refused_field: "asset", runtime_words: "config field `asset`: not an asset of the project" } };
        }
        return mockBackend.transactInTheOpenProject(operations, mode, idempotencyKey);
      },
    });
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-tool="add_node"]') ?? expect.unreachable("no Add node in the graph's ribbon")));
    const nodeSearch = await waitFor(() => within(streamGraph.body).getByRole("dialog", { name: "Add a node" }));
    const nodeSearchField = within(nodeSearch).getByRole("combobox");
    fireEvent.change(nodeSearchField, { target: { value: "Image File" } });
    fireEvent.keyDown(nodeSearchField, { key: "Enter" });
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="imagefile"]') ?? expect.unreachable("no Image File card"), { timeout: 5000 }));

    const properties = () => coreViewPage("properties");
    const assetWords = () => properties().querySelector<HTMLInputElement>('[data-config-field="asset"] [data-property-asset-field] input') ?? expect.unreachable("no asset field");
    const openThePicker = async () => {
      fireEvent.click(properties().querySelector<HTMLElement>('[data-config-field="asset"] [data-property-asset-choose]') ?? expect.unreachable("no Choose an asset… button"));
      await waitFor(() => screen.getByRole("dialog", { name: "Choose an image" }));
      const pickerFrame = await waitFor(() => document.querySelector<HTMLIFrameElement>('[data-project-asset-picker] iframe[data-tatolab-view="library"]') ?? expect.unreachable("no Library in the asset picker"));
      return pickerFrame.contentDocument ?? expect.unreachable("the picker's Library has no page");
    };
    const pickerCardPaths = (picker: Document) => [...picker.querySelectorAll<HTMLElement>("[data-library-asset]")].map((card) => card.dataset.libraryAsset);
    await waitFor(() => expect(assetWords().value).toBe("None"));
    expect(properties().querySelector('[data-config-field="asset"] [data-property-asset-picture]')).toBeNull();

    const picker = await openThePicker();
    await waitFor(() => expect(pickerCardPaths(picker)).toEqual(["media/poster.png"]));
    expect(picker.querySelector("[data-library-shown]")).toBeNull();
    expect(picker.querySelector("[data-project-asset-more-actions]")).toBeNull();
    fireEvent.click(picker.querySelector<HTMLElement>('[data-library-asset="media/poster.png"]') ?? expect.unreachable("no poster card in the picker"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose an image" })).toBeNull());
    await waitFor(() => expect(assetWords().value).toBe("media/poster.png"), { timeout: 5000 });
    expect(assetsSent).toEqual(["baaf9e5a-0aff-45f7-a7ea-b83db51e5a3b"]);
    await waitFor(() => expect(properties().querySelector('[data-config-field="asset"] [data-property-asset-picture]')?.getAttribute("src")).toMatch(/^data:image\//));

    fireEvent.keyDown(document, { key: "z", metaKey: true });
    await waitFor(() => expect(assetWords().value).toBe("None"), { timeout: 5000 });

    const pickerToImportFrom = await openThePicker();
    fireEvent.click(await waitFor(() => pickerToImportFrom.querySelector<HTMLElement>("[data-library-import-asset]") ?? expect.unreachable("no Import in the picker")));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose an image" })).toBeNull(), { timeout: 5000 });
    await waitFor(() => expect(assetWords().value).toBe("media/night-sky.jpg"), { timeout: 5000 });
    expect(mediaTheImportOffered).toEqual([["image"]]);
    expect(assetsSent).toEqual(["baaf9e5a-0aff-45f7-a7ea-b83db51e5a3b", "5e0c6a1d-7f2b-4c93-8a1e-000000000001"]);

    await openThePicker();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Choose an image" })).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose an image" })).toBeNull());
    expect(assetWords().value).toBe("media/night-sky.jpg");

    const pickerToEscapeFrom = await openThePicker();
    await waitFor(() => expect(pickerCardPaths(pickerToEscapeFrom)).not.toEqual([]));
    fireEvent.keyDown(pickerToEscapeFrom.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose an image" })).toBeNull());
    expect(assetWords().value).toBe("media/night-sky.jpg");

    refusesTheNextAssetSet = true;
    const pickerToBeRefused = await openThePicker();
    fireEvent.click(await waitFor(() => pickerToBeRefused.querySelector<HTMLElement>('[data-library-asset="media/poster.png"]') ?? expect.unreachable("no poster card in the picker")));
    await waitFor(() => expect(properties().querySelector('[data-config-field="asset"]')?.textContent).toContain("config field `asset`: not an asset of the project"), { timeout: 5000 });
    expect(assetWords().value).toBe("media/night-sky.jpg");
  });

  it("shows under Image File's asset field the runtime's words when it refuses to list the project's assets", { timeout: 20_000 }, async () => {
    const refusal = "list_assets failed: the project's assets folder is unreadable";
    await mountedWindowOverTheMock("state=running", {
      listProjectAssets: async () => {
        throw refusal;
      },
    });
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-tool="add_node"]') ?? expect.unreachable("no Add node in the graph's ribbon")));
    const nodeSearchField = within(await waitFor(() => within(streamGraph.body).getByRole("dialog", { name: "Add a node" }))).getByRole("combobox");
    fireEvent.change(nodeSearchField, { target: { value: "Image File" } });
    fireEvent.keyDown(nodeSearchField, { key: "Enter" });
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="imagefile"]') ?? expect.unreachable("no Image File card"), { timeout: 5000 }));

    await waitFor(() => expect(coreViewPage("properties").querySelector('[data-config-field="asset"] [data-property-asset-listing-refusal]')?.textContent).toContain(refusal), { timeout: 5000 });
  });

  it("exposes a number config field as a Graph Input from Properties, the node taking it as an input fed by the new Graph Input", async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="invertingeffect"]') ?? expect.unreachable("no Inverting Effect card")));
    const properties = () => coreViewPage("properties");

    pressAsAPointerDoes(await waitFor(() => properties().querySelector<HTMLElement>("[data-properties-expose-as-a-graph-input]") ?? expect.unreachable("no Expose as a Graph Input")));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Strength" }));

    const strengthInput = await waitFor(() => properties().querySelector<HTMLElement>('[data-properties-section="inputs"] [data-properties-port="strength"]') ?? expect.unreachable("no strength input"), { timeout: 5000 });
    await waitFor(() => expect([...strengthInput.querySelectorAll("[data-property-port-target]")].map((target) => target.getAttribute("data-property-port-target"))).toEqual(["invertingeffect_strength › value"]));
    await waitFor(() => expect(streamGraph.querySelector('[data-node-graph-card="invertingeffect_strength"]')).not.toBeNull());
    expect(properties().querySelector("[data-properties-expose-as-a-graph-input]")).toBeNull();
  });

  it("opens the Marketplace from Install modules… at the foot of the node search, closing the search", async () => {
    const modulesAndMarketplaceSectionsOpened: string[] = [];
    await mountedWindowOverTheMock("state=running", {
      openModuleManagerWindow: async (shows) => {
        modulesAndMarketplaceSectionsOpened.push(shows);
      },
    });
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    const addNodeInTheRibbon = await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-tool="add_node"]') ?? expect.unreachable("no Add node in the graph's ribbon"));
    fireEvent.click(addNodeInTheRibbon);
    const nodeSearch = await waitFor(() => within(streamGraph.body).getByRole("dialog", { name: "Add a node" }));

    fireEvent.click(within(nodeSearch).getByRole("button", { name: "Install modules…" }));
    await waitFor(() => expect(modulesAndMarketplaceSectionsOpened).toEqual(["marketplace"]));
    expect(within(streamGraph.body).queryByRole("dialog", { name: "Add a node" })).toBeNull();
  });

  it("shows a view node's view in an area from Properties' Show in an area, in place of what that area showed", async () => {
    await mountedWindowOverTheMock("state=running&studio_views=fixture");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="pictureandfader"]') ?? expect.unreachable("no view node card")));
    const properties = () => coreViewPage("properties");
    const shownInWords = () => properties().querySelector("[data-properties-view-shown-in-words]")?.textContent;
    await waitFor(() => expect(shownInWords()).toBe("Not shown"));

    pressAsAPointerDoes(properties().querySelector<HTMLElement>("[data-properties-show-in-an-area]") ?? expect.unreachable("no Show in an area"));
    const viewerChoice = await screen.findByRole("menuitem", { name: "In place of Node visualizer" });
    expect(screen.queryByRole("menuitem", { name: "In place of Properties" })).toBeNull();
    fireEvent.click(viewerChoice);

    await waitFor(() => expect(document.querySelector('[data-studio-area="viewer"] iframe[data-tatolab-view]')?.getAttribute("data-tatolab-view")).toBe("pattern:picture_and_fader"));
    await waitFor(() => expect(shownInWords()).toBe("1 area"));
  });

  it("moves an input's link to another output from its target picker, and adds and removes a blank picker on an output", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="brightnessmeter"]') ?? expect.unreachable("no Brightness Meter card")));
    const properties = () => coreViewPage("properties");
    const targetsOf = (port: string) => [...properties().querySelectorAll(`[data-properties-port="${port}"] [data-property-port-target]`)].map((target) => target.getAttribute("data-property-port-target"));
    await waitFor(() => expect(targetsOf("video_from_upstream")).toEqual(["Inverting Effect › video_to_downstream"]));

    pressAsAPointerDoes(properties().querySelector<HTMLElement>('[data-properties-port="video_from_upstream"] [data-property-port-target-picker]') ?? expect.unreachable("no target picker"));
    expect(screen.queryByRole("menuitem", { name: /^Inverting Effect/ })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Test Pattern Source/ }));
    await waitFor(() => expect(targetsOf("video_from_upstream")).toEqual(["Test Pattern Source › video"]), { timeout: 5000 });
    expect(properties().querySelector('[data-properties-port="video_from_upstream"] [data-property-port-add-target]')?.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(properties().querySelector<HTMLElement>('[data-properties-port="brightness"] [data-property-port-add-target]') ?? expect.unreachable("no + on brightness"));
    await waitFor(() => expect(targetsOf("brightness")).toEqual([""]));
    expect(await screen.findByText("Inputs in main that take Records")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(properties().querySelector<HTMLElement>('[data-properties-port="brightness"] [data-property-port-target-remove]') ?? expect.unreachable("no ✕ on the blank picker"));
    await waitFor(() => expect(targetsOf("brightness")).toEqual([]));
  });

  it("picks an input's other end in the Stream graph from Properties' crosshair, the fitting nodes lit, and Esc or choosing another node ends a pick", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraphPage = () => coreViewPage("stream_graph", "stream-graph");
    const card = (name: string) => streamGraphPage().querySelector<HTMLElement>(`[data-node-graph-card="${name}"]`) ?? expect.unreachable(`no ${name} card`);
    fireEvent.click(await waitFor(() => card("brightnessmeter")));
    const properties = () => coreViewPage("properties");
    const targetsOf = (port: string) => [...properties().querySelectorAll(`[data-properties-port="${port}"] [data-property-port-target]`)].map((target) => target.getAttribute("data-property-port-target"));
    await waitFor(() => expect(targetsOf("video_from_upstream")).toEqual(["Inverting Effect › video_to_downstream"]));
    const crosshair = () => properties().querySelector<HTMLElement>('[data-properties-port="video_from_upstream"] [data-property-port-target-pick]') ?? expect.unreachable("no crosshair");

    fireEvent.click(crosshair());
    await waitFor(() => expect(streamGraphPage().querySelector("[data-node-graph-port-pick-banner]")?.textContent).toContain("Pick the other end of Brightness Meter › video_from_upstream"));
    expect(card("testpatternsource").getAttribute("data-port-pick")).toBe("lit");
    expect(card("displaywindow").getAttribute("data-port-pick")).toBe("dim");
    expect(crosshair().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card("testpatternsource"));
    await waitFor(() => expect(targetsOf("video_from_upstream")).toEqual(["Test Pattern Source › video"]), { timeout: 5000 });
    expect(streamGraphPage().querySelector("[data-node-graph-port-pick-banner]")).toBeNull();

    fireEvent.click(crosshair());
    await waitFor(() => expect(streamGraphPage().querySelector("[data-node-graph-port-pick-banner]")).not.toBeNull());
    fireEvent.keyDown(streamGraphPage(), { key: "Escape" });
    await waitFor(() => expect(streamGraphPage().querySelector("[data-node-graph-port-pick-banner]")).toBeNull());
    await waitFor(() => expect(crosshair().getAttribute("aria-pressed")).toBe("false"));
    expect(card("displaywindow").getAttribute("data-port-pick")).toBeNull();

    fireEvent.click(crosshair());
    await waitFor(() => expect(streamGraphPage().querySelector("[data-node-graph-port-pick-banner]")).not.toBeNull());
    fireEvent.click(await waitFor(() => outlinerRow(`node:${PATTERN_MAIN_STREAM}/invertingeffect`)));
    await waitFor(() => expect(streamGraphPage().querySelector("[data-node-graph-port-pick-banner]")).toBeNull());
  });

  it("answers a studio shortcut pressed while a core view's frame holds the focus", async () => {
    keepThePatternProjectsLayout({ presets_saved: [{ title: "Graph alone", layout: { kind: "area", area_id: "stream-graph", view_type_id: "stream_graph" } }] });
    await mountedWindowOverTheMock("state=running");
    const outlinerPage = await waitFor(() => (coreViewPage("outliner").querySelector("[data-outliner]") === null ? expect.unreachable("no outliner drawn") : coreViewPage("outliner")));

    fireEvent.keyDown(outlinerPage, { key: "1", metaKey: true });
    await theAreasShownAre(["stream-graph"]);
  });

  it("opens a stream's tab on a single click of its Outliner row, and the views follow the tab", async () => {
    await mountedWindowOverTheMock("state=running");
    const recorderStream = mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "recorder" });
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["main"]));

    fireEvent.click(await waitFor(() => outlinerRow(`stream:${recorderStream}`)));

    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => [tab.textContent, tab.getAttribute("aria-selected")])).toEqual([["main", "false"], ["recorder", "true"]]));
    await waitFor(() => expect(coreViewPage("stream_graph", "stream-graph").querySelector("[data-stream-graph]")?.getAttribute("data-stream-graph")).toBe(recorderStream));
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
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector('[data-viewer-state="nothing_selected"]')).not.toBeNull());

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
    keepThePatternProjectsLayout({ layout: { kind: "area", area_id: "venue", view_type_id: "venue-3d" } });
    await mountedWindowOverTheMock("state=running");
    await theAreasShownAre(["venue"]);
    expect(screen.getByText("This area's view, venue-3d, isn't in this build")).toBeTruthy();
    document.body.replaceChildren();

    keepThePatternProjectsLayout({ layout: { kind: "split", parts: [] } });
    await mountedWindowOverTheMock("state=running");
    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
  });

  it("shows the Projects window with no project open, its recent projects as cards, and opens the one chosen on its stream", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    const patternCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern card"));
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6);

    fireEvent.click(patternCard.querySelector<HTMLElement>("[data-project-open]") ?? expect.unreachable("no open button"));

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
    expect(document.querySelector("[data-projects]")).toBeNull();
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => `${tab.textContent} ${tab.getAttribute("aria-selected")}`)).toEqual(["main true"]));
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector('[data-viewer-state="nothing_selected"]')).not.toBeNull());
  });

  it("shows the Projects window with no menu bar, a bare strip for the window buttons on macOS only, and a gear that opens Settings", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-projects-title-bar]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

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

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
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
    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-naming-dialog-name]") ?? expect.unreachable("no Rename dialog"));
    expect(nameField.value).toBe("pattern");
    fireEvent.change(nameField, { target: { value: "   " } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    expect(renameRecentProject).not.toHaveBeenCalled();

    fireEvent.change(nameField, { target: { value: "Refused" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(textOf("[data-naming-dialog-refusal]")).toContain("rename_project failed: the project file is read-only"));
    expect(document.querySelector("[data-name-form-dialog='rename_project']")).not.toBeNull();

    fireEvent.change(nameField, { target: { value: "Night Show" } });
    fireEvent.keyDown(nameField, { key: "Enter" });

    await waitFor(() => expect(document.querySelector("[data-name-form-dialog='rename_project']")).toBeNull());
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

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
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

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
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
    fireEvent.click(await projectsWindowNewProjectButton());
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

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
    expect(document.querySelector("[data-new-project-sheet]")).toBeNull();
    expect(document.querySelector("[data-projects]")).toBeNull();
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true"]));
    await waitFor(() => expect(streamTabs.getByRole("tab").textContent).toBe("main"));
  });

  it("opens the Activity panel as a new project's packages sync, naming each package uv downloads, and keeps how many it installed and each package once it ends", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    fireEvent.click(await projectsWindowNewProjectButton());
    await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no New project sheet"));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const packageList = await screen.findByRole("list", { name: "Untitled project 2's Python packages, each part" }, { timeout: 4000 });
    await waitFor(() => expect(within(packageList).getByText("pillow")).toBeTruthy(), { timeout: 4000 });
    expect(document.querySelector("[data-studio-activity-panel]")?.textContent).toMatch(/Downloading|Installing|Installed/);
    const endedRow = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-activity-panel] [data-progress-meter-outcome="done"]') ?? expect.unreachable("the sync has not ended"), { timeout: 8000 });
    expect(endedRow.textContent).toContain("Installed 8 packages");
    expect(within(within(endedRow).getByRole("list")).getByText("pillow")).toBeTruthy();
  }, 15_000);

  it("refuses a name that is no folder name before Create, and a folder already there in the sheet, which stays open", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    fireEvent.click(await projectsWindowNewProjectButton());
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
    fireEvent.click(await projectsWindowNewProjectButton());
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

  it("lists the project's modules as the runtime does, each saying where it was copied from and the views it adds, and opens one to edit by its folder", async () => {
    let foldersOpenedToEdit: string[] = [];
    await mountedWindowOverTheMock("state=running&studio_views=fixture&module_manager=open&module_manager_section=added_to_this_project", {
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
    expect(textOf('[data-module-manager-view="lobby-wall:stage_rig"]')).toBe("Stage rigDoesn't open: `contract`: this runtime reads view contract 1.0.");
    expect(document.querySelector("[data-module-manager-views-reach]")).toBeNull();
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

describe("Settings", () => {
  it("opens on macOS from Tato Studio › Settings… in the system menu bar, after About and Check for Updates…, on Project while a project is open", async () => {
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
    await waitFor(() => expect(document.querySelector(`[data-settings-page="project"]`)).not.toBeNull());
  });

  it("opens on Linux from Edit › Settings… on Project while a project is open, listing every section under its group beside it", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    await chooseFromTheMenuBar("Edit", /^Settings…/);

    await waitFor(() => expect(document.querySelector(`[data-settings-page="project"]`)).not.toBeNull());
    const sectionList = within(screen.getByRole("navigation", { name: "Settings" }));
    expect(sectionList.getByRole("button", { name: "Project" }).getAttribute("aria-current")).toBe("page");
    expect(sectionList.getAllByRole("button").map((sectionButton) => sectionButton.textContent)).toEqual(["Project", "General", "Developer", "Runtime", "Command line", "About"]);
    expect(sectionList.getByText("This machine")).toBeTruthy();
    expect(sectionList.getByText("This project")).toBeTruthy();
  });

  it("changes the open project's name, description and cover in Settings' Project section", async () => {
    const setRecentProjectDescription = vi.fn<(folder: string, description: string) => Promise<void>>(async () => undefined);
    const renameRecentProject = vi.fn<(folder: string, name: string) => Promise<void>>(async () => undefined);
    const setRecentProjectCover = vi.fn<(folder: string, image: string | null) => Promise<void>>(async () => undefined);
    const chooseProjectCoverImage = vi.fn<() => Promise<string | null>>(async () => "/Users/jonathanf/Pictures/stage.png");
    await mountedWindowOverTheMock("state=running", { setRecentProjectDescription, renameRecentProject, setRecentProjectCover, chooseProjectCoverImage });
    await openSettingsOn("project");
    const projectSettings = await waitFor(() => document.querySelector<HTMLElement>(`[data-project-settings="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no Project section"));
    const nameField = await waitFor(() => projectSettings.querySelector<HTMLInputElement>("[data-project-details-name]") ?? expect.unreachable("no name field"));
    expect(nameField.value).toBe("pattern");

    fireEvent.change(nameField, { target: { value: "Lobby pattern" } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    await waitFor(() => expect(renameRecentProject).toHaveBeenCalledWith(PATTERN_PROJECT, "Lobby pattern"));

    const descriptionField = projectSettings.querySelector<HTMLTextAreaElement>("[data-project-details-description]") ?? expect.unreachable("no description field");
    fireEvent.change(descriptionField, { target: { value: "The lobby's test pattern." } });
    fireEvent.blur(descriptionField);
    await waitFor(() => expect(setRecentProjectDescription).toHaveBeenCalledWith(PATTERN_PROJECT, "The lobby's test pattern."));

    fireEvent.click(within(projectSettings).getByRole("button", { name: "Choose image…" }));
    await waitFor(() => expect(setRecentProjectCover).toHaveBeenCalledWith(PATTERN_PROJECT, "/Users/jonathanf/Pictures/stage.png"));
  });

  it("lists no Project section in Settings opened from the Projects window", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]").length).toBeGreaterThan(0));
    fireEvent.keyDown(document, { key: ",", metaKey: true });
    fireEvent.keyDown(document, { key: ",", ctrlKey: true });
    await waitFor(() => expect(document.querySelector('[data-settings-page="general"]')).not.toBeNull());
    expect(document.querySelector('[data-settings-section="project"]')).toBeNull();
    expect(screen.queryByText("This project")).toBeNull();
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

describe("Settings › Command line › tatolab", () => {
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
