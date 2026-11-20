// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NodeTypeDescription, PoppedOutView } from "../shared/tatolab_backend_contract";
import type { ModuleManagerSectionAsked } from "../shared/tatolab_electron_bridge_contract";
import { connectToTatoAppOverPort, type TatoAppViewConnection, type ViewSettings } from "@tatolab/tato-app-view-sdk";
import type { TatolabBackend } from "./backend/tatolab_backend";
import { createMockTatolabBackend } from "../../mock/mock_tatolab_backend";
import { readMockTatolabOptions } from "../../mock/mock_tatolab_options";
import { mockStreamIdOf } from "../../mock/mock_stream_fixtures";
import { studioLayoutStorageKey } from "./studio_shell/studio_layout";
import { mountedWindowOverTheMock, textOf, pressAsAPointerDoes, PATTERN_PROJECT, PATTERN_MAIN_STREAM, coreViewPage, inTheCoreView, libraryRow, showTheLibraryInTheViewerArea, outlinerRow, outlinerRowIds, AREAS_OF_THE_COMPOSITION_LAYOUT, theAreasShownAre, keepThePatternProjectsLayout, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

afterEach(cleanUpTheWindowsOfEarlierTests);

const IMAGE_FILE = "core_nodes.image_file:ImageFile";

const CORE_NODES_DISTRIBUTION = { source: "installed_distribution", distribution: "tatolab-core-nodes", distribution_version: "0.68.82" } as const;

/**
 * The mock `backend`'s node types, with Core Nodes' `ImageFile` listed and described as streamlib declares it: the recorded sample
 * adds no node type taking a project asset, so a test of the asset field lists one itself.
 */
function nodeTypesListingImageFile(backend: Pick<TatolabBackend, "listNodeTypes" | "describeNodeTypes">): Pick<TatolabBackend, "listNodeTypes" | "describeNodeTypes"> {
  return {
    listNodeTypes: async (projectDirectory) => {
      const listing = await backend.listNodeTypes(projectDirectory);
      const imageFileListed = { node_type: IMAGE_FILE, documentation: "A project image asset, published as an Image.", category: null, kind: "process", described_from: "interpreter" } as const;
      return { ...listing, sources: [...listing.sources, { ...CORE_NODES_DISTRIBUTION, node_types: [imageFileListed], graph_generators: [], unreadable_modules: [] }] };
    },
    describeNodeTypes: async (projectDirectory, nodeTypes) => {
      const described = await backend.describeNodeTypes(
        projectDirectory,
        nodeTypes.filter((nodeType) => nodeType !== IMAGE_FILE),
      );
      const imageFileDescribed: NodeTypeDescription = {
        ...CORE_NODES_DISTRIBUTION,
        node_type: IMAGE_FILE,
        described_from: "interpreter",
        documentation: "A project image asset, published as an Image.",
        kind: "process",
        inputs: [
          {
            name: "asset",
            documentation: "",
            pin_type: { kind: "is", pin_type: { type: "string" } },
            flow: "value",
            annotations: { project_asset: { media: ["image"] } },
            mode: "setting_only",
            read: "at_setup",
            default_value: "",
            lifetime: "kept",
            value_json_schema: { type: "string" },
          },
        ],
        outputs: [{ name: "image", documentation: "", pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream" }],
      };
      return { node_types: nodeTypes.includes(IMAGE_FILE) ? [...described.node_types, imageFileDescribed] : described.node_types };
    },
  };
}

const ALPHA_OVER_COMPOSITOR = "tatolab.compositor.alpha_over_compositor:AlphaOverCompositor";

/** The JSON Schema of the compositor's `layers`, as its config class declares it: a list of records, each placing one layer. */
const LAYERS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      x: { type: "integer", description: "Canvas column of the layer's left edge; negative clips it.", default: 0 },
      y: { type: "integer", description: "Canvas row of the layer's top edge; negative clips it.", default: 0 },
      opacity: { type: "number", description: "0.0 hides the layer, 1.0 shows it as it arrives.", minimum: 0, maximum: 1, default: 1 },
    },
    additionalProperties: false,
  },
};

/**
 * The mock `backend`'s descriptions, the compositor's `layers` setting with the JSON Schema its config class declares: the runtime
 * describes a setting whose type no pin type holds with no schema, so a test of a list of records gives it one.
 */
