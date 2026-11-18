// The files of the open project and its imports, as the code pane reads and saves them, through the
// runtime's file tools; the app reads and writes no project file itself. The window names a file by
// its absolute path, which is sent to the runtime relative to the open project's folder, so an
// import's file under `imports/<folder>/` is read through the open project, and the runtime refuses
// writing it.

import { createHash } from "node:crypto";
import path from "node:path";
import { Effect } from "effect";
import type { NodeFileCreated, OpenProjectReading, ProjectFileRead, ProjectFileSaved, ProjectFiles } from "../shared/tatolab_backend_contract.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { fromResult } from "./result_as_effect.js";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import { createNodeFile, listProjectFiles, readProjectFile, writeProjectFile } from "./runtime_operations.js";
import { IdempotencyKeys, PersonEditingInStudio } from "./studio_runtime.js";
import type { RuntimeControl } from "./tatolab_runtime_control_operation_call.js";
import { CommandRefused } from "./window_command.js";

/** The folder every import's copy sits in, inside the project that imports it. */
const IMPORTS_FOLDER_NAME = "imports";

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

function refusalOfAnImportsFile(file: string): CommandRefused {
  return new CommandRefused({ words: `${file} belongs to an imported project, which the studio opens read-only.` });
}

function refusalOfAFileOutsideTheProject(file: string): string {
  return `${file} is not a file of the open project or its imports, so Tatolab does not open it.`;
}

/** The open project's folder and the folder of each of its imports, inside its `imports/`, from `reading`; `null` while no project is read. */
function foldersOfTheOpenProject(reading: OpenProjectReading): FoldersOfTheOpenProject | null {
  if (reading.kind !== "read") return null;
  return {
    open_project_folder: reading.open_project.project.folder,
    import_folders: reading.open_project.imports.flatMap((importedProject) => (importedProject.source.kind === "folder" ? [importedProject.source.project.folder] : [])),
  };
}

/** `projectFolder` as the folder of the open project or of one of its imports, with the open project's folder, or why it is not one. */
function listedFolderOfTheOpenProject(reading: OpenProjectReading, projectFolder: string): Result<{ open_project_folder: string; listed_folder: string }, string> {
  const folders = foldersOfTheOpenProject(reading);
  const resolvedFolder = path.resolve(projectFolder);
  const isAProjectFolder = folders !== null && (resolvedFolder === folders.open_project_folder || folders.import_folders.includes(resolvedFolder));
  return isAProjectFolder
    ? succeeded({ open_project_folder: folders.open_project_folder, listed_folder: resolvedFolder })
    : failedWith(`${projectFolder} is not the folder of the open project or of one of its imports.`);
}

/** `projectFolder` as the folder of the project `reading` holds open or of one of its imports, or why it is not one. */
export function projectFolderOfTheOpenProject(reading: OpenProjectReading, projectFolder: string): Result<string, string> {
  const listedFolder = listedFolderOfTheOpenProject(reading, projectFolder);
  return listedFolder.ok ? succeeded(listedFolder.value.listed_folder) : listedFolder;
}

/** Where `file` sits in the project `reading` holds open, and the project it belongs to: an import's when it lies in one, the innermost deciding. */
function addressOf(reading: OpenProjectReading, file: string): Effect.Effect<OpenProjectFileAddress, CommandRefused> {
  const folders = foldersOfTheOpenProject(reading);
  const resolvedFile = path.resolve(file);
  if (folders === null || !path.isAbsolute(file) || !isInsideTheFolder(resolvedFile, folders.open_project_folder)) {
    return Effect.fail(new CommandRefused({ words: refusalOfAFileOutsideTheProject(file) }));
  }
  const importFolder = folders.import_folders.find((folder) => isInsideTheFolder(resolvedFile, folder));
  return Effect.succeed({
    open_project_folder: folders.open_project_folder,
    path_in_the_open_project: slashSeparated(path.relative(folders.open_project_folder, resolvedFile)),
    project_folder: importFolder ?? folders.open_project_folder,
    is_editable: importFolder === undefined,
  });
}

/** Where `file` sits in the project `reading` holds open, refused for a file of an import, which the studio opens read-only. */
function addressOfAnEditableFile(reading: OpenProjectReading, file: string): Effect.Effect<OpenProjectFileAddress, CommandRefused> {
  return addressOf(reading, file).pipe(Effect.filterOrFail((fileAddress) => fileAddress.is_editable, () => refusalOfAnImportsFile(file)));
}

