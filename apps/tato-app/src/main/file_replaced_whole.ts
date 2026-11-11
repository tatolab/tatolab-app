import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** Write `contents` to `filePath` whole, creating its folder: written beside it under a name of this write's own, then renamed over it, so a crash never leaves half a file and two writes at once never share a partial file. */
export async function replaceFileWhole(filePath: string, contents: string): Promise<Result<void, string>> {
  const partiallyWrittenPath = `${filePath}.${randomUUID()}.partial`;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(partiallyWrittenPath, contents);
    await rename(partiallyWrittenPath, filePath);
  } catch (writeFailure) {
    // The write's own failure is the one answered, never its cleanup's.
    await rm(partiallyWrittenPath, { force: true }).catch(() => undefined);
    return failedWith(describeCaughtFailure(writeFailure));
  }
  return succeeded(undefined);
}
