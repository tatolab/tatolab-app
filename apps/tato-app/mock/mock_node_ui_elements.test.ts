import { expect, it } from "vitest";
import { mockStudioNodeUiElements } from "./mock_node_ui_elements";

it("lists each control the Studio's own node UI manifest registers, read from source, served from the page's own origin", () => {
  expect(mockStudioNodeUiElements("http://localhost:5173", false).map(({ script, registration, script_serving }) => ({ script, registration, script_serving }))).toEqual([
    { script: "boolean_switch.ts", registration: { kind: "control", type: "boolean", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/boolean_switch.ts" } },
    { script: "integer_stepper.ts", registration: { kind: "control", type: "integer", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/integer_stepper.ts" } },
    { script: "float_number.ts", registration: { kind: "control", type: "float", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/float_number.ts" } },
    { script: "color_swatch.ts", registration: { kind: "control", type: "color", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/color_swatch.ts" } },
    { script: "vector_fields.ts", registration: { kind: "control", type: "vector", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/vector_fields.ts" } },
    { script: "rectangle_fields.ts", registration: { kind: "control", type: "rectangle", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/rectangle_fields.ts" } },
    { script: "transform_fields.ts", registration: { kind: "control", type: "transform", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/transform_fields.ts" } },
    { script: "text_line.ts", registration: { kind: "control", type: "string", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/text_line.ts" } },
    { script: "menu_choice.ts", registration: { kind: "control", type: "menu", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/menu_choice.ts" } },
    { script: "asset_field.ts", registration: { kind: "control", type: "asset", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/asset_field.ts" } },
    { script: "trigger_button.ts", registration: { kind: "control", type: "trigger", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/trigger_button.ts" } },
    { script: "list_rows.ts", registration: { kind: "control", type: "list_of", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/list_rows.ts" } },
    { script: "type_choice.ts", registration: { kind: "control", type: "pin_type_choice", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/type_choice.ts" } },
    { script: "integer_slider.ts", registration: { kind: "control", type: "integer", control: "slider" }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/integer_slider.ts" } },
    { script: "float_slider.ts", registration: { kind: "control", type: "float", control: "slider" }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/float_slider.ts" } },
  ]);
  expect(mockStudioNodeUiElements("http://localhost:5173", true).map((listed) => listed.script_serving)).toEqual([
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/boolean_switch.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/integer_stepper.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/float_number.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/color_swatch.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/vector_fields.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/rectangle_fields.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/transform_fields.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/text_line.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/menu_choice.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/asset_field.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/trigger_button.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/list_rows.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/type_choice.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/integer_slider.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/float_slider.ts" },
  ]);
});
