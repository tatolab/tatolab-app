import { expect, test } from "vitest";
import type { NodeCatalogEntry } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeTypeSearchItems } from "./stream_graph_node_type_search";

const catalogEntry = (type: string, description: string, inputs: [string, "image" | "array" | null][], outputs: [string, "image" | "array" | null][]): NodeCatalogEntry => ({
  type,
  description,
  config_schema: null,
  inputs: inputs.map(([name, family]) => ({ name, description: "", family })),
  outputs: outputs.map(([name, family]) => ({ name, description: "", family })),
});
const BLUR = catalogEntry("nodes.blur:GaussianBlur", "Softens an image", [["video_in", "image"]], [["video_out", "image"]]);
const METER = catalogEntry("tatolab.stream.Meter", "Reads a level", [["level", "array"]], []);

test("each_catalog_type_is_offered_titled_in_words_under_its_module_and_a_loose_wire_offers_only_what_can_take_it", () => {
  expect(nodeTypeSearchItems([BLUR, METER], null)).toEqual([
    { item_id: "nodes.blur:GaussianBlur", title: "Gaussian Blur", summary: "Softens an image", category: "nodes.blur" },
    { item_id: "tatolab.stream.Meter", title: "Meter", summary: "Reads a level", category: "tatolab.stream" },
  ]);
  expect(nodeTypeSearchItems([BLUR, METER], { side: "output", family: "image" }).map((item) => item.item_id)).toEqual(["nodes.blur:GaussianBlur"]);
  expect(nodeTypeSearchItems([BLUR, METER], { side: "input", family: "array" })).toEqual([]);
});
