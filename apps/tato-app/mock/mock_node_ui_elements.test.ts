import studioNodeUiManifestText from "../../../packages/tato-app-core-node-ui/node_ui/tatolab_node_ui.json?raw";
import { expect, it } from "vitest";
import { MOCK_STUDIO_NODE_UI_CONTROLS, mockStudioNodeUiElements } from "./mock_node_ui_elements";

it("lists each control the Studio's own node UI manifest registers, served from the page's own origin", () => {
  const manifest: unknown = JSON.parse(studioNodeUiManifestText);
  const controls = typeof manifest === "object" && manifest !== null && "controls" in manifest && Array.isArray(manifest.controls) ? manifest.controls : [];
  expect(MOCK_STUDIO_NODE_UI_CONTROLS.map(({ script, registration }) => (registration.kind === "control" ? { type: registration.type, script } : null))).toEqual(controls);
  expect(mockStudioNodeUiElements("http://localhost:5173", false).map((listed) => listed.script_serving)).toEqual([{ kind: "served", script_url: "http://localhost:5173/core_node_ui/float_number.ts" }]);
  expect(mockStudioNodeUiElements("http://localhost:5173", true).map((listed) => listed.script_serving)).toEqual([{ kind: "served", script_url: "http://localhost:5173/unserved_node_ui/float_number.ts" }]);
});
