// The studio's view types whose views are built by later issues: each is listed in the view-type menu
// and its area says which work it waits on.

import { WaitingState } from "../../design_system/waiting_state";
import type { StudioIconName, StudioViewType } from "../../view_host/studio_view_contract";

function viewTypeArrivingLater(viewTypeId: string, title: string, icon: StudioIconName, waitsOn: string): StudioViewType<null> {
  return {
    view_type_id: viewTypeId,
    title,
    icon,
    brought_by: { kind: "built_in" },
    default_settings: null,
    settingsFromSavedLayout: () => null,
    renderStudioView: () => ({
      header_tools: null,
      body: <WaitingState title={`${title} isn't in this build yet`} waitsOn={waitsOn} data-view-arriving-later={viewTypeId} />,
    }),
  };
}

/** A port's live view, which tatolab-app#135 builds. */
export const VIEWER_VIEW_TYPE = viewTypeArrivingLater("viewer", "Viewer", "viewer", "tatolab/tatolab-app#135");
