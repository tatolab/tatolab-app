// What the Library's Assets choice shows of the project's asset listing: every imported file, its
// graph documents left to the Outliner, grouped by the folder each sits in at the project's top.

import type { ProjectAssetPictureTone } from "@tatolab/tato-app-view-sdk/design_system/project_asset_card";
import type { ProjectAsset, ProjectAssetListing } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The id of the choice that shows every asset, whatever its folder. */
export const EVERY_ASSET_FOLDER_ID = "every_asset";

/** A folder at the project's top that holds assets, and how many. */
export interface LibraryAssetFolder {
  folder_id: string;
  label: string;
  asset_count: number;
}

/** The assets the Library lists: every asset but the graph documents, which are the project's streams. */
export function assetsTheLibraryLists(listing: ProjectAssetListing): ProjectAsset[] {
  return listing.assets.filter((asset) => asset.kind !== "stream");
}

/** The folder at the project's top an asset at `path` sits in, `.` for one at the top itself. */
function topFolderOf(path: string): string {
  const separatorAt = path.indexOf("/");
  return separatorAt === -1 ? "." : path.slice(0, separatorAt);
}

/** Every asset's choice first, then each top folder that holds one, by name, each with its count. */
export function libraryAssetFoldersOf(assets: readonly ProjectAsset[]): LibraryAssetFolder[] {
  const countsByFolder = new Map<string, number>();
  for (const asset of assets) countsByFolder.set(topFolderOf(asset.path), (countsByFolder.get(topFolderOf(asset.path)) ?? 0) + 1);
  const folders = [...countsByFolder.entries()]
    .sort(([leftFolder], [rightFolder]) => leftFolder.localeCompare(rightFolder))
    .map(([folder, assetCount]): LibraryAssetFolder => ({ folder_id: `folder:${folder}`, label: folder === "." ? "Project folder" : folder, asset_count: assetCount }));
  return [{ folder_id: EVERY_ASSET_FOLDER_ID, label: "All assets", asset_count: assets.length }, ...folders];
}

/** The assets in the folder `folderId` whose path holds `searchText`, ignoring case. */
export function assetsShownInTheFolder(assets: readonly ProjectAsset[], folderId: string, searchText: string): ProjectAsset[] {
  const searchedFor = searchText.trim().toLowerCase();
  return assets.filter(
    (asset) => (folderId === EVERY_ASSET_FOLDER_ID || `folder:${topFolderOf(asset.path)}` === folderId) && (searchedFor === "" || asset.path.toLowerCase().includes(searchedFor)),
  );
}

/** The name of the file at `path`. */
export function assetFileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The file's extension in capitals, as "MP4", or the asset's kind when it has none. */
export function assetFormatWords(asset: ProjectAsset): string {
  const fileName = assetFileName(asset.path);
  const dotAt = fileName.lastIndexOf(".");
  return dotAt <= 0 ? asset.kind : fileName.slice(dotAt + 1).toUpperCase();
}

/** How many bytes, in the unit that reads best, as "38 MB"; a megabyte is 1,000,000 bytes, as macOS's Finder counts. */
export function byteLengthInWords(byteLength: number): string {
  if (byteLength < 1000) return byteLength === 1 ? "1 byte" : `${byteLength} bytes`;
  const units = ["KB", "MB", "GB", "TB"];
  let scaled = byteLength / 1000;
  let unitIndex = 0;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }
  return `${scaled < 10 ? scaled.toFixed(1).replace(/\.0$/, "") : Math.round(scaled)} ${units[unitIndex]}`;
}

/** The tint of an asset's card, from its kind. */
export function assetPictureToneOf(asset: ProjectAsset): ProjectAssetPictureTone {
  return asset.kind === "media" || asset.kind === "scene" || asset.kind === "data" ? asset.kind : "other";
}

/** A long hex digest or UUID shortened to its ends, as "16e8…2700". */
export function shortenedDigest(digest: string): string {
  return digest.length <= 12 ? digest : `${digest.slice(0, 4)}…${digest.slice(-4)}`;
}
