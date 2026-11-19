import type { JsonValue, StreamTabAddress, StudioSelection } from "@tatolab/tato-app-view-sdk/studio_readings";
import { streamTabAddressSchema, studioSelectionSchema } from "@tatolab/tato-app-view-sdk/studio_host";
import { Result, Schema } from "effect";
import type { PoppedOutView } from "../../shared/tatolab_backend_contract";

/** What a popped-out view's window pins it to: the stream tab shown and the selection as they were when it popped out, and the settings its area held. */
export interface PoppedOutViewPin {
  stream_tab: StreamTabAddress | null;
  selection: StudioSelection;
  /** `null` for an area that kept none, so the view opens on its defaults. */
  settings: JsonValue;
}

/** What an area pops out with: its view type and title, the settings it holds, and the window's stream tab, selection and project. */
export interface AreaPoppingOut {
  view_type_id: string;
  view_title: string;
  settings: JsonValue | undefined;
  stream_tab: StreamTabAddress | null;
  selection: StudioSelection;
  project_name: string | null;
}

/** The words a popped-out view's window is titled with: the stream it shows and the node selected in it, or else the project, then the view. */
function poppedOutViewWindowTitleOf(areaPoppingOut: AreaPoppingOut): string {
  const { stream_tab: streamTab, selection, view_title: viewTitle } = areaPoppingOut;
  if (streamTab !== null) {
    const selectedNode = selection.kind === "node" && selection.stream === streamTab.stream ? selection.node : null;
    return `${streamTab.display_name}${selectedNode === null ? "" : ` › ${selectedNode}`} · ${viewTitle}`;
  }
  return areaPoppingOut.project_name === null ? viewTitle : `${areaPoppingOut.project_name} · ${viewTitle}`;
}

/** The popped-out view an area pops out as, pinned to the window's stream tab and selection with the area's settings. */
export function poppedOutViewOfTheArea(areaPoppingOut: AreaPoppingOut): PoppedOutView {
  const { stream_tab: streamTab, selection } = areaPoppingOut;
  return {
    view_type_id: areaPoppingOut.view_type_id,
    window_title: poppedOutViewWindowTitleOf(areaPoppingOut),
    pinned_to: { stream_tab: streamTab, selection, settings: areaPoppingOut.settings ?? null },
  };
}

const decodeStreamTab = Schema.decodeUnknownResult(Schema.NullOr(streamTabAddressSchema));
const decodeSelection = Schema.decodeUnknownResult(studioSelectionSchema);

/** The pin a popped-out view's `pinned_to` names; `null` when it names none this window reads. */
export function poppedOutViewPinOf(pinnedTo: JsonValue): PoppedOutViewPin | null {
  if (typeof pinnedTo !== "object" || pinnedTo === null || Array.isArray(pinnedTo)) return null;
  const streamTab = decodeStreamTab(pinnedTo["stream_tab"]);
  const selection = decodeSelection(pinnedTo["selection"]);
  const settings = pinnedTo["settings"];
  if (Result.isFailure(streamTab) || Result.isFailure(selection) || settings === undefined) return null;
  return { stream_tab: streamTab.success, selection: selection.success, settings };
}
