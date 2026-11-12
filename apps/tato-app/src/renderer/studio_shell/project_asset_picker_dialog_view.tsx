// The asset picker: the Library view framed in a dialog over the window while a view's asset pick is
// held, its frame alone served that pick, so it shows only the assets the pick asks for and answers it.

import { useMemo, useState } from "react";
import { DialogHoldingAView } from "@tatolab/tato-app-view-sdk/design_system/dialog_holding_a_view";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { projectAssetPickTitle } from "@tatolab/tato-app-core-views/shared/project_asset_media";
import type { JsonValue } from "../../shared/tatolab_backend_contract";
import type { ProjectAssetPickHeldInTheWindow } from "../view_host/project_asset_pick_held_in_the_window";
import type { StudioAreaExpansion, StudioViewHostServices, ViewHeaderRow } from "../view_host/studio_view_contract";
import { StudioViewFailureBoundary } from "../view_host/studio_view_failure_boundary";
import type { StudioViewTypeRegistry } from "../view_host/studio_view_type_registry";
import { useWatchedStudioValue, WatchedStudioValue } from "../view_host/watched_studio_value";

/** The view type the asset picker frames. */
const LIBRARY_VIEW_TYPE_ID = "library";

/** Why an asset pick ends when the person closes the picker. */
export const THE_ASSET_PICKER_CLOSED = "The asset picker closed.";

/** The dialog's title row stands where an area's header row would, and no view-type menu lies over the Library, so its own header row takes no height. */
const HEADER_ROW_OF_THE_ASSET_PICKER: ViewHeaderRow = { leading_inset_px: 0, height_px: 0 };

/** The asset picker's Library sits in no layout, so it is never expanded. */
const EXPANSION_OF_THE_ASSET_PICKER: StudioAreaExpansion = {
  watchIsExpanded: new WatchedStudioValue(false).watch,
  expand: () => ({ kind: "refused", because: "The asset picker holds the Library over the window, outside the layout." }),
};

/** The asset picker over the window while `projectAssetPickHeld` holds a pick: the Library, its title naming the media the pick takes; closing it ends the pick with nothing chosen. */
export function ProjectAssetPickerDialogView({
  projectAssetPickHeld,
  viewTypeRegistry,
  viewHostServices,
}: {
  projectAssetPickHeld: ProjectAssetPickHeldInTheWindow;
  viewTypeRegistry: StudioViewTypeRegistry;
  viewHostServices: StudioViewHostServices;
}) {
  const projectAssetPick = useWatchedStudioValue(projectAssetPickHeld.projectAssetPick);
  const viewHostServicesOfThePicker = useMemo(
    (): StudioViewHostServices => ({ ...viewHostServices, watchProjectAssetPickShownHere: projectAssetPickHeld.projectAssetPick.watch }),
    [viewHostServices, projectAssetPickHeld],
  );
  // The picker's Library keeps what it remembers, as the folder shown, from one pick to the next while the project is shown, and never writes the studio's layouts.
  const [settingsKept, keepSettings] = useState<JsonValue | undefined>(undefined);
  const [headerRow] = useState(() => new WatchedStudioValue<ViewHeaderRow>(HEADER_ROW_OF_THE_ASSET_PICKER));
  if (projectAssetPick === null) return null;
  const libraryViewType = viewTypeRegistry.viewTypeWithId(LIBRARY_VIEW_TYPE_ID);
  return (
    <DialogHoldingAView isOpen title={projectAssetPickTitle(projectAssetPick.media)} onOpenChange={(isOpen) => !isOpen && projectAssetPickHeld.end(THE_ASSET_PICKER_CLOSED)} data-project-asset-picker="">
      {libraryViewType === null ? (
        <WaitingState isFailure title="This build has no Library view" explanation="The asset picker shows the Library, which this build of Tato Studio lacks." />
      ) : (
        <StudioViewFailureBoundary viewTitle={libraryViewType.title}>
          {libraryViewType.renderInAnArea(
            { area_id: null, saved_settings: settingsKept, rememberSettings: keepSettings, header_row: headerRow, expansion: EXPANSION_OF_THE_ASSET_PICKER },
            viewHostServicesOfThePicker,
          )}
        </StudioViewFailureBoundary>
      )}
    </DialogHoldingAView>
  );
}
