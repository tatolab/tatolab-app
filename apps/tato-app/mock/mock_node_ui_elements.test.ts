import { expect, it } from "vitest";
import { mockStudioNodeUiElements } from "./mock_node_ui_elements";

it("lists each control the Studio's own node UI manifest registers, read from source, served from the page's own origin", () => {
  expect(mockStudioNodeUiElements("http://localhost:5173", false).map(({ script, registration, script_serving }) => ({ script, registration, script_serving }))).toEqual([
    { script: "float_number.ts", registration: { kind: "control", type: "float", control: null }, script_serving: { kind: "served", script_url: "http://localhost:5173/core_node_ui/float_number.ts" } },
  ]);
  expect(mockStudioNodeUiElements("http://localhost:5173", true).map((listed) => listed.script_serving)).toEqual([{ kind: "served", script_url: "http://localhost:5173/unserved_node_ui/float_number.ts" }]);
});
