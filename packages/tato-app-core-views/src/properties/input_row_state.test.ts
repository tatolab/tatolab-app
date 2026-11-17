import { NODE_STUDIO_FIELDS_NONE_SET, type StreamGraphNode } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { expect, test } from "vitest";
import { inputRowStateOf } from "./input_row_state";
import type { LinkedEndOfAPort } from "./properties_graph_edits";

const AMOUNT: InputAddress = { graph: { project_folder: "/projects/demo", stream_asset: "asset", level: [] }, node_id: "id-glow", input: "amount" };

const camera: StreamGraphNode = {
  id: "id-camera",
  name: "camera",
  type: "tatolab.ops:Camera",
  kind: "process",
  state: "Running",
  failed_because: null,
  process_raising_because: null,
  not_ready_because: null,
  config: {},
  pins: {},
  exposed_config_fields: [],
  input_ports: [],
  output_ports: [],
  dropped_bags_by_link: {},
  refused_bags_by_output_port: {},
  studio: NODE_STUDIO_FIELDS_NONE_SET,
  fragment: null,
  graph_interface: null,
};
const FROM_THE_CAMERA: LinkedEndOfAPort = { link: { id: "L1", source_node: "camera", source_port: "frames", target_node: "glow", target_port: "video", state: "wired" }, node: camera, port: "frames" };

test("an input a link at its level feeds is wired by that link, though the runtime's reading still gives it a value of its own", () => {
  expect(inputRowStateOf({ input: { family: "channels", value_address: AMOUNT }, value_comes_from: "saved", driven_by: [FROM_THE_CAMERA], is_editable: true })).toEqual({ kind: "wired", driven_by: [FROM_THE_CAMERA], can_be_disconnected: true });
  expect(inputRowStateOf({ input: { family: "image", value_address: null }, value_comes_from: "wire", driven_by: [FROM_THE_CAMERA], is_editable: false })).toEqual({ kind: "wired", driven_by: [FROM_THE_CAMERA], can_be_disconnected: false });
});

test("an unwired input holding a value is addressed, and offers a promotion where its family is one a client writes and the graph can be edited", () => {
  expect(inputRowStateOf({ input: { family: "channels", value_address: AMOUNT }, value_comes_from: "default", driven_by: [], is_editable: true })).toEqual({ kind: "holds_a_value", address: AMOUNT, can_be_promoted: true });
  expect(inputRowStateOf({ input: { family: "channels", value_address: AMOUNT }, value_comes_from: "default", driven_by: [], is_editable: false })).toEqual({ kind: "holds_a_value", address: AMOUNT, can_be_promoted: false });
  expect(inputRowStateOf({ input: { family: null, value_address: AMOUNT }, value_comes_from: "saved", driven_by: [], is_editable: true })).toEqual({ kind: "holds_a_value", address: AMOUNT, can_be_promoted: false });
});

test("an Image or Packets input offers no promotion, since a Graph Input of either runs nothing", () => {
  expect(inputRowStateOf({ input: { family: "image", value_address: null }, value_comes_from: null, driven_by: [], is_editable: true })).toEqual({ kind: "not_connected", can_be_promoted: false });
  expect(inputRowStateOf({ input: { family: "packets", value_address: null }, value_comes_from: null, driven_by: [], is_editable: true })).toEqual({ kind: "not_connected", can_be_promoted: false });
  expect(inputRowStateOf({ input: { family: "records", value_address: null }, value_comes_from: null, driven_by: [], is_editable: true })).toEqual({ kind: "not_connected", can_be_promoted: true });
});

test("an input the runtime reads from a wire that no link at its level holds is named only as wired", () => {
  expect(inputRowStateOf({ input: { family: "channels", value_address: null }, value_comes_from: "wire", driven_by: [], is_editable: true })).toEqual({ kind: "wired_from_outside_the_level" });
});
