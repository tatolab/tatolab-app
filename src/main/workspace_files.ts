// The files of the open workspace's projects, as the code pane reads and saves them. The window
// names a file by its absolute path; only a file whose real path lies inside the workspace project's
// folder, or a folder import's, is read, and only one inside the workspace project's own folder is
// written. Imports are read-only, as the outliner shows them.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { OpenWorkspaceReading, WorkspaceFileRead, WorkspaceFileSaved, WorkspaceProjectFiles } from "../shared/tatolab_backend_contract.js";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure, realPathOrAsGiven } from "./file_system_entries_on_this_machine.js";
import { PROJECT_DESCRIPTION_FILE_NAME } from "./project_on_disk.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** Folders a project's file listing never descends into: the venv uv makes, caches, and anything hidden. */
const FOLDERS_A_PROJECT_LISTING_SKIPS = new Set([".venv", "__pycache__", "node_modules", "build", "dist"]);

/** How deep a project's file listing descends below the project's folder. */
const PROJECT_LISTING_DEPTH_LIMIT = 4;

/** How many files a project's file listing names at most. */
const PROJECT_LISTING_FILE_LIMIT = 400;

/** The version a file's bytes are known by: their SHA-256, in hex. */
export function workspaceFileVersionOf(fileBytes: Buffer | string): string {
  return createHash("sha256").update(fileBytes).digest("hex");
}

/** A project folder of the open workspace, and whether its files may be written. */
interface WorkspaceProjectFolder {
  folder: string;
  is_editable: boolean;
}

/** The workspace project's folder, editable, then each folder import's, read-only. */
function projectFoldersOf(reading: OpenWorkspaceReading): WorkspaceProjectFolder[] {
  if (reading.kind !== "read") return [];
  const importFolders = reading.workspace.imports.flatMap((importedProject) =>
    importedProject.source.kind === "folder" ? [{ folder: importedProject.source.project.folder, is_editable: false }] : [],
  );
  return [{ folder: reading.workspace.workspace_project.folder, is_editable: true }, ...importFolders];
}

