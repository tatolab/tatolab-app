// The file a Marketplace entry's `.zip` is downloaded as, `<name>-<version>.zip` in the app's
// `module-downloads/` folder, which the runtime's `add_dependency` records as the import's source.
// A module's project names itself in its own `tatolab-project.json` ("Camera"), never by the
// catalog's package name ("tatolab-camera"), so this file is what ties an import to its entry.

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
