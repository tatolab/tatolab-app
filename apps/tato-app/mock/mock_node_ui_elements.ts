// The node UI elements the mock lists: the Studio's own module, as the app lists it from its
// manifest, the manifest read from source with the contract's checker, each script served by the
// mock's dev server beside the window with its types removed, as the app's page protocol serves it.
// `?node_ui=unserved` serves none, so each control ends at the read-only line; `?node_ui=refused`
// refuses the listing. `?node_bodies=served|blocked` adds the mock project's node bodies and its control of a named type, from
// `mock/mock_project_node_ui/`, served beside the window as a project's node UI folder is, or blocked.

import studioNodeUiManifestText from "../../../packages/tato-app-core-node-ui/node_ui/tatolab_node_ui.json?raw";
import projectNodeUiManifestText from "./mock_project_node_ui/tatolab_node_ui.json?raw";
import type { ListedNodeUiElement, NodeUiElementRegistration } from "@tatolab/tato-app-view-sdk/node_ui_host";
import { describeTheContractIssues, readControlContractValue } from "../src/main/tatolab_runtime_control_operation_call";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import { sleep } from "./mock_tatolab_simulation";
import type { MockNodeUiElementsListing, MockProjectNodeBodies } from "./mock_tatolab_options";
import { MOCK_COMMAND_LATENCY_MILLISECONDS } from "./mock_tatolab_simulation_constants";

/** Where the mock's dev server serves the Studio's own node UI module, as the app's window page serves it. */
const MOCK_STUDIO_NODE_UI_FILES_PATH = "/core_node_ui/";

/** The folder version the mock lists the Studio's own elements under. */
const MOCK_STUDIO_NODE_UI_FOLDER_VERSION = "mock";

/** Each element the node UI manifest `manifestText`, read from `manifestFile`, registers, as its script and its registration. */
function elementsTheManifestRegisters(manifestText: string, manifestFile: string): readonly Pick<ListedNodeUiElement, "script" | "registration">[] {
  const manifest = readControlContractValue("NodeUiManifest", JSON.parse(manifestText));
  if (!manifest.read) throw new Error(`${manifestFile} is not a node UI manifest: ${describeTheContractIssues(manifest.issues, "the manifest")}`);
  const listed = (script: string, registration: NodeUiElementRegistration) => ({ script, registration });
  return [
    ...(manifest.value.controls ?? []).map((control) => listed(control.script, { kind: "control", type: control.type, control: control.control ?? null })),
    ...(manifest.value.node_bodies ?? []).map((nodeBody) => listed(nodeBody.script, { kind: "node_body", node_type: nodeBody.node_type })),
  ];
}

/** Where the mock's dev server serves the mock project's node UI folder, as the app serves a project's passed `node_ui` folder. */
const MOCK_PROJECT_NODE_UI_FILES_PATH = "/mock_project_node_ui/";

/** The mock project's node bodies, served from the page's own origin, or blocked by a finding of their folder's check. */
export function mockProjectNodeBodies(pageOrigin: string, bodies: Exclude<MockProjectNodeBodies, "none">): readonly ListedNodeUiElement[] {
  return elementsTheManifestRegisters(projectNodeUiManifestText, "mock/mock_project_node_ui/tatolab_node_ui.json").map(({ script, registration }) => ({
    module: "pattern",
    brought_by: "project",
    script,
    folder_version: bodies === "served" ? "0123456789abcdef" : "",
    registration,
    script_serving:
      bodies === "served"
        ? { kind: "served", script_url: new URL(`${MOCK_PROJECT_NODE_UI_FILES_PATH}${script}`, pageOrigin).href }
        : { kind: "blocked", findings: ["This module's node UI code did not pass the runtime's check, so the Studio does not load it.", `node_ui/${script}:1:1: error: Type 'string' is not assignable to type 'number'. (TS2322)`] },
  }));
}

/** The Studio's own elements as the mock lists them, each served from the page's own origin, or from nowhere when `isUnserved`. */
export function mockStudioNodeUiElements(pageOrigin: string, isUnserved: boolean): readonly ListedNodeUiElement[] {
  return elementsTheManifestRegisters(studioNodeUiManifestText, "The Studio's own node_ui/tatolab_node_ui.json").map(({ script, registration }) => ({
    module: "studio",
    brought_by: "studio",
    script,
    folder_version: MOCK_STUDIO_NODE_UI_FOLDER_VERSION,
    registration,
    script_serving: { kind: "served", script_url: new URL(`${isUnserved ? "/unserved_node_ui/" : MOCK_STUDIO_NODE_UI_FILES_PATH}${script}`, pageOrigin).href },
  }));
}

/** The mock's `listNodeUiElements`. */
export function mockNodeUiElementsBackendOf(listing: MockNodeUiElementsListing, projectNodeBodies: MockProjectNodeBodies): Pick<TatolabBackend, "listNodeUiElements"> {
  return {
    listNodeUiElements: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (listing === "refused") throw new Error("The mock refuses to list the Studio's node UI elements (?node_ui=refused).");
      const studiosOwn = mockStudioNodeUiElements(window.location.origin, listing === "unserved");
      return projectNodeBodies === "none" ? studiosOwn : [...studiosOwn, ...mockProjectNodeBodies(window.location.origin, projectNodeBodies)];
    },
  };
}
