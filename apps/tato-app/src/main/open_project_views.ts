// The views the open project and its imports bring, as the window's view-type menu lists them: the
// runtime's `list_project_views`, each view's folder served under the window page's scheme from the
// bytes `read_project_file` answers.

import { Cause, Effect } from "effect";
import type { ListedStudioView, OpenProjectReading } from "../shared/tatolab_backend_contract.js";
import { projectViewFolderUrl } from "./extension_files_served_with_types_removed.js";
import { studioViewOpeningOf } from "./project_views_on_the_wire.js";
import { listProjectViews } from "./runtime_operations.js";
import { ProjectViewsListed, SystemMediaAccessAhead } from "./studio_runtime.js";
import { CommandRefused } from "./window_command.js";

/**
 * The views the open project in `openProjectReading` and its imports bring, each with the URL its folder is served under, kept as the only views served, the
 * system asked ahead for each device they declare off the answer's path; refused while no project is read, or in the runtime's words.
 */
export const studioViewsOfTheOpenProject = Effect.fn("studioViewsOfTheOpenProject")(function* (openProjectReading: OpenProjectReading) {
  if (openProjectReading.kind === "unreadable") return yield* new CommandRefused({ words: openProjectReading.refusal });
  if (openProjectReading.kind !== "read") return yield* new CommandRefused({ words: "No project is open in this window." });
  const openProjectFolder = openProjectReading.open_project.project.folder;
  const projectViewsListed = yield* ProjectViewsListed;
  const listingStarted = yield* projectViewsListed.startAListing;
  const listed = yield* listProjectViews(openProjectFolder);
  yield* projectViewsListed.rememberTheListing(openProjectFolder, listingStarted, listed);
  yield* (yield* SystemMediaAccessAhead)
    .askForTheDevicesTheViewsDeclare(listed)
    .pipe(
      Effect.catchCause((cause) => Effect.logError("asking the system for a device a view declares ended without finishing", Cause.pretty(cause))),
      Effect.forkDetach,
    );
  return listed.map(
    (listedView): ListedStudioView => ({
      view_type_id: listedView.view_type,
      project_name: listedView.project_name,
      import_folder: listedView.import_folder,
      manifest_json: listedView.manifest,
      folder_url: projectViewFolderUrl(openProjectFolder, listedView.view_folder_in_the_project),
      ...studioViewOpeningOf(listedView),
    }),
  );
});
