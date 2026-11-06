import { describe, expect, test } from "vitest";
import { packageCatalogReadingFromTheCatalogText, PACKAGE_CATALOG_URL, readThePackageCatalog } from "./package_catalog.js";
import { failedWith, succeeded } from "./result.js";

const CAMERA_ENTRY = {
  kind: "package",
  name: "tatolab-camera",
  title: "Camera",
  summary: "Captures from a camera on the machine.",
  version: "0.68.29",
  requirement: "tatolab-camera>=0.68.29",
  nodes: [{ name: "CameraSource", import_path: "tatolab.camera:CameraSource", summary: "Frames from one camera." }],
  streams: [],
  homepage_url: null,
};

describe("the package catalog", () => {
  test("reads version 1's entries, leaving out and counting each one it cannot read", () => {
    const catalogText = JSON.stringify({
      catalog_version: 1,
      entries: [CAMERA_ENTRY, { ...CAMERA_ENTRY, kind: "plugin" }, { ...CAMERA_ENTRY, requirement: 7 }, { ...CAMERA_ENTRY, name: "camera-halftone", kind: "sample", nodes: undefined, homepage_url: "https://tatolab.com" }],
    });
    expect(packageCatalogReadingFromTheCatalogText(catalogText)).toEqual({
      kind: "read",
      entries: [CAMERA_ENTRY, { ...CAMERA_ENTRY, name: "camera-halftone", kind: "sample", nodes: [], homepage_url: "https://tatolab.com" }],
      unreadable_entry_count: 2,
    });
  });

  test("refuses a catalog of another version, or one that is not JSON, in words", () => {
    expect(packageCatalogReadingFromTheCatalogText(JSON.stringify({ catalog_version: 2, entries: [] }))).toEqual({
      kind: "not_read",
      because: `The catalog at ${PACKAGE_CATALOG_URL} is version 2; this Tato Studio reads version 1. A newer Tato Studio may read it.`,
    });
    expect(packageCatalogReadingFromTheCatalogText("<html>")).toMatchObject({ kind: "not_read", because: expect.stringContaining("is not JSON") });
  });

  test("is fetched from get.tatolab.com, and a failed fetch is said in its own words", async () => {
    const urlsFetched: string[] = [];
    expect(
      await readThePackageCatalog(async (url) => {
        urlsFetched.push(url);
        return succeeded(JSON.stringify({ catalog_version: 1, entries: [CAMERA_ENTRY] }));
      }),
    ).toEqual({ kind: "read", entries: [CAMERA_ENTRY], unreadable_entry_count: 0 });
    expect(urlsFetched).toEqual(["https://get.tatolab.com/catalog/v1.json"]);
    expect(await readThePackageCatalog(async () => failedWith("HTTP 404 Not Found"))).toEqual({
      kind: "not_read",
      because: `The catalog at ${PACKAGE_CATALOG_URL} could not be fetched: HTTP 404 Not Found`,
    });
  });
});
