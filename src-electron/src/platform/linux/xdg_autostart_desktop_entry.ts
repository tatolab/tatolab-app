// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// "Open Tatolab at login" on Linux: an XDG autostart entry, `Tatolab.desktop` in
// `$XDG_CONFIG_HOME/autostart/` (`~/.config/autostart/`), which the desktop session opens at login.
// Electron has no login-item settings on Linux. The app writes the entry when the person turns the
// switch on and removes it when they turn it off; nothing else of theirs is touched.

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TatolabAppOpenAtLogin } from "../../../../src/backend/tatolab_backend_contract.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { TatolabAppOpenedAtLogin } from "../tatolab_app_opened_at_login.js";

/** The autostart entry's file name, matching the installed desktop entry's. */
export const TATOLAB_AUTOSTART_DESKTOP_ENTRY_FILE_NAME = "Tatolab.desktop";

/** `$XDG_CONFIG_HOME/autostart`, or `$HOME/.config/autostart` where `$XDG_CONFIG_HOME` is unset, empty or relative, as the XDG Base Directory spec says. */
export function xdgAutostartDirectory(xdgConfigHome: string | undefined, homeDirectory: string): string {
  const configHome = xdgConfigHome !== undefined && path.isAbsolute(xdgConfigHome) ? xdgConfigHome : path.join(homeDirectory, ".config");
  return path.join(configHome, "autostart");
}

/**
 * `programPath` as one Exec argument: bare when it holds only characters the Exec key takes as they are; otherwise
 * quoted with `"`, `` ` ``, `$` and `\` escaped, then every backslash doubled by the string escape the spec applies first.
 */
export function desktopEntryExecArgument(programPath: string): string {
  if (/^[A-Za-z0-9_/.+-]+$/.test(programPath)) return programPath;
  const quotedArgument = `"${programPath.replace(/[\\"`$]/g, (reservedCharacter) => `\\${reservedCharacter}`)}"`;
  return quotedArgument.replace(/\\/g, "\\\\");
}

/** The autostart entry that opens `appProgramPath` at login. */
export function tatolabAutostartDesktopEntry(appProgramPath: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Tatolab",
    "Comment=Opens Tatolab at login",
    `Exec=${desktopEntryExecArgument(appProgramPath)}`,
    "Icon=Tatolab",
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

/** Whether an autostart entry's text opens its program: the desktop skips one marked `Hidden=true` or `X-GNOME-Autostart-enabled=false`. */
export function autostartDesktopEntryOpensAtLogin(desktopEntryText: string): boolean {
  const keyLines = desktopEntryText.split("\n").map((desktopEntryLine) => desktopEntryLine.trim());
  return !keyLines.includes("Hidden=true") && !keyLines.includes("X-GNOME-Autostart-enabled=false");
}

/** The autostart entry in `autostartDirectory` that opens `appProgramPath`, the AppImage or the installed app binary. */
export class XdgAutostartDesktopEntry implements TatolabAppOpenedAtLogin {
  private readonly desktopEntryPath: string;

  constructor(
    autostartDirectory: string,
    private readonly appProgramPath: string,
  ) {
    this.desktopEntryPath = path.join(autostartDirectory, TATOLAB_AUTOSTART_DESKTOP_ENTRY_FILE_NAME);
  }

  async readOpenAtLogin(): Promise<TatolabAppOpenAtLogin> {
    let desktopEntryText: string;
    try {
      desktopEntryText = await readFile(this.desktopEntryPath, "utf8");
    } catch {
      return { kind: "off" };
    }
    return autostartDesktopEntryOpensAtLogin(desktopEntryText) ? { kind: "on" } : { kind: "off" };
  }

  async setOpenAtLogin(openAtLogin: boolean): Promise<Result<void, string>> {
    try {
      if (!openAtLogin) {
        await rm(this.desktopEntryPath, { force: true });
        return succeeded(undefined);
      }
      const partiallyWrittenPath = `${this.desktopEntryPath}.partial`;
      await mkdir(path.dirname(this.desktopEntryPath), { recursive: true });
      await writeFile(partiallyWrittenPath, tatolabAutostartDesktopEntry(this.appProgramPath));
      await rename(partiallyWrittenPath, this.desktopEntryPath);
      return succeeded(undefined);
    } catch (writeFailure) {
      return failedWith(
        `${openAtLogin ? "Tatolab could not write" : "Tatolab could not remove"} ${this.desktopEntryPath}: ${describeCaughtFailure(writeFailure)}`,
      );
    }
  }
}
