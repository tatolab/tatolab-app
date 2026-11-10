import { useState } from "react";
import type { JsonValue, PoppedOutView, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { StudioViewFailureBoundary, WatchedStudioValue } from "../view_host/in_window_view_host";
import type { ViewHeaderRow } from "../view_host/studio_view_contract";
import type { StudioViewHostServices, StudioViewTypeRegistry } from "../view_host/studio_view_type_registry";
import { poppedOutViewPinOf } from "./popped_out_view_pin";

const HEADER_ROW_OF_THE_POPPED_OUT_AREA: ViewHeaderRow = { leading_inset_px: 0, height_px: 30 };

/** A view popped out of a studio window: that view alone, with the settings its area held, under a title strip where macOS draws the window buttons over the content. */
export function PoppedOutViewWindowView({
  target,
  viewTypeRegistry,
  viewHostServices,
  platform,
}: {
  target: PoppedOutView;
  viewTypeRegistry: StudioViewTypeRegistry;
  viewHostServices: StudioViewHostServices;
  platform: TatolabPlatform;
}) {
  const viewType = viewTypeRegistry.viewTypeWithId(target.view_type_id);
  // The window's one area keeps what the view remembers while it is open, and never writes the studio's layouts.
  const [settingsKept, keepSettings] = useState<JsonValue | undefined>(() => poppedOutViewPinOf(target.pinned_to)?.settings ?? undefined);
  const [headerRow] = useState(() => new WatchedStudioValue<ViewHeaderRow>(HEADER_ROW_OF_THE_POPPED_OUT_AREA));
  return (
    <div className="flex h-full flex-col bg-studio-frame text-studio" data-popped-out-view={target.view_type_id}>
      {presentPlatform(platform).hasOverlayTitleBar && (
        <div
          className="flex h-(--studio-menu-bar-height) shrink-0 items-center justify-center border-b border-studio-frame bg-studio-menu-bar px-20 text-xs text-fg-2"
          data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined}
        >
          <span className="truncate" data-popped-out-view-title="">
            {target.window_title}
          </span>
        </div>
      )}
      <main aria-label={target.window_title} className="relative flex min-h-0 flex-1 flex-col">
        {viewType === null ? (
          <WaitingState title={`This build has no ${target.view_type_id} view`} explanation="Close this window and open the view in the studio." />
        ) : (
          <StudioViewFailureBoundary viewTitle={viewType.title}>
            {((rendering) => (rendering.kind === "frame" ? rendering.frame : rendering.body))(
              viewType.renderInAnArea({ saved_settings: settingsKept, rememberSettings: keepSettings, header_row: headerRow }, viewHostServices),
            )}
          </StudioViewFailureBoundary>
        )}
      </main>
    </div>
  );
}
