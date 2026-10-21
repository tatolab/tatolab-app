// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { failedWith } from "../../result.js";
import { LINUX_TATOLAB_UNINSTALL, tatolabAppUpdatePackagingOnLinux } from "./mod.js";

test("Linux refuses Uninstall Tatolab… and says the installer does it, turning nothing off", async () => {
  const runTatolabSwitchCalls: boolean[] = [];
  expect(
    await LINUX_TATOLAB_UNINSTALL.uninstallTatolab({
      setRunTatolab: async (runTatolab) => {
        runTatolabSwitchCalls.push(runTatolab);
        return { kind: "unregistered" };
      },
    }),
  ).toEqual(failedWith("On Linux the installer uninstalls Tatolab: Settings › Uninstall Tatolab… shows how."));
  expect(runTatolabSwitchCalls).toEqual([]);
});

test("an AppImage replaces its own file, the .deb opens its download, and an unpackaged app updates nothing", () => {
  expect(tatolabAppUpdatePackagingOnLinux(true, "/home/ada/Applications/Tatolab-0.46.3-x86_64.AppImage")).toEqual({
    kind: "appimage",
    appImagePath: "/home/ada/Applications/Tatolab-0.46.3-x86_64.AppImage",
  });
  expect(tatolabAppUpdatePackagingOnLinux(true, undefined)).toEqual({ kind: "deb" });
  expect(tatolabAppUpdatePackagingOnLinux(true, "")).toEqual({ kind: "deb" });
  expect(tatolabAppUpdatePackagingOnLinux(false, "/tmp/.mount_Tatola/AppRun")).toEqual({ kind: "not_offered", reason: "Only a packaged Tatolab updates itself." });
});
