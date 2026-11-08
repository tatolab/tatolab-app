// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenProjectReading, PoppedOutViewerTarget, SystemMenuBarMenu, TatolabStatus } from "../shared/tatolab_backend_contract";
import { createMockTatolabBackend, readMockTatolabOptions } from "./backend/mock_tatolab_backend";
import { mockStreamIdOf } from "./backend/mock_stream_fixtures";
import type { TatolabBackend } from "./backend/tatolab_backend";
import { studioLayoutsStorageKey } from "./studio_shell/studio_layouts";
import { mountTatolabWindow } from "./tatolab_window_view";

/** The keydown listeners each mounted window added to the document, removed after each test so a window from an earlier test never answers a shortcut. */
const documentKeydownListenersAdded: EventListenerOrEventListenerObject[] = [];

function removeTheKeydownListenersOfEarlierWindows(): void {
  vi.restoreAllMocks();
  for (const keydownListener of documentKeydownListenersAdded.splice(0)) document.removeEventListener("keydown", keydownListener);
}

afterEach(() => {
  removeTheKeydownListenersOfEarlierWindows();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});

/** The real window over the mock backend opened with `pageQuery`, mounted the way `main.ts` mounts it. */
async function mountedWindowOverTheMock(pageQuery: string, backendChanges: Partial<TatolabBackend> = {}, onTheFirstStatusDrawn?: () => void) {
  const backend: TatolabBackend = { ...createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams(pageQuery))), ...backendChanges };
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  let showTatolabStatus: ((status: TatolabStatus) => void) | null = null;
  await backend.onTatolabStatusChanged((status) => showTatolabStatus?.(status));
  const firstStatus = await backend.getTatolabStatus();
  removeTheKeydownListenersOfEarlierWindows();
  vi.spyOn(document, "addEventListener").mockImplementation((eventName: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    if (eventName === "keydown" && listener !== null) documentKeydownListenersAdded.push(listener);
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
const PATTERN_MAIN_STREAM = mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_function: "stream:main" });

