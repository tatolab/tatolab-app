// The panels Tato Studio ships with itself, read from their own `tatolab_view.json` like any view's and opened in a frame
// through the one bridge; their built folders are served beside the window under `core_views/`.

import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import type { CoreView } from "@tatolab/tato-app-core-views";
import type { JsonValue } from "./studio_view_contract";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import type { ProjectStudioViewNotOpened, RegisteredStudioViewType } from "./studio_view_type_registry";
import { tatolabFrameViewType } from "./tatolab_frame_view_type";

/** The core views as view types, by folder, and each whose manifest does not open, with why. */
export interface CoreViewTypes {
  readonly view_types_by_folder: ReadonlyMap<string, RegisteredStudioViewType>;
  readonly not_opened: readonly ProjectStudioViewNotOpened[];
}

/** Where the window serves the built folder of the core view `folder`. */
export function servedCoreViewFolderUrl(folder: string, windowPageUrl: string): string {
  return new URL(`core_views/${folder}/`, windowPageUrl).href;
}

/** Each of `coreViews` read from its manifest, its folder served at `folderUrlOf(folder)`. */
export function coreViewTypesOf(coreViews: readonly CoreView[], folderUrlOf: (folder: string) => string): CoreViewTypes {
  const viewTypesByFolder = new Map<string, RegisteredStudioViewType>();
  const notOpened: ProjectStudioViewNotOpened[] = [];
  for (const coreView of coreViews) {
    let manifestJson: JsonValue;
    try {
      manifestJson = JSON.parse(coreView.manifest_text);
    } catch (parseFailure) {
      notOpened.push({ view_type_id: coreView.folder, because: `\`tatolab_view.json\`: ${parseFailure instanceof Error ? parseFailure.message : String(parseFailure)}` });
      continue;
    }
    const manifestReading = readTatolabViewManifest(manifestJson);
    if (manifestReading.kind === "not_read") {
      notOpened.push({ view_type_id: coreView.folder, because: manifestReading.because });
      continue;
    }
    const listed: ListedStudioView = { view_type_id: coreView.folder, project_name: "Tato Studio", import_folder: null, opens: true, not_opened_because: null, manifest_json: manifestJson, folder_url: folderUrlOf(coreView.folder) };
    viewTypesByFolder.set(coreView.folder, tatolabFrameViewType(listed, manifestReading.manifest, { kind: "tato_studio" }));
  }
  return { view_types_by_folder: viewTypesByFolder, not_opened: notOpened };
}
