// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Position } from "@xyflow/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NodeGraphCanvas } from "./node_graph_canvas";
import { NodeGraphCardPreview, NodeGraphPinMark } from "./node_graph/node_card";
import { NodeGraphLinkView } from "./node_graph_link_view";
import type { NodePin } from "../pin_model/node_pins";
import type { NodeGraphCanvasEditing, NodeGraphCanvasNode, NodeGraphCardKind } from "./support/node_graph_canvas_contract";

afterEach(cleanup);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const FRAME_ID = "21d9c0ee-a01d-40a0-ad61-bd05476819e7";

function card(nodeId: string, isCollapsed: boolean): NodeGraphCanvasNode {
  return {
    node_id: nodeId,
    title: nodeId,
    type_name: null,
    node_type: null,
    description: "Passes each frame through.",
    condition: { look: "healthy" },
    inputs: [
      { name: "video_in", member: null, bundle: null, pin: { pin_type: { type: "texture" }, flow: "stream" }, family: "image", description: "The frames to pass.", annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null },
      { name: "gain", member: null, bundle: null, pin: { pin_type: { type: "float" }, flow: "value" }, family: "channels", description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null },
      { name: "boxes", member: null, bundle: null, pin: { pin_type: { type: "list_of", element_type: { type: "rectangle" } }, flow: "value" }, family: "array", description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null },
      { name: "reset", member: null, bundle: null, pin: { pin_type: { type: "trigger" }, flow: "trigger" }, family: "records", description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null },
    ],
    outputs: [{ name: "video_out", member: null, bundle: null, pin: null, family: "image", description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null }],
    saved_position: { x: 0, y: 0 },
    frame_id: FRAME_ID,
    is_collapsed: isCollapsed,
    subgraph: null,
    kind: { look: "process" },
  };
}

function editingRecorded() {
  const onFrameChanged = vi.fn();
  const onFrameRemoved = vi.fn();
  const onCardCollapsed = vi.fn();
  const onBundleOpened = vi.fn();
  const applied = async () => "applied" as const;
  const editing: NodeGraphCanvasEditing = {
    onCardsMoved: applied,
    fitsOfAWireFrom: async () => new Map(),
    onPinsWired: vi.fn(),
    onWireLetGoOverTheCanvas: vi.fn(),
    onNodeAskedFor: vi.fn(),
    onNoteAskedFor: vi.fn(),
    onDeleted: vi.fn(),
    onFrameAskedFor: applied,
    onSubgraphAskedFor: vi.fn(),
    onNoteChanged: applied,
    onTidiedUp: applied,
    onFrameChanged,
    onFrameRemoved,
    onCardCollapsed,
    onBundleOpened,
  };
  return { editing, onFrameChanged, onFrameRemoved, onCardCollapsed, onBundleOpened };
}

function drawnCanvas(editing: NodeGraphCanvasEditing | null, isCollapsed = false, description: string | null = null) {
  return render(
    <NodeGraphCanvas
      label="Stream graph"
      nodes={[card("pattern", isCollapsed)]}
      links={[]}
      frames={[{ frame_id: FRAME_ID, title: "Frame", description, colour: null }]}
      selectedNodeIds={[]}
      onNodesSelected={vi.fn()}
      editing={editing}
    />,
  );
}

describe("the node graph canvas", () => {
  it("shows a node type's description on its card's header, and a pin's type in plain words and its description on its name and its socket", async () => {
    const { container } = drawnCanvas(editingRecorded().editing);
    const header = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"] .node-graph-card-header') ?? expect.unreachable("no card header"));
    expect(header.getAttribute("title")).toBe("Passes each frame through.");
    expect(container.querySelector('[data-node-graph-input-pin="video_in"]')?.getAttribute("title")).toBe("video_in · Texture, a stream\nThe frames to pass.");
    expect(container.querySelector('[data-node-graph-input-pin="boxes"]')?.getAttribute("title")).toBe("boxes · List of Rectangle, one value at a time");
    expect(container.querySelector('[data-node-graph-output-pin="video_out"]')?.getAttribute("title")).toBe("video_out · No exact type");
    expect(container.querySelector('.node-graph-pin[data-handleid="input:gain"]')?.getAttribute("title")).toBe("gain · Float, one value at a time");
  });

  it("draws one full-width row per pin, outputs first, each socket coloured by its type and shaped by its flow, an untyped one round and neutral", async () => {
    const { container } = drawnCanvas(editingRecorded().editing);
    const card = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"]') ?? expect.unreachable("no card"));
    expect([...card.querySelectorAll("[data-node-graph-pin-row]")].map((row) => `${row.getAttribute("data-node-graph-pin-row")}:${row.textContent}`)).toEqual(["output:video_out", "input:video_in", "input:gain", "input:boxes", "input:reset"]);
    expect([...card.querySelectorAll(".node-graph-pin")].map((socket) => [socket.getAttribute("data-handleid"), socket.getAttribute("data-pin-type"), socket.getAttribute("data-pin-flow")])).toEqual([
      ["output:video_out", "untyped", null],
      ["input:video_in", "texture", "stream"],
      ["input:gain", "float", "value"],
      ["input:boxes", "rectangle", "value"],
      ["input:reset", "trigger", "trigger"],
    ]);
    expect(card.querySelector("[data-family]")).toBeNull();
  });
});

