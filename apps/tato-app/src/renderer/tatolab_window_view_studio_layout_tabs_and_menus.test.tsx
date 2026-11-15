// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectTransaction } from "../shared/tatolab_backend_contract";
import { mockStreamIdOf } from "../../mock/mock_stream_fixtures";
import { mountedWindowOverTheMock, textOf, pressAsAPointerDoes, systemMenuBarOverTheMock, chooseFromTheMenuBar, PATTERN_PROJECT, CAMERA_PROJECT, PATTERN_MAIN_STREAM, coreViewPage, inTheCoreView, outlinerRow, outlinerRowIds, AREAS_OF_THE_DEFAULT_LAYOUT, areaIdsShown, theAreasShownAre, keepThePatternProjectsLayout, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

afterEach(cleanUpTheWindowsOfEarlierTests);

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
    expect(coreViewPage("outliner").querySelector("[data-outliner] [data-tree-column-headings]")?.textContent).toBe("LabelType");
    expect(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`).textContent).toBe("mainstream");
    expect(outlinerRow(mainNodeRowId("testpatternsource")).getAttribute("aria-level")).toBe("2");
    expect(outlinerRow(mainNodeRowId("testpatternsource")).textContent).toBe("Test Pattern Sourceprocess");
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
    await waitFor(() => expect(coreViewPage("outliner").querySelector("[data-tree-row-current]")?.textContent).toBe("Lobby previewstream"));

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

  it("pauses, resumes and stops the project from the title row's player control, which follows the playback the runtime lists", async () => {
    await mountedWindowOverTheMock("state=running");
    const playerControl = () => document.querySelector<HTMLElement>("[data-studio-player-control]") ?? expect.unreachable("no player control");
    await waitFor(() => expect(playerControl().dataset.studioPlayerControl).toBe("pause"));
    expect(playerControl().getAttribute("aria-label")).toBe("Pause the project");

    fireEvent.click(playerControl());
    await waitFor(() => expect(playerControl().getAttribute("aria-label")).toBe("Resume the project"));

    pressAsAPointerDoes(document.querySelector<HTMLElement>("[data-studio-player-control-menu]") ?? expect.unreachable("no player control menu"));
    expect((await screen.findByRole("menuitem", { name: /^Pause/ })).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Stop/ }));
    await waitFor(() => expect(playerControl().getAttribute("aria-label")).toBe("Play the project"));
    expect(playerControl().closest("[data-studio-split-menu-button]")?.hasAttribute("data-live")).toBe(false);
  });

  it("sends F5 and Shift F5 only while the playback offers the step each one takes", async () => {
    const playTheProject = vi.fn(() => Promise.resolve());
    const stopTheProject = vi.fn(() => Promise.resolve());
    await mountedWindowOverTheMock("state=running", { runOpenProject: playTheProject, stopOpenProject: stopTheProject });
    await waitFor(() => expect(document.querySelector<HTMLElement>("[data-studio-player-control]")?.dataset.studioPlayerControl).toBe("pause"));

    fireEvent.keyDown(document, { key: "F5" });
    expect(playTheProject).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "F5", shiftKey: true });
    expect(stopTheProject).toHaveBeenCalledOnce();
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
});
