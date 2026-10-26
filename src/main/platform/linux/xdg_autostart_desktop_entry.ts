// "Open Tatolab at login" on Linux: an XDG autostart entry, `Tatolab.desktop` in
// `$XDG_CONFIG_HOME/autostart/` (`~/.config/autostart/`), which the desktop session opens at login.
// Electron has no login-item settings on Linux. The app writes the entry when the person turns the
// switch on and removes it when they turn it off; nothing else of theirs is touched.

import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { TatolabAppOpenAtLogin } from "../../../shared/tatolab_backend_contract.js";
import { replaceFileWhole } from "../../file_replaced_whole.js";
import { isAMissingFileFailure } from "../../file_system_entries_on_this_machine.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
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

  /** The entry in `autostartDirectory` opening `appProgramPath`, logging to `tatolabAppLog` an entry that cannot be read. */
  constructor(
    autostartDirectory: string,
    private readonly appProgramPath: string,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {
    this.desktopEntryPath = path.join(autostartDirectory, TATOLAB_AUTOSTART_DESKTOP_ENTRY_FILE_NAME);
  }

  async readOpenAtLogin(): Promise<TatolabAppOpenAtLogin> {
    let desktopEntryText: string;
    try {
      desktopEntryText = await readFile(this.desktopEntryPath, "utf8");
    } catch (readFailure) {
      if (!isAMissingFileFailure(readFailure)) {
        this.tatolabAppLog.warn("the autostart entry could not be read; Open Tatolab at login reads as off", {
          path: this.desktopEntryPath,
          failure: describeCaughtFailure(readFailure),
        });
      }
      return { kind: "off" };
    }
    return autostartDesktopEntryOpensAtLogin(desktopEntryText) ? { kind: "on" } : { kind: "off" };
  }

  setOpenAtLogin(openAtLogin: boolean): Promise<Result<void, string>> {
    return openAtLogin ? this.writeTheAutostartEntry() : this.removeTheAutostartEntry();
  }

  private async writeTheAutostartEntry(): Promise<Result<void, string>> {
    const written = await replaceFileWhole(this.desktopEntryPath, tatolabAutostartDesktopEntry(this.appProgramPath));
    return written.ok ? written : failedWith(`Tatolab could not write ${this.desktopEntryPath}: ${written.failure}`);
  }

  private async removeTheAutostartEntry(): Promise<Result<void, string>> {
    try {
      await rm(this.desktopEntryPath, { force: true });
    } catch (removalFailure) {
      return failedWith(`Tatolab could not remove ${this.desktopEntryPath}: ${describeCaughtFailure(removalFailure)}`);
    }
    return succeeded(undefined);
  }
}