describe("a card's header", () => {
  it.each<[NodeGraphCardKind, string, string | null]>([
    [{ look: "process" }, "Process node", null],
    [{ look: "shader" }, "Shader node", null],
    [{ look: "function", language: "python" }, "Function node in Python", "Python"],
    [{ look: "function", language: "rust" }, "Function node in Rust", "Rust"],
    [{ look: "function", language: null }, "Function node", null],
    [{ look: "subgraph" }, "Subgraph", null],
    [{ look: "placed_stream" }, "Placed stream", null],
    [{ look: "unknown" }, "Kind not known", null],
  ])("leads with the mark of a %o node, labelled %s, and names a function's language", async (kind, words, languageWords) => {
    const { container } = render(
      <NodeGraphCanvas label="Stream graph" nodes={[{ ...card("pattern", false), kind }]} links={[]} frames={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} editing={null} />,
    );
    const header = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"] .node-graph-card-header') ?? expect.unreachable("no card header"));
    expect(header.getAttribute("data-kind")).toBe(kind.look);
    const mark = header.querySelector(`[data-node-graph-card-kind="${kind.look}"]`) ?? expect.unreachable("no kind mark");
    expect(mark.getAttribute("aria-label")).toBe(words);
    expect(header.querySelector("[data-node-graph-card-language]")?.textContent ?? null).toBe(languageWords);
  });

  it("marks a collapsed card's header with its kind too", async () => {
    const { container } = render(
      <NodeGraphCanvas label="Stream graph" nodes={[{ ...card("pattern", true), kind: { look: "shader" } }]} links={[]} frames={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} editing={null} />,
    );
    const header = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"][data-collapsed] .node-graph-card-header') ?? expect.unreachable("no collapsed card header"));
    expect(header.querySelector('[data-node-graph-card-kind="shader"]')).not.toBeNull();
  });
});

describe("a card's settings", () => {
  it("draws each setting as a row before the other inputs, a socket on each the runtime says takes a wire, one read at setup marked as rebuilding the node", async () => {
    const pattern = card("pattern", false);
    const setting = (name: string, read: "at_setup" | "each_run", takesAWire: boolean): NodeGraphCanvasNode["inputs"][number] => ({ name, member: null, bundle: null, pin: { pin_type: { type: "integer" }, flow: "value" }, family: null, description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: { read }, takes_a_wire: takesAWire, wire: null, link: null });
    const { container } = render(
      <NodeGraphCanvas
        label="Stream graph"
        nodes={[{ ...pattern, inputs: [setting("width", "at_setup", true), setting("fps", "each_run", false), setting("port", "at_setup", false), ...pattern.inputs] }]}
        links={[]}
        frames={[{ frame_id: FRAME_ID, title: "Frame", description: null, colour: null }]}
        selectedNodeIds={[]}
        onNodesSelected={vi.fn()}
        editing={editingRecorded().editing}
      />,
    );
    const drawnCard = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"]') ?? expect.unreachable("no card"));
    expect([...drawnCard.querySelectorAll("[data-node-graph-pin-row]")].map((row) => [row.textContent, row.getAttribute("data-node-graph-setting")])).toEqual([
      ["video_out", null],
      ["width", "at_setup"],
      ["fps", "each_run"],
      ["port", "at_setup"],
      ["video_in", null],
      ["gain", null],
      ["boxes", null],
      ["reset", null],
    ]);
    expect([...drawnCard.querySelectorAll(".node-graph-pin")].map((socket) => socket.getAttribute("data-handleid"))).toEqual(["output:video_out", "input:width", "input:video_in", "input:gain", "input:boxes", "input:reset"]);
    expect([...drawnCard.querySelectorAll("[data-node-graph-rebuilds-the-node]")].map((mark) => [mark.getAttribute("data-node-graph-rebuilds-the-node"), mark.getAttribute("title")])).toEqual([
      ["width", "A change rebuilds the node"],
      ["port", "A change rebuilds the node"],
    ]);
  });

  it("draws a collapsed card's sockets only for the pins that take a wire", async () => {
    const pattern = card("pattern", true);
    const setting = (name: string, takesAWire: boolean): NodeGraphCanvasNode["inputs"][number] => ({ name, member: null, bundle: null, pin: { pin_type: { type: "integer" }, flow: "value" }, family: null, description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: { read: "at_setup" }, takes_a_wire: takesAWire, wire: null, link: null });
    const { container } = render(
      <NodeGraphCanvas label="Stream graph" nodes={[{ ...pattern, inputs: [setting("width", true), setting("port", false), ...pattern.inputs] }]} links={[]} frames={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} editing={null} />,
    );
    const header = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"][data-collapsed] .node-graph-card-header') ?? expect.unreachable("no collapsed card header"));
    expect([...header.querySelectorAll(".node-graph-pin")].map((socket) => socket.getAttribute("data-handleid"))).toEqual(["output:video_out", "input:width", "input:video_in", "input:gain", "input:boxes", "input:reset"]);
  });
});