function nodeTypesDescribingTheCompositorsLayers(backend: Pick<TatolabBackend, "describeNodeTypes">): Pick<TatolabBackend, "describeNodeTypes"> {
  return {
    describeNodeTypes: async (projectDirectory, nodeTypes) => {
      const described = await backend.describeNodeTypes(projectDirectory, nodeTypes);
      return {
        node_types: described.node_types.map((nodeType) =>
          nodeType.node_type !== ALPHA_OVER_COMPOSITOR || "not_described_because" in nodeType
            ? nodeType
            : { ...nodeType, inputs: nodeType.inputs.map((input) => (input.name === "layers" ? { ...input, value_json_schema: LAYERS_SCHEMA } : input)) },
        ),
      };
    },
  };
}


/** The fixture view shown in the viewer area on the stream's node of its type, and a panel connected over the port its frame is handed. */
async function thePictureAndFaderPanelInTheViewer(): Promise<TatoAppViewConnection> {
  const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
  pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Picture and fader/ }));
  const viewFrame = await waitFor(() => document.querySelector<HTMLIFrameElement>('[data-studio-area="viewer"] iframe[data-tatolab-view]') ?? expect.unreachable("no project view frame"));
  await waitFor(() => expect(viewerArea.querySelector("[data-node-view-whereabouts]")).not.toBeNull());

  const frameWindow = viewFrame.contentWindow ?? expect.unreachable("the view's frame has no window");
  const handedOverPort = new Promise<MessagePort>((resolve) => {
    // happy-dom's window.postMessage drops what it transfers, so the handover's port is taken here.
    frameWindow.postMessage = (_message: unknown, _targetOrigin?: string | WindowPostMessageOptions, transfer: Transferable[] = []) => {
      const port = transfer.find((transferred): transferred is MessagePort => "postMessage" in transferred && "start" in transferred);
      if (port !== undefined) resolve(port);
    };
  });
  fireEvent.load(viewFrame);
  return connectToTatoAppOverPort(await handedOverPort);
}

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
    expect(playing.querySelector("[data-viewer-ended]")?.getAttribute("data-viewer-ended")).toBe("open_the_port_again");
    fireEvent.click(within(playing).getByRole("button", { name: "Open again" }));
    expect(playing.getAttribute("data-viewer-port-state")).toBe("waiting");
    await waitFor(() => expect(playing.getAttribute("data-viewer-port-state")).toBe("ended"));
    expect(playing.ownerDocument.activeElement).toBe(within(playing).getByRole("button", { name: "Open again" }));

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
    const glowRowId = "source:project/category:Every pin kind/node_type:nodes.glow:Glow";
    fireEvent.doubleClick(await waitFor(() => libraryRow(glowRowId)));

    const glowFile = `${PATTERN_PROJECT}/nodes/glow.py`;
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-document-state]")?.getAttribute("data-code-document-state")).toBe("read"));
    expect(coreViewPage("code").querySelector("[data-code-document-file]")?.getAttribute("data-code-document-file")).toBe(glowFile);
    expect(coreViewPage("code").querySelector(`[data-code-file-tab="${CSS.escape(glowFile)}"]`)?.textContent).toContain("glow.py");
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-project-log]")).not.toBeNull());

    fireEvent.click(coreViewPage("code").querySelector<HTMLElement>("[data-code-logs-toggle]") ?? expect.unreachable("no logs toggle"));
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-project-log]")).toBeNull());
    fireEvent.click(coreViewPage("code").querySelector<HTMLElement>(`[data-code-file-tab-close="${CSS.escape(glowFile)}"]`) ?? expect.unreachable("no close on the tab"));
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

    fireEvent.doubleClick(await waitFor(() => libraryRow(glowRowId)));
    await waitFor(() => expect(coreViewPage("code").querySelector("[data-code-document-file]")?.getAttribute("data-code-document-file")).toBe(glowFile));
  });

  it("switches to the Code layout Studio ships to open a node type's file from the Library while no area shows Code", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();
    expect(document.querySelector('[data-studio-area="code"]')).toBeNull();
    fireEvent.doubleClick(await waitFor(() => libraryRow("source:project/category:Every pin kind/node_type:nodes.glow:Glow")));

    await waitFor(() => expect(["code-files", "code", "code-stream-graph", "code-viewer"].map((areaId) => document.querySelector(`[data-studio-area="${areaId}"]`) !== null)).toEqual([true, true, true, true]));
    expect(document.querySelector('[data-studio-area="viewer"]')).toBeNull();
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

  it("draws the recorded sample's Float, Integer, Boolean and Texture pins and its untyped Records pin each in its own look, and names each type on its tooltip", async () => {
    await mountedWindowOverTheMock("state=running&main_graph=every_pin_kind");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    const socket = (nodeName: string, handleId: string) => streamGraph.querySelector<HTMLElement>(`[data-node-graph-card="${nodeName}"] .node-graph-pin[data-handleid="${handleId}"]`) ?? expect.unreachable(`no socket ${handleId} on ${nodeName}`);
    const look = (element: HTMLElement) => [element.getAttribute("data-pin-type"), element.getAttribute("data-pin-flow"), element.getAttribute("title")];
    await waitFor(() => expect(look(socket("warmth", "input:base"))).toEqual(["float", "value", "base · Float, one value at a time\nHow warm the picture is on the first beat of a bar."]));
    expect(look(socket("beat", "output:count"))).toEqual(["integer", "value", "count · Integer, one value at a time"]);
    expect(look(socket("beat", "output:accented"))).toEqual(["boolean", "value", "accented · Boolean, one value at a time"]);
    expect(look(socket("testpattern", "output:video"))).toEqual(["texture", "stream", "video · Texture, a stream\nTest-pattern video frames"]);
    expect(look(socket("tally", "output:tally"))).toEqual(["untyped", null, "tally · No exact type · values unchecked\nHow many pictures it has seen, and the size of the latest"]);
  });

  it("names each port's type and flow in Properties beside a mark in its type's look, and an untyped port's family as a family", async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="invertingeffect"]') ?? expect.unreachable("no Inverting Effect card")));
    const portRow = (portName: string) => coreViewPage("properties").querySelector<HTMLElement>(`[data-properties-port="${portName}"]`);
    const wordsAndMark = (portName: string) => {
      const row = portRow(portName) ?? expect.unreachable(`no ${portName} row in Properties`);
      return [row.querySelector("[data-properties-port-type-words]")?.textContent, row.querySelector(".node-graph-pin-mark")?.getAttribute("data-pin-type")];
    };
    await waitFor(() => expect(portRow("amount")).not.toBeNull());
    expect(wordsAndMark("amount")).toEqual(["Float, one value at a time", "float"]);
    expect(wordsAndMark("video_from_upstream")).toEqual(["No exact type · Image", "untyped"]);
  });

  it("narrows Properties to the matching properties from its toolbar's search field, and shows them all again once cleared", async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="invertingeffect"]') ?? expect.unreachable("no Inverting Effect card")));
    const properties = () => coreViewPage("properties");
    const portsListed = () => [...properties().querySelectorAll("[data-properties-port]")].map((port) => port.getAttribute("data-properties-port"));
    await waitFor(() => expect(portsListed()).toEqual(["video_from_upstream", "amount", "video_to_downstream"]));
    const search = properties().querySelector<HTMLInputElement>("[data-properties-search]") ?? expect.unreachable("no search field in Properties' toolbar");
    expect(search.closest('[role="toolbar"]')?.getAttribute("aria-label")).toBe("Properties tools");

    fireEvent.change(search, { target: { value: "UPSTREAM" } });
    await waitFor(() => expect(portsListed()).toEqual(["video_from_upstream"]));
    expect(properties().querySelector("[data-properties-listed-count]")?.textContent).toMatch(/^1 of \d+ propert/);
    expect(properties().querySelector('[data-properties-port="video_from_upstream"] [data-matched-words]')?.textContent).toBe("upstream");
    expect(properties().querySelector('[data-properties-section="outputs"]')).toBeNull();

    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(portsListed()).toEqual(["video_from_upstream", "amount", "video_to_downstream"]));
    expect(properties().querySelector("[data-properties-listed-count]")).toBeNull();
  });

  it("filters the Outliner's tree in place from its toolbar's search field, keeping each match's stream", async () => {
    await mountedWindowOverTheMock("state=running");
    const outliner = () => coreViewPage("outliner");
    const rowLabels = () => [...outliner().querySelectorAll('[role="treeitem"]')].map((row) => row.textContent);
    await waitFor(() => expect(rowLabels().some((label) => label?.startsWith("Brightness Meter"))).toBe(true));
    const search = outliner().querySelector<HTMLInputElement>("[data-outliner-search]") ?? expect.unreachable("no search field in the Outliner's toolbar");
    fireEvent.change(search, { target: { value: "bright" } });
    await waitFor(() => expect(rowLabels().slice(0, 2)).toEqual(["mainstream", "Brightness Meterfunction"]));
    expect(rowLabels().some((label) => label?.startsWith("Test Pattern Source"))).toBe(false);
    expect(outliner().querySelector("[data-matched-words]")?.textContent).toBe("Bright");
    fireEvent.change(search, { target: { value: "nothing-is-called-this" } });
    await waitFor(() => expect(outliner().querySelector('[data-outliner-state="no_row_matches"]')).not.toBeNull());
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(rowLabels().length).toBeGreaterThan(2));
  });

  it("shows each entry of a setting holding a list of records as its own fields on its input row in Properties, and edits, adds and removes an entry as the setting's whole list", { timeout: 20_000 }, async () => {
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&compositor=layered")));
    await mountedWindowOverTheMock("state=running&compositor=layered", { ...mockBackend, ...nodeTypesDescribingTheCompositorsLayers(mockBackend) });
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="alphaovercompositor"]') ?? expect.unreachable("no compositor card")));
    const properties = () => coreViewPage("properties");
    const entryLabels = () => [...properties().querySelectorAll("[data-config-list-entry]")].map((entry) => entry.getAttribute("data-config-list-entry"));
    await waitFor(() => expect(entryLabels()).toEqual(["layers:0", "layers:1"]));
    expect(properties().querySelector('[data-properties-port="layers"] [data-properties-list-of-records="layers"] output')?.textContent).toBe("2 entries");
    const secondX = () => properties().querySelector<HTMLInputElement>('[data-config-field="layers:1:x"] input') ?? expect.unreachable("no x field on the second entry");
    expect(secondX().value).toBe("640");
    expect(properties().querySelector('[data-config-field="layers:0:opacity"]')?.getAttribute("data-config-field-value-source")).toBe("default");

    fireEvent.change(secondX(), { target: { value: "100" } });
    secondX().focus();
    fireEvent.keyDown(secondX(), { key: "Enter" });
    await waitFor(() => expect(secondX().value).toBe("100"), { timeout: 5000 });
    expect(properties().querySelector('[data-config-field="layers:1:y"] input')).toHaveProperty("value", "360");

    fireEvent.click(properties().querySelector<HTMLElement>('[data-properties-port="layers"] [data-property-list-entry-add]') ?? expect.unreachable("no add"));
    await waitFor(() => expect(entryLabels()).toEqual(["layers:0", "layers:1", "layers:2"]), { timeout: 5000 });
    expect(properties().querySelector('[data-config-field="layers:2:opacity"]')?.getAttribute("data-config-field-value-source")).toBe("default");

    fireEvent.click(properties().querySelector<HTMLElement>('[data-config-list-entry="layers:0"] [data-property-list-entry-remove]') ?? expect.unreachable("no remove"));
    await waitFor(() => expect(entryLabels()).toEqual(["layers:0", "layers:1"]), { timeout: 5000 });
    expect(secondX().value).toBe("0");
    expect(properties().querySelector<HTMLInputElement>('[data-config-field="layers:0:x"] input')?.value).toBe("100");
  });

  it("chooses an image for Image File's asset field in the asset picker over the window, sends its UUID, undoes it with one ⌘Z, imports one that is chosen at once, and shows a refusal in the runtime's words under the field", { timeout: 30_000 }, async () => {
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=node-not-ready")));
    const assetsSent: unknown[] = [];
    const mediaTheImportOffered: (readonly string[] | null)[] = [];
    let refusesTheNextAssetSet = false;
    await mountedWindowOverTheMock("state=node-not-ready", {
      ...mockBackend,
      ...nodeTypesListingImageFile(mockBackend),
      importAssetsIntoTheOpenProject: (media) => {
        mediaTheImportOffered.push(media);
        return mockBackend.importAssetsIntoTheOpenProject(media);
      },
      transactInTheOpenProject: async (operations, mode, idempotencyKey) => {
        const assetSet = operations.find((operation) => operation.operation === "set_node_input_value" && operation.input === "asset");
        if (assetSet !== undefined && assetSet.operation === "set_node_input_value") {
          assetsSent.push(assetSet.value ?? null);
          if (refusesTheNextAssetSet)
            return { kind: "refused", refusal: { refusal_code: "refused", action: "transact", refused_operation_index: 0, refused_node: assetSet.node, refused_link: null, refused_field: "asset", refused_params_pointer: null, refused_file: null, suggested_call: null, runtime_words: "input `asset`: not an asset of the project" } };
        }
        return mockBackend.transactInTheOpenProject(operations, mode, idempotencyKey);
      },
    });
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="posterimage"]') ?? expect.unreachable("no Image File card"), { timeout: 5000 }));

    const properties = () => coreViewPage("properties");
    const assetWords = () => properties().querySelector<HTMLInputElement>('[data-properties-port="asset"] [data-property-asset-field] input') ?? expect.unreachable("no asset field");
    const openThePicker = async () => {
      fireEvent.click(properties().querySelector<HTMLElement>('[data-properties-port="asset"] [data-property-asset-choose]') ?? expect.unreachable("no Choose an asset… button"));
      await waitFor(() => screen.getByRole("dialog", { name: "Choose an image" }));
      const pickerFrame = await waitFor(() => document.querySelector<HTMLIFrameElement>('[data-project-asset-picker] iframe[data-tatolab-view="library"]') ?? expect.unreachable("no Library in the asset picker"));
      return pickerFrame.contentDocument ?? expect.unreachable("the picker's Library has no page");
    };
    const pickerCardPaths = (picker: Document) => [...picker.querySelectorAll<HTMLElement>("[data-library-asset]")].map((card) => card.dataset.libraryAsset);
    await waitFor(() => expect(assetWords().value).toBe("None"));
    expect(properties().querySelector('[data-properties-port="asset"] [data-property-asset-picture]')).toBeNull();

    const picker = await openThePicker();
    await waitFor(() => expect(pickerCardPaths(picker)).toEqual(["media/poster.png"]));
    expect(picker.querySelector("[data-library-shown]")).toBeNull();
    expect(picker.querySelector("[data-project-asset-more-actions]")).toBeNull();
    fireEvent.click(picker.querySelector<HTMLElement>('[data-library-asset="media/poster.png"]') ?? expect.unreachable("no poster card in the picker"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose an image" })).toBeNull());
    await waitFor(() => expect(assetWords().value).toBe("media/poster.png"), { timeout: 5000 });
    expect(assetsSent).toEqual(["baaf9e5a-0aff-45f7-a7ea-b83db51e5a3b"]);
    await waitFor(() => expect(properties().querySelector('[data-properties-port="asset"] [data-property-asset-picture]')?.getAttribute("src")).toMatch(/^data:image\//));

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
    await waitFor(() => expect(properties().querySelector('[data-properties-port="asset"]')?.textContent).toContain("input `asset`: not an asset of the project"), { timeout: 5000 });
    expect(assetWords().value).toBe("media/night-sky.jpg");
  });

  it("shows under Image File's asset field the runtime's words when it refuses to list the project's assets", { timeout: 20_000 }, async () => {
    const refusal = "list_assets failed: the project's assets folder is unreadable";
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=node-not-ready")));
    await mountedWindowOverTheMock("state=node-not-ready", {
      ...mockBackend,
      ...nodeTypesListingImageFile(mockBackend),
      listProjectAssets: async () => {
        throw refusal;
      },
    });
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="posterimage"]') ?? expect.unreachable("no Image File card"), { timeout: 5000 }));

    await waitFor(() => expect(coreViewPage("properties").querySelector('[data-properties-port="asset"] [data-property-asset-listing-refusal]')?.textContent).toContain(refusal), { timeout: 5000 });
  });

  it("exposes a number setting as a Graph Input from its row in Properties, the node taking it as an input fed by the new Graph Input", async () => {
    await mountedWindowOverTheMock("state=running&main_graph=every_pin_kind");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="tally"]') ?? expect.unreachable("no Frame Tally card")));
    const properties = () => coreViewPage("properties");

    const exposeTheSetting = () => properties().querySelector<HTMLElement>('[data-properties-port="report_every_frames"] [data-properties-input-promote]');
    fireEvent.click(await waitFor(() => exposeTheSetting() ?? expect.unreachable("no Expose as a Graph Input on report_every_frames")));

    const reportInput = await waitFor(() => properties().querySelector<HTMLElement>('[data-properties-section="inputs"] [data-properties-port="report_every_frames"]') ?? expect.unreachable("no report_every_frames input"), { timeout: 5000 });
    await waitFor(() => expect([...reportInput.querySelectorAll("[data-property-port-linked-end]")].map((linkedEnd) => linkedEnd.getAttribute("data-property-port-linked-end"))).toEqual(["tally_report_every_frames › value"]));
    await waitFor(() => expect(streamGraph.querySelector('[data-node-graph-card="tally_report_every_frames"]')).not.toBeNull());
    expect(exposeTheSetting()).toBeNull();
  });

  it("opens the Marketplace from the store button beside the node search's field, closing the search", async () => {
    const modulesAndMarketplaceSectionsOpened: string[] = [];
    await mountedWindowOverTheMock("state=running", {
      openModuleManagerWindow: async (asked) => {
        modulesAndMarketplaceSectionsOpened.push(asked.shows);
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

  async function theNodeSearchTyped(streamGraph: Document, typed: string): Promise<HTMLElement> {
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-tool="add_node"]') ?? expect.unreachable("no Add node in the graph's ribbon")));
    const nodeSearch = await waitFor(() => within(streamGraph.body).getByRole("dialog", { name: "Add a node" }));
    fireEvent.change(within(nodeSearch).getByRole("combobox"), { target: { value: typed } });
    return nodeSearch;
  }
  const CAMERA_SOURCE_FROM_THE_MARKETPLACE = '[data-search-popover-item="marketplace_node:tatolab-camera/CameraSource"]';

  it("offers the nodes of a Marketplace package the project has not added while searching, adds the package when one is chosen, and then offers them as the project's own", async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    const nodeSearch = await theNodeSearchTyped(streamGraph, "camera");

    const offered = await waitFor(() => nodeSearch.querySelector<HTMLElement>(CAMERA_SOURCE_FROM_THE_MARKETPLACE) ?? expect.unreachable("Camera Source not offered"));
    expect(offered.textContent).toContain("In the Camera module");
    expect([...nodeSearch.querySelectorAll("[data-search-popover-section-heading]")].map((heading) => heading.textContent)).toEqual(["Not in patternMarketplace", "Sample projectsMarketplace"]);
    fireEvent.click(offered);

    await waitFor(() => expect(nodeSearch.querySelector('[data-search-popover-item="tatolab.camera:CameraSource"]')).not.toBeNull());
    expect(nodeSearch.querySelector(CAMERA_SOURCE_FROM_THE_MARKETPLACE)).toBeNull();
    expect(within(streamGraph.body).queryByRole("dialog", { name: "Add a node" })).not.toBeNull();
  });

  it("says an add of a Marketplace package is under way, adds it once however often it is chosen, and says the runtime's refusal of it", async () => {
    const entriesAdded: string[] = [];
    let refuseTheAdd: (() => void) | null = null;
    await mountedWindowOverTheMock("state=running", {
      importFromTheMarketplace: (name) => {
        entriesAdded.push(name);
        return new Promise((_resolve, reject) => {
          refuseTheAdd = () => reject("add_dependency failed: tatolab-camera-0.68.29.zip holds no tatolab-project.json");
        });
      },
    });
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    const nodeSearch = await theNodeSearchTyped(streamGraph, "camera");
    const offered = await waitFor(() => nodeSearch.querySelector<HTMLElement>(CAMERA_SOURCE_FROM_THE_MARKETPLACE) ?? expect.unreachable("Camera Source not offered"));

    fireEvent.click(offered);
    await waitFor(() => expect(nodeSearch.querySelector(`${CAMERA_SOURCE_FROM_THE_MARKETPLACE} [data-search-popover-item-end="under_way"]`)?.textContent).toBe("Adding module…"));
    fireEvent.click(offered);
    expect(entriesAdded).toEqual(["tatolab-camera"]);
    act(() => refuseTheAdd?.());

    await waitFor(() => expect(nodeSearch.querySelector(`${CAMERA_SOURCE_FROM_THE_MARKETPLACE} [data-search-popover-item-end="refused"]`)?.textContent).toBe("Not added"));
    expect(streamGraph.body.textContent).toContain("Didn't add Camera to pattern:");
    expect(streamGraph.body.textContent).toContain("tatolab-camera-0.68.29.zip holds no tatolab-project.json");
  });

  it("opens a sample project the node search offers on its own page in the Marketplace, closing the search", async () => {
    const modulesAndMarketplaceAsked: ModuleManagerSectionAsked[] = [];
    await mountedWindowOverTheMock("state=running", {
      openModuleManagerWindow: async (asked) => {
        modulesAndMarketplaceAsked.push(asked);
      },
    });
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    const nodeSearch = await theNodeSearchTyped(streamGraph, "halftone");

    fireEvent.click(await waitFor(() => nodeSearch.querySelector<HTMLElement>('[data-search-popover-item="marketplace_sample:camera-halftone"]') ?? expect.unreachable("no sample offered")));

    await waitFor(() => expect(modulesAndMarketplaceAsked).toEqual([{ shows: "marketplace", page: "camera-halftone" }]));
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

  it("names each port's linked ends in Properties, offering only a way to a wired input's driver and its disconnect, and no way to wire there", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    fireEvent.click(await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="brightnessmeter"]') ?? expect.unreachable("no Brightness Meter card")));
    const properties = () => coreViewPage("properties");
    const linkedEndsOf = (port: string) => [...properties().querySelectorAll(`[data-properties-port="${port}"] [data-property-port-linked-end]`)].map((linkedEnd) => linkedEnd.getAttribute("data-property-port-linked-end"));
    await waitFor(() => expect(linkedEndsOf("video_from_upstream")).toEqual(["Inverting Effect › video_to_downstream"]));

    const buttonsOf = (port: string) => [...(properties().querySelector(`[data-properties-port="${port}"]`)?.querySelectorAll("button") ?? [])].map((button) => button.getAttribute("aria-label"));
    expect(buttonsOf("video_from_upstream")).toEqual(["Go to Inverting Effect", "Disconnect Inverting Effect › video_to_downstream"]);
    expect([...properties().querySelectorAll('[data-properties-port-direction="output"] button')]).toEqual([]);
    expect(properties().querySelector('[data-properties-port="video_from_upstream"] input')).toBeNull();
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

  it("draws a stream the runtime refused to play as its graph, under why it failed, in the Stream graph and the Outliner, and its cards still select", async () => {
    await mountedWindowOverTheMock("state=refused-at-play");
    const streamGraph = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>("[data-stream-graph]") ?? expect.unreachable("no stream graph drawn"));
    await waitFor(() => expect(streamGraph.querySelector('[aria-label="Graph of main"]')).not.toBeNull());
    const startRefused = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>('[data-stream-diagnostic="start_refused"]') ?? expect.unreachable("no start refused bar"));
    expect(startRefused.textContent).toMatch(/^main: Invalid link: link `Lkrgygd6qubqrj4jviamzuzfw` feeds a function node island into `displaywindow`/);
    expect(within(startRefused).getByRole("button", { name: "Restart playback" })).not.toBeNull();
    expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-stream-graph-state="not_read"]')).toBeNull();

    await waitFor(() => expect(outlinerRowIds()).toEqual(expect.arrayContaining([`stream:${PATTERN_MAIN_STREAM}/diagnostic/start_refused@stream`, `node:${PATTERN_MAIN_STREAM}/displaywindow`])));

    const displayWindowCard = await waitFor(() => streamGraph.querySelector<HTMLElement>('[data-node-graph-card="displaywindow"]') ?? expect.unreachable("no Display Window card"));
    fireEvent.click(displayWindowCard);
    await waitFor(() => expect(inTheCoreView("properties").getByRole("textbox", { name: "Node name" })).toHaveProperty("value", "Display Window"));
  });

  it("restarts a stream the runtime refused to play without stopping a project none of whose streams plays", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=refused-at-play");
    const startRefused = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>('[data-stream-diagnostic="start_refused"]') ?? expect.unreachable("no start refused bar"));
    fireEvent.click(within(startRefused).getByRole("button", { name: "Restart playback" }));

    await waitFor(() => expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-stream-condition]')?.textContent).toBe("loaded, playing, healthy"), { timeout: 10_000 });
    expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-stream-diagnostic="start_refused"]')).toBeNull();
    expect(coreViewPage("stream_graph", "stream-graph").textContent).not.toContain("Restart playback was refused");
  });

  it("keeps a stream's diagnostic bar, and the focus on its action, as the graph is read under it", async () => {
    await mountedWindowOverTheMock("state=refused-at-play");
    const startRefused = await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>('[data-stream-diagnostic="start_refused"]') ?? expect.unreachable("no start refused bar"));
    const restart = within(startRefused).getByRole("button", { name: "Restart playback" });
    restart.focus();

    await waitFor(() => expect(coreViewPage("stream_graph", "stream-graph").querySelector('[aria-label="Graph of main"]')).not.toBeNull());
    expect(startRefused.isConnected).toBe(true);
    expect(restart.ownerDocument.activeElement).toBe(restart);
  });

  it("draws a stopped stream's saved graph with its condition in the Stream graph's frame, and says no stream is open once its tab closes", async () => {
    await mountedWindowOverTheMock("state=running");
    const patternTwoStream = mockStreamIdOf({ project_directory: PATTERN_PROJECT, stream_name: "pattern_two" });
    fireEvent.doubleClick(await waitFor(() => outlinerRow(`stream:${patternTwoStream}`)));

    await waitFor(() => expect(coreViewPage("stream_graph", "stream-graph").querySelector('[aria-label="Graph of pattern-two"]')).not.toBeNull());
    expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-stream-graph-state="not_read"]')).toBeNull();
    await waitFor(() => expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-stream-condition="healthy"]')?.textContent).toBe("not loaded, stopped, healthy"));

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

  it("sets what a node view's panel sends on its output, live, on its node's input of that name in the open project's stream", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&studio_views=fixture");
    const transactionsSent = vi.spyOn(backend, "transactInTheOpenProject");
    const panel = await thePictureAndFaderPanelInTheViewer();

    expect(await panel.sendOutput("fader", 0.6)).toEqual({ kind: "done" });
    panel.close();
    const graph = await backend.describeStreamGraph(PATTERN_MAIN_STREAM);
    const viewNode = graph.nodes.find((node) => node.name === "pictureandfader") ?? expect.unreachable("no view node");
    expect(transactionsSent.mock.calls).toEqual([[[{ operation: "set_node_input_value", stream: graph.asset, node: viewNode.id, input: "fader", value: 0.6 }], "live", null]]);
    expect(viewNode.ports.inputs.find((port) => port.name === "fader")).toMatchObject({ value: 0.6, value_comes_from: "live" });
  });

  it("keeps a node view's setting on its node, which Undo takes back and the panel follows", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&studio_views=fixture");
    const panel = await thePictureAndFaderPanelInTheViewer();
    const settingsSeen: ViewSettings[] = [];
    panel.watchSettings((settings) => settingsSeen.push(settings));
    await waitFor(() => expect(settingsSeen).toEqual([{ picture_fit: "contain" }]));

    expect(await panel.rememberSettings({ picture_fit: "cover" })).toEqual({ kind: "done" });
    await waitFor(() => expect(settingsSeen.at(-1)).toEqual({ picture_fit: "cover" }));
    const viewNodeOf = async () => (await backend.describeStreamGraph(PATTERN_MAIN_STREAM)).nodes.find((node) => node.name === "pictureandfader") ?? expect.unreachable("no view node");
    expect((await viewNodeOf()).input_values).toMatchObject({ picture_fit: "cover" });
    expect(localStorage.getItem(studioLayoutStorageKey(PATTERN_PROJECT)) ?? "").not.toContain("picture_fit");

    await backend.undoInTheOpenProject({ kind: "person", name: "Sam" });
    await waitFor(() => expect(settingsSeen.at(-1)).toEqual({ picture_fit: "contain" }));
    expect((await viewNodeOf()).input_values).not.toHaveProperty("picture_fit");
    panel.close();
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
    expect(await screen.findByText("This area's view, venue-3d, isn't in this build or the project")).toBeTruthy();
    document.body.replaceChildren();

    keepThePatternProjectsLayout({ layout: { kind: "split", parts: [] } });
    await mountedWindowOverTheMock("state=running");
    await theAreasShownAre(AREAS_OF_THE_COMPOSITION_LAYOUT);
  });
});
