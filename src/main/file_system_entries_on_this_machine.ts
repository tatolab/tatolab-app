import type { Stats } from "node:fs";
import { realpath, stat } from "node:fs/promises";

/** What is at `fileSystemPath`, links followed; `null` when nothing is there or it cannot be read. */
async function fileSystemEntryAt(fileSystemPath: string): Promise<Stats | null> {
  try {
    return await stat(fileSystemPath);
  } catch {
    return null;
  }
}

/** Whether anything is at `fileSystemPath`. */
export async function somethingIsAt(fileSystemPath: string): Promise<boolean> {
  return (await fileSystemEntryAt(fileSystemPath)) !== null;
}

/** Whether `filePath` names a file on this machine. */
export async function isAFileOnThisMachine(filePath: string): Promise<boolean> {
  return (await fileSystemEntryAt(filePath))?.isFile() ?? false;
}

/** Whether `folderPath` names a folder on this machine. */
export async function isAnExistingFolderOnThisMachine(folderPath: string): Promise<boolean> {
  return (await fileSystemEntryAt(folderPath))?.isDirectory() ?? false;
}

/** `fileSystemPath` with its links resolved, as `/tmp` is `/private/tmp` on macOS; as given when it cannot be resolved. */
export async function realPathOrAsGiven(fileSystemPath: string): Promise<string> {
  try {
    return await realpath(fileSystemPath);
  } catch {
    return fileSystemPath;
  }
}

/** Whether a caught filesystem failure is the file not being there (`ENOENT`), rather than one that could not be read. */
export function isAMissingFileFailure(caughtFailure: unknown): boolean {
  return caughtFailure instanceof Error && "code" in caughtFailure && caughtFailure.code === "ENOENT";
}
