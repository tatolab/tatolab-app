// How a Linux viewer reads the runtime's frames, decided from the desktop session before any window opens.

import type { ViewerImageFrameReading } from "../viewer_image_frame_reading.js";

/** The session variables a Linux desktop sets, which Electron's own choice of Wayland or X11 follows. */
export interface LinuxDesktopSessionVariables {
  /** `XDG_SESSION_TYPE`: `wayland`, `x11`, or unset outside a graphical login. */
  xdgSessionType: string | undefined;
  /** `WAYLAND_DISPLAY`, set while a Wayland compositor answers. */
  waylandDisplay: string | undefined;
}

/**
 * A Wayland session imports each frame with no copy; any other session copies it through the CPU. Under X11 on NVIDIA's driver,
 * Chromium accepts a DMA-BUF import without error and shows black, so the choice is made from the session, never from an import's
 * answer. Intel and AMD under X11 copy too until a live run shows their import.
 */
export function viewerImageFrameReadingOfTheLinuxSession({ xdgSessionType, waylandDisplay }: LinuxDesktopSessionVariables): ViewerImageFrameReading {
  if (xdgSessionType === "wayland") return "display_import";
  if (xdgSessionType === "x11") return "cpu_read";
  return waylandDisplay !== undefined && waylandDisplay !== "" ? "display_import" : "cpu_read";
}
