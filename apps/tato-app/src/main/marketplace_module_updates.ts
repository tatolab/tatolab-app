// An import added from the Marketplace has its own download as its source, so the runtime's
// `list_dependencies` reads that same `.zip` again and never finds it newer. Whether the Marketplace
// holds another version is told from the catalog instead, against the version the download's file
// name carries, and an Update of such an import copies the catalog's current download.

import { isAMarketplaceDownload, marketplaceDownloadVersionOf } from "@tatolab/tato-app-view-sdk/marketplace_modules";
import type { PackageCatalogEntry, PackageCatalogReading } from "../shared/tatolab_backend_contract.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";

/**
 * The catalog package `source` is a Marketplace download of, and whether the catalog lists it at another version than the one downloaded;
 * `null` where `catalog` lists no package it downloads. Where two names could have made the file name, as `tatolab-camera` at `2-0.1` and
 * `tatolab-camera-2` at `0.1` both make `tatolab-camera-2-0.1.zip`, the longer name is the one downloaded.
 */
function marketplacePackageDownloadedAs(catalog: PackageCatalogReading, source: string): { entry: PackageCatalogEntry; isListedAtAnotherVersion: boolean } | null {
  if (catalog.kind !== "read") return null;
  let downloaded: { entry: PackageCatalogEntry; isListedAtAnotherVersion: boolean } | null = null;
  for (const entry of catalog.entries) {
    const downloadedVersion = entry.kind === "package" ? marketplaceDownloadVersionOf(entry.name, source) : null;
    if (downloadedVersion !== null && (downloaded === null || entry.name.length > downloaded.entry.name.length)) downloaded = { entry, isListedAtAnotherVersion: downloadedVersion !== entry.version };
  }
  return downloaded;
}

/**
 * `listed` as checked for a newer version: an import downloaded from the Marketplace against the version `catalog` lists for it, or why
 * that could not be told; any other import as the runtime checked it. The catalog lists one version of a package, its current one, so
 * any other version downloaded is one the Marketplace has moved on from, even where it reads higher.
 */
export function checkedAgainstTheMarketplace(listed: ListedProjectDependency, catalog: PackageCatalogReading): ListedProjectDependency {
  if (!isAMarketplaceDownload(listed.dependency.source)) return listed;
  if (catalog.kind === "not_read") return { ...listed, newer_version_exists: null, check_refused_because: `The Marketplace could not be read: ${catalog.because}` };
  const downloaded = marketplacePackageDownloadedAs(catalog, listed.dependency.source);
  if (downloaded === null) return { ...listed, newer_version_exists: null, check_refused_because: "The Marketplace no longer lists it." };
  return { ...listed, newer_version_exists: downloaded.isListedAtAnotherVersion, check_refused_because: null };
}

/** The catalog package an Update of the import downloaded from `source` takes instead, where `catalog` lists another version of it; `null` where the import updates from its own source. */
export function marketplacePackageToUpdateTo(catalog: PackageCatalogReading, source: string): PackageCatalogEntry | null {
  const downloaded = marketplacePackageDownloadedAs(catalog, source);
  return downloaded !== null && downloaded.isListedAtAnotherVersion ? downloaded.entry : null;
}
