import { expect, test } from "vitest";
import { nodeTypeCategoryPath } from "./node_type_category_path";

test("a_served_category_reads_as_its_groups_outermost_first_and_none_served_as_no_group", () => {
  expect(nodeTypeCategoryPath("Effects")).toEqual(["Effects"]);
  expect(nodeTypeCategoryPath("Effects/Stylize")).toEqual(["Effects", "Stylize"]);
  expect(nodeTypeCategoryPath(" Effects / Stylize / ")).toEqual(["Effects", "Stylize"]);
  expect(nodeTypeCategoryPath("nodes.brightness_meter")).toEqual(["nodes.brightness_meter"]);
  expect(nodeTypeCategoryPath(null)).toEqual([]);
  expect(nodeTypeCategoryPath("")).toEqual([]);
});