describe("what the runtime marks on a link into an input", () => {
  it("rings the socket of a link converted for free in the wire's type, never a Trigger's arrow, names both types in its hint and to a screen reader, and marks a warned input in the runtime's words", async () => {
    const pattern = card("pattern", false);
    const meaningsDiffer = { warning: "meanings_differ", output_meaning: "seconds", input_meaning: "frames", words: "the output carries `seconds` and the input takes `frames`" } as const;
    const inputs = pattern.inputs.map((input): NodePin =>
      input.name === "gain"
        ? { ...input, link: { converts_for_free_from: { pin_type: { type: "integer" }, flow: "value" }, warnings: [meaningsDiffer] } }
        : input.name === "reset"
          ? { ...input, link: { converts_for_free_from: { pin_type: { type: "trigger" }, flow: "trigger" }, warnings: [] } }
          : input,
    );
    const { container } = render(
      <NodeGraphCanvas
        label="Stream graph"
        nodes={[{ ...pattern, inputs }]}
        links={[]}
        frames={[{ frame_id: FRAME_ID, title: "Frame", description: null, colour: null }]}
        selectedNodeIds={[]}
        onNodesSelected={vi.fn()}
        editing={editingRecorded().editing}
      />,
    );
    const drawnCard = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"]') ?? expect.unreachable("no card"));
    const gainSocket = drawnCard.querySelector<HTMLElement>('[data-handleid="input:gain"]') ?? expect.unreachable("no gain socket");
    expect([gainSocket.getAttribute("data-pin-type"), gainSocket.getAttribute("data-converts-for-free-from"), gainSocket.querySelector(".node-graph-pin-wire-ring")?.getAttribute("data-pin-type")]).toEqual(["float", "integer", "integer"]);
    expect(gainSocket.getAttribute("title")).toBe("gain · Float, one value at a time\nReads Integer as Float, for free\nthe output carries `seconds` and the input takes `frames`");
    expect([...drawnCard.querySelectorAll("[data-converts-for-free-from]")].map((socket) => socket.getAttribute("data-handleid"))).toEqual(["input:gain"]);
    expect([...drawnCard.querySelectorAll(".node-graph-pin-wire-ring")]).toHaveLength(1);
    expect([...drawnCard.querySelectorAll("[data-node-graph-free-conversion]")].map((words) => [words.getAttribute("data-node-graph-free-conversion"), words.className, words.textContent])).toEqual([
      ["gain", "sr-only", "Reads Integer as Float, for free"],
      ["reset", "sr-only", "Reads Trigger as Trigger, for free"],
    ]);
    expect([...drawnCard.querySelectorAll("[data-node-graph-link-warning]")].map((mark) => [mark.getAttribute("data-node-graph-link-warning"), mark.getAttribute("title")])).toEqual([["gain", "the output carries `seconds` and the input takes `frames`"]]);
  });

  it("draws a link the runtime warns of amber, its warnings read after its state", () => {
    const { container } = render(
      <svg>
        <NodeGraphLinkView
          id="L1"
          source="a"
          target="b"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          data={{ graphLink: { link_id: "L1", source_node_id: "a", source_pin: "out", source_member: null, target_node_id: "b", target_pin: "in", target_member: null, look: "carrying", description: "a.out → b.in, wired\nA Vector is read as a Color", warning_words: ["A Vector is read as a Color"] }, pin_type_key: "vector" }}
        />
      </svg>,
    );
    const link = container.querySelector('[data-node-graph-link="L1"]');
    expect([link?.getAttribute("data-warned"), link?.querySelector("title")?.textContent]).toEqual(["true", "a.out → b.in, wired\nA Vector is read as a Color"]);
  });
});

