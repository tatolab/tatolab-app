import { describe, expect, it } from "vitest";
import type { PackageCatalogReading, WorkspaceDependency } from "../../shared/tatolab_backend_contract";
import { everyModuleCardRowOf, moduleCardCountsOf, moduleCardMarkOf, moduleCardRowPickedBy, moduleCardRowsShownOf, moduleFolderNameOf, shortVersionOf, type ModulesShown } from "./module_manager_listing";

function moduleCardRowsOf(catalog: PackageCatalogReading | null, dependencies: readonly WorkspaceDependency[], modulesShown: ModulesShown, searchText: string) {
  return moduleCardRowsShownOf(everyModuleCardRowOf(catalog, dependencies), modulesShown, searchText);
}

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

describe("what the Modules window lists", () => {
  it("lists the catalog's entries in its order, each saying whether the project has added it, then the project's modules the catalog does not list", () => {
    expect(moduleCardRowsOf(CATALOG, MODULES, "everything", "").map((row) => [row.row_id, row.title, row.module_of_the_project?.folder ?? null])).toEqual([
      ["camera-halftone", "Camera halftone", null],
      ["tatolab-camera", "Camera", "tatolab-camera"],
      ["tatolab-opus", "Opus", null],
      ["lobby-wall", "lobby-wall", "lobby-wall"],
    ]);
    expect(moduleCardRowsOf(CATALOG, MODULES, "everything", "").at(-1)?.summary).toBe("Copied from /shows/lobby-wall");
  });

  it("shows only the project's modules, or only the catalog's samples, and counts each choice", () => {
    expect(moduleCardRowsOf(CATALOG, MODULES, "added_to_this_project", "").map((row) => row.row_id)).toEqual(["tatolab-camera", "lobby-wall"]);
    expect(moduleCardRowsOf(CATALOG, MODULES, "sample_projects", "").map((row) => row.row_id)).toEqual(["camera-halftone"]);
    expect(moduleCardCountsOf(everyModuleCardRowOf(CATALOG, MODULES))).toEqual({ everything: 4, added_to_this_project: 2, sample_projects: 1 });
  });

  it("narrows to a search by a node's or stream's name, or a module's folder or source", () => {
    expect(moduleCardRowsOf(CATALOG, [], "everything", "opusencoder").map((row) => row.row_id)).toEqual(["tatolab-opus"]);
    expect(moduleCardRowsOf(CATALOG, [], "everything", "main").map((row) => row.row_id)).toEqual(["camera-halftone"]);
    expect(moduleCardRowsOf(CATALOG, MODULES, "everything", "LOBBY").map((row) => row.row_id)).toEqual(["lobby-wall"]);
  });

  it("gives each of the project's modules to one catalog entry only, the first that names its folder", () => {
    const entryNamingTheSameFolder = { ...CATALOG.entries[1], name: "tatolab_camera", title: "Camera (again)" };
    const catalogNamingAFolderTwice: PackageCatalogReading = { ...CATALOG, entries: [...CATALOG.entries, entryNamingTheSameFolder] };
    expect(moduleCardRowsOf(catalogNamingAFolderTwice, MODULES, "added_to_this_project", "").map((row) => row.row_id)).toEqual(["tatolab-camera", "lobby-wall"]);
  });

  it("does not match a module the catalog does not list by the words of its summary", () => {
    expect(moduleCardRowsOf(CATALOG, MODULES, "everything", "copied")).toEqual([]);
  });

  it("lists the project's modules alone from a catalog not read", () => {
    expect(moduleCardRowsOf({ kind: "not_read", because: "HTTP 404" }, MODULES, "everything", "").map((row) => [row.row_id, row.title])).toEqual([
      ["tatolab-camera", "Tatolab_Camera"],
      ["lobby-wall", "lobby-wall"],
    ]);
    expect(moduleCardRowsOf(null, [], "everything", "")).toEqual([]);
  });

  it("picks a card by its own id before another card's module folder of the same name", () => {
    const rows = everyModuleCardRowOf(CATALOG, [aModule("camera-halftone-copy", "tatolab-camera"), aModule("tatolab-opus-2", null)]);
    expect(moduleCardRowPickedBy(rows, "tatolab-camera")?.row_id).toBe("tatolab-camera");
    expect(moduleCardRowPickedBy(rows, "camera-halftone-copy")?.row_id).toBe("tatolab-camera");
    expect(moduleCardRowPickedBy(rows, "gone")).toBeNull();
  });

  it("marks a card with a newer version as news, one with edited files as edited, and any other added one as added", () => {
    const rowOf = (dependency: WorkspaceDependency) => everyModuleCardRowOf(null, [dependency])[0];
    const camera = aModule("tatolab-camera", null);
    expect(moduleCardMarkOf(rowOf({ ...camera, newer_version_exists: true }))).toEqual({ words: "Newer version", isNews: true });
    expect(moduleCardMarkOf(rowOf({ ...camera, edited_files: ["nodes/x.py"] }))).toEqual({ words: "Added · edited", isNews: false });
    expect(moduleCardMarkOf(rowOf(camera))).toEqual({ words: "Added", isNews: false });
    expect(moduleCardMarkOf(everyModuleCardRowOf(CATALOG, [])[0])).toBeNull();
  });

  it("names a module's folder as the runtime does", () => {
    expect(moduleFolderNameOf("Camera Tools!")).toBe("camera-tools");
  });

  it("shows a version by its first 12 characters", () => {
    expect(shortVersionOf("9f2c4e1a7b3d5f60c8e2a4b6")).toBe("9f2c4e1a7b3d");
  });
});
