import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import { readStudioViewManifest, type StudioViewManifest } from "../../shared/studio_view_manifest";
import type { StudioIconName } from "../design_system/studio_icons";
import { WatchedStudioValue } from "./in_window_view_host";
import type { JsonValue, StudioViewHostConnection, StudioViewRendering, StudioViewType, StudioViewTypeSource } from "./studio_view_contract";

/** What a host serves every view alike: the connection less the area's own settings. */
export type StudioViewHostServices = Omit<StudioViewHostConnection<JsonValue>, "settings" | "rememberSettings">;

/** A view type as the registry holds it, its settings' type kept inside: what the view-type menu lists, and how an area draws it. */
export interface RegisteredStudioViewType {
  view_type_id: string;
  title: string;
  icon: StudioIconName;
  brought_by: StudioViewTypeSource;
  /** The view drawn on the settings an area saved, or on the defaults when they no longer fit; `rememberSettings` keeps the next ones with the area. */
  renderInAnArea(savedSettings: JsonValue | undefined, hostServices: StudioViewHostServices, rememberSettings: (nextSettings: JsonValue) => void): StudioViewRendering;
}

/** `viewType` as the registry holds it. */
export function registeredStudioViewType<ViewSettings extends JsonValue>(viewType: StudioViewType<ViewSettings>): RegisteredStudioViewType {
  return {
    view_type_id: viewType.view_type_id,
    title: viewType.title,
    icon: viewType.icon,
    brought_by: viewType.brought_by,
    renderInAnArea: (savedSettings, hostServices, rememberSettings) =>
      viewType.renderStudioView({
        ...hostServices,
        settings: (savedSettings === undefined ? null : viewType.settingsFromSavedLayout(savedSettings)) ?? viewType.default_settings,
        rememberSettings,
      }),
  };
}

/** The views the open project and its imports bring, as the backend lists them, or why it lists none. */
export type ProjectStudioViewsReading =
  | { kind: "none_open" }
  | { kind: "listed"; project_name: string; studio_views: ListedStudioView[] }
  | { kind: "not_listed"; because: string };

/** A view the open project brings that does not open, and why, in words naming its manifest's field. */
export interface ProjectStudioViewNotOpened {
  view_type_id: string;
  because: string;
}

/** Makes the view type a listed view's manifest declares, brought by the project `projectName`. */
export type ProjectStudioViewTypeMaker = (listed: ListedStudioView, manifest: StudioViewManifest, projectName: string) => RegisteredStudioViewType;

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

  constructor(
    viewTypes: readonly RegisteredStudioViewType[],
    private readonly projectStudioViewTypeOf: ProjectStudioViewTypeMaker | null = null,
  ) {
    for (const viewType of viewTypes) this.viewTypesById.set(viewType.view_type_id, viewType);
  }

  /** The view type `viewTypeId` names, or `null` for one this build does not hold and the open project does not bring. */
  viewTypeWithId(viewTypeId: string): RegisteredStudioViewType | null {
    return this.viewTypesById.get(viewTypeId) ?? this.readProjectStudioViewTypes().viewTypes.find((viewType) => viewType.view_type_id === viewTypeId) ?? null;
  }

  /** The studio's own view types, in the order the view-type menu lists them. */
  studioViewTypes(): RegisteredStudioViewType[] {
    return [...this.viewTypesById.values()].filter((viewType) => viewType.brought_by.kind === "built_in");
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
        const manifestReading = readStudioViewManifest(listed.manifest_json);
        if (manifestReading.kind === "not_read") notOpened.push({ view_type_id: listed.view_type_id, because: manifestReading.because });
        else if (this.viewTypesById.has(listed.view_type_id)) notOpened.push({ view_type_id: listed.view_type_id, because: `The studio already has a view named ${listed.view_type_id}.` });
        else viewTypes.push(this.projectStudioViewTypeOf(listed, manifestReading.manifest, reading.project_name));
      }
    }
    this.projectStudioViewTypesRead = { readFrom: reading, viewTypes, notOpened };
    return this.projectStudioViewTypesRead;
  }
}
