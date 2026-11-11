import { describe, expect, it } from "vitest";
import { isPartOfTheGraphOutsideTheView, type NodeGraphPlacesInTheView } from "./node_graph_map_visibility";

function cardAt(x: number, y: number, hidden = false) {
  return { hidden, internals: { positionAbsolute: { x, y } }, measured: { width: 180, height: 80 } };
}

function placesInAView(transform: readonly [number, number, number], cards: ReturnType<typeof cardAt>[]): NodeGraphPlacesInTheView {
  return { transform, width: 600, height: 400, nodeLookup: new Map(cards.map((card, index) => [String(index), card])) };
}

describe("isPartOfTheGraphOutsideTheView", () => {
  it("hides the map while every card is in view, so it never covers a pin", () => {
    expect(isPartOfTheGraphOutsideTheView(placesInAView([0, 0, 1], [cardAt(20, 20), cardAt(400, 300)]))).toBe(false);
  });

  it("shows the map once a card reaches past an edge", () => {
    expect(isPartOfTheGraphOutsideTheView(placesInAView([0, 0, 1], [cardAt(20, 20), cardAt(500, 300)]))).toBe(true);
    expect(isPartOfTheGraphOutsideTheView(placesInAView([-40, 0, 1], [cardAt(20, 20)]))).toBe(true);
  });

  it("measures cards at the view's zoom", () => {
    expect(isPartOfTheGraphOutsideTheView(placesInAView([0, 0, 2], [cardAt(100, 100)]))).toBe(false);
    expect(isPartOfTheGraphOutsideTheView(placesInAView([0, 0, 2], [cardAt(150, 100)]))).toBe(true);
  });

  it("ignores hidden cards", () => {
    expect(isPartOfTheGraphOutsideTheView(placesInAView([0, 0, 1], [cardAt(20, 20), cardAt(900, 900, true)]))).toBe(false);
  });
});
