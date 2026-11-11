// The layout's areas as a view node's Show in an area lists them, and the showing of a view
// type in one of them.

import type { AreasForAViewTypeInTheWindow, StopWatching, ViewOpening } from "../view_host/studio_view_contract";
import { areasOfTheLayout, type StudioAreaLayoutNode } from "./studio_area_layout";

/** Why a popped-out view's window lists no areas to show a view in. */
export const A_POPPED_OUT_WINDOW_HAS_NO_AREAS = "A popped-out view's window shows that view alone. Show it in an area from the project's studio window.";

/** Why no area is listed while no project is open. */
export const NO_LAYOUT_WHILE_NO_PROJECT_IS_OPEN = "No project is open, so the window has no layout to show it in.";

/** What the areas of a view type are read from: the layout's areas, whether the window is a popped-out view's, and each view type's title. */
export interface StudioViewTypeAreaSources {
  /** The layout's tree; `null` while no project is open. */
  readChosenLayoutTree(): StudioAreaLayoutNode | null;
  isAPoppedOutViewsWindow(): boolean;
  /** The title of the view type `viewTypeId` names; `null` when no view type has that id. */
  viewTitleOf(viewTypeId: string): string | null;
  /** Each change to what the areas are read from. */
  watchChanges(onChanged: () => void): StopWatching;
  showViewTypeInTheArea(showing: { view_type_id: string; area_id: string }): void;
}

/** The layout's areas for `viewTypeId`, each by the title of the view it shows. */
export function areasForTheViewTypeOf(viewTypeId: string, sources: Omit<StudioViewTypeAreaSources, "watchChanges" | "showViewTypeInTheArea">): AreasForAViewTypeInTheWindow {
  const viewTitle = sources.viewTitleOf(viewTypeId);
  if (viewTitle === null) return { kind: "not_a_view_type" };
  if (sources.isAPoppedOutViewsWindow()) return { kind: "no_areas", because: A_POPPED_OUT_WINDOW_HAS_NO_AREAS };
  const layoutTree = sources.readChosenLayoutTree();
  if (layoutTree === null) return { kind: "no_areas", because: NO_LAYOUT_WHILE_NO_PROJECT_IS_OPEN };
  return {
    kind: "areas_listed",
    view_title: viewTitle,
    areas: areasOfTheLayout(layoutTree).map((area) => ({
      area_id: area.area_id,
      shows_view_title: area.view_type_id === null ? null : (sources.viewTitleOf(area.view_type_id) ?? area.view_type_id),
      shows_the_view_type: area.view_type_id === viewTypeId,
    })),
  };
}

/** `listener` told the areas for `viewTypeId` at once and again each time they read differently. */
export function watchAreasForTheViewType(viewTypeId: string, sources: StudioViewTypeAreaSources, listener: (reading: AreasForAViewTypeInTheWindow) => void): StopWatching {
  let readingLastTold: string | null = null;
  const tellTheAreas = () => {
    const reading = areasForTheViewTypeOf(viewTypeId, sources);
    const readingAsJson = JSON.stringify(reading);
    if (readingAsJson === readingLastTold) return;
    readingLastTold = readingAsJson;
    listener(reading);
  };
  const stopWatching = sources.watchChanges(tellTheAreas);
  tellTheAreas();
  return stopWatching;
}

/** Area `areaId` of the layout showing `viewTypeId`, or why it can't. */
export function showViewTypeInAreaOf(viewTypeId: string, areaId: string, sources: StudioViewTypeAreaSources): ViewOpening {
  const areas = areasForTheViewTypeOf(viewTypeId, sources);
  if (areas.kind === "not_a_view_type") return { kind: "not_opened", because: `Tato Studio has no view named ${viewTypeId}.` };
  if (areas.kind === "no_areas") return { kind: "not_opened", because: areas.because };
  if (!areas.areas.some((area) => area.area_id === areaId)) return { kind: "not_opened", because: `The layout shown has no area ${areaId}.` };
  sources.showViewTypeInTheArea({ view_type_id: viewTypeId, area_id: areaId });
  return { kind: "opened" };
}
