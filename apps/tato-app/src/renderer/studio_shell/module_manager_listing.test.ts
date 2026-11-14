import { describe, expect, it } from "vitest";
import type { PackageCatalogReading, ViewOfAWorkspaceDependency, WorkspaceDependency } from "../../shared/tatolab_backend_contract";
import {
  everyModuleCardRowOf,
  marketplaceRowsShownOf,
  moduleCardMarkOf,
  moduleContentsWordsOf,
  moduleCopyStateOf,
  moduleFolderNameOf,
  moduleRowAndItsNeighboursOf,
  moduleRowCountsOf,
  moduleSourceWordsOf,
  moduleViewsShownOf,
  projectModuleRowsShownOf,
} from "./module_manager_listing";

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
    views: { kind: "listed", views: [] },
  };
}

const MODULES = [aModule("tatolab-camera", "Tatolab_Camera"), aModule("lobby-wall", null)];

describe("what the Marketplace window lists", () => {
  const idsOf = (rows: readonly { row_id: string }[]) => rows.map((row) => row.row_id);

  it("lists the catalog's entries in its order, each package saying whether the project has it, then the project's modules the catalog does not list", () => {
    expect(everyModuleCardRowOf(CATALOG, MODULES).map((row) => [row.row_id, row.title, row.summary, row.module_of_the_project?.folder ?? null])).toEqual([
      ["camera-halftone", "Camera halftone", "A halftone camera.", null],
      ["tatolab-camera", "Camera", "Captures frames.", "tatolab-camera"],
      ["tatolab-opus", "Opus", "Encodes audio.", null],
      ["lobby-wall", "lobby-wall", "", "lobby-wall"],
    ]);
  });

  it("shows the catalog's entries by kind in the Marketplace, the project's modules by filter in its tab, and counts each", () => {
    const edited = { ...aModule("lobby-wall", null), edited_files: ["nodes/x.py"] };
    const withAnUpdate = { ...aModule("tatolab-camera", "Tatolab_Camera"), newer_version_exists: true };
    const everyRow = everyModuleCardRowOf(CATALOG, [withAnUpdate, edited]);
    expect(idsOf(marketplaceRowsShownOf(everyRow, "all", ""))).toEqual(["camera-halftone", "tatolab-camera", "tatolab-opus"]);
    expect(idsOf(marketplaceRowsShownOf(everyRow, "package", ""))).toEqual(["tatolab-camera", "tatolab-opus"]);
    expect(idsOf(marketplaceRowsShownOf(everyRow, "sample", ""))).toEqual(["camera-halftone"]);
    expect(idsOf(projectModuleRowsShownOf(everyRow, "all", ""))).toEqual(["tatolab-camera", "lobby-wall"]);
    expect(idsOf(projectModuleRowsShownOf(everyRow, "updates", ""))).toEqual(["tatolab-camera"]);
    expect(idsOf(projectModuleRowsShownOf(everyRow, "edited", ""))).toEqual(["lobby-wall"]);
    expect(moduleRowCountsOf(everyRow)).toEqual({ marketplace: { all: 3, package: 2, sample: 1 }, project: { all: 2, updates: 1, edited: 1 } });
  });

  it("narrows to a search by a node's or stream's name, or a module's folder or source", () => {
    expect(idsOf(marketplaceRowsShownOf(everyModuleCardRowOf(CATALOG, []), "all", "opusencoder"))).toEqual(["tatolab-opus"]);
    expect(idsOf(marketplaceRowsShownOf(everyModuleCardRowOf(CATALOG, []), "all", "main"))).toEqual(["camera-halftone"]);
    expect(idsOf(projectModuleRowsShownOf(everyModuleCardRowOf(CATALOG, MODULES), "all", "LOBBY"))).toEqual(["lobby-wall"]);
  });

  it("gives each of the project's modules to one catalog entry only, the first that names its folder", () => {
    const entryNamingTheSameFolder = { ...CATALOG.entries[1], name: "tatolab_camera", title: "Camera (again)" };
    const catalogNamingAFolderTwice: PackageCatalogReading = { ...CATALOG, entries: [...CATALOG.entries, entryNamingTheSameFolder] };
    expect(idsOf(projectModuleRowsShownOf(everyModuleCardRowOf(catalogNamingAFolderTwice, MODULES), "all", ""))).toEqual(["tatolab-camera", "lobby-wall"]);
  });

  it("lists the project's modules alone from a catalog not read", () => {
    expect(projectModuleRowsShownOf(everyModuleCardRowOf({ kind: "not_read", because: "HTTP 404" }, MODULES), "all", "").map((row) => [row.row_id, row.title])).toEqual([
      ["tatolab-camera", "Tatolab_Camera"],
      ["lobby-wall", "lobby-wall"],
    ]);
    expect(marketplaceRowsShownOf(everyModuleCardRowOf(null, []), "all", "")).toEqual([]);
  });

  it("never gives a module of the project to a sample, which is cloned into a project of its own", () => {
    const downloadedFromTheSample = { ...aModule("camera-halftone", "Camera halftone"), source: "/home/jo/.config/Tato Studio/module-downloads/camera-halftone-0.68.29.zip" };
    const rows = everyModuleCardRowOf(CATALOG, [downloadedFromTheSample]);
    expect(rows.map((row) => [row.row_id, row.catalog_entry?.kind ?? null, row.module_of_the_project?.folder ?? null])).toEqual([
      ["camera-halftone", "sample", null],
      ["tatolab-camera", "package", null],
      ["tatolab-opus", "package", null],
      ["camera-halftone", null, "camera-halftone"],
    ]);
  });

  it("finds a row among those shown with where it stands and the rows either side of it", () => {
    const rows = marketplaceRowsShownOf(everyModuleCardRowOf(CATALOG, []), "all", "");
    expect(moduleRowAndItsNeighboursOf(rows, "camera-halftone")).toMatchObject({ position: 1, previousRowId: null, nextRowId: "tatolab-camera" });
    expect(moduleRowAndItsNeighboursOf(rows, "tatolab-opus")).toMatchObject({ position: 3, previousRowId: "tatolab-camera", nextRowId: null });
    expect(moduleRowAndItsNeighboursOf(rows, "gone")).toBeNull();
  });

  it("marks a card whose module has an update as news, any other the project has as in the project, and one it has not with nothing", () => {
    const rowOf = (dependency: WorkspaceDependency) => everyModuleCardRowOf(null, [dependency])[0];
    const camera = aModule("tatolab-camera", null);
    expect(moduleCardMarkOf(rowOf({ ...camera, newer_version_exists: true }))).toEqual({ words: "Update", isNews: true });
    expect(moduleCardMarkOf(rowOf({ ...camera, edited_files: ["nodes/x.py"] }))).toEqual({ words: "In project", isNews: false });
    expect(moduleCardMarkOf(everyModuleCardRowOf(CATALOG, [])[0])).toBeNull();
  });

  it("says what a row holds in words, counting its views once the project has it", () => {
    const view: ViewOfAWorkspaceDependency = { view_type_id: "camera:preview", manifest_json: null, opens: true, not_opened_because: null };
    const camera = { ...aModule("tatolab-camera", null), views: { kind: "listed" as const, views: [view] } };
    const rows = everyModuleCardRowOf(CATALOG, [camera, aModule("lobby-wall", null)]);
    expect(rows.map(moduleContentsWordsOf)).toEqual(["1 stream", "1 node · 1 view", "1 node", ""]);
  });

  it("says where a module was copied from, and how its copy stands against it", () => {
    const fromTheMarketplace = { ...aModule("camera", "Camera"), source: "/home/jo/.config/Tato Studio/module-downloads/tatolab-camera-0.68.85.zip" };
    const fromAZip = { ...aModule("doorways", null), source: "/shows/Doorways.ZIP" };
    const rows = everyModuleCardRowOf(CATALOG, [fromTheMarketplace, fromAZip, aModule("lobby-wall", null)]);
    expect(rows.map(moduleSourceWordsOf)).toEqual(["", "From the Marketplace", "", "From a .zip", "From a folder"]);
    const camera = aModule("tatolab-camera", null);
    expect(moduleCopyStateOf(camera)).toEqual({ kind: "not_checked" });
    expect(moduleCopyStateOf({ ...camera, newer_version_exists: false })).toEqual({ kind: "up_to_date" });
    expect(moduleCopyStateOf({ ...camera, newer_version_exists: true })).toEqual({ kind: "update_available" });
    expect(moduleCopyStateOf({ ...camera, check_refused_because: "No such file or directory (os error 2)" })).toEqual({ kind: "check_refused", because: "No such file or directory (os error 2)" });
  });

  it("names a module's folder as the runtime does", () => {
    expect(moduleFolderNameOf("Camera Tools!")).toBe("camera-tools");
    expect(moduleFolderNameOf("Tatolab_Camera")).toBe("tatolab_camera");
    expect(moduleFolderNameOf("a - b")).toBe("a--b");
    expect(moduleFolderNameOf(" !! ")).toBe("module");
  });

  it("gives a Marketplace download to its catalog entry, though its project names itself by its title", () => {
    const camera = { ...aModule("camera", "Camera"), source: "/home/jo/.config/Tato Studio/module-downloads/tatolab-camera-0.68.85.zip" };
    const rows = everyModuleCardRowOf(CATALOG, [camera]);
    expect(rows.map((row) => [row.row_id, row.module_of_the_project?.folder ?? null])).toEqual([
      ["camera-halftone", null],
      ["tatolab-camera", "camera"],
      ["tatolab-opus", null],
    ]);
  });

  it("gives a Marketplace download to the entry it was downloaded for before one its project's name matches", () => {
    const cameraNamedOpus = { ...aModule("tatolab-opus", "tatolab-opus"), source: "/home/jo/.config/Tato Studio/module-downloads/tatolab-camera-0.68.29.zip" };
    const rows = everyModuleCardRowOf(CATALOG, [cameraNamedOpus]);
    expect(rows.map((row) => [row.row_id, row.module_of_the_project?.folder ?? null])).toEqual([
      ["camera-halftone", null],
      ["tatolab-camera", "tatolab-opus"],
      ["tatolab-opus", null],
    ]);
  });
});

