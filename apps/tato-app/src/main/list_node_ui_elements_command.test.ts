import { ManagedRuntime } from "effect";
import { afterEach, expect, test } from "vitest";
import { listNodeUiElementsCommand } from "./list_node_ui_elements_command.js";
import { FROM_THE_PROJECTS_WINDOW, STUDIO_WINDOW_UNDER_TEST, studioServicesLayerForTest } from "./tatolab_commands_test_support.js";

const FROM_A_STUDIO_WINDOW = { windowContentsId: STUDIO_WINDOW_UNDER_TEST.windowContentsId };
const disposals: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

/** The window's `list_node_ui_elements` in a Studio of `version`, whose one studio window is `FROM_A_STUDIO_WINDOW`. */
function listCommandOfTheStudio(version: string) {
  const studioRuntime = ManagedRuntime.make(studioServicesLayerForTest({ appVersion: version }));
  disposals.push(() => studioRuntime.dispose());
  return listNodeUiElementsCommand(studioRuntime);
}

test("a studio window lists the Studio's own controls, named by this copy's version and served under the window page's scheme", async () => {
  expect(await listCommandOfTheStudio("0.46.0")(undefined, FROM_A_STUDIO_WINDOW)).toEqual({
    ok: true,
    value: [
      {
        module: "studio",
        brought_by: "studio",
        script: "boolean_switch.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "boolean", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/boolean_switch.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "integer_stepper.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "integer", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/integer_stepper.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "float_number.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "float", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_number.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "color_swatch.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "color", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/color_swatch.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "vector_fields.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "vector", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/vector_fields.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "rectangle_fields.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "rectangle", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/rectangle_fields.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "transform_fields.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "transform", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/transform_fields.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "text_line.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "string", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/text_line.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "menu_choice.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "menu", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/menu_choice.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "asset_field.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "asset", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/asset_field.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "trigger_button.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "trigger", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/trigger_button.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "list_rows.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "list_of", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/list_rows.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "integer_slider.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "integer", control: "slider" },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/integer_slider.ts" },
      },
      {
        module: "studio",
        brought_by: "studio",
        script: "float_slider.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "float", control: "slider" },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_slider.ts" },
      },
    ],
  });
});

test("the Projects window lists none, and arguments the command takes none of are refused", async () => {
  const list = listCommandOfTheStudio("0.46.0");
  expect(await list(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(await list({ project_folder: "/elsewhere" }, FROM_A_STUDIO_WINDOW)).toMatchObject({ ok: false, refusal: expect.stringMatching(/^list_node_ui_elements: /) });
});
