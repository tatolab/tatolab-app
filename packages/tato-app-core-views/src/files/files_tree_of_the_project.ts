// The open project's folder as the Files view draws it: the project, its folders and files as the
// runtime lists them, folders before files, then its imports, each read-only with its own files.

import type { TreeViewRow } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import type { StudioIconName } from "@tatolab/tato-app-view-sdk/design_system/support/studio_icons";
import type { OpenProject, ProjectFilesListing } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { RowExpansionChoices } from "../shared/row_expansion_settings";
import { isAFileTheCodeViewOpens } from "../shared/files_the_code_view_opens";

/** What choosing a row of the Files tree does. */
export type FilesTreeRowMeaning =
  | { kind: "folder" }
  /** `file` is absolute; `opens_in_code` says whether Code opens it. */
  | { kind: "file"; file: string; opens_in_code: boolean }
  | { kind: "nothing_to_open" };

/** One row of the Files tree and what choosing it does. */
export interface FilesTreeRow {
  row: TreeViewRow;
  meaning: FilesTreeRowMeaning;
}

/** One project's files as the Files view lists them: the open project's or an import's, by its folder. */
export interface ProjectFilesListedForTheTree {
  project_folder: string;
  listing: ProjectFilesListing | null;
}

/** The row id of the heading over the open project's imports. */
export const IMPORTS_HEADING_ROW_ID = "imports";

const EXTENSIONS_OF_DATA_FILES = [".json", ".toml", ".yaml", ".yml", ".ini", ".cfg"];
const EXTENSIONS_OF_IMAGE_FILES = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];

/** The icon a file's row shows, by its extension. */
export function iconOfAFile(fileName: string): StudioIconName {
  const lowerCaseName = fileName.toLowerCase();
  if (lowerCaseName.endsWith(".py") || lowerCaseName.endsWith(".pyi")) return "code_file";
  if (EXTENSIONS_OF_DATA_FILES.some((extension) => lowerCaseName.endsWith(extension))) return "data_file";
  if (EXTENSIONS_OF_IMAGE_FILES.some((extension) => lowerCaseName.endsWith(extension))) return "image_file";
  return "file";
}

/** A folder of a listing: its folders and its files, each by name. */
interface ListedFolder {
  folders: Map<string, ListedFolder>;
  file_names: string[];
}

function listedFolderOf(relativeFiles: readonly string[]): ListedFolder {
  const root: ListedFolder = { folders: new Map(), file_names: [] };
  for (const relativeFile of relativeFiles) {
    const parts = relativeFile.split("/").filter((part) => part !== "");
    const fileName = parts.pop();
    if (fileName === undefined) continue;
    let folder = root;
    for (const part of parts) {
      const known = folder.folders.get(part);
      const inner = known ?? { folders: new Map(), file_names: [] };
      if (known === undefined) folder.folders.set(part, inner);
      folder = inner;
    }
    folder.file_names.push(fileName);
  }
  return root;
}

function byName(first: string, second: string): number {
  return first.localeCompare(second, undefined, { sensitivity: "base" });
}

/** Whether a row shows its rows: what the person chose, or `expandedUnchosen` while they chose nothing. */
function expansionOf(rowId: string, expansionChoices: RowExpansionChoices, expandedUnchosen: boolean): "expanded" | "collapsed" {
  return (expansionChoices[rowId] ?? expandedUnchosen) ? "expanded" : "collapsed";
}

function rowsOfAFolder(folder: ListedFolder, absoluteFolder: string, depth: number, isReadOnly: boolean, expansionChoices: RowExpansionChoices): FilesTreeRow[] {
  const rows: FilesTreeRow[] = [];
  for (const folderName of [...folder.folders.keys()].sort(byName)) {
    const innerFolder = folder.folders.get(folderName);
    if (innerFolder === undefined) continue;
    const absoluteInnerFolder = `${absoluteFolder}/${folderName}`;
    const rowId = `folder:${absoluteInnerFolder}`;
    const expansion = expansionOf(rowId, expansionChoices, false);
    rows.push({ row: { row_id: rowId, depth, label: folderName, icon: "folder", expansion }, meaning: { kind: "folder" } });
    if (expansion === "expanded") rows.push(...rowsOfAFolder(innerFolder, absoluteInnerFolder, depth + 1, isReadOnly, expansionChoices));
  }
  for (const fileName of [...folder.file_names].sort(byName)) {
    const file = `${absoluteFolder}/${fileName}`;
    rows.push({
      row: { row_id: `file:${file}`, depth, label: fileName, icon: iconOfAFile(fileName), isMachineWords: true, isReadOnly, expansion: "leaf" },
      meaning: { kind: "file", file, opens_in_code: isAFileTheCodeViewOpens(fileName) },
    });
  }
  return rows;
}

