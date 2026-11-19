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

/** Whether `source`, an import's source as the runtime lists it, is a Marketplace download of the catalog entry named `name`, at any version. */
export function isAMarketplaceDownloadOf(name: string, source: string): boolean {
  const segments = source.split(/[/\\]/);
  const fileName = segments.at(-1) ?? "";
  if (segments.at(-2) !== MODULE_DOWNLOADS_FOLDER_NAME || !fileName.startsWith(`${name}-`) || !fileName.endsWith(".zip")) return false;
  return DOWNLOADED_VERSION_PATTERN.test(fileName.slice(name.length + 1, -".zip".length));
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
