import { expect, test } from "vitest";
import { takesAControl } from "./controlled_inputs.js";
import type { InputAddress } from "./node_inputs.js";

const WIDTH: InputAddress = { graph: { project_folder: "/projects/demo", stream_asset: "11111111-2222-3333-4444-555555555555", level: [] }, node_id: "PATTERN-ID", input: "width" };

test("a_settings_control_is_told_whether_a_change_rebuilds_its_node", () => {
  const width = { name: "width", pin: { pin_type: { type: "integer" }, flow: "value" }, annotations: {}, value_address: WIDTH } as const;
  expect(takesAControl({ ...width, setting: { read: "at_setup" } })?.rebuilds_its_node).toBe(true);
  expect(takesAControl({ ...width, setting: { read: "each_run" } })?.rebuilds_its_node).toBe(false);
  expect(takesAControl({ ...width, setting: null })?.rebuilds_its_node).toBe(false);
});

test("a_string_holding_a_project_assets_uuid_takes_no_control_so_the_panels_own_asset_field_picks_it", () => {
  const asset = { name: "asset", pin: { pin_type: { type: "string" }, flow: "value" }, value_address: { ...WIDTH, input: "asset" }, setting: { read: "at_setup" } } as const;
  expect(takesAControl({ ...asset, annotations: { project_asset: { media: ["image"] } } })).toBeNull();
  expect(takesAControl({ ...asset, annotations: {} })).not.toBeNull();
});
