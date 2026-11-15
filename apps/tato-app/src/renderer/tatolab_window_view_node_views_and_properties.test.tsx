// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonValue, PoppedOutView } from "../shared/tatolab_backend_contract";
import { createMockTatolabBackend } from "../../mock/mock_tatolab_backend";
import { readMockTatolabOptions } from "../../mock/mock_tatolab_options";
import { mockStreamIdOf } from "../../mock/mock_stream_fixtures";
import { studioLayoutStorageKey } from "./studio_shell/studio_layout";
import { mountedWindowOverTheMock, textOf, pressAsAPointerDoes, PATTERN_PROJECT, PATTERN_MAIN_STREAM, coreViewPage, inTheCoreView, libraryRow, showTheLibraryInTheViewerArea, outlinerRow, outlinerRowIds, AREAS_OF_THE_DEFAULT_LAYOUT, theAreasShownAre, keepThePatternProjectsLayout, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

afterEach(cleanUpTheWindowsOfEarlierTests);

describe("the studio", () => {
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

  it("shows a node the runtime reports not ready in the runtime's own words in Properties, and draws the checker behind its picture only", async () => {
    await mountedWindowOverTheMock("state=node-not-ready&outliner=open");
    await waitFor(() => outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.doubleClick(outlinerRow(`stream:${PATTERN_MAIN_STREAM}`));
    fireEvent.click(await waitFor(() => outlinerRow(`node:${PATTERN_MAIN_STREAM}/posterimage`)));

    const notReadyBar = await waitFor(() => coreViewPage("properties").querySelector<HTMLElement>('[data-properties-not-ready-because="posterimage"]') ?? expect.unreachable("no not-ready bar in Properties"));
    expect(notReadyBar.getAttribute("role")).toBe("status");
    expect(notReadyBar.textContent).toBe("This node isn't ready: ImageFile names no image asset. To fix: set its `asset` config to the UUID of a PNG or JPEG imported into the project");
    const playing = await waitFor(() => coreViewPage("viewer", "viewer").querySelector<HTMLElement>('[data-viewer-playing="posterimage/image"]') ?? expect.unreachable("the Node visualizer plays nothing"));
    expect(playing.hasAttribute("data-viewer-node-not-ready")).toBe(true);

    fireEvent.click(outlinerRow(`node:${PATTERN_MAIN_STREAM}/invertingeffect`));
    const playingAReadyNode = await waitFor(() => coreViewPage("viewer", "viewer").querySelector<HTMLElement>('[data-viewer-playing="invertingeffect/video_to_downstream"]') ?? expect.unreachable("the Node visualizer plays nothing"));
    expect(playingAReadyNode.hasAttribute("data-viewer-node-not-ready")).toBe(false);
    await waitFor(() => expect(coreViewPage("properties").querySelector("[data-properties-not-ready-because]")).toBeNull());
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
    await waitFor(() => expect(rowLabels().slice(0, 2)).toEqual(["mainstream", "Brightness Meterprocess"]));
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

  it("opens the Marketplace from the store button beside the node search's field, closing the search", async () => {
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

    fireEvent.click(within(nodeSearch).getByRole("button", { name: "Install modules from marketplace" }));
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
});
