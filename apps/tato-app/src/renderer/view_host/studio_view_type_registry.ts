import { readTatolabViewManifest, type TatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import type { ReactNode } from "react";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import type { StudioAreaHeaderMenuIcon } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import type { JsonValue, StudioViewHostServices, StudioViewTypeSource, ViewHeaderRow } from "./studio_view_contract";
import { WatchedStudioValue } from "./watched_studio_value";

/** What an area hands the view type it draws: the settings it saved, keeping the next ones, and where a frame's own header row lies. */
export interface StudioAreaOfTheView {
  saved_settings: JsonValue | undefined;
  rememberSettings(nextSettings: JsonValue): void;
  header_row: WatchedStudioValue<ViewHeaderRow>;
}

/** A view type as the registry holds it, made from its manifest: what the view-type menu lists, and how an area draws its frame. */
export interface RegisteredStudioViewType {
  view_type_id: string;
  title: string;
  icon: StudioAreaHeaderMenuIcon;
  brought_by: StudioViewTypeSource;
  /** The view's frame across `area`, on the settings the area saved. */
  renderInAnArea(area: StudioAreaOfTheView, hostServices: StudioViewHostServices): ReactNode;
}

/** The views the open project and its imports bring, as the backend lists them, or why it lists none. */
export type ProjectStudioViewsReading =
  | { kind: "none_open" }
  | { kind: "listed"; studio_views: ListedStudioView[] }
  | { kind: "not_listed"; because: string };

/** A view the open project brings that does not open, and why, in words naming its manifest's field. */
export interface ProjectStudioViewNotOpened {
  view_type_id: string;
  because: string;
}

/** Makes the view type a listed view's manifest declares, brought by the project its `project_name` names: the open project or the import whose `views/` holds it. */
export type ProjectStudioViewTypeMaker = (listed: ListedStudioView, manifest: TatolabViewManifest) => RegisteredStudioViewType;

interface ProjectStudioViewTypesRead {
  readFrom: ProjectStudioViewsReading;
  viewTypes: RegisteredStudioViewType[];
  notOpened: ProjectStudioViewNotOpened[];
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
    private readonly studioViewTypesNotOpenedList: readonly ProjectStudioViewNotOpened[] = [],
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
  studioViewTypesNotOpened(): readonly ProjectStudioViewNotOpened[] {
    return this.studioViewTypesNotOpenedList;
  }

  /** The view types the open project and its imports bring. */
  projectViewTypes(): RegisteredStudioViewType[] {
    return [...[...this.viewTypesById.values()].filter((viewType) => viewType.brought_by.kind === "project"), ...this.readProjectStudioViewTypes().viewTypes];
  }

  /** The views the open project brings that do not open, each with why. */
  projectViewTypesNotOpened(): ProjectStudioViewNotOpened[] {
    return this.readProjectStudioViewTypes().notOpened;
  }

  private readProjectStudioViewTypes(): ProjectStudioViewTypesRead {
    const reading = this.projectStudioViews.readLatest();
    if (this.projectStudioViewTypesRead?.readFrom === reading) return this.projectStudioViewTypesRead;
    const viewTypes: RegisteredStudioViewType[] = [];
    const notOpened: ProjectStudioViewNotOpened[] = [];
    if (reading.kind === "listed" && this.projectStudioViewTypeOf !== null) {
      for (const listed of reading.studio_views) {
        if (!listed.opens) {
          notOpened.push({ view_type_id: listed.view_type_id, because: listed.not_opened_because });
          continue;
        }
        const manifestReading = readTatolabViewManifest(listed.manifest_json);
        if (manifestReading.kind === "not_read") notOpened.push({ view_type_id: listed.view_type_id, because: manifestReading.because });
        else if (this.viewTypesById.has(listed.view_type_id) || this.viewTypesOfferedInDeveloperModeById.has(listed.view_type_id)) notOpened.push({ view_type_id: listed.view_type_id, because: `The studio already has a view named ${listed.view_type_id}.` });
        else viewTypes.push(this.projectStudioViewTypeOf(listed, manifestReading.manifest));
      }
    }
    this.projectStudioViewTypesRead = { readFrom: reading, viewTypes, notOpened };
    return this.projectStudioViewTypesRead;
  }
}