describe("what a module's details say of the views it adds", () => {
  const wallCamera: ViewOfAWorkspaceDependency = {
    view_type_id: "lobby-wall:wall_camera",
    manifest_json: { contract: "1.0", title: "Wall camera", entry: "index.html", placement: "node", inputs: [{ name: "video", family: "image" }], outputs: [{ name: "pan", family: "array" }, { name: "tilt", family: "array" }], capabilities: ["camera"] },
    opens: true,
    not_opened_because: null,
  };
  const cueList: ViewOfAWorkspaceDependency = { view_type_id: "lobby-wall:cue_list", manifest_json: { contract: "1.0", title: "Cue list", entry: "index.html", placement: "area", capabilities: ["microphone", "read.selection"] }, opens: true, not_opened_because: null };
  const stageRig: ViewOfAWorkspaceDependency = { view_type_id: "lobby-wall:stage_rig", manifest_json: { contract: "2.0", title: "Stage rig", entry: "index.html", placement: "area" }, opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0." };

  it("names each view by its manifest's title with its ports, says why one doesn't open, and names the devices those that open declare", () => {
    expect(moduleViewsShownOf({ kind: "listed", views: [wallCamera, cueList, stageRig, { view_type_id: "lobby-wall:half_built", manifest_json: null, opens: true, not_opened_because: null }] })).toEqual({
      kind: "listed",
      rows: [
        { view_type_id: "lobby-wall:wall_camera", title: "Wall camera", opens: true, ports_words: "1 in · 2 out" },
        { view_type_id: "lobby-wall:cue_list", title: "Cue list", opens: true, ports_words: "Opens in any area" },
        { view_type_id: "lobby-wall:stage_rig", title: "Stage rig", opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0." },
        { view_type_id: "lobby-wall:half_built", title: "lobby-wall:half_built", opens: false, not_opened_because: expect.any(String) },
      ],
      reach_words: "Full access, like its nodes. They ask for the camera and the microphone.",
    });
  });

  it("says what its views reach only when one opens, naming no device none of them declares", () => {
    expect(moduleViewsShownOf({ kind: "listed", views: [wallCamera] })).toMatchObject({ reach_words: "Full access, like its nodes. They ask for the camera." });
    expect(moduleViewsShownOf({ kind: "listed", views: [{ ...cueList, manifest_json: { contract: "1.0", title: "Cue list", entry: "index.html", placement: "area" } }] })).toMatchObject({ reach_words: "Full access, like its nodes." });
    expect(moduleViewsShownOf({ kind: "listed", views: [stageRig] })).toMatchObject({ reach_words: null });
  });

  it("passes on the runtime's refusal to list them in its words", () => {
    expect(moduleViewsShownOf({ kind: "not_listed", because: "list_project_views failed: the runtime is stopping" })).toEqual({ kind: "not_listed", because: "list_project_views failed: the runtime is stopping" });
  });
});
