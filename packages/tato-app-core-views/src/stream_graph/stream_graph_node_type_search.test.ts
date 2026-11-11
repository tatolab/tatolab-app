import { expect, test } from "vitest";
import type { NodeCatalogEntry, ProjectNodeTypeListing } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeTypeSearchItems, nodeTypesTheSearchOffers } from "./stream_graph_node_type_search";

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

test("offers each node type the project and its imports declare, not an installed distribution's, that the stream's catalog does not list yet, its ports as declared", () => {
  const listing: ProjectNodeTypeListing = {
    project_directory: "/p",
    project: "p-uuid",
    project_name: "Night Show",
    sources: [
      {
        origin: { source: "project" },
        node_types: [
          { type: "nodes.invert:Invert", kind: "process", description: "Inverts each frame", category: "nodes.invert", inputs: [{ name: "video_in", description: "", family: "image", annotation: null }], outputs: [{ name: "video_out", description: "", family: "image", annotation: null }], path: "nodes/invert.py", line: 4 },
          { type: "nodes.blur:GaussianBlur", kind: "process", description: "Declared again", category: "nodes.blur", inputs: null, outputs: null, path: "nodes/blur.py", line: 1 },
          { type: "nodes.native:Half", kind: null, description: "", category: "nodes.native", inputs: null, outputs: null, path: null, line: null },
        ],
        graph_generators: [],
        unreadable_modules: [],
      },
      {
        origin: { source: "installed_distribution", distribution: "tatolab-testpattern", distribution_version: "1.0.0" },
        node_types: [{ type: "tatolab_testpattern:TestPatternSource", kind: "process", description: "", category: "tatolab_testpattern", inputs: [], outputs: [], path: null, line: null }],
        graph_generators: [],
        unreadable_modules: [],
      },
    ],
  };
  const offered = nodeTypesTheSearchOffers([BLUR], listing);
  expect(offered.map((entry) => entry.type)).toEqual(["nodes.blur:GaussianBlur", "nodes.invert:Invert", "nodes.native:Half"]);
  expect(offered[0]).toBe(BLUR);
  expect(offered[1]).toEqual({ type: "nodes.invert:Invert", description: "Inverts each frame", config_schema: null, inputs: [{ name: "video_in", description: "", family: "image" }], outputs: [{ name: "video_out", description: "", family: "image" }] });
  expect(offered[2]?.inputs).toEqual([]);
  expect(nodeTypesTheSearchOffers([BLUR], null)).toEqual([BLUR]);
});
