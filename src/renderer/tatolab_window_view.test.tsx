// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenProjectReading, TatolabStatus } from "../shared/tatolab_backend_contract";
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
    await mountedWindowOverTheMock("state=stopped");
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
    expect(screen.getByText("Open a stream from the outliner to see it here.")).toBeTruthy();

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

    fireEvent.keyDown(document, { key: "2", metaKey: true });
    expect(await shownLayout()).toBe("compose");
    expect(document.querySelector('[data-studio-area="scene"]')).toBeNull();
    fireEvent.keyDown(document, { key: "5", metaKey: true });
    expect(await shownLayout()).toBe("perform");
    expect(document.querySelector('[data-studio-area="scene"]')).not.toBeNull();

    pressAsAPointerDoes(await waitFor(() => document.querySelector<HTMLElement>('[data-studio-menu="Window"]') ?? expect.unreachable("no Window menu")));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Layout" }));
    expect((await screen.findByRole("menuitemcheckbox", { name: "Perform ⌘5" })).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Code ⌘4" }));
    expect(await shownLayout()).toBe("code");
  });

  it("shows the view an area's view-type menu chooses, and the project reopens with it", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    expect(within(viewerArea).getByText("Viewer isn't in this build yet")).toBeTruthy();

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
    expect(document.querySelector('[data-studio-area="scene"]')).not.toBeNull();
  });

  it("shows Home with no project open, its recent projects as cards, and opens the one chosen", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    const patternCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-home-project="${PATTERN_PROJECT}"]`) ?? expect.unreachable("no pattern card"));
    expect(patternCard.textContent).toContain("Running");
    expect(document.querySelectorAll("[data-home-project]")).toHaveLength(6);
    expect(document.querySelector("[data-welcome-splash]")).toBeNull();

    fireEvent.click(patternCard);

    expect(await shownLayout()).toBe("build");
    expect(document.querySelector("[data-home]")).toBeNull();
  });

  it("narrows Home to the running projects, and to the ones a search names", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-home-project]")).toHaveLength(6));
    fireEvent.click(document.querySelector<HTMLElement>('[data-home-filter="running_now"]') ?? expect.unreachable("no Running now"));
    expect([...document.querySelectorAll("[data-home-project]")].map((card) => card.getAttribute("data-home-project"))).toEqual([PATTERN_PROJECT, CAMERA_PROJECT]);
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), { target: { value: "lobby" } });
    expect(document.querySelectorAll("[data-home-project]")).toHaveLength(0);
    expect(textOf("[data-home-empty]")).toContain("No project matches");
  });

  it("greets first run with the Welcome splash over Home, its banner a still picture where WebGL is not offered, and Open… opens the one chosen", async () => {
    await mountedWindowOverTheMock("state=running&project=none&recent=none");
    const welcome = await screen.findByRole("dialog", { name: "Welcome to Tato Studio" });
    expect(welcome.querySelector('[data-welcome-banner="still"] img')).not.toBeNull();
    expect(within(welcome).getByText("v0.45.0")).toBeTruthy();
    expect(within(welcome).getByText("None yet")).toBeTruthy();

    fireEvent.click(within(welcome).getByRole("button", { name: "Open…" }));

    expect(await shownLayout()).toBe("build");
    expect(screen.queryByRole("dialog", { name: "Welcome to Tato Studio" })).toBeNull();
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
      chooseProjectFolder: () => Promise.reject("the folder already holds a project"),
    });
    fireEvent.click(await screen.findByRole("button", { name: "New project" }));

    await waitFor(() => expect(textOf("[data-project-opening-refusal]")).toContain("the folder already holds a project"));
    expect(document.querySelector("[data-home]")).not.toBeNull();
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
  it("opens from Edit › Preferences… on General, listing every section under its group beside it", async () => {
    await mountedWindowOverTheMock("state=running");
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

  it("shows a refused restart in the service manager's words, and offers none while Run Tatolab is off", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running&restart=refused");
    await openSettingsOn("runtime");

    fireEvent.click(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }));

    await waitFor(() =>
      expect(within(settingsRow("runtime-status")).getByRole("alert").textContent).toContain(
        "launchctl kickstart -k gui/501/com.tatolab.tatolabd failed (exit status: 5): Input/output error",
      ),
    );
    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=stopped");
    await openSettingsOn("runtime");
    expect(textOf("[data-runtime-status-words]")).toBe("Stopped");
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

  it("colours a runtime that is not responding and says why", async () => {
    await mountedWindowOverTheMock("state=unreachable");
    await openSettingsOn("runtime");

    const statusWords = document.querySelector<HTMLElement>("[data-runtime-status-words]") ?? expect.unreachable("no status words");
    expect(statusWords.textContent).toBe("Not responding");
    expect(statusWords.classList.contains("text-danger-text")).toBe(true);
    expect(within(settingsRow("runtime-status")).getByText(/hasn't answered for over 20 seconds/)).toBeTruthy();
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


function gettingStartedControl(action: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-getting-started-action="${action}"]`) ?? expect.unreachable(`no ${action} on first run`);
}

