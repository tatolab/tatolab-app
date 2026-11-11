// The views an area can show, as a view reads them: what the window's view type registry offers now and what it
// refuses to open, Studio's own first, then those the open project and its imports bring.

import type { TatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import type { StudioViewListed, StudioViewsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { StopWatching, StudioViewTypeSource } from "./studio_view_contract";
import type { RegisteredStudioViewType, StudioViewNotOpened, StudioViewTypeRegistry } from "./studio_view_type_registry";

/** Who `broughtBy` names in the listing: Tato Studio, or the project or import that brought the view. */
function broughtByWords(broughtBy: StudioViewTypeSource): string {
  return broughtBy.kind === "tato_studio" ? "Tato Studio" : broughtBy.project_name;
}

function studioViewListedFromTheViewType(viewType: RegisteredStudioViewType): StudioViewListed {
  const declaredPortOf = (port: TatolabViewManifest["inputs"][number]) => ({ name: port.name, family: port.family, description: port.description ?? "" });
  return {
    view_type_id: viewType.view_type_id,
    title: viewType.title,
    description: viewType.manifest.description ?? "",
    brought_by: broughtByWords(viewType.brought_by),
    is_built_in: viewType.brought_by.kind === "tato_studio",
    placement: viewType.manifest.placement,
    inputs: viewType.manifest.inputs.map(declaredPortOf),
    outputs: viewType.manifest.outputs.map(declaredPortOf),
    not_opened_because: null,
  };
}

function studioViewListedNotOpened(notOpened: StudioViewNotOpened): StudioViewListed {
  return {
    view_type_id: notOpened.view_type_id,
    title: notOpened.title,
    description: "",
    brought_by: broughtByWords(notOpened.brought_by),
    is_built_in: notOpened.brought_by.kind === "tato_studio",
    placement: null,
    inputs: [],
    outputs: [],
    not_opened_because: notOpened.because,
  };
}

/** The views `viewTypeRegistry` offers an area now, and those it does not open, as a view reads them. */
export function studioViewsReadingOf(viewTypeRegistry: StudioViewTypeRegistry): StudioViewsReading {
  const builtInViews = [...viewTypeRegistry.studioViewTypes().map(studioViewListedFromTheViewType), ...viewTypeRegistry.studioViewTypesNotOpened().map(studioViewListedNotOpened)];
  const projectStudioViews = viewTypeRegistry.projectStudioViews.readLatest();
  if (projectStudioViews.kind === "not_listed") return { kind: "not_listed", built_in_views: builtInViews, because: projectStudioViews.because };
  const projectViews = [...viewTypeRegistry.projectViewTypes().map(studioViewListedFromTheViewType), ...viewTypeRegistry.projectViewTypesNotOpened().map(studioViewListedNotOpened)];
  return { kind: "listed", studio_views: [...builtInViews, ...projectViews] };
}

/** Tells `listener` the views `viewTypeRegistry` offers, at once and again each time the open project's are listed or Developer mode turns on or off. */
export function watchTheStudioViewsOfTheRegistry(viewTypeRegistry: StudioViewTypeRegistry, listener: (reading: StudioViewsReading) => void): StopWatching {
  const tellTheListener = () => listener(studioViewsReadingOf(viewTypeRegistry));
  const stopWatchingTheProjectsViews = viewTypeRegistry.projectStudioViews.watch(tellTheListener);
  let developerModeToldOnce = false;
  const stopWatchingDeveloperMode = viewTypeRegistry.developerMode.watch(() => {
    if (developerModeToldOnce) tellTheListener();
    developerModeToldOnce = true;
  });
  return () => {
    stopWatchingTheProjectsViews();
    stopWatchingDeveloperMode();
  };
}
