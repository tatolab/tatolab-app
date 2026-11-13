// Loading Tato Studio's viewer addon (`native/tatolab-runtime-viewer-frame-import`), built to
// `out/native/` beside the app, and opening a runtime viewer's channel reader on it.

import { createRequire } from "node:module";
import type { OpenedRuntimeViewer } from "./runtime_viewer_control_connection.js";
import type { ViewerImageFrameReading } from "./platform/viewer_image_frame_reading.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { RuntimeViewerChannelReaderOfTheAddon } from "./runtime_viewer_image_frame_import.js";

/** The addon's file name under `out/native/`, as `scripts/build-tatolab-runtime-viewer-frame-import.sh` writes it. */
export const RUNTIME_VIEWER_FRAME_IMPORT_ADDON_FILE_NAME = "tatolab_runtime_viewer_frame_import.node";

/** What the addon exports: its napi-rs class, whose constructor refuses by throwing in the addon's words. */
interface RuntimeViewerFrameImportAddon {
  RuntimeViewerChannelReader: new (
    iceoryx2DomainRoot: string,
    channel: string,
    wakeService: string,
    surfaceShareAddress: string | null,
    viewerNodeName: string,
    viewedFrameReadBy: ViewerImageFrameReading,
  ) => RuntimeViewerChannelReaderOfTheAddon;
}

function isTheRuntimeViewerFrameImportAddon(loadedModule: unknown): loadedModule is RuntimeViewerFrameImportAddon {
  return typeof loadedModule === "object" && loadedModule !== null && "RuntimeViewerChannelReader" in loadedModule && typeof loadedModule.RuntimeViewerChannelReader === "function";
}

function loadTheRuntimeViewerFrameImportAddon(addonPath: string): Result<RuntimeViewerFrameImportAddon, string> {
  try {
    const loadedModule: unknown = createRequire(import.meta.url)(addonPath);
    if (isTheRuntimeViewerFrameImportAddon(loadedModule)) return succeeded(loadedModule);
    return failedWith(`${addonPath} is not Tato Studio's viewer addon`);
  } catch (loadFailure) {
    return failedWith(`Tato Studio's viewer addon did not load from ${addonPath}: ${describeCaughtFailure(loadFailure)}`);
  }
}

/** What opens a channel reader on the addon at `addonPath` that reads each Image frame by `viewerImageFrameReading`, loading the addon on the first open; a refusal, or an addon that did not load, is answered in words. */
export function runtimeViewerChannelReaderOpenerOver(
  addonPath: string,
  viewerImageFrameReading: ViewerImageFrameReading,
): (openedViewer: OpenedRuntimeViewer, viewerNodeName: string) => Result<RuntimeViewerChannelReaderOfTheAddon, string> {
  let loadedAddon: Result<RuntimeViewerFrameImportAddon, string> | null = null;
  return (openedViewer, viewerNodeName) => {
    loadedAddon ??= loadTheRuntimeViewerFrameImportAddon(addonPath);
    if (!loadedAddon.ok) return loadedAddon;
    try {
      return succeeded(
        new loadedAddon.value.RuntimeViewerChannelReader(
          openedViewer.iceoryx2_domain_root,
          openedViewer.channel,
          openedViewer.wake_service,
          openedViewer.surface_share_address,
          viewerNodeName,
          viewerImageFrameReading,
        ),
      );
    } catch (openFailure) {
      return failedWith(describeCaughtFailure(openFailure));
    }
  };
}
