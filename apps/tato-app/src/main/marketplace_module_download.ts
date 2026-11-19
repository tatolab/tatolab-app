// A Marketplace entry's project, downloaded as the `.zip` the catalog names into the app's own
// downloads folder and checked against the SHA-256 the catalog gives, for the runtime's
// `add_dependency` to import like any other zip.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { marketplaceDownloadFileNameOf } from "@tatolab/tato-app-view-sdk/marketplace_modules";
import type { MarketplaceImportStage, PackageCatalogEntry } from "../shared/tatolab_backend_contract.js";
import type { FetchBytesOverHttps } from "./package_catalog.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";

/** The most bytes one Marketplace download may be. */
export const LARGEST_MODULE_DOWNLOAD_BYTES = 1024 * 1024 * 1024;

/** What a Marketplace download tells as it goes, each stage it reaches and its bytes as they are read, and watches to stop while it downloads. */
export interface MarketplaceDownloadFollowing {
  readonly stageReached: (stage: MarketplaceImportStage) => void;
  /** Stops the download once aborted; checking it against the catalog's SHA-256 is never stopped. */
  readonly stopped: AbortSignal;
}

/** Why a Marketplace download came to nothing: refused in words, or stopped by its following, with nothing left behind either way. */
export type MarketplaceDownloadFailure = { kind: "refused"; because: string } | { kind: "stopped" };

/**
 * `entry`'s `.zip` downloaded into `downloadsFolder` as `<name>-<version>.zip` once its SHA-256 matches the catalog's, answering its path;
 * `following`, where given, is told each stage and the bytes read, and may stop the download before it is checked.
 */
export async function downloadTheCatalogEntrysZip(
  entry: PackageCatalogEntry,
  fetchBytesOverHttps: FetchBytesOverHttps,
  downloadsFolder: string,
  following: MarketplaceDownloadFollowing | null,
): Promise<Result<string, MarketplaceDownloadFailure>> {
  const refused = (because: string) => failedWith<MarketplaceDownloadFailure>({ kind: "refused", because });
  if (entry.download === null) return refused(`The catalog names no download for ${entry.title}.`);
  const zipFileName = marketplaceDownloadFileNameOf(entry.name, entry.version);
  if (zipFileName.includes("/") || zipFileName.includes("\\") || zipFileName.startsWith(".")) return refused(`The catalog's name ${entry.name} or version ${entry.version} is not one a file can be named by.`);
  following?.stageReached({ kind: "downloading", bytes_read: 0, bytes_total: null });
  const downloaded = await fetchBytesOverHttps(
    entry.download.url,
    LARGEST_MODULE_DOWNLOAD_BYTES,
    following === null ? null : { bytesRead: (bytesRead, bytesTotal) => following.stageReached({ kind: "downloading", bytes_read: bytesRead, bytes_total: bytesTotal }), stopped: following.stopped },
  );
  if (following?.stopped.aborted === true) return failedWith({ kind: "stopped" });
  if (!downloaded.ok) return refused(`${entry.download.url} could not be downloaded: ${downloaded.failure}`);
  following?.stageReached({ kind: "verifying", sha256: entry.download.sha256 });
  const downloadedSha256 = createHash("sha256").update(downloaded.value).digest("hex");
  if (downloadedSha256 !== entry.download.sha256) {
    return refused(`${entry.download.url} downloaded with the SHA-256 ${downloadedSha256}, not the catalog's ${entry.download.sha256}; nothing was imported.`);
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
    return refused(`Tato Studio couldn't write ${zipPath}: ${describeCaughtFailure(writeFailure)}`);
  }
  return succeeded(zipPath);
}
