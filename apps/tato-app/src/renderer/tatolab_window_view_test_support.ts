import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { SystemMenuBarMenu, TatolabStatus } from "../shared/tatolab_backend_contract";
import { nodeUiElementTag } from "@tatolab/tato-app-view-sdk/node_ui_host";
import { mockStudioNodeUiElements } from "../../mock/mock_node_ui_elements";
import { createMockTatolabBackend } from "../../mock/mock_tatolab_backend";
import { readMockTatolabOptions } from "../../mock/mock_tatolab_options";
import { mockStreamIdOf } from "../../mock/mock_stream_fixtures";
import type { TatolabBackend } from "./backend/tatolab_backend";
import { studioLayoutStorageKey } from "./studio_shell/studio_layout";
import { mountTatolabWindow } from "./tatolab_window_view";
import { drawTheCoreViewsInTheirFrames } from "./view_host/fake_core_view_frames";

/** Stops drawing the core views of the window mounted last, unmounting each. */
let stopDrawingTheCoreViews: () => void = () => undefined;

/** The keydown listeners, and the load listeners that hand a view's frame one, each mounted window added to the document, removed after each test so a window from an earlier test never answers a shortcut. */
const documentShortcutListenersAdded: { eventName: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }[] = [];

/** Removes the keydown and load listeners every window mounted so far added to the document, and restores the spies on it. */
export function removeTheKeydownListenersOfEarlierWindows(): void {
  vi.restoreAllMocks();
  for (const { eventName, listener, options } of documentShortcutListenersAdded.splice(0)) document.removeEventListener(eventName, listener, options);
}

/** Hides every window mounted so far, so none starts another read, and lets the reads already in flight settle while the page is still here. */
export async function hideTheWindowsOfEarlierTestsAndLetTheirReadsSettle(): Promise<void> {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
  await act(() => new Promise<void>((settled) => setTimeout(settled, 100)));
  Reflect.deleteProperty(document, "visibilityState");
}

/** Hides the windows the test that just ended mounted, lets their reads settle and clears what they left on the page. */
export async function cleanUpTheWindowsOfEarlierTests(): Promise<void> {
  await hideTheWindowsOfEarlierTestsAndLetTheirReadsSettle();
  removeTheKeydownListenersOfEarlierWindows();
  stopDrawingTheCoreViews();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
}

