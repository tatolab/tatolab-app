import type { StreamGraphNode } from "@tatolab/tato-app-view-sdk/studio_readings";
import { aGraphLink, aGraphNode } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { expect, test } from "vitest";
import { inputRowStateOf } from "./input_row_state";
import type { LinkedEndOfAPort } from "./properties_graph_edits";

const FLOAT = { pin_type: { type: "float" }, flow: "value" } as const;
const STRING = { pin_type: { type: "string" }, flow: "value" } as const;
const TEXTURE = { pin_type: { type: "texture" }, flow: "stream" } as const;
const ENCODED_VIDEO = { pin_type: { type: "encoded_video" }, flow: "stream" } as const;

const AMOUNT: InputAddress = { graph: { project_folder: "/projects/demo", stream_asset: "asset", level: [] }, node_id: "id-glow", input: "amount", member: null };

const camera: StreamGraphNode = aGraphNode("camera", { id: "id-camera", type: "tatolab.ops:Camera", kind: "process", components: { state: "Running" } });
const FROM_THE_CAMERA: LinkedEndOfAPort = { link: aGraphLink("L1", ["camera", "frames"], ["glow", "video"]), node: camera, port: "frames" };

test("an input a link at its level feeds is wired by that link, though the runtime's reading still gives it a value of its own", () => {
  expect(inputRowStateOf({ input: { pin: FLOAT, value_address: AMOUNT, setting: null, takes_a_wire: true }, value_comes_from: "saved", driven_by: [FROM_THE_CAMERA], is_editable: true })).toEqual({ kind: "wired", driven_by: [FROM_THE_CAMERA], can_be_disconnected: true });
  expect(inputRowStateOf({ input: { pin: TEXTURE, value_address: null, setting: null, takes_a_wire: true }, value_comes_from: "wire", driven_by: [FROM_THE_CAMERA], is_editable: false })).toEqual({ kind: "wired", driven_by: [FROM_THE_CAMERA], can_be_disconnected: false });
});

test("an unwired input holding a value is addressed, and offers a promotion where its type is one a Graph Input chooses and the graph can be edited", () => {
  expect(inputRowStateOf({ input: { pin: FLOAT, value_address: AMOUNT, setting: null, takes_a_wire: true }, value_comes_from: "default", driven_by: [], is_editable: true })).toEqual({ kind: "holds_a_value", address: AMOUNT, can_be_promoted: true });
  expect(inputRowStateOf({ input: { pin: FLOAT, value_address: AMOUNT, setting: null, takes_a_wire: true }, value_comes_from: "default", driven_by: [], is_editable: false })).toEqual({ kind: "holds_a_value", address: AMOUNT, can_be_promoted: false });
  expect(inputRowStateOf({ input: { pin: null, value_address: AMOUNT, setting: null, takes_a_wire: true }, value_comes_from: "saved", driven_by: [], is_editable: true })).toEqual({ kind: "holds_a_value", address: AMOUNT, can_be_promoted: false });
});

test("a Texture or Encoded video input offers no promotion, since a client sets no value of either", () => {
  expect(inputRowStateOf({ input: { pin: TEXTURE, value_address: null, setting: null, takes_a_wire: true }, value_comes_from: null, driven_by: [], is_editable: true })).toEqual({ kind: "not_connected", can_be_promoted: false });
  expect(inputRowStateOf({ input: { pin: ENCODED_VIDEO, value_address: null, setting: null, takes_a_wire: true }, value_comes_from: null, driven_by: [], is_editable: true })).toEqual({ kind: "not_connected", can_be_promoted: false });
  expect(inputRowStateOf({ input: { pin: STRING, value_address: null, setting: null, takes_a_wire: true }, value_comes_from: null, driven_by: [], is_editable: true })).toEqual({ kind: "not_connected", can_be_promoted: true });
});

test("an input the runtime reads from a wire that no link at its level holds is named only as wired", () => {
  expect(inputRowStateOf({ input: { pin: FLOAT, value_address: null, setting: null, takes_a_wire: true }, value_comes_from: "wire", driven_by: [], is_editable: true })).toEqual({ kind: "wired_from_outside_the_level" });
});

test("an input the runtime marks as taking no wire offers no promotion, since no Graph Input's link can end at it", () => {
  expect(inputRowStateOf({ input: { pin: STRING, value_address: AMOUNT, setting: null, takes_a_wire: false }, value_comes_from: "default", driven_by: [], is_editable: true })).toEqual({ kind: "holds_a_value", address: AMOUNT, can_be_promoted: false });
  expect(inputRowStateOf({ input: { pin: FLOAT, value_address: null, setting: null, takes_a_wire: false }, value_comes_from: null, driven_by: [], is_editable: true })).toEqual({ kind: "not_connected", can_be_promoted: false });
});
