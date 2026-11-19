import { expect, test } from "vitest";
import type { PackageCatalogEntry, PackageCatalogReading } from "../shared/tatolab_backend_contract.js";
import { checkedAgainstTheMarketplace, marketplacePackageToUpdateTo } from "./marketplace_module_updates.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";

const DOWNLOADS = "/home/sam/.config/Tato Studio/module-downloads";

function entryNamed(kind: PackageCatalogEntry["kind"], name: string, version: string): PackageCatalogEntry {
  return {
    kind,
    name,
    title: name,
    summary: "",
    version,
    download: { url: `https://get.tatolab.com/modules/${name}-${version}.zip`, sha256: "4f7a" },
    nodes: [],
    streams: [],
    homepage_url: null,
    platforms: null,
    runs_on_this_machine: true,
    lowest_runtime_version: null,
    newer_runtime_it_needs: null,
  };
}

const CATALOG: PackageCatalogReading = { kind: "read", entries: [entryNamed("package", "tatolab-camera", "0.69.44"), entryNamed("sample", "camera-halftone", "0.69.44")], unreadable_entry_count: 0 };

/** An import copied from `source`, as the runtime checked its own source: the same `.zip`, so never newer. */
function listedFrom(source: string): ListedProjectDependency {
  return { dependency: { project: "uuid-of-camera", folder: "camera", source, version: "9f2c" }, edited_files: [], newer_version_exists: false, check_refused_because: null };
}

test("a Marketplace download of an older version than the catalog lists has an update, and one of the catalog's own version has none", () => {
  expect(checkedAgainstTheMarketplace(listedFrom(`${DOWNLOADS}/tatolab-camera-0.68.97.zip`), CATALOG)).toMatchObject({ newer_version_exists: true, check_refused_because: null });
  expect(checkedAgainstTheMarketplace(listedFrom(`${DOWNLOADS}/tatolab-camera-0.69.44.zip`), CATALOG)).toMatchObject({ newer_version_exists: false, check_refused_because: null });
});

test("an import from a folder or a local .zip keeps the runtime's own check", () => {
  const fromAFolder = { ...listedFrom("/home/sam/shows/lobby-wall"), newer_version_exists: true };
  expect(checkedAgainstTheMarketplace(fromAFolder, CATALOG)).toBe(fromAFolder);
  const fromALocalZip = listedFrom("/home/sam/Downloads/tatolab-camera-0.68.97.zip");
  expect(checkedAgainstTheMarketplace(fromALocalZip, { kind: "not_read", because: "HTTP 404" })).toBe(fromALocalZip);
});

test("a Marketplace download says why it was not checked where the catalog did not read, or lists no package it downloads", () => {
  expect(checkedAgainstTheMarketplace(listedFrom(`${DOWNLOADS}/tatolab-camera-0.68.97.zip`), { kind: "not_read", because: "HTTP 503" })).toMatchObject({
    newer_version_exists: null,
    check_refused_because: "The Marketplace could not be read: HTTP 503",
  });
  expect(checkedAgainstTheMarketplace(listedFrom(`${DOWNLOADS}/camera-halftone-0.68.97.zip`), CATALOG)).toMatchObject({ newer_version_exists: null, check_refused_because: "The Marketplace no longer lists it." });
});

test("an Update takes the catalog's package only where the catalog lists another version than the one downloaded", () => {
  expect(marketplacePackageToUpdateTo(CATALOG, `${DOWNLOADS}/tatolab-camera-0.68.97.zip`)?.version).toBe("0.69.44");
  expect(marketplacePackageToUpdateTo(CATALOG, `${DOWNLOADS}/tatolab-camera-0.69.44.zip`)).toBeNull();
  expect(marketplacePackageToUpdateTo(CATALOG, "/home/sam/shows/lobby-wall")).toBeNull();
  expect(marketplacePackageToUpdateTo({ kind: "not_read", because: "HTTP 503" }, `${DOWNLOADS}/tatolab-camera-0.68.97.zip`)).toBeNull();
});

test("a download of a pre-release version is told back from its file name, and the longer of two names that could make it is the one downloaded", () => {
  const catalog: PackageCatalogReading = {
    kind: "read",
    entries: [entryNamed("package", "tatolab-camera", "0.70.0-rc.1"), entryNamed("package", "tatolab-camera-2", "0.2")],
    unreadable_entry_count: 0,
  };
  expect(checkedAgainstTheMarketplace(listedFrom(`${DOWNLOADS}/tatolab-camera-0.70.0-rc.1.zip`), catalog)).toMatchObject({ newer_version_exists: false, check_refused_because: null });
  expect(marketplacePackageToUpdateTo(catalog, `${DOWNLOADS}/tatolab-camera-2-0.1.zip`)).toMatchObject({ name: "tatolab-camera-2", version: "0.2" });
});
