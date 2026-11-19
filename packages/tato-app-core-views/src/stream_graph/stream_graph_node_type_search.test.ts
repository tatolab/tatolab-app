import { expect, test } from "vitest";
import type { ListNodeTypesToolResult, NodeTypeDescription, NodeTypeInputDescribed, NodeTypeSourceListed, OpenProject, ProjectNodeTypesDescribed } from "@tatolab/tato-app-view-sdk/studio_readings";
import {
  GRAPH_GENERATORS_SEARCH_HEADING,
  THIS_PROJECT_SEARCH_ENTRY,
  graphGeneratorOfTheSearchItem,
  graphGeneratorSearchItems,
  nodeTypeSearchItems,
  nodeTypeSearchNarrowing,
  nodeTypeSearchPreviewCard,
  nodeTypesTheSearchOffers,
  type NodeTypeOffered,
} from "./stream_graph_node_type_search";

/** A port of a node type not yet typed, as its description describes it: its family alone. */
const untypedPort = ([name, family]: [string, "image" | "array" | null]) => ({ name, documentation: "", ...(family === null ? {} : { family: { family } }) });

const describedNodeType = (type: string, documentation: string, inputs: [string, "image" | "array" | null][], outputs: [string, "image" | "array" | null][]): NodeTypeDescription => ({
  node_type: type,
  described_from: "interpreter",
  documentation,
  inputs: inputs.map((input): NodeTypeInputDescribed => ({ ...untypedPort(input), mode: "wire_or_value" })),
  outputs: outputs.map(untypedPort),
  source: "built_in",
});

const BUILT_IN: NodeTypeSourceListed = { source: "built_in", node_types: [], graph_generators: [], unreadable_modules: [] };
const THE_PROJECT: NodeTypeSourceListed = { source: "project", node_types: [], graph_generators: [], unreadable_modules: [] };

/** `described` offered as listed in `source` under `category`, described as it is, or with no description where `isDescribed` is false. */
const offeredFrom = (source: NodeTypeSourceListed, described: NodeTypeDescription, category: string | null = null, isDescribed = true): NodeTypeOffered => ({
  listed: { node_type: described.node_type, documentation: described.documentation, category, kind: "process", described_from: "interpreter" },
  source,
  described: isDescribed ? described : null,
});

const BLUR = describedNodeType("nodes.blur:GaussianBlur", "Softens an image", [["video_in", "image"]], [["video_out", "image"]]);
const METER = describedNodeType("tatolab.stream.Meter", "Reads a level", [["level", "array"]], []);

/** A node type as its description lists it once each setting is an input: its port `video_in`, then its settings, each with no family and taking no wire. */
const A_SETTING = { mode: "setting_only", read: "at_setup" } as const;
const BLUR_LISTING_ITS_SETTINGS: NodeTypeDescription = {
  ...BLUR,
  inputs: [
    { name: "video_in", documentation: "", family: { family: "image" }, mode: "wire_only" },
    { name: "gain", documentation: "How loud.", pin_type: { kind: "is", pin_type: { type: "float" } }, flow: "value", ...A_SETTING },
    { name: "layers", documentation: "", ...A_SETTING },
  ],
};
const TONE_OF_SETTINGS_ONLY: NodeTypeDescription = { ...describedNodeType("nodes.tone:Tone", "Makes a tone", [], [["tone", "array"]]), inputs: BLUR_LISTING_ITS_SETTINGS.inputs.slice(1) };

const offered = (...nodeTypes: NodeTypeDescription[]) => nodeTypes.map((nodeType) => offeredFrom(BUILT_IN, nodeType));

const NIGHT_SHOW: OpenProject = {
  project: { folder: "/p", project: "p-uuid", name: "Night Show" },
  imports: [],
  imports_not_listed_because: null,
};