describe("the node graph canvas while it takes edits", () => {
  it("renames a frame from its title tab on a double-click, keeping the trimmed title, and asks nothing on Escape or an unchanged title", async () => {
    const { editing, onFrameChanged } = editingRecorded();
    const { container } = drawnCanvas(editing);
    const titleTab = await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-frame-title="${FRAME_ID}"]`) ?? expect.unreachable("no frame title"));

    fireEvent.doubleClick(titleTab);
    const titleField = await vi.waitFor(() => container.querySelector<HTMLInputElement>(`[data-node-graph-frame-title-field="${FRAME_ID}"]`) ?? expect.unreachable("no title field"));
    fireEvent.change(titleField, { target: { value: "  Titles " } });
    fireEvent.keyDown(titleField, { key: "Enter" });
    expect(onFrameChanged).toHaveBeenCalledWith(FRAME_ID, { title: "Titles" });

    fireEvent.doubleClick(await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-frame-title="${FRAME_ID}"]`) ?? expect.unreachable("no frame title")));
    const secondField = await vi.waitFor(() => container.querySelector<HTMLInputElement>(`[data-node-graph-frame-title-field="${FRAME_ID}"]`) ?? expect.unreachable("no title field"));
    fireEvent.change(secondField, { target: { value: "Something else" } });
    fireEvent.keyDown(secondField, { key: "Escape" });
    expect(onFrameChanged).toHaveBeenCalledTimes(1);
  });

  it("edits a frame's description on a double-click, keeping the trimmed words, and asks nothing for unchanged words", async () => {
    const { editing, onFrameChanged } = editingRecorded();
    const { container } = drawnCanvas(editing, false, "Where the frames come in");
    const description = await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-frame-description="${FRAME_ID}"]`) ?? expect.unreachable("no description"));

    fireEvent.doubleClick(description);
    const descriptionField = await vi.waitFor(() => container.querySelector<HTMLInputElement>(`[data-node-graph-frame-description-field="${FRAME_ID}"]`) ?? expect.unreachable("no description field"));
    expect(descriptionField.value).toBe("Where the frames come in");
    fireEvent.keyDown(descriptionField, { key: "Enter" });
    expect(onFrameChanged).not.toHaveBeenCalled();

    fireEvent.doubleClick(await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-frame-description="${FRAME_ID}"]`) ?? expect.unreachable("no description")));
    const secondField = await vi.waitFor(() => container.querySelector<HTMLInputElement>(`[data-node-graph-frame-description-field="${FRAME_ID}"]`) ?? expect.unreachable("no description field"));
    fireEvent.change(secondField, { target: { value: " The camera and the clip " } });
    fireEvent.keyDown(secondField, { key: "Enter" });
    expect(onFrameChanged).toHaveBeenCalledWith(FRAME_ID, { description: "The camera and the clip" });
  });

  it("offers a frame's right-click menu on its title tab: describing it opens the description field, and Remove frame asks for its removal", async () => {
    const { editing, onFrameRemoved } = editingRecorded();
    const { container } = drawnCanvas(editing);
    const titleTab = await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-frame-title="${FRAME_ID}"]`) ?? expect.unreachable("no frame title"));

    fireEvent.contextMenu(titleTab);
    const describe = await vi.waitFor(() => document.querySelector<HTMLElement>('[data-node-graph-frame-choice="describe"]') ?? expect.unreachable("no Add description"));
    expect(describe.textContent).toBe("Add description");
    fireEvent.click(describe);
    await vi.waitFor(() => container.querySelector(`[data-node-graph-frame-description-field="${FRAME_ID}"]`) ?? expect.unreachable("no description field"));

    fireEvent.contextMenu(await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-frame-title="${FRAME_ID}"]`) ?? expect.unreachable("no frame title")));
    fireEvent.click(await vi.waitFor(() => document.querySelector<HTMLElement>('[data-node-graph-frame-choice="remove"]') ?? expect.unreachable("no Remove frame")));
    expect(onFrameRemoved).toHaveBeenCalledWith(FRAME_ID);
  });

  it("gives a frame a colour of the person's own from Custom color…, picked over the window", async () => {
    const { editing, onFrameChanged } = editingRecorded();
    const { container } = drawnCanvas(editing);
    fireEvent.contextMenu(await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-frame-title="${FRAME_ID}"]`) ?? expect.unreachable("no frame title")));
    fireEvent.click(await vi.waitFor(() => document.querySelector<HTMLElement>('[data-node-graph-frame-choice="colour"]') ?? expect.unreachable("no Color")));
    fireEvent.click(await vi.waitFor(() => document.querySelector<HTMLElement>('[data-node-graph-frame-choice="custom_colour"]') ?? expect.unreachable("no Custom color")));
    const hexField = await vi.waitFor(() => document.querySelector<HTMLInputElement>("[data-node-graph-frame-colour-picker] [data-colour-picker-hex]") ?? expect.unreachable("no picker"));
    fireEvent.change(hexField, { target: { value: "#4aa8a8" } });
    fireEvent.click(document.querySelector('[data-colour-picker-action="use"]') ?? expect.unreachable("no Use color"));
    expect(onFrameChanged).toHaveBeenCalledWith(FRAME_ID, { colour: "#4aa8a8" });
  });

  it("keeps what is typed while a new frame is made and opens its title field holding it", async () => {
    const { editing } = editingRecorded();
    const onFrameAskedFor = vi.fn(async () => "applied" as const);
    const editingAFrame: NodeGraphCanvasEditing = { ...editing, onFrameAskedFor };
    const NEW_FRAME_ID = "5f0c2d9e-7b8a-4c61-9e3d-2a1b0c9d8e7f";
    const canvasWith = (frames: { frame_id: string; title: string; description: null; colour: null }[]) => (
      <NodeGraphCanvas
        label="Stream graph"
        nodes={[{ ...card("pattern", false), frame_id: frames.length === 0 ? null : NEW_FRAME_ID }]}
        links={[]}
        frames={frames}
        selectedNodeIds={["pattern"]}
        onNodesSelected={vi.fn()}
        editing={editingAFrame}
      />
    );
    const { container, rerender } = render(canvasWith([]));
    const canvas = await vi.waitFor(() => container.querySelector<HTMLElement>("[data-node-graph-editable]") ?? expect.unreachable("no editable canvas"));
    fireEvent.keyDown(canvas, { key: "f" });
    expect(onFrameAskedFor).toHaveBeenCalledWith(["pattern"]);
    for (const key of ["L", "o", "o", "x", "Backspace", "k"]) fireEvent.keyDown(canvas, { key });

    rerender(canvasWith([{ frame_id: NEW_FRAME_ID, title: "Frame", description: null, colour: null }]));
    const titleField = await vi.waitFor(() => container.querySelector<HTMLInputElement>(`[data-node-graph-frame-title-field="${NEW_FRAME_ID}"]`) ?? expect.unreachable("no title field"));
    expect(titleField.value).toBe("Look");
  });

  it("titles a new frame with what was typed and entered while it was made, opening no field, and leaves it untitled after Escape", async () => {
    const { editing, onFrameChanged } = editingRecorded();
    const NEW_FRAME_ID = "5f0c2d9e-7b8a-4c61-9e3d-2a1b0c9d8e7f";
    const canvasWith = (frameIds: string[]) => (
      <NodeGraphCanvas
        label="Stream graph"
        nodes={[{ ...card("pattern", false), frame_id: frameIds.at(-1) ?? null }]}
        links={[]}
        frames={frameIds.map((frame_id) => ({ frame_id, title: "Frame", description: null, colour: null }))}
        selectedNodeIds={["pattern"]}
        onNodesSelected={vi.fn()}
        editing={editing}
      />
    );
    const { container, rerender } = render(canvasWith([]));
    const canvas = await vi.waitFor(() => container.querySelector<HTMLElement>("[data-node-graph-editable]") ?? expect.unreachable("no editable canvas"));
    fireEvent.keyDown(canvas, { key: "f" });
    for (const key of ["I", "n", "Enter", "x"]) fireEvent.keyDown(canvas, { key });
    rerender(canvasWith([NEW_FRAME_ID]));
    await vi.waitFor(() => expect(onFrameChanged).toHaveBeenCalledWith(NEW_FRAME_ID, { title: "In" }));
    expect(container.querySelector(`[data-node-graph-frame-title-field="${NEW_FRAME_ID}"]`)).toBeNull();

    const SECOND_FRAME_ID = "0b7e4c2a-9d31-4f58-a6e2-3c8d1f0e9b75";
    fireEvent.keyDown(canvas, { key: "f" });
    for (const key of ["L", "Escape"]) fireEvent.keyDown(canvas, { key });
    rerender(canvasWith([NEW_FRAME_ID, SECOND_FRAME_ID]));
    await vi.waitFor(() => container.querySelector(`[data-node-graph-frame="${SECOND_FRAME_ID}"]`) ?? expect.unreachable("no second frame"));
    expect(container.querySelector(`[data-node-graph-frame-title-field="${SECOND_FRAME_ID}"]`)).toBeNull();
    expect(onFrameChanged).toHaveBeenCalledTimes(1);
  });

  it("asks for a node where the pointer last pressed when Tab follows a click that brought no pointer move", async () => {
    const { editing } = editingRecorded();
    const onNodeAskedFor = vi.fn();
    const { container } = drawnCanvas({ ...editing, onNodeAskedFor });
    const canvas = await vi.waitFor(() => container.querySelector<HTMLElement>("[data-node-graph-editable]") ?? expect.unreachable("no editable canvas"));
    fireEvent.pointerMove(canvas, { clientX: 900, clientY: 500 });
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 480 });
    fireEvent.keyDown(canvas, { key: "Tab" });
    expect(onNodeAskedFor).toHaveBeenCalledWith(expect.objectContaining({ in_the_element: { x: 120, y: 480 } }));
  });

  it("draws Add node, Frame, Note, Subgraph and Tidy up, then Frame the whole graph and the zooms, in the graph's ribbon, Frame and Subgraph saying why they wait for a selection", async () => {
    const { editing } = editingRecorded();
    const onNodeAskedFor = vi.fn();
    const { container } = drawnCanvas({ ...editing, onNodeAskedFor });
    const tool = (name: string) => container.querySelector<HTMLElement>(`[data-node-graph-tool="${name}"]`) ?? expect.unreachable(`no ${name}`);
    await vi.waitFor(() => tool("add_node"));
    expect(tool("add_note").closest('[role="toolbar"]')?.getAttribute("aria-label")).toBe("Stream graph tools");
    expect([...container.querySelectorAll("[data-node-graph-tool]")].map((button) => button.getAttribute("data-node-graph-tool"))).toEqual(["add_node", "frame_selection", "add_note", "add_subgraph", "tidy_up", "frame_all", "zoom_in", "zoom_out", "find"]);
    expect(tool("frame_selection").getAttribute("aria-disabled")).toBe("true");
    expect(tool("add_subgraph").getAttribute("aria-label")).toBe("Collapse the selection into a subgraph: Select the nodes to collapse into a subgraph first");
    fireEvent.click(tool("add_node"));
    expect(onNodeAskedFor).toHaveBeenCalledTimes(1);
  });

  it("asks for every card's new place in its frame as one edit when Tidy up or Shift T is pressed with nothing selected", async () => {
    const { editing } = editingRecorded();
    const onTidiedUp = vi.fn(async () => "applied" as const);
    const { container } = drawnCanvas({ ...editing, onTidiedUp });
    const tidyUp = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-tool="tidy_up"]') ?? expect.unreachable("no Tidy up"));
    expect(tidyUp.getAttribute("aria-label")).toBe("Tidy up the graph");
    fireEvent.click(tidyUp);
    expect(onTidiedUp).toHaveBeenCalledTimes(1);
    expect(onTidiedUp).toHaveBeenCalledWith({ cards: [{ node_id: "pattern", position: { x: 0, y: 0 }, frame_id: FRAME_ID }], notes: [] });
    const canvas = container.querySelector<HTMLElement>("[data-node-graph-editable]") ?? expect.unreachable("no editable canvas");
    fireEvent.keyDown(canvas, { key: "T", shiftKey: true });
    expect(onTidiedUp).toHaveBeenCalledTimes(2);
  });

  it("holds the cards at the places Tidy up gives them, and puts them back where they were when the edit is refused", async () => {
    const { editing } = editingRecorded();
    let answer: (answer: "applied" | "refused") => void = () => undefined;
    const onTidiedUp = vi.fn((_places: Parameters<NodeGraphCanvasEditing["onTidiedUp"]>[0]) => new Promise<"applied" | "refused">((resolve) => (answer = resolve)));
    const upstream = { ...card("upstream", false), saved_position: { x: 600, y: 400 }, frame_id: null };
    const downstream = { ...card("downstream", false), saved_position: { x: 0, y: 0 }, frame_id: null };
    const { container } = render(
      <NodeGraphCanvas
        label="Stream graph"
        nodes={[upstream, downstream]}
        links={[{ link_id: "wire", source_node_id: "upstream", source_pin: "video_out", source_member: null, target_node_id: "downstream", target_pin: "video_in", target_member: null, look: "carrying", description: "wired", warning_words: [] }]}
        frames={[]}
        selectedNodeIds={[]}
        onNodesSelected={vi.fn()}
        editing={{ ...editing, onTidiedUp }}
      />,
    );
    const placeOf = (nodeId: string) => container.querySelector<HTMLElement>(`.react-flow__node[data-id="${nodeId}"]`)?.style.transform;
    await vi.waitFor(() => expect(placeOf("upstream")).toBe("translate(600px,400px)"));
    fireEvent.click(container.querySelector<HTMLElement>('[data-node-graph-tool="tidy_up"]') ?? expect.unreachable("no Tidy up"));
    const [places] = onTidiedUp.mock.calls[0] ?? expect.unreachable("Tidy up asked for nothing");
    const upstreamPlace = places.cards.find((move) => move.node_id === "upstream")?.position ?? expect.unreachable("upstream not placed");
    const downstreamPlace = places.cards.find((move) => move.node_id === "downstream")?.position ?? expect.unreachable("downstream not placed");
    expect(upstreamPlace.x).toBeLessThan(downstreamPlace.x);
    await vi.waitFor(() => expect(placeOf("upstream")).toBe(`translate(${upstreamPlace.x}px,${upstreamPlace.y}px)`));
    expect(container.querySelector(".node-graph-canvas-tidying")).toBeTruthy();
    await act(async () => answer("refused"));
    await vi.waitFor(() => expect(placeOf("upstream")).toBe("translate(600px,400px)"));
    expect(placeOf("downstream")).toBe("translate(0px,0px)");
  });

  it("offers Add node and Add note where the canvas is right-clicked, and Frame the whole graph", async () => {
    const { editing } = editingRecorded();
    const onNodeAskedFor = vi.fn();
    const onNoteAskedFor = vi.fn();
    const { container } = drawnCanvas({ ...editing, onNodeAskedFor, onNoteAskedFor });
    const pane = await vi.waitFor(() => container.querySelector<HTMLElement>(".react-flow__pane") ?? expect.unreachable("no pane"));
    fireEvent.contextMenu(pane, { clientX: 140, clientY: 90 });
    const addNode = await vi.waitFor(() => document.querySelector<HTMLElement>('[data-node-graph-choice="add_node"]') ?? expect.unreachable("no Add node"));
    expect(document.querySelector('[data-node-graph-choice="frame_all"]')).toBeTruthy();
    expect(addNode.textContent).toBe("Add node…Tab");
    fireEvent.click(addNode);
    expect(onNodeAskedFor).toHaveBeenCalledWith(expect.objectContaining({ in_the_element: { x: 140, y: 90 } }));

    fireEvent.contextMenu(pane, { clientX: 60, clientY: 40 });
    fireEvent.click(await vi.waitFor(() => document.querySelector<HTMLElement>('[data-node-graph-choice="add_note"]') ?? expect.unreachable("no Add note")));
    expect(onNoteAskedFor).toHaveBeenCalledWith(expect.objectContaining({ in_the_element: { x: 60, y: 40 } }));
  });

  it("selects a card right-clicked and offers to frame it, collapse it into a subgraph, hide its pins or delete it", async () => {
    const { editing, onCardCollapsed } = editingRecorded();
    const onDeleted = vi.fn();
    const onNodesSelected = vi.fn();
    const { container } = render(
      <NodeGraphCanvas label="Stream graph" nodes={[card("pattern", false)]} links={[]} frames={[]} selectedNodeIds={[]} onNodesSelected={onNodesSelected} editing={{ ...editing, onDeleted }} />,
    );
    const rightClickTheCard = async () => fireEvent.contextMenu(await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"]') ?? expect.unreachable("no card")));
    await rightClickTheCard();
    expect(onNodesSelected).toHaveBeenCalledWith(["pattern"]);
    const choiceWords = await vi.waitFor(() => {
      const choices = [...document.querySelectorAll<HTMLElement>("[data-node-graph-choice]")].map((choice) => choice.textContent);
      return choices.length > 0 ? choices : expect.unreachable("no card choices");
    });
    expect(choiceWords).toEqual(["Frame the nodeF", "Collapse into a subgraph⇧⌘G", "Hide its pins", "Delete the node⌫"]);
    fireEvent.click(document.querySelector<HTMLElement>('[data-node-graph-choice="collapse_card"]') ?? expect.unreachable("no Hide its pins"));
    expect(onCardCollapsed).toHaveBeenCalledWith("pattern", true);

    await rightClickTheCard();
    fireEvent.click(await vi.waitFor(() => document.querySelector<HTMLElement>('[data-node-graph-choice="delete"]') ?? expect.unreachable("no Delete")));
    expect(onDeleted).toHaveBeenCalledWith({ node_ids: ["pattern"], link_ids: [], note_ids: [] });
  });

  it("offers Edit code on a card whose node type has code, and Edit code dimmed with why on one whose has none, editable or not", async () => {
    const onOpened = vi.fn();
    const codeOfTheCard = (nodeId: string) => (nodeId === "pattern" ? { kind: "opens" as const, onOpened } : { kind: "does_not_open" as const, because: "tatolab.stream:Display is built into the runtime, which ships no file of its code." });
    const { editing } = editingRecorded();
    const { container, rerender } = render(
      <NodeGraphCanvas label="Stream graph" nodes={[card("pattern", false), card("display", false)]} links={[]} frames={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} editing={editing} codeOfTheCard={codeOfTheCard} />,
    );
    const rightClickTheCard = async (nodeId: string) => fireEvent.contextMenu(await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-card="${nodeId}"]`) ?? expect.unreachable("no card")));
    const editCode = () => vi.waitFor(() => document.querySelector<HTMLElement>('[data-node-graph-choice="edit_code"]') ?? expect.unreachable("no Edit code"));

    await rightClickTheCard("pattern");
    expect((await editCode()).getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(await editCode());
    expect(onOpened).toHaveBeenCalledOnce();

    rerender(<NodeGraphCanvas label="Stream graph" nodes={[card("pattern", false), card("display", false)]} links={[]} frames={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} codeOfTheCard={codeOfTheCard} />);
    await rightClickTheCard("display");
    const dimmed = await editCode();
    expect(dimmed.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(dimmed.getAttribute("aria-describedby") ?? "")?.textContent).toBe("tatolab.stream:Display is built into the runtime, which ships no file of its code.");
    fireEvent.click(dimmed);
    expect(onOpened).toHaveBeenCalledOnce();
  });

  it("leaves only Frame the whole graph, the zooms and Find in a read-only graph's ribbon", async () => {
    const { container } = drawnCanvas(null);
    await vi.waitFor(() => container.querySelector('[data-node-graph-tool="frame_all"]') ?? expect.unreachable("no ribbon"));
    expect([...container.querySelectorAll("[data-node-graph-tool]")].map((button) => button.getAttribute("data-node-graph-tool"))).toEqual(["frame_all", "zoom_in", "zoom_out", "find"]);
  });

  it("offers no right-click menu on a read-only canvas's frame", async () => {
    const { container } = drawnCanvas(null);
    const titleTab = await vi.waitFor(() => container.querySelector<HTMLElement>(`[data-node-graph-frame-title="${FRAME_ID}"]`) ?? expect.unreachable("no frame title"));
    fireEvent.contextMenu(titleTab);
    expect(document.querySelector('[data-node-graph-frame-choice="remove"]')).toBeNull();
  });

  it("collapses a card from its chevron, which names the card's pins and says whether they show", async () => {
    const { editing, onCardCollapsed } = editingRecorded();
    const { container, rerender } = drawnCanvas(editing);
    const chevron = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card-collapse="pattern"]') ?? expect.unreachable("no chevron"));
    expect([chevron.getAttribute("aria-label"), chevron.getAttribute("aria-expanded")]).toEqual(["pattern pins", "true"]);
    act(() => chevron.click());
    expect(onCardCollapsed).toHaveBeenCalledWith("pattern", true);

    rerender(
      <NodeGraphCanvas
        label="Stream graph"
        nodes={[card("pattern", true)]}
        links={[]}
        frames={[{ frame_id: FRAME_ID, title: "Frame", description: null, colour: null }]}
        selectedNodeIds={[]}
        onNodesSelected={vi.fn()}
        editing={editing}
      />,
    );
    await vi.waitFor(() => expect(container.querySelector('[data-node-graph-card="pattern"]')?.getAttribute("data-collapsed")).toBe("true"));
    expect(container.querySelector('[data-node-graph-input-pin="video_in"]')).toBeNull();
  });
});

