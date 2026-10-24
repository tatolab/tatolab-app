// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { isAFileOnThisMachine, isAnExistingFolderOnThisMachine, somethingIsAt } from "./file_system_entries_on_this_machine.js";

test("a folder, a file and nothing are each told apart", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "tl-app-project-"));
  try {
    await writeFile(path.join(folder, "stream.py"), "");
    expect(await isAnExistingFolderOnThisMachine(folder)).toBe(true);
    expect(await isAnExistingFolderOnThisMachine(path.join(folder, "stream.py"))).toBe(false);
    expect(await isAnExistingFolderOnThisMachine(path.join(folder, "missing"))).toBe(false);
    expect(await isAFileOnThisMachine(path.join(folder, "stream.py"))).toBe(true);
    expect(await isAFileOnThisMachine(folder)).toBe(false);
    expect(await somethingIsAt(path.join(folder, "stream.py"))).toBe(true);
    expect(await somethingIsAt(path.join(folder, "missing"))).toBe(false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
