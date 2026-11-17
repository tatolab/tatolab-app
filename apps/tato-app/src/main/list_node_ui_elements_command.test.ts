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

test("a studio window lists the Studio's own number control, named by this copy's version and served under the window page's scheme", async () => {
  expect(await listCommandOfTheStudio("0.46.0")(undefined, FROM_A_STUDIO_WINDOW)).toEqual({
    ok: true,
    value: [
      {
        module: "studio",
        brought_by: "studio",
        script: "float_number.ts",
        folder_version: "0.46.0",
        registration: { kind: "control", type: "float", control: null },
        script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_number.ts" },
      },
    ],
  });
});

test("the Projects window lists none, and arguments the command takes none of are refused", async () => {
  const list = listCommandOfTheStudio("0.46.0");
  expect(await list(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(await list({ project_folder: "/elsewhere" }, FROM_A_STUDIO_WINDOW)).toMatchObject({ ok: false, refusal: expect.stringMatching(/^list_node_ui_elements: /) });
});