/** The real window over the mock backend opened with `pageQuery`, mounted the way `main.ts` mounts it. */
export async function mountedWindowOverTheMock(pageQuery: string, backendChanges: Partial<TatolabBackend> = {}, onTheFirstStatusDrawn?: () => void) {
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

/** The text of the first element `selector` matches, or empty when none does. */
export function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

/** Presses the element as a pointer does: a menu's trigger opens on the press. */
export function pressAsAPointerDoes(element: HTMLElement): void {
  fireEvent.pointerDown(element, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.pointerUp(element, { button: 0, pointerType: "mouse" });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element);
}

/** The mock backend's changes that keep what the window shows in macOS's system menu bar, and choose from it as a person does. */
export function systemMenuBarOverTheMock() {
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
export async function chooseFromTheMenuBar(menuLabel: string, entryLabel: RegExp): Promise<void> {
  pressAsAPointerDoes(await waitFor(() => document.querySelector<HTMLElement>(`[data-studio-menu="${menuLabel}"]`) ?? expect.unreachable(`no ${menuLabel} menu`)));
  fireEvent.click(await screen.findByRole("menuitem", { name: entryLabel }));
}

/** Opens Settings from its shortcut on the section `section`, and waits for its page. */
export async function openSettingsOn(section: string): Promise<void> {
  await waitFor(() => expect(document.querySelector("[data-studio-window]")).not.toBeNull());
  fireEvent.keyDown(document, { key: ",", metaKey: true });
  fireEvent.keyDown(document, { key: ",", ctrlKey: true });
  const sectionButton = await waitFor(() => document.querySelector<HTMLElement>(`[data-settings-section="${section}"]`) ?? expect.unreachable(`no ${section} section`));
  fireEvent.click(sectionButton);
  await waitFor(() => expect(document.querySelector(`[data-settings-page="${section}"]`)).not.toBeNull());
}

/** Settings' row named `rowName`. */
export function settingsRow(rowName: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-settings-row="${rowName}"]`) ?? expect.unreachable(`no ${rowName} row`);
}

/** The mock's pattern project's folder, open by default. */
export const PATTERN_PROJECT = "/Users/jonathanf/streams/pattern";
/** The mock's camera project's folder. */
export const CAMERA_PROJECT = "/Users/jonathanf/streams/camera";
/** The id of the pattern project's `main` stream. */
export const PATTERN_MAIN_STREAM = mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "main" });

/** The page of the core view `viewTypeId` drawn in its frame, in the area `areaId` when one is named. */
export function coreViewPage(viewTypeId: string, areaId?: string): Document {
  const areaSelector = areaId === undefined ? "" : `[data-studio-area="${areaId}"] `;
  const frame = document.querySelector<HTMLIFrameElement>(`${areaSelector}iframe[data-tatolab-view="${viewTypeId}"]`) ?? expect.unreachable(`no ${viewTypeId} frame`);
  return frame.contentDocument ?? expect.unreachable(`the ${viewTypeId} frame has no page`);
}

/** Queries scoped to the page of the core view `viewTypeId`. */
export function inTheCoreView(viewTypeId: string) {
  return within(coreViewPage(viewTypeId).body);
}

/** Chooses `shown` in the Library's Show menu. */
export async function showInTheLibrary(shown: string): Promise<void> {
  const library = coreViewPage("library");
  pressAsAPointerDoes(await waitFor(() => library.querySelector<HTMLElement>("[data-library-shown]") ?? expect.unreachable("no Show menu")));
  // A fake core view frame is drawn by the window's own React, so its menu's portal opens in the window's document.
  const shownChoice = `[data-library-shown-choice="${shown}"]`;
  fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>(shownChoice) ?? expect.unreachable(`no Show choice ${shown}`)));
}

/** The Library's row `rowId`. */
export function libraryRow(rowId: string): HTMLElement {
  return coreViewPage("library").querySelector<HTMLElement>(`[data-library-declarations] [data-tree-row-id="${CSS.escape(rowId)}"]`) ?? expect.unreachable(`no Library row ${rowId}`);
}

/** Chooses the Library in the default layout's viewer area's view-type menu, and waits for the menu to close. */
export async function showTheLibraryInTheViewerArea(): Promise<void> {
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await waitFor(() => expect(screen.queryByRole("menuitemradio", { name: /^Library/ })).toBeNull());
}

/** The Projects window's New project button, beside its view and sort menus; the grid's last card is another. */
export async function projectsWindowNewProjectButton(): Promise<HTMLElement> {
  return waitFor(() => document.querySelector<HTMLElement>('[data-projects-action="new"]') ?? expect.unreachable("no New project button"));
}

/** The Outliner's row `rowId`. */
export function outlinerRow(rowId: string): HTMLElement {
  return coreViewPage("outliner").querySelector<HTMLElement>(`[data-outliner] [data-tree-row-id="${CSS.escape(rowId)}"]`) ?? expect.unreachable(`no outliner row ${rowId}`);
}

/** The ids of the Outliner's rows, in their order. */
export function outlinerRowIds(): string[] {
  return [...coreViewPage("outliner").querySelectorAll<HTMLElement>("[data-outliner] [data-tree-row-id]")].map((row) => row.dataset.treeRowId ?? "");
}

/** The areas of the studio's default layout, in their order. */
export const AREAS_OF_THE_DEFAULT_LAYOUT = ["outliner", "stream-graph", "viewer", "properties"];

/** The ids of the studio layout's areas shown, in their order. */
export function areaIdsShown(): (string | null)[] {
  return [...document.querySelectorAll<HTMLElement>("[data-studio-layout] [data-studio-area]")].map((area) => area.getAttribute("data-studio-area"));
}

/** Waits for the studio to show the areas `areaIds` names, in their order. */
export async function theAreasShownAre(areaIds: readonly string[]): Promise<void> {
  await waitFor(() => expect(areaIdsShown()).toEqual(areaIds));
}

/** Keeps `saved` as the pattern project's layout, for the studio to open on. */
export function keepThePatternProjectsLayout(saved: unknown): void {
  localStorage.setItem(studioLayoutStorageKey(PATTERN_PROJECT), JSON.stringify(saved));
}

/**
 * The tag the mock's listing mints for the Studio's Float control named `control`, `null` for the type's default. A frame
 * imports each listed script from the dev server, which no test serves, so a test defines a stand-in under this tag, as
 * loading the Studio's own control in a frame defines it.
 */
export function tagOfTheStudiosFloatControl(control: string | null): string {
  const listed = mockStudioNodeUiElements(window.location.origin, false).find(({ registration }) => registration.kind === "control" && registration.type === "float" && registration.control === control);
  return nodeUiElementTag(listed ?? expect.unreachable(`the mock lists no Float control ${control ?? "default"}`));
}
