// The words of a view node's "Shown in" row in Properties: how many of the chosen layout's areas
// show its view, and the areas Show in an area offers.

import type { AreaForAViewType } from "@tatolab/tato-app-view-sdk";

/** How many areas show the view, as "1 area" or "Not shown". */
export function viewShownInAreasWords(areas: readonly AreaForAViewType[]): string {
  const areasShowingIt = areas.filter((area) => area.shows_the_view_type).length;
  if (areasShowingIt === 0) return "Not shown";
  return areasShowingIt === 1 ? "1 area" : `${areasShowingIt} areas`;
}

/** One area Show in an area offers: its id and what showing the view there replaces, in words. */
export interface AreaToShowTheViewIn {
  area_id: string;
  words: string;
}

/** The areas Show in an area offers, each in place of what it shows: every area but those showing the view already and the one Properties itself is in. */
export function areasToShowTheViewIn(areas: readonly AreaForAViewType[]): AreaToShowTheViewIn[] {
  return areas
    .filter((area) => !area.shows_the_view_type && !area.is_the_asking_views_area)
    .map((area) => ({ area_id: area.area_id, words: area.shows_view_title === null ? "In the empty area" : `In place of ${area.shows_view_title}` }));
}
