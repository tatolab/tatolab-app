import { expect, test } from "vitest";
import type { NodeCatalogEntry, OpenProject, ProjectNodeTypeListing } from "@tatolab/tato-app-view-sdk/studio_readings";
import {
  GRAPH_GENERATORS_SEARCH_HEADING,
  THIS_PROJECT_SEARCH_ENTRY,
  graphGeneratorOfTheSearchItem,
  graphGeneratorSearchItems,
  nodeTypeOriginWordsByType,
  nodeTypeSearchItems,
  nodeTypeSearchNarrowing,
  nodeTypeSearchPreviewCard,
  nodeTypesTheProjectDeclares,
  nodeTypesTheSearchOffers,
} from "./stream_graph_node_type_search";

const catalogEntry = (type: string, description: string, category: string | null, inputs: [string, "image" | "array" | null][], outputs: [string, "image" | "array" | null][]): NodeCatalogEntry => ({
  type,
  description,
  category,
  config_schema: null,
  inputs: inputs.map(([name, family]) => ({ name, description: "", family, pin: null, input_mode: null, annotations: {} })),
  outputs: outputs.map(([name, family]) => ({ name, description: "", family, pin: null, input_mode: null, annotations: {} })),
});
const BLUR = catalogEntry("nodes.blur:GaussianBlur", "Softens an image", "Effects/Blur", [["video_in", "image"]], [["video_out", "image"]]);
const METER = catalogEntry("tatolab.stream.Meter", "Reads a level", null, [["level", "array"]], []);

/** A node type as the catalog lists it once each setting is an input: its port `video_in`, then its settings, each with no family and taking no wire. */
const A_SETTING = { mode: "setting_only", read: "at_setup" } as const;
const BLUR_LISTING_ITS_SETTINGS: NodeCatalogEntry = {
  ...BLUR,
  inputs: [
    { name: "video_in", description: "", family: "image", pin: null, input_mode: null, annotations: {} },
    { name: "gain", description: "How loud.", family: null, pin: { pin_type: { kind: "is", pin_type: { type: "float" } }, flow: "value" }, input_mode: A_SETTING, annotations: {} },
    { name: "layers", description: "", family: null, pin: null, input_mode: A_SETTING, annotations: {} },
  ],
};
const TONE_OF_SETTINGS_ONLY: NodeCatalogEntry = { ...catalogEntry("nodes.tone:Tone", "Makes a tone", null, [], [["tone", "array"]]), inputs: BLUR_LISTING_ITS_SETTINGS.inputs.slice(1) };

const NIGHT_SHOW: OpenProject = {
  project: { folder: "/p", project: "p-uuid", name: "Night Show" },
  imports: [],
  imports_not_listed_because: null,
};

test("each_catalog_type_is_offered_titled_in_words_under_the_category_the_runtime_serves_and_never_under_its_module", () => {
  expect(nodeTypeSearchItems([BLUR, METER], null, new Set(["tatolab.stream.Meter"]), new Map([["tatolab.stream.Meter", "Night Show"]]))).toEqual([
    { item_id: "nodes.blur:GaussianBlur", title: "Gaussian Blur", summary: "Softens an image", origin_words: null, category_path: ["Effects", "Blur"], listed_above_the_categories: null },
    { item_id: "tatolab.stream.Meter", title: "Meter", summary: "Reads a level", origin_words: "Night Show", category_path: [], listed_above_the_categories: { entry: THIS_PROJECT_SEARCH_ENTRY, heading: THIS_PROJECT_SEARCH_ENTRY } },
  ]);
});

test("a_loose_wire_offers_only_the_node_types_with_a_port_of_its_family_on_the_other_side", () => {
  expect(nodeTypeSearchItems([BLUR, METER], { side: "output", family: "image" }).map((item) => item.item_id)).toEqual(["nodes.blur:GaussianBlur"]);
  expect(nodeTypeSearchItems([BLUR, METER], { side: "input", family: "image" }).map((item) => item.item_id)).toEqual(["nodes.blur:GaussianBlur"]);
  expect(nodeTypeSearchItems([BLUR, METER], { side: "input", family: "array" })).toEqual([]);
});