function outlinerRow(rowId: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-outliner] [data-tree-row-id="${CSS.escape(rowId)}"]`) ?? expect.unreachable(`no outliner row ${rowId}`);
}

function outlinerRowIds(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[data-outliner] [data-tree-row-id]")].map((row) => row.dataset.treeRowId ?? "");
}

function openTheOutlinerRow(rowId: string): void {
  fireEvent.click(outlinerRow(rowId).querySelector<HTMLElement>("[data-tree-row-toggle]") ?? expect.unreachable(`no toggle on ${rowId}`));
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
      `project:${PATTERN_PROJECT}/pyproject`,
      `stream:${PATTERN_MAIN_STREAM}`,
      `stream:${mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_function: "stream:recorder" })}`,
      `stream:${mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_function: "stream:pattern_two" })}`,
      "imports",
    ]);
    expect(outlinerRow("open_project_folder").getAttribute("aria-level")).toBe("1");
    expect(outlinerRow(`project:${PATTERN_PROJECT}`).textContent).toBe("pattern");
    expect(outlinerRow(`project:${PATTERN_PROJECT}/pyproject`).textContent).toBe("pyproject.toml");
    expect(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`).textContent).toBe("main");
    expect(outlinerRow("imports").getAttribute("aria-expanded")).toBe("false");
    expect(outlinerRow("imports").textContent).toBe("Imports");
    expect(within(outlinerRow("imports")).getByRole("img", { name: "Read only" })).toBeTruthy();
  });

  it("opens Imports on each import, read-only: a folder import's streams, an unreadable one's refusal, and a package's waiting on the runtime", async () => {
    await mountedWindowOverTheMock("state=running");
    await waitFor(() => outlinerRow("imports"));
    openTheOutlinerRow("imports");
    openTheOutlinerRow(`project:${CAMERA_PROJECT}`);
    openTheOutlinerRow(`project:${PATTERN_PROJECT}/imports/stage-lights`);
    openTheOutlinerRow("project:tatolab-testpattern");

    expect(within(outlinerRow(`project:${CAMERA_PROJECT}`)).getByRole("img", { name: "Read only" })).toBeTruthy();
    expect(outlinerRow(`stream:${mockStreamIdOf({ project_directory: CAMERA_PROJECT, stream_function: "stream:main" })}`).getAttribute("aria-level")).toBe("4");
    expect(outlinerRow(`project:${PATTERN_PROJECT}/imports/stage-lights/refusal`).textContent).toBe(`${PATTERN_PROJECT}/imports/stage-lights has no pyproject.toml.`);
    expect(outlinerRow("project:tatolab-testpattern/waiting").textContent).toBe("Streams and nodes not read yet");
  });

  it("shows a project's streams waiting on the runtime while it lists none", async () => {
    await mountedWindowOverTheMock("state=not-running");
    await waitFor(() => outlinerRow(`project:${PATTERN_PROJECT}/waiting`));
    expect(outlinerRow(`project:${PATTERN_PROJECT}/waiting`).textContent).toBe("Streams and nodes not read yet");
  });

  it("moves through the outliner from the keyboard, opening and closing rows and selecting as it goes", async () => {
    await mountedWindowOverTheMock("state=running");
    await waitFor(() => outlinerRow("imports"));
    const tree = screen.getByRole("tree", { name: "Outliner" });
    outlinerRow(`stream:${PATTERN_MAIN_STREAM}`).focus();

    fireEvent.keyDown(tree, { key: "End" });
    expect(outlinerRow("imports").getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(outlinerRow("imports"));
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(outlinerRow("imports").getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(outlinerRow("imports").getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(tree, { key: "Home" });
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(outlinerRow(`project:${PATTERN_PROJECT}`).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(outlinerRow(`project:${PATTERN_PROJECT}`));
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
    fireEvent.keyDown(screen.getByRole("tree", { name: "Outliner" }), { key: "Enter" });
    const cameraStream = mockStreamIdOf({ project_directory: CAMERA_PROJECT, stream_function: "stream:main" });
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

  it("plays the open stream's last picture in the Viewer, reading the port as a port viewer", async () => {
    await mountedWindowOverTheMock("state=running");
    await waitFor(() => outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.doubleClick(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));

    const playing = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"] [data-viewer-playing]') ?? expect.unreachable("the Viewer plays nothing"));
    expect(playing.getAttribute("data-viewer-playing")).toBe("invertingeffect/video_to_downstream");
    expect(playing.querySelector("canvas")?.getAttribute("aria-label")).toBe("Live picture of Inverting Effect › video_to_downstream");
    expect(document.querySelector("iframe")).toBeNull();
    await waitFor(() => expect(playing.getAttribute("data-viewer-port-state")).toBe("ended"));
    expect(playing.textContent).toContain("This page has no WebCodecs VideoFrame to play the mock's frames.");
  });

  it("pops the Viewer out pinned to the stream shown and the node selected, and says why where it is refused", async () => {
    const popOutsAsked: PoppedOutViewerTarget[] = [];
    let popOutRefusal: string | null = null;
    await mountedWindowOverTheMock("state=running", {
      popOutViewer: async (target) => {
        popOutsAsked.push(target);
        if (popOutRefusal !== null) throw popOutRefusal;
      },
    });
    const popOutButton = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"] [data-viewer-pop-out]') ?? expect.unreachable("no Pop out"));

    fireEvent.click(popOutButton);
    await waitFor(() => expect(popOutsAsked).toEqual([{ stream: PATTERN_MAIN_STREAM, project_name: "pattern", display_name: "main", node: null }]));
    expect(document.querySelector("[data-viewer-pop-out-refusal]")).toBeNull();

    popOutRefusal = "Only a project's studio window can pop out its Viewer.";
    fireEvent.click(popOutButton);
    await waitFor(() => expect(textOf("[data-viewer-pop-out-refusal]")).toBe("Didn't pop out: Only a project's studio window can pop out its Viewer."));
  });

  it("draws a popped-out Viewer's window as the Viewer alone, pinned, with no menus, tabs or other areas", async () => {
    const pin: PoppedOutViewerTarget = { stream: PATTERN_MAIN_STREAM, project_name: "pattern", display_name: "main", node: "invertingeffect" };
    await mountedWindowOverTheMock(`state=running&popped_out_viewer=${encodeURIComponent(JSON.stringify(pin))}`);

    const playing = await waitFor(() => document.querySelector<HTMLElement>("[data-popped-out-viewer] [data-viewer-playing]") ?? expect.unreachable("the popped-out Viewer plays nothing"));
    expect(playing.getAttribute("data-viewer-playing")).toBe("invertingeffect/video_to_downstream");
    expect(textOf("[data-popped-out-viewer-title]")).toBe("main › invertingeffect");
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-studio-area]")).toBeNull();
    expect(document.querySelector("[data-projects]")).toBeNull();
    expect(document.querySelector("[data-viewer-pop-out]")).toBeNull();
  });

  it("shows the view an area's view-type menu chooses, and the project reopens with it", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    await waitFor(() => expect(viewerArea.querySelector("[data-viewer-playing]")).not.toBeNull());

    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    expect(await screen.findByText("Views a project brings arrive with users' own view types.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Outliner/ }));

    await waitFor(() => expect(document.querySelector('[data-studio-area="viewer"] [data-outliner]')).not.toBeNull());
    expect(localStorage.getItem(studioLayoutsStorageKey(PATTERN_PROJECT))).toContain('"area_id":"viewer","view_type_id":"outliner"');
    document.body.replaceChildren();

    await mountedWindowOverTheMock("state=running");
    await waitFor(() => expect(document.querySelector('[data-studio-area="viewer"] [data-outliner]')).not.toBeNull());
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
    expect(patternCard.textContent).toContain("Running");
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6);

    fireEvent.click(patternCard);

    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-projects]")).toBeNull();
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => `${tab.textContent} ${tab.getAttribute("aria-selected")}`)).toEqual(["pattern /main true"]));
    await waitFor(() => expect(document.querySelector('[data-studio-area="viewer"] [data-viewer-playing]')).not.toBeNull());
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

  it("narrows the Projects window to the projects a search names", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), { target: { value: "camera" } });
    expect([...document.querySelectorAll("[data-projects-project]")].map((card) => card.getAttribute("data-projects-project"))).toEqual([CAMERA_PROJECT]);
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), { target: { value: "nothing-like-it" } });
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(0);
    expect(textOf("[data-projects-empty]")).toContain("No project matches");
  });

  it("opens first run on the empty Projects window, its banner a still picture where WebGL is not offered, and Open… opens the one chosen", async () => {
    await mountedWindowOverTheMock("state=running&project=none&recent=none");
    await waitFor(() => expect(textOf("[data-projects-empty]")).toContain("No projects yet"));
    expect(document.querySelector('[data-projects-banner="still"] img')).not.toBeNull();
    expect(screen.getByText("v0.45.0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open…" }));

    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-projects]")).toBeNull();
  });

  it("says why an unreadable project can't be read, in the reader's words", async () => {
    await mountedWindowOverTheMock("state=running&project=unreadable");
    await waitFor(() => expect(screen.getByText(`${PATTERN_PROJECT} can't be read`)).toBeTruthy());
    expect(screen.getByText(/pyproject\.toml is not TOML: Invalid TOML document/)).toBeTruthy();
  });

  it("shows a refused project choice in its own words, and the open project stays as it was", async () => {
    const reading: OpenProjectReading = { kind: "none_open" };
    await mountedWindowOverTheMock("state=running&project=none", {
      readOpenProject: async () => reading,
      chooseProjectFolder: () => Promise.reject("The project dialog did not open: no window"),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Open…" }));

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
    expect(streamTabs.getByRole("tab").textContent).toMatch(/^night-show \//);
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

describe("Get more", () => {
  function getMoreRow(name: string): HTMLElement {
    return document.querySelector<HTMLElement>(`[data-get-more-row="${name}"]`) ?? expect.unreachable(`no ${name} row`);
  }

  it("lists the catalog's packages and samples, each showing the nodes it brings, and narrows to a search", async () => {
    await mountedWindowOverTheMock("state=running&get_more=open");

    await waitFor(() => expect(document.querySelector('[data-get-more-row="tatolab-camera"]')).not.toBeNull());
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector('[data-get-more-row="camera-halftone"]')).toBeNull();
    fireEvent.click(getMoreRow("tatolab-compositor"));
    expect(textOf('[data-get-more-detail="tatolab-compositor"]')).toContain("LowerThird");
    expect(getMoreRow("tatolab-testpattern").textContent).toContain("Imported");

    fireEvent.click(document.querySelector<HTMLElement>('[data-get-more-scope="samples"]') ?? expect.unreachable("no Samples scope"));
    await waitFor(() => expect(document.querySelector('[data-get-more-row="camera-halftone"]')).not.toBeNull());
    expect(document.querySelector('[data-get-more-row="tatolab-camera"]')).toBeNull();

    fireEvent.click(document.querySelector<HTMLElement>('[data-get-more-scope="published"]') ?? expect.unreachable("no Published scope"));
    const searchField = document.querySelector<HTMLInputElement>("[data-get-more-search] input") ?? document.querySelector<HTMLInputElement>("input[data-get-more-search]") ?? expect.unreachable("no search");
    fireEvent.change(searchField, { target: { value: "opusdecoder" } });
    await waitFor(() => expect(document.querySelectorAll("[data-get-more-row]").length).toBe(1));
    expect(getMoreRow("tatolab-opus")).toBeTruthy();
  });

  it("shows an import's change to pyproject.toml before writing it, and lists it in the project once written", async () => {
    await mountedWindowOverTheMock("state=running&get_more=open");

    fireEvent.click(await waitFor(() => getMoreRow("tatolab-camera")));
    fireEvent.click(document.querySelector<HTMLElement>('[data-get-more-import="tatolab-camera"]') ?? expect.unreachable("no Import"));
    await waitFor(() => expect(document.querySelector("[data-import-change]")).not.toBeNull());
    const addedLines = [...document.querySelectorAll('[data-import-change-line="added"]')].map((line) => line.textContent ?? "");
    expect(addedLines.some((line) => line.includes('"tatolab-camera>='))).toBe(true);

    fireEvent.click(document.querySelector<HTMLElement>("[data-get-more-import-confirm]") ?? expect.unreachable("no Import in the dialog"));
    await waitFor(() => expect(document.querySelector("[data-import-change]")).toBeNull());
    await waitFor(() => expect(getMoreRow("tatolab-camera").textContent).toContain("Imported"));
    expect(document.querySelector('[data-get-more-import="tatolab-camera"]')).toBeNull();
  });

  it("says nothing was written when pyproject.toml changed after the import was shown", async () => {
    const staleRefusal = "pyproject.toml changed since the import was shown; nothing was written. Look at the change again before importing.";
    await mountedWindowOverTheMock("state=running&get_more=open", { importIntoWorkspace: () => Promise.reject(staleRefusal) });

    fireEvent.click(await waitFor(() => getMoreRow("tatolab-opus")));
    fireEvent.click(document.querySelector<HTMLElement>('[data-get-more-import="tatolab-opus"]') ?? expect.unreachable("no Import"));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>("[data-get-more-import-confirm]") ?? expect.unreachable("no Import in the dialog")));

    await waitFor(() => expect(document.querySelector("[data-get-more-import-dialog]")?.textContent).toContain(`Nothing was written: ${staleRefusal}`));
    expect(document.querySelector("[data-import-change]")).not.toBeNull();
  });

  it("says the catalog didn't load and what it waits on, and still lists what the project imports, a folder import opening to edit", async () => {
    let namesOpenedToEdit: string[] = [];
    await mountedWindowOverTheMock("state=running&get_more=open&catalog=unserved", {
      openImportToEdit: async (name) => {
        namesOpenedToEdit = [...namesOpenedToEdit, name];
      },
    });

    await waitFor(() => expect(document.querySelector('[data-get-more-state="not_read"]')).not.toBeNull());
    expect(textOf('[data-get-more-state="not_read"]')).toContain("HTTP 404 Not Found");
    expect(textOf('[data-get-more-state="not_read"]')).toContain("tatolab/streamlib#3216");

    fireEvent.click(document.querySelector<HTMLElement>('[data-get-more-scope="in_this_workspace"]') ?? expect.unreachable("no In this project scope"));
    fireEvent.click(await waitFor(() => getMoreRow("camera")));
    fireEvent.click(document.querySelector<HTMLElement>('[data-get-more-open-to-edit="camera"]') ?? expect.unreachable("no Open to edit"));
    await waitFor(() => expect(namesOpenedToEdit).toEqual(["camera"]));

    fireEvent.click(getMoreRow("tatolab-stream"));
    expect(document.querySelector('[data-get-more-open-to-edit="tatolab-stream"]')).toBeNull();
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
  it("opens on macOS from Tato Studio › Settings… in the system menu bar, beside About, on General", async () => {
    const { backendChanges, menusShownLast, chooseFromTheSystemMenuBar } = systemMenuBarOverTheMock();
    await mountedWindowOverTheMock("state=running", backendChanges);
    await waitFor(() =>
      expect(menusShownLast()[0]?.entries).toEqual([
        { kind: "command", entry_id: "Tato Studio › About Tato Studio", label: "About Tato Studio", shortcut_hint: null, unavailable_because: null },
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
    expect(sectionList.getAllByRole("button").map((sectionButton) => sectionButton.textContent)).toEqual(["General", "Runtime", "Command line", "About"]);
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