function rowsOfAProject(
  heading: { row_id: string; label: string; icon: StudioIconName; depth: number; is_read_only: boolean },
  listed: ProjectFilesListedForTheTree | undefined,
  expansionChoices: RowExpansionChoices,
): FilesTreeRow[] {
  const expansion = expansionOf(heading.row_id, expansionChoices, true);
  const headingRow: FilesTreeRow = {
    row: { row_id: heading.row_id, depth: heading.depth, label: heading.label, icon: heading.icon, isHeading: true, isReadOnly: heading.is_read_only, expansion },
    meaning: { kind: "folder" },
  };
  if (expansion === "collapsed") return [headingRow];
  const listing = listed?.listing ?? null;
  if (listing === null) {
    return [headingRow, { row: { row_id: `${heading.row_id}:listing`, depth: heading.depth + 1, label: "Listing the files…", icon: "waiting", tone: "waiting", expansion: "leaf" }, meaning: { kind: "nothing_to_open" } }];
  }
  if (listing.kind === "not_listed") {
    return [headingRow, { row: { row_id: `${heading.row_id}:not_listed`, depth: heading.depth + 1, label: listing.because, icon: "unreadable", tone: "unreadable", expansion: "leaf" }, meaning: { kind: "nothing_to_open" } }];
  }
  const projectFolder = listing.project_files.project_folder;
  if (listing.project_files.files.length === 0) {
    return [headingRow, { row: { row_id: `${heading.row_id}:empty`, depth: heading.depth + 1, label: "No files", icon: "file", tone: "waiting", expansion: "leaf" }, meaning: { kind: "nothing_to_open" } }];
  }
  return [headingRow, ...rowsOfAFolder(listedFolderOf(listing.project_files.files), projectFolder, heading.depth + 1, heading.is_read_only, expansionChoices)];
}

/** The rows of the Files tree for `openProject`, each project's files from `listedProjects`, opened and closed as `expansionChoices` says. */
export function filesTreeOfTheProject(openProject: OpenProject, listedProjects: readonly ProjectFilesListedForTheTree[], expansionChoices: RowExpansionChoices): FilesTreeRow[] {
  const listedProjectOf = (projectFolder: string) => listedProjects.find((listedProject) => listedProject.project_folder === projectFolder);
  const rows = rowsOfAProject(
    { row_id: `project:${openProject.project.folder}`, label: openProject.project.name, icon: "project", depth: 0, is_read_only: false },
    listedProjectOf(openProject.project.folder),
    expansionChoices,
  );
  const importsWithFolders = openProject.imports.flatMap((importedProject) => (importedProject.source.kind === "folder" ? [importedProject.source.project] : []));
  if (importsWithFolders.length === 0) return rows;
  const importsExpansion = expansionOf(IMPORTS_HEADING_ROW_ID, expansionChoices, true);
  rows.push({ row: { row_id: IMPORTS_HEADING_ROW_ID, depth: 0, label: "Imports", icon: "imports", isHeading: true, tone: "imports", expansion: importsExpansion }, meaning: { kind: "folder" } });
  if (importsExpansion === "collapsed") return rows;
  for (const importedProject of importsWithFolders) {
    rows.push(
      ...rowsOfAProject(
        { row_id: `project:${importedProject.folder}`, label: importedProject.name, icon: "project", depth: 1, is_read_only: true },
        listedProjectOf(importedProject.folder),
        expansionChoices,
      ),
    );
  }
  return rows;
}

/** The folders of the open project and of each import whose files the tree lists. */
export function projectFoldersTheTreeLists(openProject: OpenProject): string[] {
  return [openProject.project.folder, ...openProject.imports.flatMap((importedProject) => (importedProject.source.kind === "folder" ? [importedProject.source.project.folder] : []))];
}
