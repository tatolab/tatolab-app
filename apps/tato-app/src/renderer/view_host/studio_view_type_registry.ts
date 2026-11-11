import { readTatolabViewManifest, type TatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import type { ReactNode } from "react";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import type { StudioAreaHeaderMenuIcon } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import type { JsonValue, StopWatching, StudioAreaExpansion, StudioViewHostServices, StudioViewTypeSource, ViewHeaderRow } from "./studio_view_contract";
import { WatchedStudioValue } from "./watched_studio_value";

/** What an area hands the view type it draws: the settings it saved, keeping the next ones, and where a frame's own header row lies. */
export interface StudioAreaOfTheView {
  /** The area's id in the chosen layout; `null` where the view shows outside one, as a popped-out view does. */
  area_id: string | null;
  saved_settings: JsonValue | undefined;
  rememberSettings(nextSettings: JsonValue): void;
  header_row: WatchedStudioValue<ViewHeaderRow>;
  expansion: StudioAreaExpansion;
}

/** A view type as the registry holds it, made from its manifest: what the view-type menu lists, and how an area draws its frame. */
export interface RegisteredStudioViewType {
  view_type_id: string;
  title: string;
  icon: StudioAreaHeaderMenuIcon;
  brought_by: StudioViewTypeSource;
  /** The manifest the view type was made from. */
  manifest: TatolabViewManifest;
  /** The view's frame across `area`, on the settings the area saved. */
  renderInAnArea(area: StudioAreaOfTheView, hostServices: StudioViewHostServices): ReactNode;
  /** Words Studio draws after the area's view-type menu, such as which node a node view shows; absent when the view draws its whole header row. */
  renderWordsAfterTheViewTypeMenu?(hostServices: StudioViewHostServices): ReactNode;
}

/** The views the open project and its imports bring, as the backend lists them, or why it lists none. */
export type ProjectStudioViewsReading =
  | { kind: "none_open" }
  | { kind: "listed"; studio_views: ListedStudioView[] }
  | { kind: "not_listed"; because: string };

/** A view that does not open, named as its manifest titles it and by who brought it, and why, in words naming its manifest's field or the runtime's. */
export interface StudioViewNotOpened {
  view_type_id: string;
  /** Its manifest's `title`, or its view type id when the manifest names none. */
  title: string;
  brought_by: StudioViewTypeSource;
  because: string;
}

/** The `title` the manifest `manifestJson` names, or `fallbackTitle` when it names none. */
export function titleTheManifestNames(manifestJson: JsonValue | null, fallbackTitle: string): string {
  if (typeof manifestJson !== "object" || manifestJson === null || Array.isArray(manifestJson)) return fallbackTitle;
  const title = manifestJson["title"];
  return typeof title === "string" && title !== "" ? title : fallbackTitle;
}

/** Makes the view type a listed view's manifest declares, brought by the project its `project_name` names: the open project or the import whose `views/` holds it. */
export type ProjectStudioViewTypeMaker = (listed: ListedStudioView, manifest: TatolabViewManifest) => RegisteredStudioViewType;

interface ProjectStudioViewTypesRead {
  readFrom: ProjectStudioViewsReading;
  viewTypes: RegisteredStudioViewType[];
  notOpened: StudioViewNotOpened[];
}

/** Every view type an area can show, by id: the studio's own, then those the open project brings. */
export class StudioViewTypeRegistry {
  private readonly viewTypesById = new Map<string, RegisteredStudioViewType>();
  /** What the backend lists of the open project's views; each area and the view-type menu redraw on a new listing. */
  readonly projectStudioViews = new WatchedStudioValue<ProjectStudioViewsReading>({ kind: "none_open" });
  private projectStudioViewTypesRead: ProjectStudioViewTypesRead | null = null;
  private readonly viewTypesOfferedInDeveloperModeById = new Map<string, RegisteredStudioViewType>();
  /** Whether Developer mode is on, as the status carries it; each area and the view-type menu redraw when it changes. */
  readonly developerMode = new WatchedStudioValue<boolean>(false);

  constructor(
    viewTypes: readonly RegisteredStudioViewType[],
    private readonly projectStudioViewTypeOf: ProjectStudioViewTypeMaker | null = null,
    private readonly studioViewTypesNotOpenedList: readonly StudioViewNotOpened[] = [],
    viewTypesOfferedInDeveloperMode: readonly RegisteredStudioViewType[] = [],
  ) {
    for (const viewType of viewTypes) this.viewTypesById.set(viewType.view_type_id, viewType);
    for (const viewType of viewTypesOfferedInDeveloperMode) this.viewTypesOfferedInDeveloperModeById.set(viewType.view_type_id, viewType);
  }

  private viewTypesOfferedNow(): RegisteredStudioViewType[] {
    return [...this.viewTypesById.values(), ...(this.developerMode.readLatest() ? this.viewTypesOfferedInDeveloperModeById.values() : [])];
  }

  /** The view type `viewTypeId` names, or `null` for one this build does not hold and the open project does not bring. */
  viewTypeWithId(viewTypeId: string): RegisteredStudioViewType | null {
    return this.viewTypesOfferedNow().find((viewType) => viewType.view_type_id === viewTypeId) ?? this.readProjectStudioViewTypes().viewTypes.find((viewType) => viewType.view_type_id === viewTypeId) ?? null;
  }

  /** The view type `viewTypeId` names when Developer mode offers it and is off now, or `null`. */
  viewTypeHeldForDeveloperMode(viewTypeId: string): RegisteredStudioViewType | null {
    return this.developerMode.readLatest() ? null : (this.viewTypesOfferedInDeveloperModeById.get(viewTypeId) ?? null);
  }

  /** The studio's own view types, in the order the view-type menu lists them, those Developer mode offers last while it is on. */
  studioViewTypes(): RegisteredStudioViewType[] {
    return this.viewTypesOfferedNow().filter((viewType) => viewType.brought_by.kind === "tato_studio");
  }

  /** Studio's own views that do not open, each with why. */
  studioViewTypesNotOpened(): readonly StudioViewNotOpened[] {
    return this.studioViewTypesNotOpenedList;
  }

  /** The view types the open project and its imports bring. */
  projectViewTypes(): RegisteredStudioViewType[] {
    return [...[...this.viewTypesById.values()].filter((viewType) => viewType.brought_by.kind === "project"), ...this.readProjectStudioViewTypes().viewTypes];
  }

  /** The views the open project brings that do not open, each with why. */
  projectViewTypesNotOpened(): StudioViewNotOpened[] {
    return this.readProjectStudioViewTypes().notOpened;
  }

  private readProjectStudioViewTypes(): ProjectStudioViewTypesRead {
    const reading = this.projectStudioViews.readLatest();
    if (this.projectStudioViewTypesRead?.readFrom === reading) return this.projectStudioViewTypesRead;
    const viewTypes: RegisteredStudioViewType[] = [];
    const notOpened: StudioViewNotOpened[] = [];
    if (reading.kind === "listed" && this.projectStudioViewTypeOf !== null) {
      for (const listed of reading.studio_views) {
        const notOpenedBecause = (because: string): StudioViewNotOpened => ({
          view_type_id: listed.view_type_id,
          title: titleTheManifestNames(listed.manifest_json, listed.view_type_id),
          brought_by: { kind: "project", project_name: listed.project_name },
          because,
        });
        if (!listed.opens) {
          notOpened.push(notOpenedBecause(listed.not_opened_because));
          continue;
        }
        const manifestReading = readTatolabViewManifest(listed.manifest_json);
        if (manifestReading.kind === "not_read") notOpened.push(notOpenedBecause(manifestReading.because));
        else if (this.viewTypesById.has(listed.view_type_id) || this.viewTypesOfferedInDeveloperModeById.has(listed.view_type_id)) notOpened.push(notOpenedBecause(`The studio already has a view named ${listed.view_type_id}.`));
        else viewTypes.push(this.projectStudioViewTypeOf(listed, manifestReading.manifest));
      }
    }
    this.projectStudioViewTypesRead = { readFrom: reading, viewTypes, notOpened };
    return this.projectStudioViewTypesRead;
  }
}

/** The titles `registry`'s view types go by, which change as the open project's views are listed again or Developer mode turns on or off. */
export function studioViewTypeTitlesOf(registry: StudioViewTypeRegistry): { viewTitleOf(viewTypeId: string): string | null; watchChanges(onChanged: () => void): StopWatching } {
  return {
    viewTitleOf: (viewTypeId) => registry.viewTypeWithId(viewTypeId)?.title ?? null,
    watchChanges: (onChanged) => {
      const stopWatchingEach = [registry.projectStudioViews.watch(onChanged), registry.developerMode.watch(onChanged)];
      return () => {
        for (const stopWatching of stopWatchingEach) stopWatching();
      };
    },
  };
}
