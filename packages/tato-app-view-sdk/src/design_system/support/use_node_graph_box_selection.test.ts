import { describe, expect, it } from "vitest";
import { boxSelectionModeOf, selectionAfterTheBox } from "./use_node_graph_box_selection";

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
