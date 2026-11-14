import { describe, expect, test } from "vitest";
import { packageCatalogReadingFromTheCatalogText, PACKAGE_CATALOG_URL, readThePackageCatalog } from "./package_catalog.js";
import { failedWith, succeeded } from "./result.js";

const CAMERA_ENTRY_ON_THE_WIRE = {
  kind: "package",
  name: "tatolab-camera",
  title: "Camera",
  summary: "Captures from a camera on the machine.",
  version: "0.68.29",
  download_url: "https://get.tatolab.com/modules/tatolab-camera-0.68.29.zip",
  download_sha256: "4f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f70",
  nodes: [{ name: "CameraSource", import_path: "tatolab.camera:CameraSource", summary: "Frames from one camera." }],
  streams: [],
  homepage_url: null,
};

const { download_url: CAMERA_DOWNLOAD_URL, download_sha256: CAMERA_DOWNLOAD_SHA256, ...CAMERA_ENTRY_WITHOUT_ITS_DOWNLOAD } = CAMERA_ENTRY_ON_THE_WIRE;
const CAMERA_ENTRY = { ...CAMERA_ENTRY_WITHOUT_ITS_DOWNLOAD, download: { url: CAMERA_DOWNLOAD_URL, sha256: CAMERA_DOWNLOAD_SHA256 }, platforms: null, runs_on_this_machine: true };

const A_MAC_ON_APPLE_SILICON = { sys_platform: "darwin", platform_machine: "arm64" };

describe("the package catalog", () => {
  test("reads version 1's entries and the zip each downloads as, leaving out and counting each one it cannot read", () => {
    const catalogText = JSON.stringify({
      catalog_version: 1,
      entries: [
        CAMERA_ENTRY_ON_THE_WIRE,
        { ...CAMERA_ENTRY_ON_THE_WIRE, kind: "plugin" },
        { ...CAMERA_ENTRY_ON_THE_WIRE, download_sha256: undefined },
        { ...CAMERA_ENTRY_ON_THE_WIRE, download_url: "http://get.tatolab.com/modules/tatolab-camera-0.68.29.zip" },
        { ...CAMERA_ENTRY_WITHOUT_ITS_DOWNLOAD, name: "camera-halftone", kind: "sample", nodes: undefined, homepage_url: "https://tatolab.com" },
      ],
    });
    expect(packageCatalogReadingFromTheCatalogText(catalogText, A_MAC_ON_APPLE_SILICON)).toEqual({
      kind: "read",
      entries: [CAMERA_ENTRY, { ...CAMERA_ENTRY_WITHOUT_ITS_DOWNLOAD, download: null, name: "camera-halftone", kind: "sample", nodes: [], homepage_url: "https://tatolab.com", platforms: null, runs_on_this_machine: true }],
      unreadable_entry_count: 3,
    });
  });

  test("reads the machines each entry's wheels install on, and whether this machine is one of them; an entry naming none installs anywhere", () => {
    const linuxX8664 = { sys_platform: "linux", platform_machine: "x86_64" };
    const catalogText = JSON.stringify({
      catalog_version: 1,
      entries: [
        { ...CAMERA_ENTRY_ON_THE_WIRE, platforms: [A_MAC_ON_APPLE_SILICON, linuxX8664] },
        { ...CAMERA_ENTRY_ON_THE_WIRE, name: "tatolab-browser", platforms: [linuxX8664] },
        { ...CAMERA_ENTRY_ON_THE_WIRE, name: "tatolab-misnamed", platforms: [{ sys_platform: "linux" }] },
      ],
    });
    expect(packageCatalogReadingFromTheCatalogText(catalogText, A_MAC_ON_APPLE_SILICON)).toEqual({
      kind: "read",
      entries: [
        { ...CAMERA_ENTRY, platforms: [A_MAC_ON_APPLE_SILICON, linuxX8664], runs_on_this_machine: true },
        { ...CAMERA_ENTRY, name: "tatolab-browser", platforms: [linuxX8664], runs_on_this_machine: false },
      ],
      unreadable_entry_count: 1,
    });
    const readOnLinux = packageCatalogReadingFromTheCatalogText(catalogText, linuxX8664);
    expect(readOnLinux.kind === "read" && readOnLinux.entries.map((entry) => entry.runs_on_this_machine)).toEqual([true, true]);
  });

  test("refuses a catalog of another version, or one that is not JSON, in words", () => {
    expect(packageCatalogReadingFromTheCatalogText(JSON.stringify({ catalog_version: 2, entries: [] }), A_MAC_ON_APPLE_SILICON)).toEqual({
      kind: "not_read",
      because: `The catalog at ${PACKAGE_CATALOG_URL} is version 2; this Tato Studio reads version 1. A newer Tato Studio may read it.`,
    });
    expect(packageCatalogReadingFromTheCatalogText("<html>", A_MAC_ON_APPLE_SILICON)).toMatchObject({ kind: "not_read", because: expect.stringContaining("is not JSON") });
  });

  test("is fetched from get.tatolab.com, and a failed fetch is said in its own words", async () => {
    const urlsFetched: string[] = [];
    expect(
      await readThePackageCatalog(async (url) => {
        urlsFetched.push(url);
        return succeeded(JSON.stringify({ catalog_version: 1, entries: [CAMERA_ENTRY_ON_THE_WIRE] }));
      }, A_MAC_ON_APPLE_SILICON),
    ).toEqual({ kind: "read", entries: [CAMERA_ENTRY], unreadable_entry_count: 0 });
    expect(urlsFetched).toEqual(["https://get.tatolab.com/catalog/v1.json"]);
    expect(await readThePackageCatalog(async () => failedWith("HTTP 404 Not Found"), A_MAC_ON_APPLE_SILICON)).toEqual({
      kind: "not_read",
      because: `The catalog at ${PACKAGE_CATALOG_URL} could not be fetched: HTTP 404 Not Found`,
    });
  });
});
