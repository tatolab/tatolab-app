import { expect, test } from "vitest";
import { aGraphNode, aGraphPort, aStreamGraph } from "../stream_graph_builders.js";
import type { NodeTypeDescription, NodeTypeInputDescribed } from "../studio_readings.js";
import { settingOfTheDescribedInput } from "./node_pins.js";
import { settingsOfTheNodeNotAmongItsPorts, settingValuesOfTheGraph, valueReadOfTheSetting } from "./node_settings.js";

/** Test Pattern as the runtime describes a node type not yet typed: a stream output, and its config's `width` and `height` as settings read at setup, `height` with a default. */
const WIDTH: NodeTypeInputDescribed = { name: "width", documentation: "Canvas width.", mode: "setting_only", read: "at_setup" };
const HEIGHT: NodeTypeInputDescribed = { name: "height", documentation: "", mode: "setting_only", read: "at_setup", default_value: 720 };
const TEST_PATTERN: Pick<NodeTypeDescription, "inputs"> = { inputs: [{ name: "frames", documentation: "", mode: "wire_only" }, WIDTH, HEIGHT] };

test("a_nodes_settings_not_among_its_ports_are_those_its_type_describes_that_its_graph_lists_as_no_input_port", () => {
  const exposedWidth = aGraphNode("pattern", { inputs: [aGraphPort("frames", { pin_type: { type: "texture" }, flow: "stream" }), aGraphPort("width")] });
  expect(settingsOfTheNodeNotAmongItsPorts(TEST_PATTERN, exposedWidth).map((setting) => setting.name)).toEqual(["height"]);
  expect(settingsOfTheNodeNotAmongItsPorts(TEST_PATTERN, aGraphNode("pattern")).map((setting) => setting.name)).toEqual(["width", "height"]);
  expect(settingsOfTheNodeNotAmongItsPorts(undefined, aGraphNode("pattern"))).toEqual([]);
});

test("a_setting_reads_the_value_its_graph_document_holds_else_its_types_default_else_nothing", () => {
  const node = aGraphNode("pattern", { input_values: { width: 640 } });
  expect(valueReadOfTheSetting(node, WIDTH)).toEqual({ value: 640, comes_from: "saved" });
  expect(valueReadOfTheSetting(node, HEIGHT)).toEqual({ value: 720, comes_from: "default" });
  expect(valueReadOfTheSetting(aGraphNode("pattern"), WIDTH)).toEqual({ value: null, comes_from: null });
});

test("a_graphs_setting_values_name_each_setting_at_its_level_inside_a_subgraph_too", () => {
  const inner = aGraphNode("inner", { id: "INNER-ID", type: "nodes.pattern:TestPattern", input_values: { height: 360 } });
  const outer = aGraphNode("outer", { id: "OUTER-ID", type: "nodes.pattern:TestPattern", input_values: { width: 1920 } });
  const subgraph = aGraphNode("look", { id: "LOOK-ID", fragment: { nodes: [inner], links: [], groups: [] } });
  const described = new Map([["nodes.pattern:TestPattern", TEST_PATTERN]]);
  expect(settingValuesOfTheGraph(aStreamGraph([outer, subgraph], []), described)).toEqual([
    { level: [], node_id: "OUTER-ID", input: "width", member: null, value_read: { value: 1920, comes_from: "saved" } },
    { level: [], node_id: "OUTER-ID", input: "height", member: null, value_read: { value: 720, comes_from: "default" } },
    { level: ["LOOK-ID"], node_id: "INNER-ID", input: "width", member: null, value_read: { value: null, comes_from: null } },
    { level: ["LOOK-ID"], node_id: "INNER-ID", input: "height", member: null, value_read: { value: 360, comes_from: "saved" } },
  ]);
});

test("a_setting_states_when_its_node_reads_it_at_setup_by_default_and_an_input_that_takes_a_wire_is_no_setting", () => {
  expect(settingOfTheDescribedInput({ mode: "setting_only", read: "at_setup" })).toEqual({ read: "at_setup" });
  expect(settingOfTheDescribedInput({ mode: "setting_only" })).toEqual({ read: "at_setup" });
  expect(settingOfTheDescribedInput({ mode: "wire_or_value" })).toBeNull();
});
