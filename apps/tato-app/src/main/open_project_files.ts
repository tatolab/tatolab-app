// The files of the open project and its imports, as the code pane reads and saves them, through the
// runtime's file tools; the app reads and writes no project file itself. The window names a file by
// its absolute path, which is sent to the runtime relative to the open project's folder, so an
// import's file under `imports/<folder>/` is read through the open project, and the runtime refuses
// writing it.

import { createHash } from "node:crypto";
import path from "node:path";
import type { NodeFileCreated, OpenProjectReading, ProjectFileRead, ProjectFileSaved, ProjectFiles, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import type { NodeFileCreationRecorded, ProjectFileTheRuntimeListed, ProjectFileWriteRecorded } from "./project_files_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The folder every import's copy sits in, inside the project that imports it. */
const IMPORTS_FOLDER_NAME = "imports";

/** How many files a project's file listing names at most. */
const PROJECT_LISTING_FILE_LIMIT = 400;

/** What the runtime's file tools answer the open project's files with, each refusal in the runtime's own words. */
export interface ProjectFilesOfTheRuntime {
  /** `list_project_files`, of the folder `under` alone when given. */
  listProjectFiles(projectDirectory: string, under: string | null): Promise<Result<ProjectFileTheRuntimeListed[], string>>;
  /** `read_project_file`. */
  readProjectFile(projectDirectory: string, filePath: string): Promise<Result<Buffer, string>>;
  /** `write_project_file`, one transaction by `author` keyed by `idempotencyKey`. */
  writeProjectFile(projectDirectory: string, filePath: string, text: string, author: ProjectTransactionAuthor, idempotencyKey: string): Promise<Result<ProjectFileWriteRecorded, string>>;
  /** `create_node_file`, one transaction by `author` keyed by `idempotencyKey`. */
  createNodeFile(projectDirectory: string, filePath: string, author: ProjectTransactionAuthor, idempotencyKey: string): Promise<Result<NodeFileCreationRecorded, string>>;
}

/** What the open project's files are read and saved through: the open project, the runtime's file tools, who a save is by, and a fresh idempotency key for each save. */
export interface OpenProjectFilesSources {
  readOpenProject: () => OpenProjectReading;
  projectFilesOfTheRuntime: ProjectFilesOfTheRuntime;
  personSavingTheFiles: ProjectTransactionAuthor;
  mintAnIdempotencyKey: () => string;
}

/** The version a file's bytes are known by: their SHA-256, in hex. */
export function projectFileVersionOf(fileBytes: Buffer | string): string {
  return createHash("sha256").update(fileBytes).digest("hex");
}

/** A file of the open project as the runtime names it: the open project's folder, the file's `/`-separated path in it, and the folder of the project it belongs to, an import's for a file of an import. */
interface OpenProjectFileAddress {
  open_project_folder: string;
  path_in_the_open_project: string;
  project_folder: string;
  is_editable: boolean;
}

interface FoldersOfTheOpenProject {
  open_project_folder: string;
  import_folders: string[];
}

function slashSeparated(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function isInsideTheFolder(fileSystemPath: string, folder: string): boolean {
  const relativePath = path.relative(folder, fileSystemPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function refusalOfAFileOutsideTheProject(file: string): string {
  return `${file} is not a file of the open project or its imports, so Tatolab does not open it.`;
}

/** The files of the open project and its imports, read and saved for the window through the runtime. */
export class OpenProjectFiles {
  constructor(private readonly sources: OpenProjectFilesSources) {}

  /** The open project's folder and the folder of each of its imports, inside its `imports/`, from one reading; `null` while no project is read. */
  private foldersOfTheOpenProject(): FoldersOfTheOpenProject | null {
    const reading = this.sources.readOpenProject();
    if (reading.kind !== "read") return null;
    return {
      open_project_folder: reading.open_project.project.folder,
      import_folders: reading.open_project.imports.flatMap((importedProject) => (importedProject.source.kind === "folder" ? [importedProject.source.project.folder] : [])),
    };
  }

  /** `projectFolder` as the folder of the open project or of one of its imports, or why it is not one. */
  projectFolderOfTheOpenProject(projectFolder: string): Result<string, string> {
    return this.listedFolderOfTheOpenProject(projectFolder, this.foldersOfTheOpenProject());
  }

  private listedFolderOfTheOpenProject(projectFolder: string, folders: FoldersOfTheOpenProject | null): Result<string, string> {
    const resolvedFolder = path.resolve(projectFolder);
    const isAProjectFolder = folders !== null && (resolvedFolder === folders.open_project_folder || folders.import_folders.includes(resolvedFolder));
    return isAProjectFolder ? succeeded(resolvedFolder) : failedWith(`${projectFolder} is not the folder of the open project or of one of its imports.`);
  }

  /** The text of `file`, its version, and whether it may be saved; refused for a file outside the open project and its imports, or in the runtime's words. */
  async readProjectFile(file: string): Promise<Result<ProjectFileRead, string>> {
    const fileAddress = this.addressOf(file);
    if (!fileAddress.ok) return fileAddress;
    const fileBytes = await this.sources.projectFilesOfTheRuntime.readProjectFile(fileAddress.value.open_project_folder, fileAddress.value.path_in_the_open_project);
    if (!fileBytes.ok) return fileBytes;
    return succeeded({
      file: path.resolve(file),
      project_folder: fileAddress.value.project_folder,
      text: fileBytes.value.toString("utf8"),
      version: projectFileVersionOf(fileBytes.value),
      is_editable: fileAddress.value.is_editable,
    });
  }

  /**
   * Write `text` to `file` whole as one transaction on the project's history, when the file still has `basedOnVersion`
   * (`null` for a file not made yet); refused with nothing written for a file changed since, an import's, or in the runtime's words.
   */
  async saveProjectFile(file: string, text: string, basedOnVersion: string | null): Promise<Result<ProjectFileSaved, string>> {
    const fileAddress = this.addressOf(file);
    if (!fileAddress.ok) return fileAddress;
    const { open_project_folder: openProjectFolder, path_in_the_open_project: pathInTheOpenProject } = fileAddress.value;
    if (!fileAddress.value.is_editable) return failedWith(`${file} belongs to an imported project, which the studio opens read-only.`);
    const versionNow = await this.versionTheRuntimeHolds(openProjectFolder, pathInTheOpenProject);
    if (!versionNow.ok) return versionNow;
    if (versionNow.value !== basedOnVersion) {
      return failedWith(basedOnVersion === null ? `${path.basename(file)} already exists, so it was not saved over.` : `${path.basename(file)} changed since it was opened, so it was not saved.`);
    }
    const versionSaved = projectFileVersionOf(text);
    if (versionSaved === versionNow.value) return succeeded({ version: versionSaved });
    const written = await this.sources.projectFilesOfTheRuntime.writeProjectFile(openProjectFolder, pathInTheOpenProject, text, this.sources.personSavingTheFiles, this.sources.mintAnIdempotencyKey());
    if (!written.ok) return written;
    return succeeded({ version: versionSaved });
  }

  /** A new node file at `file`, inside the open project's own folder, from the runtime's node template as one transaction on its history; refused for an import's file or in the runtime's words. */
  async createNodeFile(file: string): Promise<Result<NodeFileCreated, string>> {
    const fileAddress = this.addressOf(file);
    if (!fileAddress.ok) return fileAddress;
    if (!fileAddress.value.is_editable) return failedWith(`${file} belongs to an imported project, which the studio opens read-only.`);
    const created = await this.sources.projectFilesOfTheRuntime.createNodeFile(
      fileAddress.value.open_project_folder,
      fileAddress.value.path_in_the_open_project,
      this.sources.personSavingTheFiles,
      this.sources.mintAnIdempotencyKey(),
    );
    if (!created.ok) return created;
    return succeeded({ file: path.resolve(file), node_type: created.value.node_type });
  }

  /** Every file the runtime lists of `projectFolder`, the folder of the open project or of one of its imports, relative to it in name order; an import's files are left out of the open project's. */
  async listProjectFiles(projectFolder: string): Promise<Result<ProjectFiles, string>> {
    const folders = this.foldersOfTheOpenProject();
    const listedFolder = this.listedFolderOfTheOpenProject(projectFolder, folders);
    if (!listedFolder.ok || folders === null) return failedWith(`${projectFolder} is not the folder of the open project or of one of its imports.`);
    const openProjectFolder = folders.open_project_folder;
    const under = listedFolder.value === openProjectFolder ? null : slashSeparated(path.relative(openProjectFolder, listedFolder.value));
    const listed = await this.sources.projectFilesOfTheRuntime.listProjectFiles(openProjectFolder, under);
    if (!listed.ok) return listed;
    const files = listed.value
      .map((listedFile) => (under === null ? listedFile.path : listedFile.path.slice(under.length + 1)))
      .filter((pathInTheProject) => under !== null || !pathInTheProject.startsWith(`${IMPORTS_FOLDER_NAME}/`))
      .sort((first, second) => first.localeCompare(second))
      .slice(0, PROJECT_LISTING_FILE_LIMIT);
    return succeeded({ project_folder: listedFolder.value, files });
  }

  /** The version of the file the runtime holds now, or `null` when it holds none there. */
  private async versionTheRuntimeHolds(openProjectFolder: string, pathInTheOpenProject: string): Promise<Result<string | null, string>> {
    const listed = await this.sources.projectFilesOfTheRuntime.listProjectFiles(openProjectFolder, null);
    if (!listed.ok) return listed;
    if (!listed.value.some((listedFile) => listedFile.path === pathInTheOpenProject)) return succeeded(null);
    const fileBytes = await this.sources.projectFilesOfTheRuntime.readProjectFile(openProjectFolder, pathInTheOpenProject);
    return fileBytes.ok ? succeeded(projectFileVersionOf(fileBytes.value)) : fileBytes;
  }

  /** Where `file` sits in the open project, and the project it belongs to: an import's when it lies in one, the innermost deciding. */
  private addressOf(file: string): Result<OpenProjectFileAddress, string> {
    const folders = this.foldersOfTheOpenProject();
    if (folders === null || !path.isAbsolute(file)) return failedWith(refusalOfAFileOutsideTheProject(file));
    const openProjectFolder = folders.open_project_folder;
    const resolvedFile = path.resolve(file);
    if (!isInsideTheFolder(resolvedFile, openProjectFolder)) return failedWith(refusalOfAFileOutsideTheProject(file));
    const importFolder = folders.import_folders.find((folder) => isInsideTheFolder(resolvedFile, folder));
    return succeeded({
      open_project_folder: openProjectFolder,
      path_in_the_open_project: slashSeparated(path.relative(openProjectFolder, resolvedFile)),
      project_folder: importFolder ?? openProjectFolder,
      is_editable: importFolder === undefined,
    });
  }
}
