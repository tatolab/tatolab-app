import type { PoppedOutViewerTarget, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { WaitingState } from "../design_system/waiting_state";
import { presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { StudioViewFailureBoundary } from "../view_host/in_window_view_host";
import type { StudioViewHostServices, StudioViewTypeRegistry } from "../view_host/studio_view_type_registry";

/** The view type a popped-out window shows. */
const VIEWER_VIEW_TYPE_ID = "viewer";

/** The words a popped-out Viewer is titled with: the stream it plays, and the node it is pinned to. */
export function poppedOutViewerTitleWords(target: PoppedOutViewerTarget): string {
  return target.node === null ? target.display_name : `${target.display_name} › ${target.node}`;
}

/** A Viewer popped out of a studio window: the Viewer alone, pinned to `target`, under a title strip where macOS draws the window buttons over the content. */
export function PoppedOutViewerWindowView({
  target,
  viewTypeRegistry,
  viewHostServices,
  platform,
}: {
  target: PoppedOutViewerTarget;
  viewTypeRegistry: StudioViewTypeRegistry;
  viewHostServices: StudioViewHostServices;
  platform: TatolabPlatform;
}) {
  const viewerViewType = viewTypeRegistry.viewTypeWithId(VIEWER_VIEW_TYPE_ID);
  const titleWords = poppedOutViewerTitleWords(target);
  return (
    <div className="flex h-full flex-col bg-studio-frame text-studio" data-popped-out-viewer={target.stream}>
      {presentPlatform(platform).hasOverlayTitleBar && (
        <div
          className="flex h-(--studio-menu-bar-height) shrink-0 items-center justify-center border-b border-studio-frame bg-studio-menu-bar px-20 text-xs text-fg-2"
          data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined}
        >
          <span className="truncate" data-popped-out-viewer-title="">
            {titleWords}
          </span>
        </div>
      )}
      <main aria-label={`Viewer of ${titleWords}`} className="relative flex min-h-0 flex-1 flex-col">
        {viewerViewType === null ? (
          <WaitingState title="This build has no Viewer" explanation="Close this window and open the stream in the studio." />
        ) : (
          <StudioViewFailureBoundary viewTitle={viewerViewType.title}>
            {viewerViewType.renderInAnArea(undefined, viewHostServices, () => {}).body}
          </StudioViewFailureBoundary>
        )}
      </main>
    </div>
  );
}
