// The views the open project and its imports bring, as the window's view-type menu lists them: the
// runtime's `list_project_views`, each view that opens passed through the extension check gate, its
// folder served under the window page's scheme at the version the gate passed, and one that does
// not pass listed as not opening, in the gate's words.

import { Cause, Effect } from "effect";
import type { ListedStudioView, OpenProjectReading } from "../shared/tatolab_backend_contract.js";
import { extensionFolderGated, type ExtensionFolderGated, type ExtensionFolderPassed } from "./extension_check_gate.js";
import { projectViewFolderUrl } from "./extension_files_served_with_types_removed.js";
import { studioViewOpeningOf } from "./project_views_on_the_wire.js";
import { listProjectViews } from "./runtime_operations.js";
import { ProjectViewsListed, SystemMediaAccessAhead } from "./studio_runtime.js";
import { CommandRefused } from "./window_command.js";

/**
 * The views the open project in `openProjectReading` and its imports bring, each that opens through the extension check gate and served under the URL of
 * the version it passed, kept as the only views served, one blocked listed as not opening in the gate's words, the system asked ahead for each device they
 * declare off the answer's path; refused while no project is read, or in the runtime's words.
 */
export const studioViewsOfTheOpenProject = Effect.fn("studioViewsOfTheOpenProject")(function* (openProjectReading: OpenProjectReading) {
  if (openProjectReading.kind === "unreadable") return yield* new CommandRefused({ words: openProjectReading.refusal });
  if (openProjectReading.kind !== "read") return yield* new CommandRefused({ words: "No project is open in this window." });
  const openProjectFolder = openProjectReading.open_project.project.folder;
  const projectViewsListed = yield* ProjectViewsListed;
  const listingStarted = yield* projectViewsListed.startAListing;
  const listed = yield* listProjectViews(openProjectFolder);
  yield* (yield* SystemMediaAccessAhead)
    .askForTheDevicesTheViewsDeclare(listed)
    .pipe(
      Effect.catchCause((cause) => Effect.logError("asking the system for a device a view declares ended without finishing", Cause.pretty(cause))),
      Effect.forkDetach,
    );
  const gatedViews = yield* Effect.forEach(
    listed,
    (listedView) =>
      listedView.opens
        ? extensionFolderGated(openProjectFolder, { folder_in_the_project: listedView.view_folder_in_the_project }, projectViewsListed.extensionFolderChecks)
        : Effect.succeed<ExtensionFolderGated | null>(null)
  );
  const passedViewFolders = new Map<string, ExtensionFolderPassed>();
  const studioViews = listed.map((listedView, viewIndex): ListedStudioView => {
    const gated = gatedViews[viewIndex] ?? null;
    if (gated?.kind === "passed") passedViewFolders.set(listedView.view_folder_in_the_project, gated);
    return {
      view_type_id: listedView.view_type,
      project_name: listedView.project_name,
      import_folder: listedView.import_folder,
      manifest_json: listedView.manifest,
      folder_url: gated?.kind === "passed" ? projectViewFolderUrl(openProjectFolder, gated.folder_version, listedView.view_folder_in_the_project) : "",
      ...(gated?.kind === "blocked" ? { opens: false, not_opened_because: gated.words } : studioViewOpeningOf(listedView)),
    };
  });
  yield* projectViewsListed.rememberTheListing(openProjectFolder, "views", listingStarted, passedViewFolders);
  return studioViews;
});
