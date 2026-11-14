// What the Marketplace window lists: the catalog's packages and samples in its order, each package saying
// whether the project has it, then the project's modules the catalog does not list.

import type { ModuleCardMark } from "@tatolab/tato-app-view-sdk/design_system/module_card";
import type { ProjectCoverNumber } from "@tatolab/tato-app-view-sdk/design_system/project_card";
import { isAMarketplaceDownloadOf } from "../../shared/marketplace_module_download_file";
import { catalogOperatingSystemsOnlyWords, whyTheModuleBringsNothingOnThisMachine } from "../../shared/package_catalog_machine_words";
import type { PackageCatalogEntry, PackageCatalogMember, PackageCatalogReading, ViewsOfAWorkspaceDependency, WorkspaceDependency } from "../../shared/tatolab_backend_contract";
import { projectCoverNumberOfTheName } from "../presentation/projects_presentation";
import { manifestOfAListedView, titleTheManifestNames } from "../view_host/studio_view_type_registry";

/** One card or list row of the Marketplace window: a catalog entry, the project's module of it, or both. */
export interface ModuleCardRow {
  /** `catalog:<the catalog's name for it>`, or for a module the catalog does not list `import:<its folder under imports/>`; no two rows share one. */
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

/** The row id of the catalog's entry `name`. */
export function rowIdOfTheCatalogEntryNamed(name: string): string {
  return `catalog:${name}`;
}

/** The row id of a module of the project the catalog does not list, by its folder under `imports/`. */
export function rowIdOfTheUnlistedModuleIn(folder: string): string {
  return `import:${folder}`;
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
  if (entry.kind === "sample") return null;
  const unclaimed = dependencies.filter((dependency) => !foldersAnotherEntryClaimed.has(dependency.folder));
  return unclaimed.find((dependency) => isAMarketplaceDownloadOf(entry.name, dependency.source)) ?? unclaimed.find((dependency) => isNamedLikeTheEntry(entry, dependency)) ?? null;
}

/**
 * Every row the window can show, before any filter: the catalog's entries in its order, then the project's modules it does not list, in the
 * runtime's order. A sample is cloned into a project of its own and never added to this one, so no module of the project is ever a sample's.
 */
export function everyModuleCardRowOf(catalog: PackageCatalogReading | null, dependencies: readonly WorkspaceDependency[]): ModuleCardRow[] {
  const catalogEntries = catalog?.kind === "read" ? catalog.entries : [];
  const foldersTheCatalogLists = new Set<string>();
  const catalogRows = catalogEntries.map((entry) => {
    const moduleOfTheProject = moduleOfTheProjectFor(entry, dependencies, foldersTheCatalogLists);
    if (moduleOfTheProject !== null) foldersTheCatalogLists.add(moduleOfTheProject.folder);
    return { row_id: rowIdOfTheCatalogEntryNamed(entry.name), title: entry.title, summary: entry.summary, catalog_entry: entry, module_of_the_project: moduleOfTheProject };
  });
  const unlistedModuleRows = dependencies
    .filter((dependency) => !foldersTheCatalogLists.has(dependency.folder))
    .map((dependency) => ({ row_id: rowIdOfTheUnlistedModuleIn(dependency.folder), title: dependency.name ?? dependency.folder, summary: "", catalog_entry: null, module_of_the_project: dependency }));
  return [...catalogRows, ...unlistedModuleRows];
}

/** The plain cover a row's module wears while it has no picture: chosen from its title as a project's is from its name, so it is the same every time and the same in both tabs. */
export function moduleCoverNumberOf(row: ModuleCardRow): ProjectCoverNumber {
  return projectCoverNumberOfTheName(row.title);
}

/** Which of the catalog's entries the Marketplace shows: all of them, its packages, or its sample projects. */
export const MARKETPLACE_KINDS_SHOWN = ["all", "package", "sample"] as const;

/** One of the Marketplace's kind filters. */
export type MarketplaceKindShown = (typeof MARKETPLACE_KINDS_SHOWN)[number];

function rowIsOfTheKind(row: ModuleCardRow, kindShown: MarketplaceKindShown): boolean {
  return row.catalog_entry !== null && (kindShown === "all" || row.catalog_entry.kind === kindShown);
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

/** Of `everyRow`, the catalog's entries of `kindShown`, narrowed to `searchText` by name, title, summary, or a node's or stream's name. */
export function marketplaceRowsShownOf(everyRow: readonly ModuleCardRow[], kindShown: MarketplaceKindShown, searchText: string): ModuleCardRow[] {
  return everyRow.filter((row) => rowIsOfTheKind(row, kindShown) && rowMatchesTheSearch(row, searchText));
}

/** Of `everyRow`, the project's modules, narrowed to `searchText` by name, folder, source, or what the catalog says of it. */
export function projectModuleRowsShownOf(everyRow: readonly ModuleCardRow[], searchText: string): ModuleCardRow[] {
  return everyRow.filter((row) => row.module_of_the_project !== null && rowMatchesTheSearch(row, searchText));
}

/** How many of `everyRow` each Marketplace kind holds, how many are the project's modules, and how many of those have an update where they were copied from, before the search narrows them. */
export function moduleRowCountsOf(everyRow: readonly ModuleCardRow[]): { marketplace: Record<MarketplaceKindShown, number>; project: { all: number; updates: number } } {
  const ofTheKind = (kindShown: MarketplaceKindShown) => everyRow.filter((row) => rowIsOfTheKind(row, kindShown)).length;
  const modulesOfTheProject = everyRow.flatMap((row) => (row.module_of_the_project === null ? [] : [row.module_of_the_project]));
  return {
    marketplace: { all: ofTheKind("all"), package: ofTheKind("package"), sample: ofTheKind("sample") },
    project: { all: modulesOfTheProject.length, updates: modulesOfTheProject.filter((dependency) => dependency.newer_version_exists === true).length },
  };
}

/** Every id the row goes by, its own first: a module of the project the catalog lists also goes by its folder's, its id while the catalog is not read. */
export function everyIdTheRowGoesBy(row: ModuleCardRow): string[] {
  const idByItsFolder = row.module_of_the_project === null ? row.row_id : rowIdOfTheUnlistedModuleIn(row.module_of_the_project.folder);
  return idByItsFolder === row.row_id ? [row.row_id] : [row.row_id, idByItsFolder];
}

/** The row `rowId` names among `rows` by any id it goes by, where it stands among them counted from 1, and the rows before and after it; `null` when none of them is it. */
export function moduleRowAndItsNeighboursOf(rows: readonly ModuleCardRow[], rowId: string): { row: ModuleCardRow; position: number; previousRowId: string | null; nextRowId: string | null } | null {
  const index = rows.findIndex((row) => everyIdTheRowGoesBy(row).includes(rowId));
  const row = rows[index];
  if (row === undefined) return null;
  return { row, position: index + 1, previousRowId: rows[index - 1]?.row_id ?? null, nextRowId: rows[index + 1]?.row_id ?? null };
}

/** What can be asked of one module. */
export const MODULE_ASKS = ["add", "clone", "update", "remove"] as const;

/** One thing asked of a module. */
export type ModuleAsk = (typeof MODULE_ASKS)[number];

function idTheWorkOfTheAskIsKeptUnder(row: ModuleCardRow, ask: ModuleAsk): string {
  const dependency = row.module_of_the_project;
  return dependency !== null && (ask === "update" || ask === "remove") ? rowIdOfTheUnlistedModuleIn(dependency.folder) : row.row_id;
}

/**
 * `workById` with the row's work made `work` for `ask`, or none for `null`. What is asked of the project's module is kept under its folder's id
 * and what is asked of the catalog's entry under the entry's, so the work stays the row's when the catalog is read after the project's modules.
 */
export function workByIdWithTheRowsMade<Work>(workById: Readonly<Record<string, Work>>, row: ModuleCardRow, ask: ModuleAsk, work: Work | null): Record<string, Work> {
  const idsOfTheRow = everyIdTheRowGoesBy(row);
  const workOfEveryOtherRow = Object.fromEntries(Object.entries(workById).filter(([rowId]) => !idsOfTheRow.includes(rowId)));
  return work === null ? workOfEveryOtherRow : { ...workOfEveryOtherRow, [idTheWorkOfTheAskIsKeptUnder(row, ask)]: work };
}

/**
 * `workById` without the work `saysAnAddJustEnded` holds for each row the project's modules now list. That an add just ended is said on the
 * module's page until the page shown changes; from then on the row's module says the project has it.
 */
export function workByIdWithoutTheAddsNowListed<Work>(workById: Readonly<Record<string, Work>>, everyRow: readonly ModuleCardRow[], saysAnAddJustEnded: (work: Work) => boolean): Readonly<Record<string, Work>> {
  return everyRow.reduce((workKept, row) => {
    const work = workKeptForTheRow(workKept, row);
    return row.module_of_the_project !== null && work !== null && saysAnAddJustEnded(work) ? workByIdWithTheRowsMade(workKept, row, "add", null) : workKept;
  }, workById);
}

/** The work kept for the row under any id it goes by; `null` for none. */
export function workKeptForTheRow<Work>(workById: Readonly<Record<string, Work>>, row: ModuleCardRow): Work | null {
  for (const rowId of everyIdTheRowGoesBy(row)) {
    const work = workById[rowId];
    if (work !== undefined) return work;
  }
  return null;
}

/** Each ask as a refusal names what did not happen, as "Camera was not added". */
export const MODULE_ASK_WORDS_ONCE_DONE: Record<ModuleAsk, string> = { add: "added", clone: "cloned", update: "updated", remove: "uninstalled" };

/** Each ask as a card says it while it runs. */
export const MODULE_ASK_WORDS_WHILE_UNDER_WAY: Record<ModuleAsk, string> = { add: "Adding…", clone: "Cloning…", update: "Updating…", remove: "Uninstalling…" };

/** Why the row's module brings no node on this machine, in words; `null` where the catalog does not say its wheels leave this machine out. */
export function whyTheRowBringsNothingOnThisMachine(row: ModuleCardRow): string | null {
  const entry = row.catalog_entry;
  return entry === null || entry.runs_on_this_machine || entry.platforms === null ? null : whyTheModuleBringsNothingOnThisMachine(row.title, entry.platforms);
}

/** The marks a module that brings nothing on this machine wears, as "Linux only"; `null` where the catalog does not say its wheels leave this machine out. */
export function moduleNotOnThisMachineMarkOf(row: ModuleCardRow): ModuleCardMark | null {
  const entry = row.catalog_entry;
  return entry === null || entry.runs_on_this_machine || entry.platforms === null ? null : { words: catalogOperatingSystemsOnlyWords(entry.platforms), tone: "refused" };
}

/** What a card says in its corner: the ask last refused of it, else that it brings nothing on this machine, else an update at the source the project's module was copied from, else that the project has it, as it does once an add of it ended; `null` for none of these. */
export function moduleCardMarkOf(row: ModuleCardRow, askLastRefused: ModuleAsk | null, wasJustAdded: boolean): ModuleCardMark | null {
  if (askLastRefused !== null) return { words: `Not ${MODULE_ASK_WORDS_ONCE_DONE[askLastRefused]}`, tone: "refused" };
  const notOnThisMachineMark = moduleNotOnThisMachineMarkOf(row);
  if (notOnThisMachineMark !== null) return notOnThisMachineMark;
  const dependency = row.module_of_the_project;
  if (dependency?.newer_version_exists === true) return { words: "Update available", tone: "news" };
  return dependency !== null || wasJustAdded ? { words: "In project", tone: "quiet" } : null;
}

/** Whether a card offers Add: a package the catalog gives a download for, which brings nodes on this machine, the project does not have and an add has not just brought. */
export function cardOffersAdd(row: ModuleCardRow, wasJustAdded: boolean): boolean {
  return row.catalog_entry?.kind === "package" && row.catalog_entry.download !== null && row.catalog_entry.runs_on_this_machine && row.module_of_the_project === null && !wasJustAdded;
}

function countedWords(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? "" : "s"}`;
}

/** How many of the project's modules have an update where they were copied from, in words, as "1 update". */
export function updatesCountWordsOf(updatesCount: number): string {
  return countedWords(updatesCount, "update");
}

/** What the window's footer counts: the project's modules, the Marketplace's entries, and the updates found when there are any. */
export function moduleCountsWordsOf(projectName: string, rowCounts: ReturnType<typeof moduleRowCountsOf>): string {
  return [`${rowCounts.project.all} in ${projectName}`, `${rowCounts.marketplace.all} in the Marketplace`, ...(rowCounts.project.updates > 0 ? [updatesCountWordsOf(rowCounts.project.updates)] : [])].join(" · ");
}

/** What the window's footer says is in progress: nothing, the one thing under way in its own words, or how many are and each one's words. */
export function workInProgressWordsOf(wordsOfEachWorkUnderWay: readonly string[]): string {
  const [firstWorkUnderWay] = wordsOfEachWorkUnderWay;
  if (firstWorkUnderWay === undefined) return "Nothing in progress";
  return wordsOfEachWorkUnderWay.length === 1 ? firstWorkUnderWay : `${wordsOfEachWorkUnderWay.length} in progress: ${wordsOfEachWorkUnderWay.join(" ")}`;
}

/** What a row holds, in words, as "2 nodes · 1 stream · 1 view": its nodes and streams as the catalog names them, and its views once the project has it; `""` where nothing says. */
export function moduleContentsWordsOf(row: ModuleCardRow): string {
  const { catalog_entry: entry, module_of_the_project: dependency } = row;
  const viewCount = dependency !== null && dependency.views.kind === "listed" ? dependency.views.views.length : 0;
  return [
    ...(entry !== null && entry.nodes.length > 0 ? [countedWords(entry.nodes.length, "node")] : []),
    ...(entry !== null && entry.streams.length > 0 ? [countedWords(entry.streams.length, "stream")] : []),
    ...(viewCount > 0 ? [countedWords(viewCount, "view")] : []),
  ].join(" · ");
}

/** What a Marketplace card says its entry holds: `moduleContentsWordsOf`, behind "Sample project" for a sample. */
export function moduleCardContentsWordsOf(row: ModuleCardRow): string {
  return [...(row.catalog_entry?.kind === "sample" ? ["Sample project"] : []), moduleContentsWordsOf(row)].filter((words) => words !== "").join(" · ");
}

/** Where a module of the project was copied from, in words: the Marketplace, a `.zip`, or a folder. */
export function moduleSourceWordsOf(row: ModuleCardRow): string {
  const { catalog_entry: entry, module_of_the_project: dependency } = row;
  if (dependency === null) return "";
  if (entry !== null && isAMarketplaceDownloadOf(entry.name, dependency.source)) return "From the Marketplace";
  return dependency.source.toLowerCase().endsWith(".zip") ? "From a .zip" : "From a folder";
}

/** How a module's copy stands against where it was copied from: an update there, none, not asked yet, or the check refused in the runtime's words. */
export type ModuleCopyState = { kind: "update_available" } | { kind: "up_to_date" } | { kind: "not_checked" } | { kind: "check_refused"; because: string };

/** How `dependency`'s copy stands against its source, as the last listing answered it. */
export function moduleCopyStateOf(dependency: WorkspaceDependency): ModuleCopyState {
  if (dependency.check_refused_because !== null) return { kind: "check_refused", because: dependency.check_refused_because };
  if (dependency.newer_version_exists === null) return { kind: "not_checked" };
  return dependency.newer_version_exists ? { kind: "update_available" } : { kind: "up_to_date" };
}

/** Why Update is not offered for a module, in words; `null` when its last listing found an update where it was copied from. */
export function whyTheModuleHasNoUpdateToTake(dependency: WorkspaceDependency): string | null {
  const copyState = moduleCopyStateOf(dependency);
  if (copyState.kind === "update_available") return null;
  if (copyState.kind === "up_to_date") return "It is up to date.";
  return copyState.kind === "not_checked" ? "Check for updates first." : "Where it was copied from could not be checked.";
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
