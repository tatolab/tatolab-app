import { expect, test } from "vitest";
import { levelOfTheSelection, nodesTheSelectionHolds, nodesTheSelectionHoldsInTheStream, selectionOfTheNodes } from "./nodes_of_the_selection";

test("a selection of nodes inside a subgraph names its level, and is read only at that level", () => {
  const insideTheLook = selectionOfTheNodes("main", ["blur", "grain"], ["look-id"]);
  expect(insideTheLook).toEqual({ kind: "nodes", stream: "main", nodes: ["blur", "grain"], level: ["look-id"] });
  expect(levelOfTheSelection(insideTheLook)).toEqual(["look-id"]);
  expect(nodesTheSelectionHoldsInTheStream(insideTheLook, "main", ["look-id"])).toEqual(["blur", "grain"]);
  expect(nodesTheSelectionHoldsInTheStream(insideTheLook, "main")).toEqual([]);
  expect(nodesTheSelectionHolds(insideTheLook, ["look-id", "inner-id"])).toBeNull();
});

test("a selection at the stream's own level names no level", () => {
  const atTheTop = selectionOfTheNodes("main", ["camera"]);
  expect(atTheTop).toEqual({ kind: "node", stream: "main", node: "camera" });
  expect(nodesTheSelectionHolds(atTheTop)).toEqual({ stream: "main", nodes: ["camera"] });
  expect(nodesTheSelectionHoldsInTheStream(atTheTop, "main", ["look-id"])).toEqual([]);
  expect(selectionOfTheNodes("main", [])).toBeNull();
});
