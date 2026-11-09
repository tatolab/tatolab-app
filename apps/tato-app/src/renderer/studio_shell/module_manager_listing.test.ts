import { describe, expect, it } from "vitest";
import type { PackageCatalogReading, WorkspaceDependency } from "../../shared/tatolab_backend_contract";
import { marketplaceRowsOf, modulesOfTheProjectRowsOf, shortVersionOf } from "./module_manager_listing";

const DOWNLOAD = { url: "https://get.tatolab.com/modules/x.zip", sha256: "4f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f70" };

const CATALOG: PackageCatalogReading = {
  kind: "read",
  unreadable_entry_count: 0,
  entries: [
    { kind: "sample", name: "camera-halftone", title: "Camera halftone", summary: "A halftone camera.", version: "0.68.29", download: DOWNLOAD, nodes: [], streams: [{ name: "main", import_path: "camera_halftone.stream:main", summary: "" }], homepage_url: "https://x" },
    { kind: "package", name: "tatolab-camera", title: "Camera", summary: "Captures frames.", version: "0.68.29", download: DOWNLOAD, nodes: [{ name: "CameraSource", import_path: "tatolab.camera:CameraSource", summary: "" }], streams: [], homepage_url: null },
    { kind: "package", name: "tatolab-opus", title: "Opus", summary: "Encodes audio.", version: "0.68.29", download: null, nodes: [{ name: "OpusEncoder", import_path: "tatolab.opus:OpusEncoder", summary: "" }], streams: [], homepage_url: null },
  ],
};

function aModule(folder: string, name: string | null): WorkspaceDependency {
  return {
    project: `uuid-of-${folder}`,
    folder,
    source: `/shows/${folder}`,
    version: "9f2c4e1a7b3d5f60c8e2a4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5",
    folder_path: `/shows/night/imports/${folder}`,
    name,
    edited_files: [],
    newer_version_exists: null,
    check_refused_because: null,
  };
}

const MODULES = [aModule("tatolab-camera", "Tatolab_Camera"), aModule("lobby-wall", null)];

describe("what the module manager lists", () => {
  it("lists the project's modules in the runtime's order, by the name their project file gives or else their folder", () => {
    expect(modulesOfTheProjectRowsOf(MODULES, "").map((row) => [row.row_id, row.title])).toEqual([
      ["tatolab-camera", "Tatolab_Camera"],
      ["lobby-wall", "lobby-wall"],
    ]);
    expect(modulesOfTheProjectRowsOf(MODULES, "LOBBY").map((row) => row.title)).toEqual(["lobby-wall"]);
  });

  it("lists the Marketplace's projects in the catalog's order, marking each the project already has by its folder", () => {
    expect(marketplaceRowsOf(CATALOG, MODULES, "").map((row) => [row.row_id, row.folder_in_this_project])).toEqual([
      ["camera-halftone", null],
      ["tatolab-camera", "tatolab-camera"],
      ["tatolab-opus", null],
    ]);
  });

  it("narrows the Marketplace to a search by a node's or stream's name, and lists nothing from a catalog not read", () => {
    expect(marketplaceRowsOf(CATALOG, [], "opusencoder").map((row) => row.row_id)).toEqual(["tatolab-opus"]);
    expect(marketplaceRowsOf(CATALOG, [], "main").map((row) => row.row_id)).toEqual(["camera-halftone"]);
    expect(marketplaceRowsOf({ kind: "not_read", because: "HTTP 404" }, MODULES, "")).toEqual([]);
    expect(marketplaceRowsOf(null, MODULES, "")).toEqual([]);
  });

  it("shows a version by its first 12 characters", () => {
    expect(shortVersionOf("9f2c4e1a7b3d5f60c8e2a4b6")).toBe("9f2c4e1a7b3d");
  });
});
