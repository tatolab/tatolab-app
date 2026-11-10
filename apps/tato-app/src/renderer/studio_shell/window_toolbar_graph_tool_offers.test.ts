import { expect, test } from "vitest";
import type { WindowToolbarGraphTool } from "@tatolab/tato-app-view-sdk";
import { WindowToolbarGraphToolOffers } from "./window_toolbar_graph_tool_offers";

const EVERY_TOOL_ENABLED = (["add_node", "frame_selection", "add_note", "add_subgraph"] as const).map((tool) => ({ tool, disabled_reason: null }));

test("shows an offer only once it names its tools, then the area the person works in, and a press reaches only the offer shown", () => {
  const offers = new WindowToolbarGraphToolOffers();
  const pressed: string[] = [];
  const firstArea = offers.offerFrom("graph-a", (tool: WindowToolbarGraphTool) => pressed.push(`a:${tool}`));
  expect(offers.shown.readLatest()).toBeNull();
  if (firstArea.kind !== "offered") return expect.unreachable("the toolbar refused the offer");
  void firstArea.show(EVERY_TOOL_ENABLED);
  expect(offers.shown.readLatest()?.area_id).toBe("graph-a");

  const secondArea = offers.offerFrom("graph-b", (tool: WindowToolbarGraphTool) => pressed.push(`b:${tool}`));
  expect(offers.shown.readLatest()?.area_id).toBe("graph-a");
  if (secondArea.kind !== "offered") return expect.unreachable("the toolbar refused the offer");
  void secondArea.show(EVERY_TOOL_ENABLED);
  expect(offers.shown.readLatest()?.area_id).toBe("graph-b");

  offers.personWorkedInTheArea("graph-a");
  offers.shown.readLatest()?.press("add_note");
  expect(pressed).toEqual(["a:add_note"]);

  firstArea.withdraw();
  expect(offers.shown.readLatest()?.area_id).toBe("graph-b");
});