describe("first run on macOS", () => {
  it("opens on Getting set up, ticks Start the runtime as it starts, and Get Started opens the studio", async () => {
    const { showStatusAsTheBackendWould, backend } = await mountedWindowOverTheMock("state=setup");

    expect(document.querySelector('[data-getting-started-screen="getting_set_up"]')).not.toBeNull();
    expect(document.querySelector("[data-studio-window]")).toBeNull();
    expect(screen.getByRole("heading", { name: "Getting set up" })).toBeTruthy();
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("Starting…");
    expect(gettingStartedControl("get_started").hasAttribute("disabled")).toBe(true);

    await showStatusAsTheBackendWould({ ...(await backend.getTatolabStatus()), runtime_state: "running", streams: [] });
    expect(document.querySelector('[data-getting-started-step="start_the_runtime"]')?.getAttribute("data-checklist-step-progress")).toBe("done");
    fireEvent.click(gettingStartedControl("get_started"));

    await waitFor(() => expect(document.querySelector('[data-getting-started-screen]')).toBeNull());
    expect(document.querySelector("[data-studio-window]")).not.toBeNull();
  });

  it("shows a step for macOS's approval with Open Login Items, and a blocked runtime as the start step retrying with nothing to press", async () => {
    await mountedWindowOverTheMock("state=approval&first_run=unfinished");
    expect(textOf('[data-getting-started-step="approve_in_login_items"]')).toContain("Allow in the Background");
    expect(document.querySelector('[data-getting-started-step-action="open_login_items"]')?.textContent).toBe("Open Login Items…");
    document.body.replaceChildren();

    await mountedWindowOverTheMock("state=blocked&first_run=unfinished");
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("Retrying…");
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("Blocked by macOS");
    expect(document.querySelector("[data-getting-started-step-action]")).toBeNull();
  });

  it("takes keyboard focus at Getting set up as first run opens", async () => {
    await mountedWindowOverTheMock("state=setup");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Getting set up"));
  });

  it("drops a step's refusal once the step has moved on", async () => {
    const { showStatusAsTheBackendWould, backend } = await mountedWindowOverTheMock("state=stopped&first_run=unfinished", {
      setRunTatolab: () => Promise.reject("the service manager refused it"),
    });
    fireEvent.click(document.querySelector<HTMLElement>('[data-getting-started-step-action="turn_on_run_tatolab"]') ?? expect.unreachable("no Turn On Tatolab"));
    await waitFor(() => expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("Couldn't turn Tatolab on: the service manager refused it"));

    await showStatusAsTheBackendWould({ ...(await backend.getTatolabStatus()), runtime_state: "running", streams: [] });
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).not.toContain("refused");
  });

  it("opens the studio even when Get Started can't be remembered, and says so there", async () => {
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=setup")));
    const { showStatusAsTheBackendWould } = await mountedWindowOverTheMock("state=setup", {
      rememberFirstRunFinished: async () => {
        await mockBackend.rememberFirstRunFinished();
        throw "EACCES: permission denied, open '/Users/ada/Library/Application Support/com.tatolab.tatolab/first-run-finished.json'";
      },
    });
    await showStatusAsTheBackendWould({ ...(await mockBackend.getTatolabStatus()), runtime_state: "running", streams: [] });
    fireEvent.click(gettingStartedControl("get_started"));
    await showStatusAsTheBackendWould({ ...(await mockBackend.getTatolabStatus()), first_run_finished: true, runtime_state: "running", streams: [] });

    await waitFor(() => expect(textOf("[data-first-run-finishing-refusal]")).toContain("Getting set up shows again next time it opens. EACCES"));
    expect(document.querySelector("[data-studio-window]")).not.toBeNull();
  });

  it("never says not responding for a start that never answered", async () => {
    await mountedWindowOverTheMock("state=never-answered&first_run=unfinished");
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("The runtime didn't start");
    expect(document.body.textContent).not.toContain("not responding");
  });

  it("keeps Linux on its installer screen and never shows Getting set up", async () => {
    await mountedWindowOverTheMock("platform=linux&state=setup");
    expect(document.querySelector("[data-getting-started-screen]")).toBeNull();
    expect(screen.getByRole("heading", { name: "Install the Tatolab runtime" })).toBeTruthy();
  });
});


const MOCK_ADMINISTRATOR_PROMPT_WAIT_MILLISECONDS = 6_000;