/** The text of `file`, its version, and whether it may be saved; refused for a file outside the open project and its imports, or in the runtime's words. */
export const readTheOpenProjectsFile = Effect.fn("readTheOpenProjectsFile")(function* (reading: OpenProjectReading, file: string) {
  const fileAddress = yield* addressOf(reading, file);
  const fileBytes = yield* readProjectFile(fileAddress.open_project_folder, fileAddress.path_in_the_open_project);
  return {
    file: path.resolve(file),
    project_folder: fileAddress.project_folder,
    text: fileBytes.toString("utf8"),
    version: projectFileVersionOf(fileBytes),
    is_editable: fileAddress.is_editable,
  } satisfies ProjectFileRead;
});

/** The version of the file the runtime holds at `pathInTheOpenProject`, or `null` when it holds none there. */
function versionTheRuntimeHolds(openProjectFolder: string, pathInTheOpenProject: string): Effect.Effect<string | null, RuntimeControlFailure, RuntimeControl> {
  return listProjectFiles(openProjectFolder, null).pipe(
    Effect.flatMap((listed) =>
      listed.some((listedFile) => listedFile.path === pathInTheOpenProject)
        ? readProjectFile(openProjectFolder, pathInTheOpenProject).pipe(Effect.map(projectFileVersionOf))
        : Effect.succeed(null),
    ),
  );
}

/**
 * `text` written to `file` whole as one transaction on the project's history by the person editing in Studio, when the file still has
 * `basedOnVersion` (`null` for a file not made yet); refused with nothing written for a file changed since, an import's, or in the runtime's words.
 */
export const saveTheOpenProjectsFile = Effect.fn("saveTheOpenProjectsFile")(function* (reading: OpenProjectReading, file: string, text: string, basedOnVersion: string | null) {
  const { open_project_folder: openProjectFolder, path_in_the_open_project: pathInTheOpenProject } = yield* addressOfAnEditableFile(reading, file);
  const versionNow = yield* versionTheRuntimeHolds(openProjectFolder, pathInTheOpenProject);
  if (versionNow !== basedOnVersion) {
    return yield* new CommandRefused({
      words: basedOnVersion === null ? `${path.basename(file)} already exists, so it was not saved over.` : `${path.basename(file)} changed since it was opened, so it was not saved.`,
    });
  }
  const versionSaved = projectFileVersionOf(text);
  if (versionSaved !== versionNow) {
    const { author } = yield* PersonEditingInStudio;
    const idempotencyKey = yield* (yield* IdempotencyKeys).mint;
    yield* writeProjectFile(openProjectFolder, pathInTheOpenProject, text, author, idempotencyKey);
  }
  return { version: versionSaved } satisfies ProjectFileSaved;
});

/** A new node file at `file`, inside the open project's own folder, from the runtime's node template as one transaction on its history by the person editing in Studio; refused for an import's file or in the runtime's words. */
export const createANodeFileInTheOpenProject = Effect.fn("createANodeFileInTheOpenProject")(function* (reading: OpenProjectReading, file: string) {
  const fileAddress = yield* addressOfAnEditableFile(reading, file);
  const { author } = yield* PersonEditingInStudio;
  const idempotencyKey = yield* (yield* IdempotencyKeys).mint;
  const created = yield* createNodeFile(fileAddress.open_project_folder, fileAddress.path_in_the_open_project, author, idempotencyKey);
  return { file: path.resolve(file), node_type: created.node_type } satisfies NodeFileCreated;
});

/** Every file the runtime lists of `projectFolder`, the folder of the open project or of one of its imports, relative to it in name order; an import's files are left out of the open project's. */
export const listTheOpenProjectsFiles = Effect.fn("listTheOpenProjectsFiles")(function* (reading: OpenProjectReading, projectFolder: string) {
  const { open_project_folder: openProjectFolder, listed_folder: listedFolder } = yield* fromResult(
    listedFolderOfTheOpenProject(reading, projectFolder),
    (words) => new CommandRefused({ words }),
  );
  const under = listedFolder === openProjectFolder ? null : slashSeparated(path.relative(openProjectFolder, listedFolder));
  const listed = yield* listProjectFiles(openProjectFolder, under);
  const files = listed
    .map((listedFile) => (under === null ? listedFile.path : listedFile.path.slice(under.length + 1)))
    .filter((pathInTheProject) => under !== null || !pathInTheProject.startsWith(`${IMPORTS_FOLDER_NAME}/`))
    .sort((first, second) => first.localeCompare(second));
  return { project_folder: listedFolder, files } satisfies ProjectFiles;
});
