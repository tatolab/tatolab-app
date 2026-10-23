// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { shell } from "electron";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/** `folder` shown in Finder or the Linux desktop's file manager through Electron's `shell.openPath`, which answers its failure as text and an empty string when it opened. */
export async function openAFolderInTheFileManagerThroughElectron(folder: string): Promise<Result<void, string>> {
  try {
    const openFailure = await shell.openPath(folder);
    return openFailure === "" ? succeeded(undefined) : failedWith(`${folder} did not open: ${openFailure}`);
  } catch (caughtFailure) {
    return failedWith(`${folder} did not open: ${describeCaughtFailure(caughtFailure)}`);
  }
}