test("each_node_type_is_offered_titled_in_words_under_the_category_the_runtime_serves_and_never_under_its_module", () => {
  expect(nodeTypeSearchItems([offeredFrom(BUILT_IN, BLUR, "Effects/Blur"), offeredFrom(THE_PROJECT, METER)], null, NIGHT_SHOW)).toEqual([
    { item_id: "nodes.blur:GaussianBlur", title: "Gaussian Blur", summary: "Softens an image", origin_words: null, category_path: ["Effects", "Blur"], listed_above_the_categories: null },
    { item_id: "tatolab.stream.Meter", title: "Meter", summary: "Reads a level", origin_words: "Night Show", category_path: [], listed_above_the_categories: { entry: THIS_PROJECT_SEARCH_ENTRY, heading: THIS_PROJECT_SEARCH_ENTRY } },
  ]);
});

test("a_loose_wire_the_runtime_answered_for_offers_only_the_node_types_it_named", () => {
  expect(nodeTypeSearchItems(offered(BLUR, METER), new Map([["nodes.blur:GaussianBlur", "video_in"]])).map((item) => item.item_id)).toEqual(["nodes.blur:GaussianBlur"]);
  expect(nodeTypeSearchItems(offered(BLUR, METER), new Map())).toEqual([]);
});

test("a_previewed_card_draws_no_setting_as_an_input_pin", () => {
  expect(nodeTypeSearchPreviewCard(offered(BLUR_LISTING_ITS_SETTINGS), BLUR_LISTING_ITS_SETTINGS.node_type)?.inputs.map((pin) => pin.name)).toEqual(["video_in"]);
  expect(nodeTypeSearchPreviewCard(offered(TONE_OF_SETTINGS_ONLY), TONE_OF_SETTINGS_ONLY.node_type)?.inputs).toEqual([]);
});

test("a_node_type_is_named_for_the_open_project_its_import_or_its_distribution_and_for_nothing_the_runtime_does_not_name", () => {
  const nodeType = describedNodeType("nodes.x:X", "", [], []);
  const originOf = (source: NodeTypeSourceListed, openProject: OpenProject | null) => nodeTypeSearchItems([offeredFrom(source, nodeType)], null, openProject)[0]?.origin_words;
  const lights: NodeTypeSourceListed = { source: "dependency", project: "lights-uuid", folder: "lights", version: "1.0.0", project_name: "Stage Lights", node_types: [], graph_generators: [], unreadable_modules: [] };
  const gone: NodeTypeSourceListed = { source: "dependency", project: "gone-uuid", folder: "gone", version: "1.0.0", project_name: null, node_types: [], graph_generators: [], unreadable_modules: [] };
  const testPattern: NodeTypeSourceListed = { source: "installed_distribution", distribution: "tatolab-testpattern", distribution_version: "1.0.0", node_types: [], graph_generators: [], unreadable_modules: [] };
  expect([THE_PROJECT, lights, gone, testPattern, BUILT_IN].map((source) => originOf(source, NIGHT_SHOW))).toEqual(["Night Show", "Stage Lights", null, "tatolab-testpattern", null]);
  expect(originOf(THE_PROJECT, null)).toBeNull();
});

test("a_loose_wire_narrows_the_search_to_what_takes_or_feeds_its_pin_and_says_placing_one_links_it", () => {
  expect(nodeTypeSearchNarrowing({ node_id: "camera", pin: "video", side: "output" })).toEqual({
    heading: "Can take video",
    footnote: "Placing one adds it and links video to the first input the runtime says it fits, in one edit. One undo takes both back.",
  });
  expect(nodeTypeSearchNarrowing({ node_id: "meter", pin: "level", side: "input" }).heading).toBe("Can feed level");
});

test("offers each node type the listing names once, in the order of its sources, with its description, and nothing before the project is listed", () => {
  const listed = (nodeType: string) => ({ node_type: nodeType, documentation: "", category: null, kind: "process" as const, described_from: "interpreter" as const });
  const listing: ListNodeTypesToolResult = {
    project_directory: "/p",
    project: "p-uuid",
    project_name: "Night Show",
    sources: [
      { ...THE_PROJECT, node_types: [listed("nodes.invert:Invert"), listed("nodes.blur:GaussianBlur")] },
      { source: "installed_distribution", distribution: "tatolab-blur", distribution_version: "1.0.0", node_types: [listed("nodes.blur:GaussianBlur"), listed("tatolab_blur:Box")], graph_generators: [], unreadable_modules: [] },
    ],
  };
  const nodeTypes: ProjectNodeTypesDescribed = {
    listing,
    described: [BLUR, { node_type: "tatolab_blur:Box", not_described_because: { refusal_code: "refused", action: "describe_node_types", runtime_words: "the module does not import" }, source: "installed_distribution", distribution: "tatolab-blur", distribution_version: "1.0.0" }],
  };
  const offeredNow = nodeTypesTheSearchOffers(nodeTypes);
  expect(offeredNow.map((nodeType) => [nodeType.listed.node_type, nodeType.source.source, nodeType.described?.node_type ?? null])).toEqual([
    ["nodes.invert:Invert", "project", null],
    ["nodes.blur:GaussianBlur", "project", "nodes.blur:GaussianBlur"],
    ["tatolab_blur:Box", "installed_distribution", null],
  ]);
  expect(nodeTypesTheSearchOffers(null)).toEqual([]);
});

