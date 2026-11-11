import { expect, test } from "vitest";
import { LINUX_CHROMIUM_COMMAND_LINE_SWITCHES, viewerImageFrameReadingOfTheLinuxSession } from "./viewer_image_frame_reading_on_linux.js";

test("a Wayland session imports each frame, and an X11 session copies it however a Wayland display is named", () => {
  expect(viewerImageFrameReadingOfTheLinuxSession({ xdgSessionType: "wayland", waylandDisplay: "wayland-0" })).toBe("display_import");
  expect(viewerImageFrameReadingOfTheLinuxSession({ xdgSessionType: "wayland", waylandDisplay: undefined })).toBe("display_import");
  expect(viewerImageFrameReadingOfTheLinuxSession({ xdgSessionType: "x11", waylandDisplay: undefined })).toBe("cpu_read");
  expect(viewerImageFrameReadingOfTheLinuxSession({ xdgSessionType: "x11", waylandDisplay: "wayland-0" })).toBe("cpu_read");
});

test("a session that names no type imports only while a Wayland display answers", () => {
  expect(viewerImageFrameReadingOfTheLinuxSession({ xdgSessionType: undefined, waylandDisplay: "wayland-1" })).toBe("display_import");
  expect(viewerImageFrameReadingOfTheLinuxSession({ xdgSessionType: "tty", waylandDisplay: undefined })).toBe("cpu_read");
  expect(viewerImageFrameReadingOfTheLinuxSession({ xdgSessionType: undefined, waylandDisplay: "" })).toBe("cpu_read");
});

test("Studio starts Chromium on ANGLE's Vulkan backend on Linux", () => {
  expect(LINUX_CHROMIUM_COMMAND_LINE_SWITCHES).toEqual([{ name: "use-angle", value: "vulkan" }]);
});
