// The mock's one listed view, from the `views/picture_and_fader/` folder of the mock project
// `pattern`: its folder served by the mock window's own server, as the app serves a project view's
// folder from the runtime's `read_project_file`.

import type { JsonValue, ListedStudioView } from "../../src/shared/tatolab_backend_contract";
import pictureAndFaderManifestText from "./picture_and_fader/tatolab_view.json?raw";

// Vite rewrites `new URL(<literal>, import.meta.url)` as an asset import, which a folder is not.
const THIS_MODULES_URL = import.meta.url;

/** The fixture view's type, `<project name>:<view folder>`, which is the node type a node of the view is. */
export const MOCK_STUDIO_VIEW_TYPE_ID = "pattern:picture_and_fader";

/** The fixture view as the backend lists it, its folder served beside this module. */
export function mockStudioViewListing(): ListedStudioView {
  const manifestJson: JsonValue = JSON.parse(pictureAndFaderManifestText);
  return {
    view_type_id: MOCK_STUDIO_VIEW_TYPE_ID,
    project_name: "pattern",
    import_folder: null,
    opens: true,
    not_opened_because: null,
    manifest_json: manifestJson,
    folder_url: new URL("picture_and_fader/", THIS_MODULES_URL).href,
  };
}
