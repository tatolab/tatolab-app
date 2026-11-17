// The node UI elements the mock lists: the Studio's own module, as the app lists it from its
// manifest, each script served by the mock's dev server beside the window with its types removed,
// as the app's page protocol serves it. `?node_ui=unserved` serves none, so each control ends at
// the read-only line; `?node_ui=refused` refuses the listing.

import type { ListedNodeUiElement } from "@tatolab/tato-app-view-sdk/node_ui_host";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import { sleep } from "./mock_tatolab_simulation";
import type { MockNodeUiElementsListing } from "./mock_tatolab_options";
import { MOCK_COMMAND_LATENCY_MILLISECONDS } from "./mock_tatolab_simulation_constants";

/** Where the mock's dev server serves the Studio's own node UI module, as the app's window page serves it. */
const MOCK_STUDIO_NODE_UI_FILES_PATH = "/core_node_ui/";

/** The folder version the mock lists the Studio's own elements under. */
export const MOCK_STUDIO_NODE_UI_FOLDER_VERSION = "mock";

/** Each control the Studio's own `node_ui/tatolab_node_ui.json` registers, as its script and its registration. */
export const MOCK_STUDIO_NODE_UI_CONTROLS: readonly Pick<ListedNodeUiElement, "script" | "registration">[] = [{ script: "float_number.ts", registration: { kind: "control", type: "float", control: null } }];

/** The Studio's own elements as the mock lists them, each served from the page's own origin, or from nowhere when `isUnserved`. */
export function mockStudioNodeUiElements(pageOrigin: string, isUnserved: boolean): readonly ListedNodeUiElement[] {
  return MOCK_STUDIO_NODE_UI_CONTROLS.map(({ script, registration }) => ({
    module: "studio",
    brought_by: "studio",
    script,
    folder_version: MOCK_STUDIO_NODE_UI_FOLDER_VERSION,
    registration,
    script_serving: { kind: "served", script_url: new URL(`${isUnserved ? "/unserved_node_ui/" : MOCK_STUDIO_NODE_UI_FILES_PATH}${script}`, pageOrigin).href },
  }));
}

/** The mock's `listNodeUiElements`. */
export function mockNodeUiElementsBackendOf(listing: MockNodeUiElementsListing): Pick<TatolabBackend, "listNodeUiElements"> {
  return {
    listNodeUiElements: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (listing === "refused") throw new Error("The mock refuses to list the Studio's node UI elements (?node_ui=refused).");
      return mockStudioNodeUiElements(window.location.origin, listing === "unserved");
    },
  };
}
