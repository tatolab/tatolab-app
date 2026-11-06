import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { failedWith } from "../../result.js";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import { tatolabAppOpenedAtLoginOnLinux } from "./tatolab_app_opened_at_login_on_linux.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

test("Open Tato Studio at login writes an autostart entry opening the AppImage or the installed binary, and an unpackaged app offers none", async () => {
  const configHome = await mkdtemp(path.join(os.tmpdir(), "tl-app-xdg-config-"));
  try {
    const appImage = tatolabAppOpenedAtLoginOnLinux(
      { kind: "appimage", appImagePath: "/home/ada/Applications/Tatolab-0.55.2-x86_64.AppImage" },
      "/tmp/.mount_Tatola/Tatolab",
      configHome,
      "/home/ada",
      quietTatolabAppLog,
    );
    await appImage.setOpenAtLogin(true);
    expect(await readFile(path.join(configHome, "autostart", "Tatolab.desktop"), "utf8")).toContain("\nExec=/home/ada/Applications/Tatolab-0.55.2-x86_64.AppImage\n");

    const installedBinary = tatolabAppOpenedAtLoginOnLinux({ kind: "deb" }, "/usr/lib/tatolab/Tatolab", configHome, "/home/ada", quietTatolabAppLog);
    await installedBinary.setOpenAtLogin(true);
    expect(await readFile(path.join(configHome, "autostart", "Tatolab.desktop"), "utf8")).toContain("\nExec=/usr/lib/tatolab/Tatolab\n");
  } finally {
    await rm(configHome, { recursive: true, force: true });
  }

  const unpackaged = tatolabAppOpenedAtLoginOnLinux(
    { kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." },
    "/home/ada/tatolab-app/node_modules/electron/dist/electron",
    undefined,
    "/home/ada",
    quietTatolabAppLog,
  );
  expect(await unpackaged.readOpenAtLogin()).toEqual({ kind: "not_offered", reason: "Only a packaged Tato Studio opens at login." });
  expect(await unpackaged.setOpenAtLogin(true)).toEqual(failedWith("Only a packaged Tato Studio opens at login."));
});