test("a_loose_wire_offers_no_node_type_for_a_setting_it_lists_among_its_inputs", () => {
  expect(nodeTypeSearchItems([BLUR_LISTING_ITS_SETTINGS, TONE_OF_SETTINGS_ONLY], { side: "output", family: "image" }).map((item) => item.item_id)).toEqual(["nodes.blur:GaussianBlur"]);
  expect(nodeTypeSearchItems([BLUR_LISTING_ITS_SETTINGS, TONE_OF_SETTINGS_ONLY], { side: "output", family: "array" })).toEqual([]);
  expect(nodeTypeSearchItems([TONE_OF_SETTINGS_ONLY], { side: "output", family: null })).toEqual([]);
  expect(nodeTypeSearchItems([TONE_OF_SETTINGS_ONLY], { side: "input", family: "array" }).map((item) => item.item_id)).toEqual(["nodes.tone:Tone"]);
});

test("a_previewed_card_draws_no_setting_as_an_input_pin", () => {
  expect(nodeTypeSearchPreviewCard([BLUR_LISTING_ITS_SETTINGS], BLUR_LISTING_ITS_SETTINGS.type)?.inputs.map((pin) => pin.name)).toEqual(["video_in"]);
  expect(nodeTypeSearchPreviewCard([TONE_OF_SETTINGS_ONLY], TONE_OF_SETTINGS_ONLY.type)?.inputs).toEqual([]);
});

test("a_node_type_is_named_for_the_open_project_its_import_or_its_distribution_and_for_nothing_the_runtime_does_not_name", () => {
  const nodeTypeOf = (type: string) => ({ type, kind: "process", description: "", category: "Effects", inputs: null, outputs: null, path: null, line: null });
  const listing: ProjectNodeTypeListing = {
    project_directory: "/p",
    project: "p-uuid",
    project_name: "Night Show",
    sources: [
      { origin: { source: "project" }, node_types: [nodeTypeOf("nodes.invert:Invert")], graph_generators: [], unreadable_modules: [] },
      { origin: { source: "dependency", project: "lights-uuid", folder: "lights", version: "1.0.0", project_name: "Stage Lights" }, node_types: [nodeTypeOf("imports/lights/nodes.dmx:Fixture")], graph_generators: [], unreadable_modules: [] },
      { origin: { source: "dependency", project: "gone-uuid", folder: "gone", version: "1.0.0", project_name: null }, node_types: [nodeTypeOf("imports/gone/nodes.x:X")], graph_generators: [], unreadable_modules: [] },
      { origin: { source: "installed_distribution", distribution: "tatolab-testpattern", distribution_version: "1.0.0" }, node_types: [nodeTypeOf("tatolab_testpattern:TestPatternSource")], graph_generators: [], unreadable_modules: [] },
      { origin: { source: "newer_than_this_app", source_name: "marketplace_module" }, node_types: [nodeTypeOf("lens:Lens")], graph_generators: [], unreadable_modules: [] },
    ],
  };
  expect([...nodeTypeOriginWordsByType(listing, NIGHT_SHOW)]).toEqual([
    ["nodes.invert:Invert", "Night Show"],
    ["imports/lights/nodes.dmx:Fixture", "Stage Lights"],
    ["tatolab_testpattern:TestPatternSource", "tatolab-testpattern"],
  ]);
  expect([...nodeTypeOriginWordsByType(listing, null)]).toEqual([
    ["imports/lights/nodes.dmx:Fixture", "Stage Lights"],
    ["tatolab_testpattern:TestPatternSource", "tatolab-testpattern"],
  ]);
  expect([...nodeTypeOriginWordsByType(null, NIGHT_SHOW)]).toEqual([]);
});

test("a_loose_wire_narrows_the_search_to_what_takes_or_gives_its_family_and_says_placing_one_links_it", () => {
  expect(nodeTypeSearchNarrowing({ node_id: "camera", pin: "video", side: "output", family: "image" })).toEqual({
    heading: "Takes Image",
    footnote: "Placing one adds it and links video to its first Image input, in one edit. One undo takes both back.",
  });
  expect(nodeTypeSearchNarrowing({ node_id: "meter", pin: "level", side: "input", family: null }).heading).toBe("Can feed level");
});

