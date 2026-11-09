// What Get more lists in each of its scopes: the catalog's published packages, its sample
// projects, and what the workspace already imports, each row saying whether the workspace has it
// and whether it opens to edit.

import type { OpenProjectReading, PackageCatalogEntry, PackageCatalogMember, PackageCatalogReading } from "../../shared/tatolab_backend_contract";

/** A scope of Get more's listing. */
export type GetMoreScope = "published" | "samples" | "in_this_workspace";

/** One row of the listing. */
export interface GetMoreRow {
  /** The name a requirement names it by, normalized, which no two rows share. */
  name: string;
  title: string;
  summary: string;
  /** The catalog's version, or the workspace's requirement for an import the catalog does not list. */
  version_words: string;
  nodes: PackageCatalogMember[];
  streams: PackageCatalogMember[];
  /** What Import adds, or `null` where the workspace already imports it or the catalog does not list it. */
  requirement_to_import: string | null;
  is_imported: boolean;
  /** Whether the workspace imports it from a folder, which opens to edit. */
  opens_to_edit: boolean;
  /** The name the workspace's import of it carries, as Open to edit names it; `null` where the workspace does not import it. */
  name_imported_as: string | null;
  homepage_url: string | null;
}

/** `packageName` as PEP 503 normalizes it. */
function normalizedPackageName(packageName: string): string {
  return packageName.toLowerCase().replace(/[-_.]+/g, "-");
}

/** One of the workspace's imports as a row reads it. */
interface WorkspaceImport {
  name: string;
  requirement: string;
  is_from_a_folder: boolean;
}

/** The workspace's imports by normalized name, each with whether it comes from a folder. */
function workspaceImportsByName(workspace: OpenProjectReading): Map<string, WorkspaceImport> {
  const importsByName = new Map<string, WorkspaceImport>();
  if (workspace.kind !== "read") return importsByName;
  for (const importedProject of workspace.open_project.imports) {
    importsByName.set(normalizedPackageName(importedProject.name), { name: importedProject.name, requirement: importedProject.requirement, is_from_a_folder: importedProject.source.kind === "folder" });
  }
  return importsByName;
}

function rowOfACatalogEntry(entry: PackageCatalogEntry, importsByName: Map<string, WorkspaceImport>): GetMoreRow {
  const workspaceImport = importsByName.get(normalizedPackageName(entry.name));
  return {
    name: normalizedPackageName(entry.name),
    title: entry.title,
    summary: entry.summary,
    version_words: entry.version,
    nodes: entry.nodes,
    streams: entry.streams,
    requirement_to_import: workspaceImport === undefined ? entry.requirement : null,
    is_imported: workspaceImport !== undefined,
    opens_to_edit: workspaceImport?.is_from_a_folder ?? false,
    name_imported_as: workspaceImport?.name ?? null,
    homepage_url: entry.homepage_url,
  };
}

/** Whether `row` holds `searchText` in its name, title, summary, or a node's or stream's name. */
function rowMatchesTheSearch(row: GetMoreRow, searchText: string): boolean {
  const searchedFor = searchText.trim().toLowerCase();
  if (searchedFor === "") return true;
  return [row.name, row.title, row.summary, ...row.nodes.map((node) => node.name), ...row.streams.map((stream) => stream.name)].some((words) =>
    words.toLowerCase().includes(searchedFor),
  );
}

/** The rows of `scope`, narrowed to `searchText`: the catalog's entries of that kind, or the workspace's imports with what the catalog says of each. */
export function getMoreRowsOf(scope: GetMoreScope, catalog: PackageCatalogReading | null, workspace: OpenProjectReading, searchText: string): GetMoreRow[] {
  const importsByName = workspaceImportsByName(workspace);
  const catalogEntries = catalog?.kind === "read" ? catalog.entries : [];
  let rows: GetMoreRow[];
  if (scope === "in_this_workspace") {
    rows = workspace.kind !== "read" ? [] : workspace.open_project.imports.map((importedProject) => {
      const catalogEntry = catalogEntries.find((entry) => normalizedPackageName(entry.name) === normalizedPackageName(importedProject.name));
      if (catalogEntry !== undefined) return rowOfACatalogEntry(catalogEntry, importsByName);
      return {
        name: normalizedPackageName(importedProject.name),
        title: importedProject.name,
        summary: importedProject.source.kind === "folder" ? `From ${importedProject.source.project.folder}` : "Not in the catalog.",
        version_words: importedProject.requirement,
        nodes: [],
        streams: [],
        requirement_to_import: null,
        is_imported: true,
        opens_to_edit: importedProject.source.kind === "folder",
        name_imported_as: importedProject.name,
        homepage_url: null,
      };
    });
  } else {
    const kind = scope === "published" ? "package" : "sample";
    rows = catalogEntries.filter((entry) => entry.kind === kind).map((entry) => rowOfACatalogEntry(entry, importsByName));
  }
  return rows.filter((row) => rowMatchesTheSearch(row, searchText));
}

/** One line of `pyproject.toml` as an import changes it: kept, added, or taken out (as a last entry is, to gain its comma). */
export interface ImportChangeLine {
  text: string;
  change: "kept" | "added" | "removed";
}

/** The lines of `textBefore` and `textAfter` as a line diff shows them, the longest run of lines both share kept. */
export function importChangeLinesOf(textBefore: string, textAfter: string): ImportChangeLine[] {
  const linesBefore = textBefore.split(/\r?\n/);
  const linesAfter = textAfter.split(/\r?\n/);
  const sharedFrom: number[][] = Array.from({ length: linesBefore.length + 1 }, () => new Array<number>(linesAfter.length + 1).fill(0));
  for (let before = linesBefore.length - 1; before >= 0; before -= 1) {
    for (let after = linesAfter.length - 1; after >= 0; after -= 1) {
      const sharedRow = sharedFrom[before];
      if (sharedRow === undefined) continue;
      const sharedBelow = sharedFrom[before + 1]?.[after + 1] ?? 0;
      sharedRow[after] = linesBefore[before] === linesAfter[after] ? sharedBelow + 1 : Math.max(sharedFrom[before + 1]?.[after] ?? 0, sharedRow[after + 1] ?? 0);
    }
  }
  const changeLines: ImportChangeLine[] = [];
  let before = 0;
  let after = 0;
  while (before < linesBefore.length || after < linesAfter.length) {
    const lineBefore = linesBefore[before];
    const lineAfter = linesAfter[after];
    if (lineBefore !== undefined && lineAfter !== undefined && lineBefore === lineAfter) {
      changeLines.push({ text: lineBefore, change: "kept" });
      before += 1;
      after += 1;
    } else if (lineBefore !== undefined && (lineAfter === undefined || (sharedFrom[before + 1]?.[after] ?? 0) >= (sharedFrom[before]?.[after + 1] ?? 0))) {
      changeLines.push({ text: lineBefore, change: "removed" });
      before += 1;
    } else if (lineAfter !== undefined) {
      changeLines.push({ text: lineAfter, change: "added" });
      after += 1;
    }
  }
  return changeLines;
}
