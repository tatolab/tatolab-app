// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NodeGraphCanvas, type NodeGraphCanvasEditing, type NodeGraphCanvasNode } from "./node_graph_canvas";

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
    description: "Passes each frame through.",
    condition: { look: "healthy" },
    input_pins: [{ name: "video_in", family: "image", description: "The frames to pass.", stream_facts_words: [] }],
    output_pins: [{ name: "video_out", family: "image", description: null, stream_facts_words: [] }],
    saved_position: { x: 0, y: 0 },
    frame_id: FRAME_ID,
    is_collapsed: isCollapsed,
    subgraph: null,
  };
}

function editingRecorded() {
  const onFrameChanged = vi.fn();
  const onFrameRemoved = vi.fn();
  const onCardCollapsed = vi.fn();
  const applied = async () => "applied" as const;
  const editing: NodeGraphCanvasEditing = {
    onCardsMoved: applied,
    onPinsWired: vi.fn(),
    onWireLetGoOverTheCanvas: vi.fn(),
    onNodeAskedFor: vi.fn(),
    onNoteAskedFor: vi.fn(),
    onDeleted: vi.fn(),
    onFrameAskedFor: applied,
    onSubgraphAskedFor: vi.fn(),
    onNoteChanged: applied,
    onFrameChanged,
    onFrameRemoved,
    onCardCollapsed,
  };
  return { editing, onFrameChanged, onFrameRemoved, onCardCollapsed };
}

function drawnCanvas(editing: NodeGraphCanvasEditing | null, isCollapsed = false, description: string | null = null) {
  return render(
    <NodeGraphCanvas
      label="Stream graph"
      nodes={[card("pattern", isCollapsed)]}
      links={[]}
      frames={[{ frame_id: FRAME_ID, title: "Frame", description, colour: null }]}
      selectedNodeId={null}
      onNodeSelected={vi.fn()}
      editing={editing}
    />,
  );
}

describe("the node graph canvas", () => {
  it("shows a node type's description on its card's header, and a pin's family and description on its name and its handle", async () => {
    const { container } = drawnCanvas(editingRecorded().editing);
    const header = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-node-graph-card="pattern"] .node-graph-card-header') ?? expect.unreachable("no card header"));
    expect(header.getAttribute("title")).toBe("Passes each frame through.");
    expect(container.querySelector('[data-node-graph-input-pin="video_in"]')?.getAttribute("title")).toBe("video_in · Image\nThe frames to pass.");
    expect(container.querySelector('[data-node-graph-output-pin="video_out"]')?.getAttribute("title")).toBe("video_out · Image");
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
        selectedNodeId="pattern"
        onNodeSelected={vi.fn()}
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
        selectedNodeId="pattern"
        onNodeSelected={vi.fn()}
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
        selectedNodeId={null}
        onNodeSelected={vi.fn()}
        editing={editing}
      />,
    );
    await vi.waitFor(() => expect(container.querySelector('[data-node-graph-card="pattern"]')?.getAttribute("data-collapsed")).toBe("true"));
    expect(container.querySelector('[data-node-graph-input-pin="video_in"]')).toBeNull();
  });
});
