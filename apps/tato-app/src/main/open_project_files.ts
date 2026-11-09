// The files of the open project and its imports, as the code pane reads and saves them. The window
// names a file by its absolute path; only a file whose real path lies inside the open project's
// folder, or a folder import's, is read, and only one inside the open project's own folder is
// written. Imports are read-only, as the outliner shows them.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { OpenProjectReading, ProjectFileRead, ProjectFileSaved, ProjectFiles } from "../shared/tatolab_backend_contract.js";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure, realPathOrAsGiven } from "./file_system_entries_on_this_machine.js";
import { TATOLAB_PROJECT_FILE_NAME } from "./workspace_dependencies.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** The Python project file at a project's root, which the code pane edits beside its Python files. */
const PYTHON_PROJECT_FILE_NAME = "pyproject.toml";

/** Folders a project's file listing never descends into: the venv uv makes, caches, and anything hidden. */
const FOLDERS_A_PROJECT_LISTING_SKIPS = new Set([".venv", "__pycache__", "node_modules", "build", "dist"]);

/** How deep a project's file listing descends below the project's folder. */
const PROJECT_LISTING_DEPTH_LIMIT = 4;

/** How many files a project's file listing names at most. */
const PROJECT_LISTING_FILE_LIMIT = 400;

/** The version a file's bytes are known by: their SHA-256, in hex. */
export function projectFileVersionOf(fileBytes: Buffer | string): string {
  return createHash("sha256").update(fileBytes).digest("hex");
}

/** The folder of the open project or of one of its imports, and whether its files may be written. */
interface OpenProjectFolder {
  folder: string;
  is_editable: boolean;
}

/** The open project's folder, editable, then each folder import's, read-only. */
function projectFoldersOf(reading: OpenProjectReading): OpenProjectFolder[] {
  if (reading.kind !== "read") return [];
  const importFolders = reading.open_project.imports.flatMap((importedProject) =>
    importedProject.source.kind === "folder" ? [{ folder: importedProject.source.project.folder, is_editable: false }] : [],
  );
  return [{ folder: reading.open_project.project.folder, is_editable: true }, ...importFolders];
}

