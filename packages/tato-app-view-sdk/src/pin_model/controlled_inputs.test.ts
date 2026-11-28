import { expect, test } from "vitest";
import { nodeOfABody, takesAControl } from "./controlled_inputs.js";
import { valueAddressOfTheInput, type InputAddress } from "./node_inputs.js";

const WIDTH: InputAddress = { graph: { project_folder: "/projects/demo", stream_asset: "11111111-2222-3333-4444-555555555555", level: [] }, node_id: "PATTERN-ID", input: "width", member: null };

test("a_string_whose_annotation_names_the_audio_capture_device_control_takes_the_control_the_table_registers_for_it", () => {
  const deviceId = { name: "device_id", pin: { pin_type: { type: "string" }, flow: "value" }, value_address: { ...WIDTH, input: "device_id" }, setting: { read: "at_setup" }, wire: null } as const;
  expect(takesAControl({ ...deviceId, annotations: { control: "audio_capture_device" } })?.declaration.annotations).toEqual({ control: "audio_capture_device" });
});

const VIDEO_IN: InputAddress = { ...WIDTH, input: "video_in" };
const WIRED_FROM_THE_CAMERA = { kind: "wired", target: { stream: "main-a1b2c3", node_id: "CAMERA-ID", port: "video" }, wired_from_words: "camera › video" } as const;

test("a_texture_input_whose_annotation_names_a_control_takes_it_driven_by_what_its_wire_reads", () => {
  const videoIn = { name: "video_in", pin: { pin_type: { type: "texture" }, flow: "stream" }, value_address: null, setting: null, wire: { into: VIDEO_IN, wiring: WIRED_FROM_THE_CAMERA } } as const;
  expect(takesAControl({ ...videoIn, annotations: { control: "preview" } })).toEqual({
    address: VIDEO_IN,
    declaration: { input_name: "video_in", label: "video_in", pin_type: { type: "texture" }, annotations: { control: "preview" }, may_be_unset: false },
    driven_by: WIRED_FROM_THE_CAMERA,
  });
  expect(takesAControl({ ...videoIn, annotations: { control: "preview" }, wire: { into: VIDEO_IN, wiring: { kind: "unwired", because: "Nothing is wired into video_in." } } })?.driven_by).toEqual({ kind: "unwired", because: "Nothing is wired into video_in." });
  expect(takesAControl({ ...videoIn, annotations: { control: "preview" }, value_address: VIDEO_IN })?.driven_by).toEqual(WIRED_FROM_THE_CAMERA);
  expect(takesAControl({ ...videoIn, annotations: {} })).toBeNull();
  expect(takesAControl({ ...videoIn, annotations: { control: "preview" }, wire: null })).toBeNull();
});

test("a_named_types_input_takes_a_control_driven_by_what_its_wire_reads_with_no_annotation", () => {
  const sweep = { name: "sweep", pin: { pin_type: { type: "named", named_pin_type: "nodes.sweep:Sweep" }, flow: "value" }, annotations: {}, value_address: null, setting: null } as const;
  const sweepIn = { ...WIDTH, input: "sweep" };
  expect(takesAControl({ ...sweep, wire: { into: sweepIn, wiring: WIRED_FROM_THE_CAMERA } })).toEqual({
    address: sweepIn,
    declaration: { input_name: "sweep", label: "sweep", pin_type: { type: "named", named_pin_type: "nodes.sweep:Sweep" }, annotations: {}, may_be_unset: false },
    driven_by: WIRED_FROM_THE_CAMERA,
  });
  expect(takesAControl({ ...sweep, wire: { into: sweepIn, wiring: { kind: "unwired", because: "Nothing is wired into sweep." } } })?.driven_by).toEqual({ kind: "unwired", because: "Nothing is wired into sweep." });
  expect(takesAControl({ ...sweep, wire: null })).toBeNull();
});

test("an_input_holding_a_value_that_a_link_feeds_takes_no_control_whatever_its_annotation_names", () => {
  const gain = { name: "gain", pin: { pin_type: { type: "float" }, flow: "value" }, annotations: { control: "slider" }, value_address: null, setting: null, wire: { into: { ...WIDTH, input: "gain" }, wiring: WIRED_FROM_THE_CAMERA } } as const;
  expect(takesAControl(gain)).toBeNull();
});

test("a_node_body_is_told_each_input_whose_type_is_exact_wired_or_not_and_no_node_outside_a_streams_graph", () => {
  const gain = { name: "gain", pin: { pin_type: { type: "float" }, flow: "value" }, annotations: {}, value_address: null, setting: null, wire: { into: { ...WIDTH, input: "gain" }, wiring: WIRED_FROM_THE_CAMERA } } as const;
  const width = { name: "width", pin: { pin_type: { type: "integer" }, flow: "value" }, annotations: {}, value_address: WIDTH, setting: { read: "at_setup" }, wire: null } as const;
  const untyped = { name: "extra", pin: null, annotations: {}, value_address: { ...WIDTH, input: "extra" }, setting: null, wire: null } as const;
  expect(nodeOfABody("nodes.pattern:Pattern", [gain, width, untyped])).toEqual({
    node_type: "nodes.pattern:Pattern",
    project_folder: "/projects/demo",
    inputs: [
      { declaration: { input_name: "gain", label: "gain", pin_type: { type: "float" }, annotations: {}, may_be_unset: false }, value_address: null, wiring: WIRED_FROM_THE_CAMERA },
      { declaration: { input_name: "width", label: "width", pin_type: { type: "integer" }, annotations: {}, may_be_unset: false }, value_address: WIDTH, wiring: null },
    ],
  });
  expect(nodeOfABody("nodes.pattern:Pattern", [{ ...width, value_address: null }])).toBeNull();
});

test("a_connection_input_takes_no_control_wired_or_not_as_the_runtime_renders_it_reading_no_value", () => {
  const relay = { name: "relay", pin: { pin_type: { type: "connection", connection_type: "acme:RelayConnection" }, flow: "value" }, annotations: {}, setting: null } as const;
  const unwiredAddress = valueAddressOfTheInput(WIDTH.graph, "TRACK-ID", { name: "relay", flow: "value" });
  expect(unwiredAddress).toBeNull();
  expect(takesAControl({ ...relay, value_address: unwiredAddress, wire: null })).toBeNull();
  const wiredAddress = valueAddressOfTheInput(WIDTH.graph, "TRACK-ID", { name: "relay", flow: "value", value_comes_from: "wire" });
  expect(wiredAddress).toBeNull();
  expect(takesAControl({ ...relay, value_address: wiredAddress, wire: { into: { ...WIDTH, input: "relay" }, wiring: WIRED_FROM_THE_CAMERA } })).toBeNull();
});
