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

/** The stream graph, which tatolab-app#130 builds. */
export const STREAM_GRAPH_VIEW_TYPE = viewTypeArrivingLater("stream_graph", "Stream graph", "stream_graph", "tatolab/tatolab-app#130");
/** The selection's properties, which tatolab-app#130 builds. */
export const PROPERTIES_VIEW_TYPE = viewTypeArrivingLater("properties", "Properties", "properties", "tatolab/tatolab-app#130");
/** A port's live view, which tatolab-app#135 builds. */
export const VIEWER_VIEW_TYPE = viewTypeArrivingLater("viewer", "Viewer", "viewer", "tatolab/tatolab-app#135");
/** The code pane, which tatolab-app#132 builds. */
export const CODE_VIEW_TYPE = viewTypeArrivingLater("code", "Code", "code", "tatolab/tatolab-app#132");
/** The agent panel, which tatolab-app#136 builds. */
export const AGENT_VIEW_TYPE = viewTypeArrivingLater("agent", "Agent", "agent", "tatolab/tatolab-app#136");
