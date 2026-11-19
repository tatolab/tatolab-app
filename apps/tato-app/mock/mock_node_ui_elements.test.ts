import { expect, it } from "vitest";
import { mockStudioNodeUiElements } from "./mock_node_ui_elements";

it("lists each control the Studio's own node UI manifest registers, read from source, served from the page's own origin", () => {
  expect(mockStudioNodeUiElements("http://localhost:5173", false).map(({ script, registration, script_serving }) => ({ script, registration, script_serving }))).toEqual([
    { script: "boolean_switch.ts", registration: { kind: "control", type: "boolean", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/boolean_switch.ts" } },
    { script: "integer_stepper.ts", registration: { kind: "control", type: "integer", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/integer_stepper.ts" } },
    { script: "float_number.ts", registration: { kind: "control", type: "float", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/float_number.ts" } },
    { script: "integer_slider.ts", registration: { kind: "control", type: "integer", control: "slider" }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/integer_slider.ts" } },
    { script: "float_slider.ts", registration: { kind: "control", type: "float", control: "slider" }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/float_slider.ts" } },
  ]);
  expect(mockStudioNodeUiElements("http://localhost:5173", true).map((listed) => listed.script_serving)).toEqual([
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/boolean_switch.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/integer_stepper.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/float_number.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/integer_slider.ts" },
    { kind: "served", script_url: "http://localhost:5173/unserved_node_ui/float_slider.ts" },
  ]);
});
