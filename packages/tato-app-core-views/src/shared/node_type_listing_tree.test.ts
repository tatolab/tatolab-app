import { expect, test } from "vitest";
import type { NodeTypeListed, NodeTypeSourceListed } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeTypeSourceChildren, shownStudioTreeRows } from "./node_type_listing_tree";

const nodeTypeOf = (nodeType: string, category: string): NodeTypeListed => ({ node_type: nodeType, documentation: "", category, kind: "process", described_from: "interpreter" });

const rowsOfTheSource = (nodeTypes: NodeTypeListed[]) => {
  const source: NodeTypeSourceListed = { source: "project", node_types: nodeTypes, graph_generators: [], unreadable_modules: [] };
  return shownStudioTreeRows(nodeTypeSourceChildren(source, new Map(), "source:project", "This project", "/p"), {});
};

test("a_category_inside_another_is_listed_under_it_before_its_own_node_types_and_a_node_type_served_with_none_comes_last", () => {
  const rows = rowsOfTheSource([
    nodeTypeOf("nodes.fx:Invert", "Effects"),
    nodeTypeOf("nodes.fx:Posterize", "Effects/Stylize"),
    nodeTypeOf("nodes.fx:Dots", "Effects/Stylize/Halftone"),
    nodeTypeOf("nodes.math:Add", "Math"),
    nodeTypeOf("nodes.loose:Loose", ""),
  ]);
  expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label}`)).toEqual([
    "Effects",
    "  Stylize",
    "    Halftone",
    "      Dots",
    "    Posterize",
    "  Invert",
    "Math",
    "  Add",
    "Ungrouped",
    "  Loose",
  ]);
});

test("each_row_is_keyed_by_its_categorys_whole_path_so_two_categories_of_one_name_stay_apart", () => {
  const rows = rowsOfTheSource([nodeTypeOf("nodes.a:A", "Effects/Color"), nodeTypeOf("nodes.b:B", "Filters/Color"), nodeTypeOf("nodes.c:C", "Effects")]);
  expect(rows.map(({ row }) => row.row_id)).toEqual([
    "source:project/category:Effects",
    "source:project/category:Effects/Color",
    "source:project/category:Effects/Color/node_type:nodes.a:A",
    "source:project/category:Effects/node_type:nodes.c:C",
    "source:project/category:Filters",
    "source:project/category:Filters/Color",
    "source:project/category:Filters/Color/node_type:nodes.b:B",
  ]);
});
