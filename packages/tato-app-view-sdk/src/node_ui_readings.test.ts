import { expect, test } from "vitest";
import { nodeUiElementsReadingSchema } from "./node_ui_readings.js";

const STUDIOS_FLOAT_CONTROL = {
  module: "studio",
  brought_by: "studio",
  script: "float_number.ts",
  folder_version: "0.45.0",
  registration: { kind: "control", type: "float", control: null },
  script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_number.ts" },
};

test("a listing of node UI elements reads each control, body and blocked script as the Studio lists them", () => {
  const listing = {
    elements: [
      STUDIOS_FLOAT_CONTROL,
      { ...STUDIOS_FLOAT_CONTROL, module: "acme", brought_by: "project", registration: { kind: "node_body", node_type: "acme:Crossfade" }, script_serving: { kind: "blocked", findings: ["crossfade.ts:3:1 TS2322"] } },
    ],
  };
  expect(nodeUiElementsReadingSchema.parse(listing)).toEqual(listing);
});

test("a control registered for a pin type the contract does not name is refused", () => {
  expect(nodeUiElementsReadingSchema.safeParse({ elements: [{ ...STUDIOS_FLOAT_CONTROL, registration: { kind: "control", type: "light_field", control: null } }] }).success).toBe(false);
});
