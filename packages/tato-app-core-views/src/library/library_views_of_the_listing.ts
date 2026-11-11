// The views the Library lists: the open project's own first, then each import's, then Studio's built-in ones, each
// group under who brought it, narrowed by the Library's search.

import type { StudioViewListed, StudioViewsReading } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The views one project, import or Studio itself brings, under its name. */
export interface LibraryViewGroup {
  brought_by: string;
  studio_views: StudioViewListed[];
}

/** The group the Library heads Studio's own views with. */
export const BUILT_IN_VIEWS_GROUP_LABEL = "Built in";

function viewMatchesTheSearch(studioView: StudioViewListed, searchText: string): boolean {
  const searchedFor = searchText.trim().toLowerCase();
  return searchedFor === "" || [studioView.title, studioView.description, studioView.view_type_id, studioView.brought_by].some((text) => text.toLowerCase().includes(searchedFor));
}

/** Every view `reading` lists, matching `searchText`, grouped by who brought it in the listing's order, Studio's own last. */
export function libraryViewGroupsOf(reading: StudioViewsReading, searchText: string): LibraryViewGroup[] {
  const studioViews = (reading.kind === "listed" ? reading.studio_views : reading.built_in_views).filter((studioView) => viewMatchesTheSearch(studioView, searchText));
  const projectGroups: LibraryViewGroup[] = [];
  for (const studioView of studioViews.filter((listed) => !listed.is_built_in)) {
    const group = projectGroups.find((projectGroup) => projectGroup.brought_by === studioView.brought_by);
    if (group === undefined) projectGroups.push({ brought_by: studioView.brought_by, studio_views: [studioView] });
    else group.studio_views.push(studioView);
  }
  const builtInViews = studioViews.filter((listed) => listed.is_built_in);
  return builtInViews.length === 0 ? projectGroups : [...projectGroups, { brought_by: BUILT_IN_VIEWS_GROUP_LABEL, studio_views: builtInViews }];
}

/** What a view's row says beside its name: its ports for a `node` view, that it is a panel for an `area` one, or that it does not open. */
export function studioViewPortsWords(studioView: StudioViewListed): string {
  if (studioView.placement === null) return "Doesn't open";
  if (studioView.placement === "area") return "Panel";
  return `${studioView.inputs.length} in · ${studioView.outputs.length} out`;
}