describe("finding nodes in the graph", () => {
  const namedCard = (nodeId: string, title: string, typeName: string | null, x: number): NodeGraphCanvasNode => ({ ...card(nodeId, false), title, type_name: typeName, frame_id: null, saved_position: { x, y: 0 } });

  function drawnGraphToFindIn(onNodesSelected = vi.fn()) {
    return render(
      <NodeGraphCanvas
        label="Stream graph"
        nodes={[namedCard("orbits", "Orbit Lights", null, 0), namedCard("speed", "Graph Input", null, 300), namedCard("click", "Click Track", "Click", 600), namedCard("speaker", "Speaker Sink", null, 900)]}
        links={[]}
        selectedNodeIds={[]}
        onNodesSelected={onNodesSelected}
        editing={editingRecorded().editing}
      />,
    );
  }

  it("opens from the ribbon, highlights every match by name or type, the current one more strongly, and moves between them with ↵ and ⇧↵", async () => {
    const onNodesSelected = vi.fn();
    const { container } = drawnGraphToFindIn(onNodesSelected);
    const findLookOf = (nodeId: string) => container.querySelector(`[data-node-graph-card="${nodeId}"]`)?.getAttribute("data-found") ?? null;
    fireEvent.click(await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-tool="find"]') ?? expect.unreachable("no Find in the ribbon")));
    const findWords = container.querySelector<HTMLInputElement>("[data-node-graph-find-words]") ?? expect.unreachable("no find bar");
    const progress = () => container.querySelector("[data-node-graph-find-progress]")?.textContent;

    fireEvent.change(findWords, { target: { value: "IN" } });
    expect(progress()).toBe("1 of 2");
    fireEvent.change(findWords, { target: { value: "t" } });
    expect(progress()).toBe("1 of 3");
    expect(["orbits", "speed", "click", "speaker"].map(findLookOf)).toEqual(["current", "found", "found", null]);

    fireEvent.keyDown(findWords, { key: "Enter" });
    expect(progress()).toBe("2 of 3");
    expect(findLookOf("speed")).toBe("current");
    fireEvent.keyDown(findWords, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(findWords, { key: "Enter", shiftKey: true });
    expect(progress()).toBe("3 of 3");
    expect(findLookOf("click")).toBe("current");

    fireEvent.change(findWords, { target: { value: "click" } });
    expect(["orbits", "speed", "click", "speaker"].map(findLookOf)).toEqual([null, null, "current", null]);
    expect(progress()).toBe("1 of 1");
    fireEvent.change(findWords, { target: { value: "zzz" } });
    expect(progress()).toBe("No results");
    expect(onNodesSelected).not.toHaveBeenCalled();
  });

  it("opens with ⌘F on the canvas, and Esc closes it and takes the highlights away", async () => {
    const { container } = drawnGraphToFindIn();
    const canvas = await vi.waitFor(() => container.querySelector<HTMLElement>("[data-node-graph-editable]") ?? expect.unreachable("no canvas"));
    fireEvent.keyDown(canvas, { key: "f", metaKey: true });
    const findWords = container.querySelector<HTMLInputElement>("[data-node-graph-find-words]") ?? expect.unreachable("⌘F opened no find bar");
    fireEvent.change(findWords, { target: { value: "orbit" } });
    expect(container.querySelector('[data-node-graph-card="orbits"]')?.getAttribute("data-found")).toBe("current");
    fireEvent.keyDown(findWords, { key: "Escape" });
    expect(container.querySelector("[data-node-graph-find-bar]")).toBeNull();
    expect(container.querySelector("[data-found]")).toBeNull();
  });
});

describe("a node's card previewed outside a canvas", () => {
  it("draws the card's own header with its kind and pin rows, outputs first, with a socket per pin in its type's look", () => {
    const previewPin = (name: string, pin: NodePin["pin"]): NodePin => ({ name, member: null, bundle: null, pin, family: null, description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null });
    const texture = { pin_type: { type: "texture" }, flow: "stream" } as const;
    const { container } = render(<NodeGraphCardPreview title="Halftone" kind={{ look: "shader" }} inputs={[previewPin("frames", texture), previewPin("level", null)]} outputs={[previewPin("image", texture)]} />);
    const preview = container.querySelector<HTMLElement>('[data-node-graph-card-preview="Halftone"]') ?? expect.unreachable("no preview");
    expect(preview.classList.contains("node-graph-card")).toBe(true);
    expect(preview.querySelector(".node-graph-card-header")?.textContent).toBe("Halftone");
    expect(preview.querySelector('.node-graph-card-header[data-kind="shader"] [data-node-graph-card-kind="shader"]')).not.toBeNull();
    expect([...preview.querySelectorAll("[data-node-graph-input-pin]")].map((pin) => pin.textContent)).toEqual(["frames", "level"]);
    expect([...preview.querySelectorAll("[data-node-graph-output-pin]")].map((pin) => pin.textContent)).toEqual(["image"]);
    expect([...preview.querySelectorAll(".node-graph-pin")].map((socket) => [socket.getAttribute("data-side"), socket.getAttribute("data-pin-type"), socket.getAttribute("data-pin-flow")])).toEqual([
      ["output", "texture", "stream"],
      ["input", "texture", "stream"],
      ["input", "untyped", null],
    ]);
  });
});

describe("a pin's mark and a link outside a card", () => {
  it("marks a port with its socket's look, and an untyped one with the neutral one", () => {
    const { container } = render(
      <>
        <NodeGraphPinMark pin={{ pin_type: { type: "float" }, flow: "value" }} />
        <NodeGraphPinMark pin={null} />
      </>,
    );
    expect([...container.querySelectorAll(".node-graph-pin-mark")].map((mark) => [mark.getAttribute("data-pin-type"), mark.getAttribute("data-pin-flow")])).toEqual([
      ["float", "value"],
      ["untyped", null],
    ]);
  });

  it("colours a link by the type key of the pin it starts from", () => {
    const { container } = render(
      <svg>
        <NodeGraphLinkView
          id="L1"
          source="a"
          target="b"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={0}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          data={{ graphLink: { link_id: "L1", source_node_id: "a", source_pin: "out", source_member: null, target_node_id: "b", target_pin: "in", target_member: null, look: "carrying", description: "wired", warning_words: [] }, pin_type_key: "float" }}
        />
      </svg>,
    );
    expect(container.querySelector('[data-node-graph-link="L1"]')?.getAttribute("data-pin-type")).toBe("float");
  });
});

describe("a bundle pin", () => {
  const memberPin = (member: string): NodePin => ({ name: "levels", member, bundle: null, pin: { pin_type: { type: "float" }, flow: "value" }, family: null, description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null });
  const mixCard = (isOpen: boolean): NodeGraphCanvasNode => ({
    ...card("mix", false),
    inputs: [
      {
        name: "levels",
        member: null,
        bundle: { members: [memberPin("left"), memberPin("right")], is_open: isOpen },
        pin: { pin_type: { type: "bundle", members: [{ name: "left", member_type: { type: "float" } }, { name: "right", member_type: { type: "float" } }] }, flow: "value" },
        family: "channels",
        description: null,
        annotations: {},
        stream_facts_words: [],
        value_address: null,
        setting: null,
        takes_a_wire: true,
        wire: null,
        link: null,
      },
    ],
    outputs: [],
  });
  const drawnMix = (isOpen: boolean, editing: NodeGraphCanvasEditing | null) =>
    render(<NodeGraphCanvas label="Stream graph" nodes={[mixCard(isOpen)]} links={[]} frames={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} editing={editing} />);

  it("draws a doubled socket on its own row while closed, and a row and a socket of each member's type under it while open", async () => {
    const closed = drawnMix(false, null);
    const closedCard = await vi.waitFor(() => closed.container.querySelector<HTMLElement>('[data-node-graph-card="mix"]') ?? expect.unreachable("no card"));
    expect([...closedCard.querySelectorAll("[data-node-graph-pin-row]")].map((row) => row.textContent)).toEqual(["levels"]);
    expect(closedCard.querySelector('.node-graph-pin[data-handleid="input:levels"]')?.getAttribute("data-bundle")).toBe("closed");
    cleanup();

    const open = drawnMix(true, null);
    const openCard = await vi.waitFor(() => open.container.querySelector<HTMLElement>('[data-node-graph-card="mix"]') ?? expect.unreachable("no card"));
    expect([...openCard.querySelectorAll("[data-node-graph-pin-row]")].map((row) => [row.textContent, row.getAttribute("data-node-graph-member")])).toEqual([
      ["levels", null],
      ["left", "left"],
      ["right", "right"],
    ]);
    expect([...openCard.querySelectorAll(".node-graph-pin")].map((socket) => [socket.getAttribute("data-handleid"), socket.getAttribute("data-pin-type"), socket.getAttribute("data-bundle")])).toEqual([
      ["input:levels", "bundle", "open"],
      ["input:levels/left", "float", null],
      ["input:levels/right", "float", null],
    ]);
  });

  it("is opened and closed by the chevron leading its row, which a read-only canvas does not draw", async () => {
    const { editing, onBundleOpened } = editingRecorded();
    const editable = drawnMix(false, editing);
    const chevron = await vi.waitFor(() => editable.container.querySelector<HTMLElement>('[data-node-graph-bundle-open="levels"]') ?? expect.unreachable("no chevron"));
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    expect(chevron.getAttribute("aria-label")).toBe("levels members");
    fireEvent.click(chevron);
    expect(onBundleOpened).toHaveBeenCalledWith("mix", "input", "levels", true);
    cleanup();

    const readOnly = drawnMix(true, null);
    await vi.waitFor(() => readOnly.container.querySelector('[data-node-graph-card="mix"]') ?? expect.unreachable("no card"));
    expect(readOnly.container.querySelector("[data-node-graph-bundle-open]")).toBeNull();
  });
});
