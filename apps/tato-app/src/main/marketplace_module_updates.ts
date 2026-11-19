// An import added from the Marketplace has its own download as its source, so the runtime's
// `list_dependencies` reads that same `.zip` again and never finds it newer. Whether the Marketplace
// holds another version is told from the catalog instead, against the version the download's file
// name carries, and an Update of such an import copies the catalog's current download.

import { isAMarketplaceDownload, marketplaceDownloadVersionOf } from "@tatolab/tato-app-view-sdk/marketplace_modules";
import type { PackageCatalogEntry, PackageCatalogReading } from "../shared/tatolab_backend_contract.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";

/** The catalog package `source` is a Marketplace download of, and the version it was downloaded at; `null` where `catalog` lists no package it downloads. */
export function marketplacePackageDownloadedAs(catalog: PackageCatalogReading, source: string): { entry: PackageCatalogEntry; downloadedVersion: string } | null {
  if (catalog.kind !== "read") return null;
  for (const entry of catalog.entries) {
    const downloadedVersion = entry.kind === "package" ? marketplaceDownloadVersionOf(entry.name, source) : null;
    if (downloadedVersion !== null) return { entry, downloadedVersion };
  }
  return null;
}

/**
 * `listed` as checked for a newer version: an import downloaded from the Marketplace against the version `catalog` lists for it, or why
 * that could not be told; any other import as the runtime checked it.
 */
export function checkedAgainstTheMarketplace(listed: ListedProjectDependency, catalog: PackageCatalogReading): ListedProjectDependency {
  if (!isAMarketplaceDownload(listed.dependency.source)) return listed;
  if (catalog.kind === "not_read") return { ...listed, newer_version_exists: null, check_refused_because: `The Marketplace could not be read: ${catalog.because}` };
  const downloaded = marketplacePackageDownloadedAs(catalog, listed.dependency.source);
  if (downloaded === null) return { ...listed, newer_version_exists: null, check_refused_because: "The Marketplace no longer lists it." };
  return { ...listed, newer_version_exists: downloaded.downloadedVersion !== downloaded.entry.version, check_refused_because: null };
}

/** The catalog package an Update of the import downloaded from `source` takes instead, where `catalog` lists another version of it; `null` where the import updates from its own source. */
export function marketplacePackageToUpdateTo(catalog: PackageCatalogReading, source: string): PackageCatalogEntry | null {
  const downloaded = marketplacePackageDownloadedAs(catalog, source);
  return downloaded !== null && downloaded.downloadedVersion !== downloaded.entry.version ? downloaded.entry : null;
}
