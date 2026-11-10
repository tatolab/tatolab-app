// The open project's folder as the Files view draws it: its folders and files as the runtime lists
// them, folders before files, then its imports, each read-only with its own files.

import type { TreeViewRow } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import type { OpenProject, ProjectFilesListing } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { RowExpansionChoices } from "../shared/row_expansion_settings";
import { isAFileTheCodeViewOpens } from "../shared/files_the_code_view_opens";
import { projectsWithFilesOf, type ProjectWithFiles } from "../shared/projects_with_files";

/** What choosing a row of the Files tree does. */
export type FilesTreeRowMeaning =
  | { readonly kind: "folder" }
  /** `file` is absolute; `opens_in_code` says whether Code opens it. */
  | { readonly kind: "file"; readonly file: string; readonly opens_in_code: boolean }
  | { readonly kind: "nothing_to_open" };

/** One row of the Files tree and what choosing it does. */
export interface FilesTreeRow {
  readonly row: TreeViewRow;
  readonly meaning: FilesTreeRowMeaning;
}

/** One project's files as the Files view lists them: the open project's or an import's, by its folder. */
export interface ProjectFilesListedForTheTree {
  readonly project_folder: string;
  readonly listing: ProjectFilesListing | null;
}

/** The row id of the heading over the open project's imports. */
export const IMPORTS_HEADING_ROW_ID = "imports";

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

function rowsOfAFolder(folder: ListedFolder, absoluteFolder: string, depth: number, expansionChoices: RowExpansionChoices): FilesTreeRow[] {
  const rows: FilesTreeRow[] = [];
  for (const folderName of [...folder.folders.keys()].sort(byName)) {
    const innerFolder = folder.folders.get(folderName);
    if (innerFolder === undefined) continue;
    const absoluteInnerFolder = `${absoluteFolder}/${folderName}`;
    const rowId = `folder:${absoluteInnerFolder}`;
    const expansion = expansionOf(rowId, expansionChoices, false);
    rows.push({ row: { row_id: rowId, depth, label: folderName, icon: "folder", expansion }, meaning: { kind: "folder" } });
    if (expansion === "expanded") rows.push(...rowsOfAFolder(innerFolder, absoluteInnerFolder, depth + 1, expansionChoices));
  }
  for (const fileName of [...folder.file_names].sort(byName)) {
    const file = `${absoluteFolder}/${fileName}`;
    rows.push({
      row: { row_id: `file:${file}`, depth, label: fileName, icon: "file", isMachineWords: true, expansion: "leaf" },
      meaning: { kind: "file", file, opens_in_code: isAFileTheCodeViewOpens(fileName) },
    });
  }
  return rows;
}

/** The rows a project's listing shows at `depth`: its folders and files, or a row saying it is still listed, was refused or holds none. */
function rowsOfAListing(rowIdPrefix: string, depth: number, listed: ProjectFilesListedForTheTree | undefined, expansionChoices: RowExpansionChoices): FilesTreeRow[] {
  const listing = listed?.listing ?? null;
  if (listing === null) {
    return [{ row: { row_id: `${rowIdPrefix}:listing`, depth, label: "Listing the files…", icon: "waiting", tone: "waiting", expansion: "leaf" }, meaning: { kind: "nothing_to_open" } }];
  }
  if (listing.kind === "not_listed") {
    return [{ row: { row_id: `${rowIdPrefix}:not_listed`, depth, label: listing.because, icon: "unreadable", tone: "unreadable", expansion: "leaf" }, meaning: { kind: "nothing_to_open" } }];
  }
  if (listing.project_files.files.length === 0) {
    return [{ row: { row_id: `${rowIdPrefix}:empty`, depth, label: "No files", icon: "file", expansion: "leaf" }, meaning: { kind: "nothing_to_open" } }];
  }
  return rowsOfAFolder(listedFolderOf(listing.project_files.files), listing.project_files.project_folder, depth, expansionChoices);
}

/** The open project's folders and files at the tree's top, as the Files view's header names the project. */
function rowsOfTheOpenProject(projectFolder: string, listed: ProjectFilesListedForTheTree | undefined, expansionChoices: RowExpansionChoices): FilesTreeRow[] {
  return rowsOfAListing(`project:${projectFolder}`, 0, listed, expansionChoices);
}

/** An import's heading, read-only, and its folders and files under it while it is open. */
function rowsOfAnImport(importWithFiles: ProjectWithFiles, listed: ProjectFilesListedForTheTree | undefined, expansionChoices: RowExpansionChoices): FilesTreeRow[] {
  const rowId = `project:${importWithFiles.project_folder}`;
  const expansion = expansionOf(rowId, expansionChoices, true);
  const headingRow: FilesTreeRow = {
    row: { row_id: rowId, depth: 1, label: importWithFiles.project_name, icon: "project", isHeading: true, isReadOnly: true, expansion },
    meaning: { kind: "folder" },
  };
  return expansion === "collapsed" ? [headingRow] : [headingRow, ...rowsOfAListing(rowId, 2, listed, expansionChoices)];
}

/** The rows of the Files tree for `openProject`, each project's files from `listedProjects`, opened and closed as `expansionChoices` says. */
export function filesTreeOfTheProject(openProject: OpenProject, listedProjects: readonly ProjectFilesListedForTheTree[], expansionChoices: RowExpansionChoices): FilesTreeRow[] {
  const listedProjectOf = (projectFolder: string) => listedProjects.find((listedProject) => listedProject.project_folder === projectFolder);
  const [openProjectWithFiles, ...importsWithFiles] = projectsWithFilesOf(openProject);
  const rows = openProjectWithFiles === undefined ? [] : rowsOfTheOpenProject(openProjectWithFiles.project_folder, listedProjectOf(openProjectWithFiles.project_folder), expansionChoices);
  if (importsWithFiles.length === 0) return rows;
  const importsExpansion = expansionOf(IMPORTS_HEADING_ROW_ID, expansionChoices, true);
  rows.push({ row: { row_id: IMPORTS_HEADING_ROW_ID, depth: 0, label: "Imports", icon: "imports", isHeading: true, tone: "imports", expansion: importsExpansion }, meaning: { kind: "folder" } });
  if (importsExpansion === "collapsed") return rows;
  for (const importWithFiles of importsWithFiles) rows.push(...rowsOfAnImport(importWithFiles, listedProjectOf(importWithFiles.project_folder), expansionChoices));
  return rows;
}
