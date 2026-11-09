// Watching the entries directly in one folder through Node's `fs.watch`: a `pyproject.toml` saved,
// replaced, created or removed there. Only the folder's own entries are watched, never its tree, so
// a project's `.venv` costs nothing.

import { watch } from "node:fs";
import type { FolderEntriesWatch } from "./open_project.js";

/** `fs.watch` on `folder` alone; `null` for a folder that cannot be watched, as one not made yet. */
export const watchFolderEntriesOnThisMachine: FolderEntriesWatch = (folder, onChange) => {
  try {
    const folderWatcher = watch(folder, { persistent: false }, () => onChange());
    folderWatcher.on("error", () => folderWatcher.close());
    return () => folderWatcher.close();
  } catch {
    return null;
  }
};
