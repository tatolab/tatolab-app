// The node UI elements a project and its imports register, as the runtime's
// `list_project_node_ui_elements` reads them from each module's manifest, each module's `node_ui`
// folder passed through the extension check gate as a view's folder is. An element of a folder that
// passes is served under the folder's versioned URL; one whose folder does not pass is listed
// blocked, with the gate's words, so its input shows the read-only line and never another control.
// One whose folder is held at the version that last passed is listed blocked at that version, so a
// control of that version already drawn stays drawn, and its folder is still served.

import type {
  ListedNodeUiElement,
  NodeUiElementRegistration,
  NodeUiElementScriptServing,
} from "@tatolab/tato-app-view-sdk/node_ui_host";
import { Effect } from "effect";
import {
  extensionFolderGated,
  type ExtensionFolderGated,
  type ExtensionFolderPassed,
} from "./extension_check_gate.js";
import { projectViewFolderUrl } from "./extension_files_served_with_types_removed.js";
import { ProjectViewsListed } from "./studio_runtime.js";
import {
  RuntimeControl,
  type ControlContractComponents,
} from "./tatolab_runtime_control_operation_call.js";

type ProjectNodeUiElementListed =
  ControlContractComponents["ProjectNodeUiElementListed"];

/** The node UI folder of the module that registers `listed`, by its path in the open project: `node_ui`, or an import's `imports/<import>/node_ui`. */
function nodeUiFolderOfTheElement(listed: ProjectNodeUiElementListed): string {
  const importFolder = listed.module.import_folder ?? null;
  return importFolder === null ? "node_ui" : `imports/${importFolder}/node_ui`;
}

/** What `listed` registers, as the control table reads it. */
function registrationOfTheElement(
  listed: ProjectNodeUiElementListed,
): NodeUiElementRegistration {
  return listed.element.kind === "control"
    ? {
        kind: "control",
        type: listed.element.pin_type,
        control: listed.element.control ?? null,
      }
    : { kind: "node_body", node_type: listed.element.node_type };
}

/** How the element whose script sits at `scriptInTheFolder` of `nodeUiFolder` is served, by how the gate left that folder of the project in `openProjectFolder`: blocked by the newer version's words when it is held. */
function scriptServingOf(
  openProjectFolder: string,
  nodeUiFolder: string,
  scriptInTheFolder: string,
  gated: ExtensionFolderGated,
): NodeUiElementScriptServing {
  return gated.kind === "passed"
    ? {
        kind: "served",
        script_url: new URL(
          scriptInTheFolder,
          projectViewFolderUrl(
            openProjectFolder,
            gated.folder_version,
            nodeUiFolder,
          ),
        ).href,
      }
    : {
        kind: "blocked",
        findings: (gated.kind === "held"
          ? gated.newer_version_blocked_because
          : gated.words
        ).split("\n"),
      };
}

/** The version of a folder the Studio serves: the one that passed, or the one that last passed while its newer one is blocked; `null` for a folder that is blocked. */
function servedVersionOf(
  gated: ExtensionFolderGated,
): ExtensionFolderPassed | null {
  if (gated.kind === "passed") return gated;
  return gated.kind === "held" ? gated.last_passed : null;
}

/**
 * The node UI elements the project in `openProjectFolder` and its imports register, each module's folder through the gate and the ones that pass kept as the
 * only node UI folders served; none, logged, when the runtime does not list them.
 */
export const projectNodeUiElementsOfTheOpenProject = Effect.fn(
  "project_node_ui_elements_of_the_open_project",
)(function* (openProjectFolder: string) {
  const projectViewsListed = yield* ProjectViewsListed;
  const listingStarted = yield* projectViewsListed.startAListing;
  const runtimeControl = yield* RuntimeControl;
  const listing = yield* runtimeControl
    .call("list_project_node_ui_elements", {
      project_directory: openProjectFolder,
    })
    .pipe(
      Effect.tapError((failure) =>
        Effect.logWarning(
          "the runtime did not list the project's node UI elements, so only the Studio's own are offered",
          failure.words,
        ),
      ),
      Effect.orElseSucceed(() => null),
    );
  if (listing === null) return [];
  const nodeUiFolders = [
    ...new Set(listing.elements.map(nodeUiFolderOfTheElement)),
  ];
  const gatedByFolder = new Map<string, ExtensionFolderGated>();
  for (const nodeUiFolder of nodeUiFolders) {
    gatedByFolder.set(
      nodeUiFolder,
      yield* extensionFolderGated(
        openProjectFolder,
        { folder_in_the_project: nodeUiFolder },
        projectViewsListed.extensionFolderChecks,
      ),
    );
  }
  const passedFolders = new Map<string, ExtensionFolderPassed>(
    [...gatedByFolder].flatMap(([nodeUiFolder, gated]) => {
      const served = servedVersionOf(gated);
      return served === null ? [] : [[nodeUiFolder, served] as const];
    }),
  );
  yield* projectViewsListed.rememberTheListing(
    openProjectFolder,
    "node_ui_elements",
    listingStarted,
    passedFolders,
  );
  return listing.elements.flatMap((listed): ListedNodeUiElement[] => {
    const nodeUiFolder = nodeUiFolderOfTheElement(listed);
    const gated = gatedByFolder.get(nodeUiFolder);
    if (gated === undefined) return [];
    const scriptInTheFolder = listed.script_path.slice(nodeUiFolder.length + 1);
    return [
      {
        module: listed.module.project_name,
        brought_by: "project",
        script: scriptInTheFolder,
        folder_version: servedVersionOf(gated)?.folder_version ?? "",
        registration: registrationOfTheElement(listed),
        script_serving: scriptServingOf(
          openProjectFolder,
          nodeUiFolder,
          scriptInTheFolder,
          gated,
        ),
      },
    ];
  });
});
