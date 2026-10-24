// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** Write `contents` to `filePath` whole, creating its folder: written beside it, then renamed over it, so a crash never leaves half a file. */
export async function replaceFileWhole(filePath: string, contents: string): Promise<Result<void, string>> {
  const partiallyWrittenPath = `${filePath}.partial`;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(partiallyWrittenPath, contents);
    await rename(partiallyWrittenPath, filePath);
  } catch (writeFailure) {
    return failedWith(describeCaughtFailure(writeFailure));
  }
  return succeeded(undefined);
}
