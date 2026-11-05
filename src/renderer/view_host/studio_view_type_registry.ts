import type { StudioIconName } from "../design_system/studio_icons";
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

/** Every view type an area can show, by id: the studio's own, then those the open workspace brings. */
export class StudioViewTypeRegistry {
  private readonly viewTypesById = new Map<string, RegisteredStudioViewType>();

  constructor(viewTypes: readonly RegisteredStudioViewType[]) {
    for (const viewType of viewTypes) this.viewTypesById.set(viewType.view_type_id, viewType);
  }

  /** The view type `viewTypeId` names, or `null` for one this build does not hold. */
  viewTypeWithId(viewTypeId: string): RegisteredStudioViewType | null {
    return this.viewTypesById.get(viewTypeId) ?? null;
  }

  /** The studio's own view types, in the order the view-type menu lists them. */
  studioViewTypes(): RegisteredStudioViewType[] {
    return [...this.viewTypesById.values()].filter((viewType) => viewType.brought_by.kind === "built_in");
  }

  /** The view types the open workspace's projects bring. */
  workspaceViewTypes(): RegisteredStudioViewType[] {
    return [...this.viewTypesById.values()].filter((viewType) => viewType.brought_by.kind === "workspace_project");
  }
}