describe("Preferences › Command line › Link in /usr/local/bin", () => {
  it("warns that the prompt says osascript, waits for the password, then shows the link", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("command-line");

    expect(settingsRow("usr-local-bin-link").textContent).toContain("osascript wants to make changes");
    fireEvent.click(within(settingsRow("usr-local-bin-link")).getByRole("button", { name: "Link in /usr/local/bin…" }));
    expect(within(settingsRow("usr-local-bin-link")).getByText("Waiting for your password…")).toBeTruthy();
    await waitFor(() => expect(settingsRow("usr-local-bin-link").textContent).toContain("Linked at /usr/local/bin/tatolab"), {
      timeout: MOCK_ADMINISTRATOR_PROMPT_WAIT_MILLISECONDS,
    });
  }, 10_000);

  it("says a cancelled prompt changed nothing", async () => {
    await mountedWindowOverTheMock("state=running&usr_local_bin=cancel");
    await openSettingsOn("command-line");
    fireEvent.click(within(settingsRow("usr-local-bin-link")).getByRole("button", { name: "Link in /usr/local/bin…" }));
    await waitFor(() => expect(settingsRow("usr-local-bin-link").textContent).toContain("The password prompt was cancelled, so nothing changed."), {
      timeout: MOCK_ADMINISTRATOR_PROMPT_WAIT_MILLISECONDS,
    });
  }, 10_000);

  it("is not shown on Linux, whose installer links the command", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    await openSettingsOn("command-line");
    expect(document.querySelector('[data-settings-row="usr-local-bin-link"]')).toBeNull();
  });
});


describe("installing the runtime the app carries", () => {
  const CARRIED_RUNTIME_BUILD = `0.56.0-4f1d0c3${"a".repeat(33)}`;

  it("fills the window with the installer's lines while it runs, holding every action and shortcut, and gives the window back once it ends", async () => {
    const { backend, showStatusAsTheBackendWould } = await mountedWindowOverTheMock("state=running");
    const runningStatus = await backend.getTatolabStatus();

    await showStatusAsTheBackendWould({
      ...runningStatus,
      runtime_install: { kind: "installing", carried_runtime_build: CARRIED_RUNTIME_BUILD, installer_lines: ["Stopping the runtime", `Starting Tatolab ${CARRIED_RUNTIME_BUILD}`] },
    });

    const overlay = document.querySelector<HTMLElement>('[data-runtime-install-overlay="installing"]') ?? expect.unreachable("no install overlay");
    expect(within(overlay).getByRole("heading", { name: "Updating the runtime" })).toBeTruthy();
    expect(overlay.textContent).toContain("Your streams stop for a moment and come back on it.");
    expect(document.querySelector("[data-runtime-install-lines]")?.textContent).toBe(`Stopping the runtime\nStarting Tatolab ${CARRIED_RUNTIME_BUILD}`);
    expect(document.querySelector("[data-runtime-install-action]")).toBeNull();
    expect(document.querySelector("[data-studio-window]")).toBeNull();
    fireEvent.keyDown(document, { key: ",", metaKey: true });
    expect(document.querySelector("[data-settings-page]")).toBeNull();

    await showStatusAsTheBackendWould({ ...runningStatus, runtime_install: { kind: "none" } });
    await waitFor(() => expect(document.querySelector("[data-runtime-install-overlay]")).toBeNull());
    expect(document.querySelector("[data-studio-window]")).not.toBeNull();
  });

  it("keeps a refusal up in the installer's own words, and Try again runs the installer again", async () => {
    const installsAgain: string[] = [];
    const { backend, showStatusAsTheBackendWould } = await mountedWindowOverTheMock("state=running", {
      installTheCarriedRuntimeAgain: async () => {
        installsAgain.push("try_again");
      },
    });
    const refusal = `tatolab install: Tatolab ${CARRIED_RUNTIME_BUILD}'s service did not start, so 0.55.2 is back in place.`;

    await showStatusAsTheBackendWould({
      ...(await backend.getTatolabStatus()),
      runtime_install: { kind: "failed", carried_runtime_build: CARRIED_RUNTIME_BUILD, installer_lines: ["Stopping the runtime"], refusal },
    });

    const overlay = document.querySelector<HTMLElement>('[data-runtime-install-overlay="failed"]') ?? expect.unreachable("no refused install");
    expect(within(overlay).getByRole("heading", { name: "The runtime didn't update" })).toBeTruthy();
    expect(within(overlay).getByRole("alert").textContent).toBe(`The installer said: ${refusal}`);
    expect(document.querySelector('[data-runtime-install-action="open_log"]')).not.toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-runtime-install-action="try_again"]') ?? expect.unreachable("no Try again"));
    await waitFor(() => expect(installsAgain).toEqual(["try_again"]));
  });

  it("shows the installed build and its folder in Preferences › Runtime", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("runtime");

    const installedRuntimeRow = document.querySelector<HTMLElement>('[data-settings-row="installed-runtime"]') ?? expect.unreachable("no Installed runtime row");
    expect(installedRuntimeRow.textContent).toContain("0.55.2 (ec6adf5)");
    expect(installedRuntimeRow.textContent).toContain("/Users/jonathanf/Library/Application Support/com.tatolab.runtime/0.55.2-ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a");
  });
});
