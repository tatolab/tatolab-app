// An AppImage runs from a mount at a new path each time it opens, gone once it quits, so a link
// into it would dangle while the app is quit. The AppImage's CLI is copied to
// `$XDG_DATA_HOME/tato-studio/bin/tatolab`, and `~/.local/bin/tatolab` links to the copy.

import { copyFile, mkdir, rename, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";

/** The copy's place under the XDG data folder. */
const COMMAND_LINE_TOOL_COPY_INSIDE_THE_XDG_DATA_FOLDER = path.join("tato-studio", "bin", "tatolab");

/** Where an AppImage's CLI is copied for the user with `homeDirectory`, under `$XDG_DATA_HOME` when it is absolute, else `~/.local/share`. */
export function commandLineToolCopyOutsideTheAppImage(xdgDataHome: string | undefined, homeDirectory: string): string {
  const xdgDataFolder = xdgDataHome !== undefined && path.isAbsolute(xdgDataHome) ? xdgDataHome : path.join(homeDirectory, ".local", "share");
  return path.join(xdgDataFolder, COMMAND_LINE_TOOL_COPY_INSIDE_THE_XDG_DATA_FOLDER);
}

/** Copy the AppImage's CLI at `carriedCommandLineTool` to `copyPath`, unless a copy of the same size and modification time is there; refused in words. */
export async function copyTheCommandLineToolOutOfTheAppImage(carriedCommandLineTool: string, copyPath: string): Promise<Result<void, string>> {
  const copyBeingMade = `${copyPath}.tato-studio-copy`;
  try {
    const carried = await stat(carriedCommandLineTool);
    const copied = await stat(copyPath).catch(() => null);
    if (copied !== null && copied.size === carried.size && copied.mtimeMs === carried.mtimeMs) return succeeded(undefined);
    await mkdir(path.dirname(copyPath), { recursive: true });
    await copyFile(carriedCommandLineTool, copyBeingMade);
    await utimes(copyBeingMade, carried.atime, carried.mtime);
    // A rename replaces the file a running `tatolab` holds open without disturbing it.
    await rename(copyBeingMade, copyPath);
    return succeeded(undefined);
  } catch (copyFailure) {
    await rm(copyBeingMade, { force: true }).catch(() => undefined);
    return failedWith(`tatolab couldn't be copied out of the AppImage to ${copyPath}: ${describeCaughtFailure(copyFailure)}`);
  }
}
