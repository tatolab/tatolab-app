// What the Library's Assets choice shows of the project's asset listing: every imported file, its
// graph documents left to the Outliner, grouped by the folder each sits in at the project's top.

import type { ProjectAssetPictureTone } from "@tatolab/tato-app-view-sdk/design_system/project_asset_card";
import type { ProjectAsset, ProjectAssetListing, ProjectAssetsImporting } from "@tatolab/tato-app-view-sdk/studio_readings";

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

/** The folder shown for the choice `shownFolderId`: that folder while the project still has it, every asset otherwise. */
export function assetFolderIdShownOf(folders: readonly LibraryAssetFolder[], shownFolderId: string): string {
  return folders.some((folder) => folder.folder_id === shownFolderId) ? shownFolderId : EVERY_ASSET_FOLDER_ID;
}

/** One file Import asset… did not import, or the import as a whole, with the words of whoever refused it. */
export interface LibraryImportRefusal {
  lead: string;
  because: string;
}

/** What to say of an import that refused anything: each file the runtime refused, or why nothing was imported. */
export function importRefusalsOf(importing: ProjectAssetsImporting): LibraryImportRefusal[] {
  switch (importing.kind) {
    case "imported":
      return importing.assets_imported.refused.map((refused) => ({ lead: `Didn't import ${refused.file_name}:`, because: refused.because }));
    case "nothing_chosen":
      return [];
    case "not_imported":
      return [{ lead: "Didn't import:", because: importing.because }];
  }
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

/** What an asset's card says under its name, as "media · 38 MB". */
export function assetKindAndSizeWords(asset: ProjectAsset): string {
  return `${asset.kind} · ${byteLengthInWords(asset.content_byte_len)}`;
}

/** Why no card shows: the project has no assets yet, or none of the media `mediaWordsOfThePick` names when the asset picker asks for some, or none in the folder `folderLabel` has `searchText` in its path. */
export function noAssetShownWords(assetCount: number, folderLabel: string, searchText: string, mediaWordsOfThePick: string | null): { title: string; explanation: string } {
  if (assetCount === 0 && mediaWordsOfThePick !== null) {
    return { title: `No ${mediaWordsOfThePick} yet`, explanation: "Import one, and it is chosen. One imported a moment ago shows here once the runtime has read it." };
  }
  if (assetCount === 0) return { title: "No assets yet", explanation: "A file imported into the project, a video, an image, a LUT or a model, is listed here." };
  const searchedFor = searchText.trim();
  return { title: "No asset matches", explanation: searchedFor === "" ? `${folderLabel} holds no asset.` : `Nothing in ${folderLabel} has “${searchedFor}” in its path.` };
}

/** The folder an asset at `path` sits in, `/`-separated in the project, empty for the project's top. */
export function assetFolderOf(path: string): string {
  const separatorAt = path.lastIndexOf("/");
  return separatorAt === -1 ? "" : path.slice(0, separatorAt);
}

/** Where an asset at `path` lands renamed to `fileName`, in the folder it sits in. */
export function assetPathRenamed(path: string, fileName: string): string {
  const folder = assetFolderOf(path);
  return folder === "" ? fileName.trim() : `${folder}/${fileName.trim()}`;
}

/** Where an asset at `path` lands moved into `folder`, under the name it has; an empty folder is the project's top. */
export function assetPathMoved(path: string, folder: string): string {
  const folderInTheProject = folder.trim().replace(/^\/+|\/+$/g, "");
  return folderInTheProject === "" ? assetFileName(path) : `${folderInTheProject}/${assetFileName(path)}`;
}

/** Why `fileName` can't name an asset's file, or `null` when it can. */
export function assetFileNameRefusal(fileName: string): string | null {
  const name = fileName.trim();
  if (name === "") return "Name the file.";
  if (name.includes("/")) return "A file name holds no “/”. Move puts the asset in another folder.";
  if (name === "." || name === "..") return "Name the file.";
  return null;
}

/** Why `folder` can't hold an asset of the project, or `null` when it can. */
export function assetFolderRefusal(folder: string): string | null {
  const folderTyped = folder.trim();
  if (folderTyped.startsWith("/") || folderTyped.split("/").some((segment) => segment === "..")) return "Name a folder inside the project, as media/archive.";
  return null;
}
