// What the Modules and Marketplace window lists: the catalog's packages and samples in its order, each saying
// whether the project has added it, then the project's modules the catalog does not list.

import { isAMarketplaceDownloadOf } from "../../shared/marketplace_module_download_file";
import type { ModulesShown } from "../../shared/tatolab_electron_bridge_contract";
import type { PackageCatalogEntry, PackageCatalogMember, PackageCatalogReading, ViewsOfAWorkspaceDependency, WorkspaceDependency } from "../../shared/tatolab_backend_contract";
import { manifestOfAListedView, titleTheManifestNames } from "../view_host/studio_view_type_registry";

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

/** The folder the runtime's `add_dependency` copies a project named `name` into under `imports/`: lowercased, each run of characters other than ASCII letters, digits, `-` and `_` made one `-`, trimmed of `-`, or `module` when nothing is left. */
export function moduleFolderNameOf(name: string): string {
  let folder = "";
  for (const character of name.trim()) {
    if (/^[A-Za-z0-9_-]$/.test(character)) folder += character.toLowerCase();
    else if (!folder.endsWith("-")) folder += "-";
  }
  const trimmed = folder.replace(/^-+|-+$/g, "");
  return trimmed === "" ? "module" : trimmed;
}

function textsMatchTheSearch(texts: readonly string[], searchText: string): boolean {
  const searchedFor = searchText.trim().toLowerCase();
  return searchedFor === "" || texts.some((text) => text.toLowerCase().includes(searchedFor));
}

function namesOf(members: readonly PackageCatalogMember[]): string[] {
  return members.map((member) => member.name);
}

function isNamedLikeTheEntry(entry: PackageCatalogEntry, dependency: WorkspaceDependency): boolean {
  const entryFolderName = moduleFolderNameOf(entry.name);
  return dependency.folder === entryFolderName || (dependency.name !== null && moduleFolderNameOf(dependency.name) === entryFolderName);
}

function moduleOfTheProjectFor(entry: PackageCatalogEntry, dependencies: readonly WorkspaceDependency[], foldersAnotherEntryClaimed: ReadonlySet<string>): WorkspaceDependency | null {
  const unclaimed = dependencies.filter((dependency) => !foldersAnotherEntryClaimed.has(dependency.folder));
  return unclaimed.find((dependency) => isAMarketplaceDownloadOf(entry.name, dependency.source)) ?? unclaimed.find((dependency) => isNamedLikeTheEntry(entry, dependency)) ?? null;
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
  return row.catalog_entry !== null;
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
  return { added_to_this_project: countOf("added_to_this_project"), marketplace: countOf("marketplace") };
}

/** The card `pickedId` names: the one whose catalog name or folder is `pickedId`, a row's own id winning over another's module folder. */
export function moduleCardRowPickedBy(rows: readonly ModuleCardRow[], pickedId: string): ModuleCardRow | null {
  return rows.find((row) => row.row_id === pickedId) ?? rows.find((row) => row.module_of_the_project?.folder === pickedId) ?? null;
}

/** What a card says beside its name about the project's module of it: an update at the source it was copied from, its files edited since the copy, or just that it is added. */
export function moduleCardMarkOf(row: ModuleCardRow): { words: string; isNews: boolean } | null {
  const dependency = row.module_of_the_project;
  if (dependency === null) return null;
  if (dependency.newer_version_exists === true) return { words: "Update available", isNews: true };
  if (dependency.edited_files.length > 0) return { words: "Added · edited", isNews: false };
  return { words: "Added", isNews: false };
}

/** The first 12 characters of a version's SHA-256, as a card's details show it. */
export function shortVersionOf(version: string): string {
  return version.slice(0, 12);
}

/** One row of a module's "Adds these views": its title, and its declared ports in words, or why it does not open in the runtime's or the schema's words. */
export type ModuleViewRow = { view_type_id: string; title: string } & ({ opens: true; ports_words: string } | { opens: false; not_opened_because: string });

/** What a module's details say of its views: each one a row, and what those that open can reach in words (`null` when none opens); or why the runtime listed none. */
export type ModuleViewsShown = { kind: "listed"; rows: ModuleViewRow[]; reach_words: string | null } | { kind: "not_listed"; because: string };

const DEVICE_WORDS = { camera: "the camera", microphone: "the microphone" } as const;

/** The views of `views` as a module's details show them, each manifest read with the view SDK's schema. */
export function moduleViewsShownOf(views: ViewsOfAWorkspaceDependency): ModuleViewsShown {
  if (views.kind === "not_listed") return views;
  const devicesDeclared = new Set<keyof typeof DEVICE_WORDS>();
  const rows = views.views.map((listedView): ModuleViewRow => {
    const title = titleTheManifestNames(listedView.manifest_json, listedView.view_type_id);
    const manifestReading = manifestOfAListedView(listedView);
    if (manifestReading.kind === "not_opened") return { view_type_id: listedView.view_type_id, title, opens: false, not_opened_because: manifestReading.because };
    const { manifest } = manifestReading;
    for (const capability of manifest.capabilities) if (capability === "camera" || capability === "microphone") devicesDeclared.add(capability);
    const portsWords = manifest.placement === "area" ? "Opens in any area" : `${manifest.inputs.length} in · ${manifest.outputs.length} out`;
    return { view_type_id: listedView.view_type_id, title, opens: true, ports_words: portsWords };
  });
  const devicesWords = (["camera", "microphone"] as const)
    .filter((device) => devicesDeclared.has(device))
    .map((device) => DEVICE_WORDS[device])
    .join(" and ");
  const reachWords = !rows.some((row) => row.opens) ? null : devicesWords === "" ? "Full access, like its nodes." : `Full access, like its nodes. They ask for ${devicesWords}.`;
  return { kind: "listed", rows, reach_words: reachWords };
}