test("offers each node type the project, its imports and its installed distributions declare that the stream's catalog does not list yet, its ports as declared", () => {
  const listing: ProjectNodeTypeListing = {
    project_directory: "/p",
    project: "p-uuid",
    project_name: "Night Show",
    sources: [
      {
        origin: { source: "project" },
        node_types: [
          { type: "nodes.invert:Invert", kind: "process", description: "Inverts each frame", category: "Effects", inputs: [{ name: "video_in", description: "", family: "image", annotation: null }], outputs: [{ name: "video_out", description: "", family: "image", annotation: null }], path: "nodes/invert.py", line: 4 },
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
  expect(offered.map((entry) => entry.type)).toEqual(["nodes.blur:GaussianBlur", "nodes.invert:Invert", "nodes.native:Half", "tatolab_testpattern:TestPatternSource"]);
  expect(offered[0]).toBe(BLUR);
  expect(offered[1]).toEqual({ type: "nodes.invert:Invert", description: "Inverts each frame", category: "Effects", config_schema: null, inputs: [{ name: "video_in", description: "", family: "image", pin: null, input_mode: null, annotations: {} }], outputs: [{ name: "video_out", description: "", family: "image", pin: null, input_mode: null, annotations: {} }] });
  expect(offered[2]?.inputs).toEqual([]);
  expect(nodeTypesTheSearchOffers([BLUR], null)).toEqual([BLUR]);
  expect([...nodeTypesTheProjectDeclares(listing)]).toEqual(["nodes.invert:Invert", "nodes.blur:GaussianBlur", "nodes.native:Half"]);
});

test("each_graph_generator_of_the_projects_own_source_is_offered_under_this_project_as_a_subgraph_and_none_for_a_loose_wire", () => {
  const listing: ProjectNodeTypeListing = {
    project_directory: "/p",
    project: "p-uuid",
    project_name: "Night Show",
    sources: [
      { origin: { source: "project" }, node_types: [], graph_generators: [{ generator: "generators.mics:mic_levels", description: "A level meter per microphone", promoted_config: [], path: "generators/mics.py", line: 3 }], unreadable_modules: [] },
      { origin: { source: "dependency", project: "lights-uuid", folder: "lights", version: "1.0.0", project_name: "Stage Lights" }, node_types: [], graph_generators: [{ generator: "generators.dmx:fixtures", description: "", promoted_config: [], path: "imports/lights/generators/dmx.py", line: 1 }], unreadable_modules: [] },
    ],
  };
  const offered = graphGeneratorSearchItems(listing, null, NIGHT_SHOW);
  expect(offered).toEqual([
    {
      item_id: "graph_generator:generators.mics:mic_levels",
      title: "Mic Levels",
      summary: "A level meter per microphone",
      origin_words: "Night Show",
      category_path: null,
      listed_above_the_categories: { entry: THIS_PROJECT_SEARCH_ENTRY, heading: GRAPH_GENERATORS_SEARCH_HEADING },
    },
  ]);
  expect(offered.map((item) => graphGeneratorOfTheSearchItem(item.item_id))).toEqual(["generators.mics:mic_levels"]);
  expect(graphGeneratorOfTheSearchItem("nodes.blur:GaussianBlur")).toBeNull();
  expect(graphGeneratorSearchItems(listing, { side: "output", family: "image" })).toEqual([]);
  expect(graphGeneratorSearchItems(null, null)).toEqual([]);
});

test("a_previewed_pin_shows_the_type_its_node_type_states_exactly_and_none_where_another_pin_decides_it", () => {
  const typed: NodeCatalogEntry = {
    ...BLUR,
    inputs: [{ name: "video_in", description: "Frames", family: "image", pin: { pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream" }, input_mode: null, annotations: {} }],
    outputs: [{ name: "video_out", description: "", family: "image", pin: { pin_type: { kind: "same_as_input", input_port_name: "video_in" }, flow: "stream" }, input_mode: null, annotations: {} }],
  };
  const previewCard = nodeTypeSearchPreviewCard([typed], typed.type);
  expect(previewCard?.inputs.map((pin) => [pin.pin, pin.description])).toEqual([[{ pin_type: { type: "texture" }, flow: "stream" }, "Frames"]]);
  expect(previewCard?.outputs.map((pin) => pin.pin)).toEqual([null]);
});

test("a_node_type_is_previewed_as_its_card_titled_in_words_with_its_pins_and_a_graph_generator_as_nothing", () => {
  expect(nodeTypeSearchPreviewCard([BLUR, METER], "nodes.blur:GaussianBlur")).toEqual({
    title: "Gaussian Blur",
    inputs: [{ name: "video_in", pin: null, family: "image", description: null, annotations: {}, stream_facts_words: [], value_address: null }],
    outputs: [{ name: "video_out", pin: null, family: "image", description: null, annotations: {}, stream_facts_words: [], value_address: null }],
  });
  expect(nodeTypeSearchPreviewCard([BLUR, METER], "graph_generator:generators.mics:mic_levels")).toBeNull();
});
