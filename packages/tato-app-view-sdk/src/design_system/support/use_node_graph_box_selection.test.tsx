// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boxSelectionModeOf, selectionAfterTheBox, useNodeGraphBoxSelection, type NodeGraphCanvasSelection } from "./use_node_graph_box_selection";

afterEach(cleanup);

describe("a box dragged out on the node graph", () => {
  it("adds with Shift, takes away with Ctrl or ⌘, and replaces with no key, Shift winning when both are held", () => {
    expect(boxSelectionModeOf({ shiftKey: true, ctrlKey: false, metaKey: false })).toBe("add");
    expect(boxSelectionModeOf({ shiftKey: false, ctrlKey: true, metaKey: false })).toBe("take_away");
    expect(boxSelectionModeOf({ shiftKey: false, ctrlKey: false, metaKey: true })).toBe("take_away");
    expect(boxSelectionModeOf({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe("add");
    expect(boxSelectionModeOf({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe("replace");
  });

  it("leaves the selection it started from with what it holds added, taken away, or in its place", () => {
    const before = new Set(["clock", "beat"]);
    const inTheBox = new Set(["beat", "follow"]);
    expect([...selectionAfterTheBox("add", before, inTheBox)].sort()).toEqual(["beat", "clock", "follow"]);
    expect([...selectionAfterTheBox("take_away", before, inTheBox)]).toEqual(["clock"]);
    expect([...selectionAfterTheBox("replace", before, inTheBox)].sort()).toEqual(["beat", "follow"]);
  });
});

/** The links joined to each card, as the canvas finds them. */
const LINK_IDS_OF_THE_CARD: Record<string, string[]> = { clock: ["clock_to_beat"], beat: ["clock_to_beat"], follow: [] };

function boxDrawn(selection: NodeGraphCanvasSelection, flowNodeIdsInTheBox: () => string[]) {
  const onBoxed = vi.fn();
  const hook: { current: ReturnType<typeof useNodeGraphBoxSelection> | null; store: ReturnType<typeof useStoreApi> | null } = { current: null, store: null };
  function BoxHost() {
    hook.store = useStoreApi();
    hook.current = useNodeGraphBoxSelection({
      reactFlow: { getIntersectingNodes: () => flowNodeIdsInTheBox().map((id) => ({ id, position: { x: 0, y: 0 }, data: {} })) },
      selection,
      isACard: (flowNodeId) => flowNodeId in LINK_IDS_OF_THE_CARD,
      noteIdOfTheFlowNode: (flowNodeId) => (flowNodeId.startsWith("note:") ? flowNodeId.slice("note:".length) : null),
      linkIdsJoinedTo: (cardIds) => new Set([...cardIds].flatMap((cardId) => LINK_IDS_OF_THE_CARD[cardId] ?? [])),
      onBoxed,
    });
    return null;
  }
  render(
    <ReactFlowProvider>
      <BoxHost />
    </ReactFlowProvider>,
  );
  const pane = document.createElement("div");
  pane.className = "react-flow__pane";
  const press = (keys: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; target?: EventTarget }) =>
    hook.current?.pressTheCanvas({ button: 0, shiftKey: false, ctrlKey: false, metaKey: false, target: pane, ...keys });
  const stepTheBox = (width: number) =>
    act(() => hook.store?.setState({ userSelectionRect: { startX: 0, startY: 0, x: 0, y: 0, width, height: width } }));
  return { hook, onBoxed, press, stepTheBox };
}

const SELECTED_BEFORE: NodeGraphCanvasSelection = { cardIds: new Set(["clock"]), noteIds: new Set(["kept"]), linkIds: new Set(["clock_to_beat"]) };

describe("the box the pointer drags out", () => {
  it("adds what it holds to the selection kept at a Shift press, links joined to its cards included", () => {
    const { hook, onBoxed, press, stepTheBox } = boxDrawn(SELECTED_BEFORE, () => ["follow", "note:new"]);
    press({ shiftKey: true });
    expect(hook.current?.isABoxPossible()).toBe(true);
    stepTheBox(40);
    expect(onBoxed).toHaveBeenLastCalledWith({ cardIds: new Set(["clock", "follow"]), noteIds: new Set(["kept", "new"]), linkIds: new Set(["clock_to_beat"]) });
  });

  it("takes away a card it holds with Ctrl, and the links joined to it", () => {
    const { onBoxed, press, stepTheBox } = boxDrawn(SELECTED_BEFORE, () => ["clock"]);
    press({ ctrlKey: true });
    stepTheBox(40);
    expect(onBoxed).toHaveBeenLastCalledWith({ cardIds: new Set(), noteIds: new Set(["kept"]), linkIds: new Set() });
  });

  it("follows every step of the box from the selection at the press, so a card it lets go of again is not left selected", () => {
    let inTheBox = ["follow"];
    const { onBoxed, press, stepTheBox } = boxDrawn(SELECTED_BEFORE, () => inTheBox);
    press({});
    stepTheBox(40);
    inTheBox = [];
    stepTheBox(10);
    expect(onBoxed).toHaveBeenLastCalledWith({ cardIds: new Set(), noteIds: new Set(), linkIds: new Set() });
  });

  it("follows no box after the press is let go, and none from a press on a card without Shift", () => {
    const { hook, onBoxed, press, stepTheBox } = boxDrawn(SELECTED_BEFORE, () => ["follow"]);
    press({});
    window.dispatchEvent(new Event("pointerup"));
    expect(hook.current?.isABoxPossible()).toBe(false);
    press({ target: document.createElement("div") });
    expect(hook.current?.isABoxPossible()).toBe(false);
    stepTheBox(40);
    expect(onBoxed).not.toHaveBeenCalled();
  });

  it("counts a redraw when React Flow marks a card otherwise than the selection the box leaves", () => {
    const { hook, press, stepTheBox } = boxDrawn(SELECTED_BEFORE, () => ["follow"]);
    act(() => hook.store?.getState().setNodes([{ id: "clock", position: { x: 0, y: 0 }, data: {}, selected: false }]));
    press({ shiftKey: true });
    const redrawnBefore = hook.current?.boxMarksRedrawn ?? 0;
    stepTheBox(40);
    expect(hook.current?.boxMarksRedrawn).toBe(redrawnBefore + 1);
  });
});
