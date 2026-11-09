// What the module manager lists in each of its tabs: the project's modules as the runtime lists
// them, and the Marketplace's projects from the catalog, each Marketplace row saying
// whether the project already has it.

import type { PackageCatalogEntry, PackageCatalogMember, PackageCatalogReading, WorkspaceDependency } from "../../shared/tatolab_backend_contract";

/** A tab of the module manager. */
export type ModuleManagerTab = "in_this_project" | "marketplace";

/** One of the project's modules as its row shows it. */
export interface ModuleOfTheProjectRow {
  /** Its folder under `imports/`, which no two rows share. */
  row_id: string;
  title: string;
  dependency: WorkspaceDependency;
}

/** One Marketplace entry as its row shows it. */
export interface MarketplaceRow {
  /** The catalog's name for it, which no two rows share. */
  row_id: string;
  title: string;
  entry: PackageCatalogEntry;
  /** The folder under `imports/` of the project's module of the same name, or `null` where the project has none. */
  folder_in_this_project: string | null;
}

/** A module's name lowercased with each run of other characters made `-`, as the runtime names its folder under `imports/`. */
function moduleFolderNameOf(name: string): string {
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

/** The project's modules narrowed to `searchText`, in the runtime's order. */
export function modulesOfTheProjectRowsOf(dependencies: readonly WorkspaceDependency[], searchText: string): ModuleOfTheProjectRow[] {
  return dependencies
    .map((dependency) => ({ row_id: dependency.folder, title: dependency.name ?? dependency.folder, dependency }))
    .filter((row) => textsMatchTheSearch([row.title, row.dependency.folder, row.dependency.source], searchText));
}

/** The catalog's projects in its order, narrowed to `searchText` by name, title, summary, or a node's or stream's name. */
export function marketplaceRowsOf(catalog: PackageCatalogReading | null, dependencies: readonly WorkspaceDependency[], searchText: string): MarketplaceRow[] {
  if (catalog?.kind !== "read") return [];
  return catalog.entries
    .map((entry) => {
      const moduleOfTheSameName = dependencies.find((dependency) => dependency.folder === moduleFolderNameOf(entry.name) || (dependency.name !== null && moduleFolderNameOf(dependency.name) === moduleFolderNameOf(entry.name)));
      return { row_id: entry.name, title: entry.title, entry, folder_in_this_project: moduleOfTheSameName?.folder ?? null };
    })
    .filter((row) => textsMatchTheSearch([row.entry.name, row.entry.title, row.entry.summary, ...namesOf(row.entry.nodes), ...namesOf(row.entry.streams)], searchText));
}

/** The first 12 characters of a version's SHA-256, as a row shows it. */
export function shortVersionOf(version: string): string {
  return version.slice(0, 12);
}