test("each_graph_generator_of_the_projects_own_source_is_offered_under_this_project_as_a_subgraph_and_none_for_a_loose_wire", () => {
  const listing: ListNodeTypesToolResult = {
    project_directory: "/p",
    project: "p-uuid",
    project_name: "Night Show",
    sources: [
      { ...THE_PROJECT, graph_generators: [{ generator: "generators.mics:mic_levels", description: "A level meter per microphone", promoted_settings: [], path: "generators/mics.py", line: 3 }] },
      {
        source: "dependency",
        project: "lights-uuid",
        folder: "lights",
        version: "1.0.0",
        project_name: "Stage Lights",
        node_types: [],
        graph_generators: [{ generator: "generators.dmx:fixtures", description: "", promoted_settings: [], path: "imports/lights/generators/dmx.py", line: 1 }],
        unreadable_modules: [],
      },
    ],
  };
  const generatorsOffered = graphGeneratorSearchItems(listing, null, NIGHT_SHOW);
  expect(generatorsOffered).toEqual([
    {
      item_id: "graph_generator:generators.mics:mic_levels",
      title: "Mic Levels",
      summary: "A level meter per microphone",
      origin_words: "Night Show",
      category_path: null,
      listed_above_the_categories: { entry: THIS_PROJECT_SEARCH_ENTRY, heading: GRAPH_GENERATORS_SEARCH_HEADING },
    },
  ]);
  expect(generatorsOffered.map((item) => graphGeneratorOfTheSearchItem(item.item_id))).toEqual(["generators.mics:mic_levels"]);
  expect(graphGeneratorOfTheSearchItem("nodes.blur:GaussianBlur")).toBeNull();
  expect(graphGeneratorSearchItems(listing, { node_id: "camera", pin: "video", side: "output" })).toEqual([]);
  expect(graphGeneratorSearchItems(null, null)).toEqual([]);
});

test("a_previewed_pin_shows_the_type_its_node_type_states_exactly_and_none_where_another_pin_decides_it", () => {
  const typed: NodeTypeDescription = {
    ...BLUR,
    inputs: [{ name: "video_in", documentation: "Frames", pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream", mode: "wire_only" }],
    outputs: [{ name: "video_out", documentation: "", pin_type: { kind: "same_as_input", input_port_name: "video_in" }, flow: "stream" }],
  };
  const previewCard = nodeTypeSearchPreviewCard(offered(typed), typed.node_type);
  expect(previewCard?.inputs.map((pin) => [pin.pin, pin.description])).toEqual([[{ pin_type: { type: "texture" }, flow: "stream" }, "Frames"]]);
  expect(previewCard?.outputs.map((pin) => pin.pin)).toEqual([null]);
});

test("a_node_type_is_previewed_as_its_card_titled_in_words_with_its_pins_and_a_graph_generator_as_nothing", () => {
  expect(nodeTypeSearchPreviewCard(offered(BLUR, METER), "nodes.blur:GaussianBlur")).toEqual({
    title: "Gaussian Blur",
    inputs: [{ name: "video_in", pin: null, family: "image", description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null }],
    outputs: [{ name: "video_out", pin: null, family: "image", description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null }],
  });
  expect(nodeTypeSearchPreviewCard(offered(BLUR, METER), "graph_generator:generators.mics:mic_levels")).toBeNull();
});