function isInsideTheFolder(fileSystemPath: string, folder: string): boolean {
  const relativePath = path.relative(folder, fileSystemPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function refusalOfAFileOutsideTheProject(file: string): string {
  return `${file} is not a file of the open project or its imports, so Tatolab does not open it.`;
}

/** The files of the open project and its imports, read and saved for the window. */
export class OpenProjectFiles {
  constructor(private readonly readOpenProject: () => OpenProjectReading) {}

  /** `projectFolder` as the folder of the open project or of one of its imports, or why it is not one. */
  projectFolderOfTheOpenProject(projectFolder: string): Result<string, string> {
    const resolvedFolder = path.resolve(projectFolder);
    const isAProjectFolder = projectFoldersOf(this.readOpenProject()).some(({ folder }) => folder === resolvedFolder);
    return isAProjectFolder ? succeeded(resolvedFolder) : failedWith(`${projectFolder} is not the folder of the open project or of one of its imports.`);
  }

  /** The text of `file`, its version, and whether it may be saved; refused for a file outside the open project and its imports, or in the filesystem's words. */
  async readProjectFile(file: string): Promise<Result<ProjectFileRead, string>> {
    const projectFolder = await this.projectFolderHolding(file);
    if (!projectFolder.ok) return projectFolder;
    try {
      const fileBytes = await readFile(projectFolder.value.real_file);
      return succeeded({
        file: path.resolve(file),
        project_folder: projectFolder.value.folder,
        text: fileBytes.toString("utf8"),
        version: projectFileVersionOf(fileBytes),
        is_editable: projectFolder.value.is_editable,
      });
    } catch (readFailure) {
      return failedWith(`${file} could not be read: ${describeCaughtFailure(readFailure)}`);
    }
  }

  /**
   * Write `text` to `file` whole, when the file on disk still has `basedOnVersion` (`null` for a file not made yet);
   * refused with nothing written for a file changed on disk since, one outside the open project, or in the filesystem's words.
   */
  async saveProjectFile(file: string, text: string, basedOnVersion: string | null): Promise<Result<ProjectFileSaved, string>> {
    const projectFolder = await this.projectFolderHolding(file);
    if (!projectFolder.ok) return projectFolder;
    if (!projectFolder.value.is_editable) return failedWith(`${file} belongs to an imported project, which the studio opens read-only.`);
    const versionOnDisk = await this.versionOnDisk(projectFolder.value.real_file);
    if (!versionOnDisk.ok) return versionOnDisk;
    if (versionOnDisk.value !== basedOnVersion) return failedWith(`${path.basename(file)} changed on disk since it was opened, so it was not saved.`);
    const written = await replaceFileWhole(projectFolder.value.real_file, text);
    if (!written.ok) return failedWith(`${file} could not be saved: ${written.failure}`);
    return succeeded({ version: projectFileVersionOf(text) });
  }

  /** The Python files and `pyproject.toml` of `projectFolder`, the folder of the open project or of one of its imports, relative to it in name order; another project inside it is left out. */
  async listProjectFiles(projectFolder: string): Promise<Result<ProjectFiles, string>> {
    const openProjectFolder = this.projectFolderOfTheOpenProject(projectFolder);
    if (!openProjectFolder.ok) return openProjectFolder;
    const filesFound: string[] = [];
    const listing = await this.listPythonFilesUnder(openProjectFolder.value, openProjectFolder.value, 0, filesFound);
    if (!listing.ok) return listing;
    return succeeded({ project_folder: openProjectFolder.value, files: filesFound.sort((first, second) => first.localeCompare(second)) });
  }

  private async listPythonFilesUnder(projectFolder: string, folder: string, depth: number, filesFound: string[]): Promise<Result<void, string>> {
    let folderEntries;
    try {
      folderEntries = await readdir(folder, { withFileTypes: true });
    } catch (listingFailure) {
      return depth === 0 ? failedWith(`${folder} could not be listed: ${describeCaughtFailure(listingFailure)}`) : succeeded(undefined);
    }
    // A folder below the project's root holding its own tatolab-project.json is another project, as an import copied in is.
    if (depth > 0 && folderEntries.some((folderEntry) => folderEntry.isFile() && folderEntry.name === TATOLAB_PROJECT_FILE_NAME)) return succeeded(undefined);
    for (const folderEntry of folderEntries) {
      if (filesFound.length >= PROJECT_LISTING_FILE_LIMIT) return succeeded(undefined);
      if (folderEntry.name.startsWith(".")) continue;
      const entryPath = path.join(folder, folderEntry.name);
      if (folderEntry.isDirectory()) {
        if (depth < PROJECT_LISTING_DEPTH_LIMIT && !FOLDERS_A_PROJECT_LISTING_SKIPS.has(folderEntry.name)) {
          await this.listPythonFilesUnder(projectFolder, entryPath, depth + 1, filesFound);
        }
      } else if (folderEntry.isFile() && (folderEntry.name.endsWith(".py") || (depth === 0 && folderEntry.name === PYTHON_PROJECT_FILE_NAME))) {
        filesFound.push(path.relative(projectFolder, entryPath));
      }
    }
    return succeeded(undefined);
  }

  /** The project folder whose inside `file` is, links resolved on both, and `file`'s real path. */
  private async projectFolderHolding(file: string): Promise<Result<OpenProjectFolder & { real_file: string }, string>> {
    if (!path.isAbsolute(file)) return failedWith(refusalOfAFileOutsideTheProject(file));
    const realFile = await realPathOrAsGiven(path.resolve(file));
    let innermostProjectFolder: (OpenProjectFolder & { real_folder: string }) | null = null;
    // An import copied into the project sits inside the open project's folder, so the innermost folder decides.
    for (const projectFolder of projectFoldersOf(this.readOpenProject())) {
      const realFolder = await realPathOrAsGiven(projectFolder.folder);
      if (!isInsideTheFolder(realFile, realFolder)) continue;
      if (innermostProjectFolder === null || realFolder.length > innermostProjectFolder.real_folder.length) innermostProjectFolder = { ...projectFolder, real_folder: realFolder };
    }
    if (innermostProjectFolder === null) return failedWith(refusalOfAFileOutsideTheProject(file));
    return succeeded({ folder: innermostProjectFolder.folder, is_editable: innermostProjectFolder.is_editable, real_file: realFile });
  }

  private async versionOnDisk(realFile: string): Promise<Result<string | null, string>> {
    try {
      return succeeded(projectFileVersionOf(await readFile(realFile)));
    } catch (readFailure) {
      if (isAMissingFileFailure(readFailure)) return succeeded(null);
      return failedWith(`${realFile} could not be read before saving: ${describeCaughtFailure(readFailure)}`);
    }
  }
}
