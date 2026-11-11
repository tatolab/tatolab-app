// The views an area can show, as a view reads them: Studio's own, each read from its manifest, then those the open
// project and its imports bring, each with what its manifest declares or why it does not open.

import { readTatolabViewManifest, type TatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import type { StudioViewListed, StudioViewsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { CoreView } from "@tatolab/tato-app-core-views";
import type { JsonValue } from "./studio_view_contract";
import { titleTheManifestNames, type ProjectStudioViewsReading } from "./studio_view_type_registry";

/** The name a view Studio ships with is listed as brought by. */
const BROUGHT_BY_TATO_STUDIO = "Tato Studio";

function studioViewListedFromItsManifest(viewTypeId: string, broughtBy: string, isBuiltIn: boolean, manifest: TatolabViewManifest): StudioViewListed {
  const declaredPortOf = (port: TatolabViewManifest["inputs"][number]) => ({ name: port.name, family: port.family, description: port.description ?? "" });
  return {
    view_type_id: viewTypeId,
    title: manifest.title,
    description: manifest.description ?? "",
    brought_by: broughtBy,
    is_built_in: isBuiltIn,
    placement: manifest.placement,
    inputs: manifest.inputs.map(declaredPortOf),
    outputs: manifest.outputs.map(declaredPortOf),
    not_opened_because: null,
  };
}

function studioViewNotOpened(viewTypeId: string, manifestJson: JsonValue | null, broughtBy: string, isBuiltIn: boolean, because: string): StudioViewListed {
  return { view_type_id: viewTypeId, title: titleTheManifestNames(manifestJson, viewTypeId), description: "", brought_by: broughtBy, is_built_in: isBuiltIn, placement: null, inputs: [], outputs: [], not_opened_because: because };
}

function studioViewListedFromTheManifestJson(viewTypeId: string, manifestJson: JsonValue | null, broughtBy: string, isBuiltIn: boolean): StudioViewListed {
  const manifestReading = readTatolabViewManifest(manifestJson);
  return manifestReading.kind === "read"
    ? studioViewListedFromItsManifest(viewTypeId, broughtBy, isBuiltIn, manifestReading.manifest)
    : studioViewNotOpened(viewTypeId, manifestJson, broughtBy, isBuiltIn, manifestReading.because);
}

function builtInStudioViewOf(coreView: CoreView): StudioViewListed {
  let manifestJson: JsonValue;
  try {
    manifestJson = JSON.parse(coreView.manifest_text);
  } catch (parseFailure) {
    return studioViewNotOpened(coreView.folder, null, BROUGHT_BY_TATO_STUDIO, true, `\`tatolab_view.json\`: ${parseFailure instanceof Error ? parseFailure.message : String(parseFailure)}`);
  }
  return studioViewListedFromTheManifestJson(coreView.folder, manifestJson, BROUGHT_BY_TATO_STUDIO, true);
}

/** The views `coreViews` and the open project's listing `projectStudioViews` bring, as a view reads them. */
export function studioViewsReadingOf(coreViews: readonly CoreView[], projectStudioViews: ProjectStudioViewsReading): StudioViewsReading {
  const builtInViews = coreViews.map(builtInStudioViewOf);
  if (projectStudioViews.kind === "not_listed") return { kind: "not_listed", built_in_views: builtInViews, because: projectStudioViews.because };
  if (projectStudioViews.kind === "none_open") return { kind: "listed", studio_views: builtInViews };
  const projectViews = projectStudioViews.studio_views.map((listed) =>
    listed.opens
      ? studioViewListedFromTheManifestJson(listed.view_type_id, listed.manifest_json, listed.project_name, false)
      : studioViewNotOpened(listed.view_type_id, listed.manifest_json, listed.project_name, false, listed.not_opened_because),
  );
  return { kind: "listed", studio_views: [...builtInViews, ...projectViews] };
}
