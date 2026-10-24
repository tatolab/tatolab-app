// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { failedWith } from "../../result.js";
import { LINUX_TATOLAB_UNINSTALL, tatolabAppOpenedAtLoginOnLinux, tatolabAppUpdatePackagingOnLinux } from "./mod.js";

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

test("Open Tatolab at login writes an autostart entry opening the AppImage or the installed binary, and an unpackaged app offers none", async () => {
  const configHome = await mkdtemp(path.join(os.tmpdir(), "tl-app-xdg-config-"));
  try {
    const appImage = tatolabAppOpenedAtLoginOnLinux(true, "/tmp/.mount_Tatola/Tatolab", "/home/ada/Applications/Tatolab-0.55.2-x86_64.AppImage", configHome, "/home/ada");
    await appImage.setOpenAtLogin(true);
    expect(await readFile(path.join(configHome, "autostart", "Tatolab.desktop"), "utf8")).toContain("\nExec=/home/ada/Applications/Tatolab-0.55.2-x86_64.AppImage\n");

    const installedBinary = tatolabAppOpenedAtLoginOnLinux(true, "/usr/lib/tatolab/Tatolab", undefined, configHome, "/home/ada");
    await installedBinary.setOpenAtLogin(true);
    expect(await readFile(path.join(configHome, "autostart", "Tatolab.desktop"), "utf8")).toContain("\nExec=/usr/lib/tatolab/Tatolab\n");
  } finally {
    await rm(configHome, { recursive: true, force: true });
  }

  const unpackaged = tatolabAppOpenedAtLoginOnLinux(false, "/home/ada/tatolab-app/node_modules/electron/dist/electron", undefined, undefined, "/home/ada");
  expect(await unpackaged.readOpenAtLogin()).toEqual({ kind: "not_offered", reason: "Only a packaged Tatolab opens at login." });
  expect(await unpackaged.setOpenAtLogin(true)).toEqual(failedWith("Only a packaged Tatolab opens at login."));
});
