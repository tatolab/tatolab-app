// What the Modules window lists: the catalog's packages and samples in its order, each saying
// whether the project has added it, then the project's modules the catalog does not list.

import type { PackageCatalogEntry, PackageCatalogMember, PackageCatalogReading, WorkspaceDependency } from "../../shared/tatolab_backend_contract";

/** Which of the Modules window's cards it shows: every one, the project's own, or the catalog's samples. */
export type ModulesShown = "everything" | "added_to_this_project" | "sample_projects";

/** One card of the Modules window: a catalog entry, the project's module of it, or both. */
export interface ModuleCardRow {
  /** The catalog's name for it, or for a module the catalog does not list its folder under `imports/`. */
  row_id: string;
  title: string;
  summary: string;
  /** The catalog's entry for it, or `null` for a module the catalog does not list. */
  catalog_entry: PackageCatalogEntry | null;
  /** The project's module of it, or `null` where the project has not added it. */
  module_of_the_project: WorkspaceDependency | null;
}

/** A module's name lowercased with each run of other characters made `-`, as the runtime names its folder under `imports/`. */
export function moduleFolderNameOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textsMatchTheSearch(texts: readonly string[], searchText: string): boolean {
  const searchedFor = searchText.trim().toLowerCase();
  return searchedFor === "" || texts.some((text) => text.toLowerCase().includes(searchedFor));
}

function namesOf(members: readonly PackageCatalogMember[]): string[] {
  return members.map((member) => member.name);
}

function moduleOfTheProjectFor(entry: PackageCatalogEntry, dependencies: readonly WorkspaceDependency[], foldersAnotherEntryClaimed: ReadonlySet<string>): WorkspaceDependency | null {
  const entryFolderName = moduleFolderNameOf(entry.name);
  return (
    dependencies.find(
      (dependency) =>
        !foldersAnotherEntryClaimed.has(dependency.folder) && (dependency.folder === entryFolderName || (dependency.name !== null && moduleFolderNameOf(dependency.name) === entryFolderName)),
    ) ?? null
  );
}

/** Every card the window can show, before any filter: the catalog's entries in its order, then the project's modules it does not list, in the runtime's order. */
export function everyModuleCardRowOf(catalog: PackageCatalogReading | null, dependencies: readonly WorkspaceDependency[]): ModuleCardRow[] {
  const catalogEntries = catalog?.kind === "read" ? catalog.entries : [];
  const foldersTheCatalogLists = new Set<string>();
  const catalogRows = catalogEntries.map((entry) => {
    const moduleOfTheProject = moduleOfTheProjectFor(entry, dependencies, foldersTheCatalogLists);
    if (moduleOfTheProject !== null) foldersTheCatalogLists.add(moduleOfTheProject.folder);
    return { row_id: entry.name, title: entry.title, summary: entry.summary, catalog_entry: entry, module_of_the_project: moduleOfTheProject };
  });
  const unlistedModuleRows = dependencies
    .filter((dependency) => !foldersTheCatalogLists.has(dependency.folder))
    .map((dependency) => ({ row_id: dependency.folder, title: dependency.name ?? dependency.folder, summary: `Copied from ${dependency.source}`, catalog_entry: null, module_of_the_project: dependency }));
  return [...catalogRows, ...unlistedModuleRows];
}

function rowIsShown(row: ModuleCardRow, modulesShown: ModulesShown): boolean {
  if (modulesShown === "added_to_this_project") return row.module_of_the_project !== null;
  if (modulesShown === "sample_projects") return row.catalog_entry?.kind === "sample";
  return true;
}

function rowMatchesTheSearch(row: ModuleCardRow, searchText: string): boolean {
  const { catalog_entry: entry, module_of_the_project: dependency } = row;
  return textsMatchTheSearch(
    [
      row.title,
      ...(entry === null ? [] : [row.summary, entry.name, ...namesOf(entry.nodes), ...namesOf(entry.streams)]),
      ...(dependency === null ? [] : [dependency.folder, dependency.source]),
    ],
    searchText,
  );
}

/** Of `everyRow`, the cards `modulesShown` picks, narrowed to `searchText` by name, title, a catalog entry's summary, a node's or stream's name, or a module's folder or source. */
export function moduleCardRowsShownOf(everyRow: readonly ModuleCardRow[], modulesShown: ModulesShown, searchText: string): ModuleCardRow[] {
  return everyRow.filter((row) => rowIsShown(row, modulesShown) && rowMatchesTheSearch(row, searchText));
}

/** How many of `everyRow` each choice of what to show holds, before the search narrows them. */
export function moduleCardCountsOf(everyRow: readonly ModuleCardRow[]): Record<ModulesShown, number> {
  const countOf = (modulesShown: ModulesShown) => everyRow.filter((row) => rowIsShown(row, modulesShown)).length;
  return { everything: countOf("everything"), added_to_this_project: countOf("added_to_this_project"), sample_projects: countOf("sample_projects") };
}

/** The card `pickedId` names: the one whose catalog name or folder is `pickedId`, a row's own id winning over another's module folder. */
export function moduleCardRowPickedBy(rows: readonly ModuleCardRow[], pickedId: string): ModuleCardRow | null {
  return rows.find((row) => row.row_id === pickedId) ?? rows.find((row) => row.module_of_the_project?.folder === pickedId) ?? null;
}

/** What a card says beside its name about the project's module of it: a newer version at its source, its files edited since the copy, or just that it is added. */
export function moduleCardMarkOf(row: ModuleCardRow): { words: string; isNews: boolean } | null {
  const dependency = row.module_of_the_project;
  if (dependency === null) return null;
  if (dependency.newer_version_exists === true) return { words: "Newer version", isNews: true };
  if (dependency.edited_files.length > 0) return { words: "Added · edited", isNews: false };
  return { words: "Added", isNews: false };
}

/** The first 12 characters of a version's SHA-256, as a card's details show it. */
export function shortVersionOf(version: string): string {
  return version.slice(0, 12);
}
