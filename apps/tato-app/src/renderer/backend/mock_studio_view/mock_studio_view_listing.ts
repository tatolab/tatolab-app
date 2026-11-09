// The mock's one listed view, the fixture a project's import would bring: its folder served by the
// mock window's own server, the way the app will serve an installed view's folder.

import type { JsonValue, ListedStudioView } from "../../../shared/tatolab_backend_contract";
import pictureAndFaderManifestText from "./picture_and_fader/tatolab_view.json?raw";

// Vite rewrites `new URL(<literal>, import.meta.url)` as an asset import, which a folder is not.
const THIS_MODULES_URL = import.meta.url;

/** The fixture view's type, as its distribution and `tatolab.views` entry name it. */
export const MOCK_STUDIO_VIEW_TYPE_ID = "tatolab-fixture-views:picture-and-fader";

/** The fixture view as the backend lists it, its folder served beside this module. */
export function mockStudioViewListing(): ListedStudioView {
  const manifestJson: JsonValue = JSON.parse(pictureAndFaderManifestText);
  return {
    view_type_id: MOCK_STUDIO_VIEW_TYPE_ID,
    distribution: "tatolab-fixture-views",
    entry_name: "picture-and-fader",
    manifest_json: manifestJson,
    folder_url: new URL("picture_and_fader/", THIS_MODULES_URL).href,
  };
}
