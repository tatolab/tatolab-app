// The mock's one listed view, from the `views/picture_and_fader/` folder of the mock's open
// project, Pulse Stage: its folder served by the mock window's own server at `/mock_studio_view/`, by the rule the
// app serves a project view's folder with from the runtime's `read_project_file`.

import type { JsonValue, ListedStudioView } from "../../src/shared/tatolab_backend_contract";
import pictureAndFaderManifestText from "./picture_and_fader/tatolab_view.json?raw";
import { PULSE_STAGE_PROJECT_NAME } from "../mock_pulse_stage_sample";

/** Where the mock window's server serves the fixture views' folders, on the window's own origin. */
const MOCK_STUDIO_VIEWS_PATH = "/mock_studio_view/";

/** The URL the fixture view folder `viewFolder` is served under. */
function mockStudioViewFolderUrl(viewFolder: string): string {
  return new URL(`${MOCK_STUDIO_VIEWS_PATH}${viewFolder}/`, window.location.origin).href;
}

/** The fixture view's type as the runtime lists it, which is the node type a node of the view is. */
export const MOCK_STUDIO_VIEW_TYPE_ID = "e4b19a6d-5c2f-4a87-93d0-1b6e8f2c7a35:picture_and_fader";

/** The fixture view as the backend lists it, its folder served beside this module. */
export function mockStudioViewListing(): ListedStudioView {
  const manifestJson: JsonValue = JSON.parse(pictureAndFaderManifestText);
  return {
    view_type_id: MOCK_STUDIO_VIEW_TYPE_ID,
    project: "e4b19a6d-5c2f-4a87-93d0-1b6e8f2c7a35",
    project_name: PULSE_STAGE_PROJECT_NAME,
    view_folder: "picture_and_fader",
    import_folder: null,
    opens: true,
    not_opened_because: null,
    manifest_json: manifestJson,
    folder_url: mockStudioViewFolderUrl("picture_and_fader"),
    newer_version_blocked_because: null,
  };
}

/** A view the mock project's import `lobby-wall` brings that does not open, as the runtime lists one built for a view contract it does not read. */
export function mockStudioViewListingThatDoesNotOpen(): ListedStudioView {
  return {
    view_type_id: "7a2c9e41-5d8b-4f16-a3e0-2b6f9c4d1e85:stage_rig",
    project: "7a2c9e41-5d8b-4f16-a3e0-2b6f9c4d1e85",
    project_name: "lobby-wall",
    view_folder: "stage_rig",
    import_folder: "lobby-wall",
    opens: false,
    not_opened_because: "`contract`: this runtime reads view contract 1.0.",
    manifest_json: { contract: "2.0", title: "Stage rig", placement: "area", entry: "index.html" },
    folder_url: mockStudioViewFolderUrl("stage_rig"),
    newer_version_blocked_because: null,
  };
}
