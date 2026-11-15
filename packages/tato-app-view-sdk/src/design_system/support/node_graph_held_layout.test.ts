import { describe, expect, it } from "vitest";
import { heldValuesNotShownYet, inCanvasPixels, onTheCanvasPixel, samePosition, sameSize, withEntriesSet, withoutTheIds } from "./node_graph_held_layout";

describe("the held layout of the node graph canvas", () => {
  it("gives back the same map when the graph shows none of what is held, so the canvas keeps its memoised nodes", () => {
    const held = new Map([["card_a", { x: 1, y: 2 }]]);
    expect(heldValuesNotShownYet(held, () => false)).toBe(held);
  });

  it("lets go of what the graph now shows", () => {
    const held = new Map([
      ["card_a", { x: 1, y: 2 }],
      ["card_b", { x: 3, y: 4 }],
    ]);
    expect([...heldValuesNotShownYet(held, (id) => id === "card_a")]).toEqual([["card_b", { x: 3, y: 4 }]]);
  });

  it("gives back the same map when none of the ids is held", () => {
    const held = new Map([["card_a", { x: 1, y: 2 }]]);
    expect(withoutTheIds(held, ["card_b"])).toBe(held);
    expect([...withoutTheIds(held, ["card_a"])]).toEqual([]);
  });

  it("sets each entry on a new map", () => {
    const held = new Map([["card_a", { x: 1, y: 2 }]]);
    const after = withEntriesSet(held, [{ id: "card_a", value: { x: 5, y: 6 } }, { id: "card_b", value: { x: 7, y: 8 } }]);
    expect(after).not.toBe(held);
    expect([...after]).toEqual([
      ["card_a", { x: 5, y: 6 }],
      ["card_b", { x: 7, y: 8 }],
    ]);
  });

  it("rounds a place and a size to whole canvas pixels", () => {
    expect(onTheCanvasPixel({ x: 1.4, y: 2.6 })).toEqual({ x: 1, y: 3 });
    expect(inCanvasPixels({ width: 10.5, height: 20.2 })).toEqual({ width: 11, height: 20 });
  });

  it("says two places or sizes are the same only when both are there and equal", () => {
    expect(samePosition({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(samePosition({ x: 1, y: 2 }, null)).toBe(false);
    expect(samePosition(undefined, undefined)).toBe(false);
    expect(sameSize({ width: 1, height: 2 }, { width: 1, height: 2 })).toBe(true);
    expect(sameSize({ width: 1, height: 2 }, undefined)).toBe(false);
  });
});
