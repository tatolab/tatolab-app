// A Marketplace entry's project, downloaded as the `.zip` the catalog names into the app's own
// downloads folder and checked against the SHA-256 the catalog gives, for the runtime's
// `add_dependency` to import like any other zip.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PackageCatalogEntry } from "../shared/tatolab_backend_contract.js";
import type { FetchBytesOverHttps } from "./package_catalog.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** The folder inside the app's config directory that holds each Marketplace download. */
export const MODULE_DOWNLOADS_FOLDER_NAME = "module-downloads";

/** The most bytes one Marketplace download may be. */
export const LARGEST_MODULE_DOWNLOAD_BYTES = 1024 * 1024 * 1024;

/** `entry`'s `.zip` downloaded into `downloadsFolder` as `<name>-<version>.zip` once its SHA-256 matches the catalog's, answering its path; refused in words with nothing left behind otherwise. */
export async function downloadTheCatalogEntrysZip(entry: PackageCatalogEntry, fetchBytesOverHttps: FetchBytesOverHttps, downloadsFolder: string): Promise<Result<string, string>> {
  if (entry.download === null) return failedWith(`The catalog names no download for ${entry.title}.`);
  const zipFileName = `${entry.name}-${entry.version}.zip`;
  if (zipFileName.includes("/") || zipFileName.includes("\\") || zipFileName.startsWith(".")) return failedWith(`The catalog's name ${entry.name} or version ${entry.version} is not one a file can be named by.`);
  const downloaded = await fetchBytesOverHttps(entry.download.url, LARGEST_MODULE_DOWNLOAD_BYTES);
  if (!downloaded.ok) return failedWith(`${entry.download.url} could not be downloaded: ${downloaded.failure}`);
  const downloadedSha256 = createHash("sha256").update(downloaded.value).digest("hex");
  if (downloadedSha256 !== entry.download.sha256) {
    return failedWith(`${entry.download.url} downloaded with the SHA-256 ${downloadedSha256}, not the catalog's ${entry.download.sha256}; nothing was imported.`);
  }
  const zipPath = path.join(downloadsFolder, zipFileName);
  const partialZipPath = path.join(downloadsFolder, `.${zipFileName}.${randomUUID()}.partial`);
  try {
    await mkdir(downloadsFolder, { recursive: true });
    await writeFile(partialZipPath, downloaded.value);
    await rename(partialZipPath, zipPath);
  } catch (writeFailure) {
    // The write's failure is the one to report; a partial file that cannot be removed either is left.
    await rm(partialZipPath, { force: true }).catch(() => undefined);
    return failedWith(`Tato Studio couldn't write ${zipPath}: ${describeCaughtFailure(writeFailure)}`);
  }
  return succeeded(zipPath);
}
