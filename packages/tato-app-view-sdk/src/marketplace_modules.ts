// How a Marketplace entry is told among the modules a project has added. Studio downloads an entry's `.zip` as
// `<name>-<version>.zip` in the app's `module-downloads/` folder, which the runtime's `add_dependency` records as the
// import's source; a module's project names itself in its own `tatolab-project.json` ("Camera"), never by the catalog's
// package name ("tatolab-camera"), so that file is what ties an import to its entry. A module copied from elsewhere is
// the entry's when its folder under `imports/`, made from its name, or the name its project file holds, comes to the
// folder the entry's name makes; and a module whose nodes come in a wheel is the entry's when the wheel's distribution
// is named like it.

/** The folder inside the app's config directory that holds each Marketplace download. */
export const MODULE_DOWNLOADS_FOLDER_NAME = "module-downloads";

/** The file name a catalog entry named `name` at `version` is downloaded as. */
export function marketplaceDownloadFileNameOf(name: string, version: string): string {
  return `${name}-${version}.zip`;
}

/** A catalog version as a download's file name carries it: digits first, then digits, letters, `.` and `+`, never a `-`, so `tatolab-camera-extras-0.1.zip` is no download of `tatolab-camera`. */
const DOWNLOADED_VERSION_PATTERN = /^[0-9][0-9A-Za-z.+]*$/;

/** The file name of `source`, an import's source as the runtime lists it, where it is a `.zip` in the Marketplace's downloads folder; `null` where it is none. */
function marketplaceDownloadFileNameIn(source: string): string | null {
  const segments = source.split(/[/\\]/);
  const fileName = segments.at(-1) ?? "";
  return segments.at(-2) === MODULE_DOWNLOADS_FOLDER_NAME && fileName.endsWith(".zip") ? fileName : null;
}

/** Whether `source`, an import's source as the runtime lists it, is a `.zip` in the Marketplace's downloads folder, of whichever entry. */
export function isAMarketplaceDownload(source: string): boolean {
  return marketplaceDownloadFileNameIn(source) !== null;
}

/** The catalog version `source`, an import's source as the runtime lists it, downloaded the entry named `name` at; `null` where it is no Marketplace download of that entry. */
export function marketplaceDownloadVersionOf(name: string, source: string): string | null {
  const fileName = marketplaceDownloadFileNameIn(source);
  if (fileName === null || !fileName.startsWith(`${name}-`)) return null;
  const version = fileName.slice(name.length + 1, -".zip".length);
  return DOWNLOADED_VERSION_PATTERN.test(version) ? version : null;
}

/** Whether `source`, an import's source as the runtime lists it, is a Marketplace download of the catalog entry named `name`, at any version. */
export function isAMarketplaceDownloadOf(name: string, source: string): boolean {
  return marketplaceDownloadVersionOf(name, source) !== null;
}

/** A Python distribution's name as packaging compares it: lowercased, each run of `-`, `_` and `.` one `-`. */
function distributionNameCompared(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/** Whether the installed wheel `distribution` is the Marketplace entry `entryName`'s, the two compared as packaging compares names, so `Tatolab_Camera` is `tatolab-camera`'s. */
export function isTheDistributionOfTheMarketplaceEntry(entryName: string, distribution: string): boolean {
  return distributionNameCompared(distribution) === distributionNameCompared(entryName);
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

/** Whether the module in `module.folder` under `imports/`, its project file naming it `module.name` (`null` where it names none), is named like the Marketplace entry `entryName`. */
export function isTheModuleNamedLikeTheMarketplaceEntry(entryName: string, module: { folder: string; name: string | null }): boolean {
  const entryFolderName = moduleFolderNameOf(entryName);
  return module.folder === entryFolderName || (module.name !== null && moduleFolderNameOf(module.name) === entryFolderName);
}