function isInsideTheFolder(fileSystemPath: string, folder: string): boolean {
  const relativePath = path.relative(folder, fileSystemPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function refusalOfAFileOutsideTheWorkspace(file: string): string {
  return `${file} is not a file of the open workspace's projects, so Tatolab does not open it.`;
}

/** The open workspace's project files, read and saved for the window. */
export class WorkspaceFiles {
  constructor(private readonly readOpenWorkspace: () => OpenWorkspaceReading) {}

  /** `projectFolder` as a project folder of the open workspace, or why it is not one. */
  projectFolderOfTheOpenWorkspace(projectFolder: string): Result<string, string> {
    const resolvedFolder = path.resolve(projectFolder);
    const isAProjectFolder = projectFoldersOf(this.readOpenWorkspace()).some(({ folder }) => folder === resolvedFolder);
    return isAProjectFolder ? succeeded(resolvedFolder) : failedWith(`${projectFolder} is not a project folder of the open workspace.`);
  }

  /** The text of `file`, its version, and whether it may be saved; refused for a file outside the workspace's projects, or in the filesystem's words. */
  async readWorkspaceFile(file: string): Promise<Result<WorkspaceFileRead, string>> {
    const projectFolder = await this.projectFolderHolding(file);
    if (!projectFolder.ok) return projectFolder;
    try {
      const fileBytes = await readFile(projectFolder.value.real_file);
      return succeeded({
        file: path.resolve(file),
        project_folder: projectFolder.value.folder,
        text: fileBytes.toString("utf8"),
        version: workspaceFileVersionOf(fileBytes),
        is_editable: projectFolder.value.is_editable,
      });
    } catch (readFailure) {
      return failedWith(`${file} could not be read: ${describeCaughtFailure(readFailure)}`);
    }
  }

  /**
   * Write `text` to `file` whole, when the file on disk still has `basedOnVersion` (`null` for a file not made yet);
   * refused with nothing written for a file changed on disk since, one outside the workspace project, or in the filesystem's words.
   */
  async saveWorkspaceFile(file: string, text: string, basedOnVersion: string | null): Promise<Result<WorkspaceFileSaved, string>> {
    const projectFolder = await this.projectFolderHolding(file);
    if (!projectFolder.ok) return projectFolder;
    if (!projectFolder.value.is_editable) return failedWith(`${file} belongs to an imported project, which the studio opens read-only.`);
    const versionOnDisk = await this.versionOnDisk(projectFolder.value.real_file);
    if (!versionOnDisk.ok) return versionOnDisk;
    if (versionOnDisk.value !== basedOnVersion) return failedWith(`${path.basename(file)} changed on disk since it was opened, so it was not saved.`);
    const written = await replaceFileWhole(projectFolder.value.real_file, text);
    if (!written.ok) return failedWith(`${file} could not be saved: ${written.failure}`);
    return succeeded({ version: workspaceFileVersionOf(text) });
  }

  /** The Python files and `pyproject.toml` of `projectFolder`, a project folder of the open workspace, relative to it in name order; another project inside it is left out. */
  async listWorkspaceProjectFiles(projectFolder: string): Promise<Result<WorkspaceProjectFiles, string>> {
    const workspaceProjectFolder = this.projectFolderOfTheOpenWorkspace(projectFolder);
    if (!workspaceProjectFolder.ok) return workspaceProjectFolder;
    const filesFound: string[] = [];
    const listing = await this.listPythonFilesUnder(workspaceProjectFolder.value, workspaceProjectFolder.value, 0, filesFound);
    if (!listing.ok) return listing;
    return succeeded({ project_folder: workspaceProjectFolder.value, files: filesFound.sort((first, second) => first.localeCompare(second)) });
  }

  private async listPythonFilesUnder(projectFolder: string, folder: string, depth: number, filesFound: string[]): Promise<Result<void, string>> {
    let folderEntries;
    try {
      folderEntries = await readdir(folder, { withFileTypes: true });
    } catch (listingFailure) {
      return depth === 0 ? failedWith(`${folder} could not be listed: ${describeCaughtFailure(listingFailure)}`) : succeeded(undefined);
    }
    // A folder below the project's root holding its own pyproject.toml is another project, as an import copied in is.
    if (depth > 0 && folderEntries.some((folderEntry) => folderEntry.isFile() && folderEntry.name === PROJECT_DESCRIPTION_FILE_NAME)) return succeeded(undefined);
    for (const folderEntry of folderEntries) {
      if (filesFound.length >= PROJECT_LISTING_FILE_LIMIT) return succeeded(undefined);
      if (folderEntry.name.startsWith(".")) continue;
      const entryPath = path.join(folder, folderEntry.name);
      if (folderEntry.isDirectory()) {
        if (depth < PROJECT_LISTING_DEPTH_LIMIT && !FOLDERS_A_PROJECT_LISTING_SKIPS.has(folderEntry.name)) {
          await this.listPythonFilesUnder(projectFolder, entryPath, depth + 1, filesFound);
        }
      } else if (folderEntry.isFile() && (folderEntry.name.endsWith(".py") || (depth === 0 && folderEntry.name === PROJECT_DESCRIPTION_FILE_NAME))) {
        filesFound.push(path.relative(projectFolder, entryPath));
      }
    }
    return succeeded(undefined);
  }

  /** The project folder whose inside `file` is, links resolved on both, and `file`'s real path. */
  private async projectFolderHolding(file: string): Promise<Result<WorkspaceProjectFolder & { real_file: string }, string>> {
    if (!path.isAbsolute(file)) return failedWith(refusalOfAFileOutsideTheWorkspace(file));
    const realFile = await realPathOrAsGiven(path.resolve(file));
    let innermostProjectFolder: (WorkspaceProjectFolder & { real_folder: string }) | null = null;
    // An import copied into the workspace sits inside the workspace project's folder, so the innermost folder decides.
    for (const projectFolder of projectFoldersOf(this.readOpenWorkspace())) {
      const realFolder = await realPathOrAsGiven(projectFolder.folder);
      if (!isInsideTheFolder(realFile, realFolder)) continue;
      if (innermostProjectFolder === null || realFolder.length > innermostProjectFolder.real_folder.length) innermostProjectFolder = { ...projectFolder, real_folder: realFolder };
    }
    if (innermostProjectFolder === null) return failedWith(refusalOfAFileOutsideTheWorkspace(file));
    return succeeded({ folder: innermostProjectFolder.folder, is_editable: innermostProjectFolder.is_editable, real_file: realFile });
  }

  private async versionOnDisk(realFile: string): Promise<Result<string | null, string>> {
    try {
      return succeeded(workspaceFileVersionOf(await readFile(realFile)));
    } catch (readFailure) {
      if (isAMissingFileFailure(readFailure)) return succeeded(null);
      return failedWith(`${realFile} could not be read before saving: ${describeCaughtFailure(readFailure)}`);
    }
  }
}
