import { expect, test } from "vitest";
import { tatolabAppUpdatePackagingOnLinux } from "./tatolab_app_update_packaging_on_linux.js";

test("an AppImage replaces its own file, the .deb opens its download, and an unpackaged app updates nothing", () => {
  expect(tatolabAppUpdatePackagingOnLinux(true, "/home/ada/Applications/Tatolab-0.46.3-x86_64.AppImage")).toEqual({
    kind: "appimage",
    appImagePath: "/home/ada/Applications/Tatolab-0.46.3-x86_64.AppImage",
  });
  expect(tatolabAppUpdatePackagingOnLinux(true, undefined)).toEqual({ kind: "deb" });
  expect(tatolabAppUpdatePackagingOnLinux(true, "")).toEqual({ kind: "deb" });
  expect(tatolabAppUpdatePackagingOnLinux(false, "/tmp/.mount_Tatola/AppRun")).toEqual({ kind: "not_offered", reason: "Only a packaged Spudnik Studio updates itself." });
});
