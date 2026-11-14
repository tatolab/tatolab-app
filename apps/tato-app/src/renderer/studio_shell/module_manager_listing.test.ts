import { describe, expect, it } from "vitest";
import type { PackageCatalogReading, ViewOfAWorkspaceDependency, WorkspaceDependency } from "../../shared/tatolab_backend_contract";
import {
  everyModuleCardRowOf,
  marketplaceRowsShownOf,
  moduleCardContentsWordsOf,
  cardOffersAdd,
  moduleCardMarkOf,
  moduleCountsWordsOf,
  moduleContentsWordsOf,
  moduleCopyStateOf,
  moduleFolderNameOf,
  moduleRowAndItsNeighboursOf,
  workByIdWithTheRowsMade,
  workKeptForTheRow,
  moduleRowCountsOf,
  moduleSourceWordsOf,
  moduleViewsShownOf,
  projectModuleRowsShownOf,
  updatesCountWordsOf,
  workInProgressWordsOf,
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
      ["catalog:camera-halftone", "Camera halftone", "A halftone camera.", null],
      ["catalog:tatolab-camera", "Camera", "Captures frames.", "tatolab-camera"],
      ["catalog:tatolab-opus", "Opus", "Encodes audio.", null],
      ["import:lobby-wall", "lobby-wall", "", "lobby-wall"],
    ]);
  });

  it("shows the catalog's entries by kind in the Marketplace, the project's modules by filter in its tab, and counts each", () => {
    const edited = { ...aModule("lobby-wall", null), edited_files: ["nodes/x.py"] };
    const withAnUpdate = { ...aModule("tatolab-camera", "Tatolab_Camera"), newer_version_exists: true };
    const everyRow = everyModuleCardRowOf(CATALOG, [withAnUpdate, edited]);
    expect(idsOf(marketplaceRowsShownOf(everyRow, "all", ""))).toEqual(["catalog:camera-halftone", "catalog:tatolab-camera", "catalog:tatolab-opus"]);
    expect(idsOf(marketplaceRowsShownOf(everyRow, "package", ""))).toEqual(["catalog:tatolab-camera", "catalog:tatolab-opus"]);
    expect(idsOf(marketplaceRowsShownOf(everyRow, "sample", ""))).toEqual(["catalog:camera-halftone"]);
    expect(idsOf(projectModuleRowsShownOf(everyRow, "all", ""))).toEqual(["catalog:tatolab-camera", "import:lobby-wall"]);
    expect(idsOf(projectModuleRowsShownOf(everyRow, "updates", ""))).toEqual(["catalog:tatolab-camera"]);
    expect(idsOf(projectModuleRowsShownOf(everyRow, "edited", ""))).toEqual(["import:lobby-wall"]);
    expect(moduleRowCountsOf(everyRow)).toEqual({ marketplace: { all: 3, package: 2, sample: 1 }, project: { all: 2, updates: 1, edited: 1 } });
  });

  it("narrows to a search by a node's or stream's name, or a module's folder or source", () => {
    expect(idsOf(marketplaceRowsShownOf(everyModuleCardRowOf(CATALOG, []), "all", "opusencoder"))).toEqual(["catalog:tatolab-opus"]);
    expect(idsOf(marketplaceRowsShownOf(everyModuleCardRowOf(CATALOG, []), "all", "main"))).toEqual(["catalog:camera-halftone"]);
    expect(idsOf(projectModuleRowsShownOf(everyModuleCardRowOf(CATALOG, MODULES), "all", "LOBBY"))).toEqual(["import:lobby-wall"]);
  });

  it("gives each of the project's modules to one catalog entry only, the first that names its folder", () => {
    const entryNamingTheSameFolder = { ...CATALOG.entries[1], name: "tatolab_camera", title: "Camera (again)" };
    const catalogNamingAFolderTwice: PackageCatalogReading = { ...CATALOG, entries: [...CATALOG.entries, entryNamingTheSameFolder] };
    expect(idsOf(projectModuleRowsShownOf(everyModuleCardRowOf(catalogNamingAFolderTwice, MODULES), "all", ""))).toEqual(["catalog:tatolab-camera", "import:lobby-wall"]);
  });

  it("lists the project's modules alone from a catalog not read", () => {
    expect(projectModuleRowsShownOf(everyModuleCardRowOf({ kind: "not_read", because: "HTTP 404" }, MODULES), "all", "").map((row) => [row.row_id, row.title])).toEqual([
      ["import:tatolab-camera", "Tatolab_Camera"],
      ["import:lobby-wall", "lobby-wall"],
    ]);
    expect(marketplaceRowsShownOf(everyModuleCardRowOf(null, []), "all", "")).toEqual([]);
  });

  it("never gives a module of the project to a sample, which is cloned into a project of its own, and gives a module in a folder of the sample's name a row id of its own", () => {
    const downloadedFromTheSample = { ...aModule("camera-halftone", "Camera halftone"), source: "/home/jo/.config/Tato Studio/module-downloads/camera-halftone-0.68.29.zip" };
    const rows = everyModuleCardRowOf(CATALOG, [downloadedFromTheSample]);
    expect(rows.map((row) => [row.row_id, row.catalog_entry?.kind ?? null, row.module_of_the_project?.folder ?? null])).toEqual([
      ["catalog:camera-halftone", "sample", null],
      ["catalog:tatolab-camera", "package", null],
      ["catalog:tatolab-opus", "package", null],
      ["import:camera-halftone", null, "camera-halftone"],
    ]);
    expect(new Set(rows.map((row) => row.row_id)).size).toBe(rows.length);
  });

  it("finds a row among those shown with where it stands and the rows either side of it", () => {
    const rows = marketplaceRowsShownOf(everyModuleCardRowOf(CATALOG, []), "all", "");
    expect(moduleRowAndItsNeighboursOf(rows, "catalog:camera-halftone")).toMatchObject({ position: 1, previousRowId: null, nextRowId: "catalog:tatolab-camera" });
    expect(moduleRowAndItsNeighboursOf(rows, "catalog:tatolab-opus")).toMatchObject({ position: 3, previousRowId: "catalog:tatolab-camera", nextRowId: null });
    expect(moduleRowAndItsNeighboursOf(rows, "gone")).toBeNull();
  });

  it("keeps a module's work its own when the catalog is read after the project's modules, and a page open on it open", () => {
    const [cameraBeforeTheCatalog] = everyModuleCardRowOf(null, MODULES);
    const cameraOnceTheCatalogIsRead = everyModuleCardRowOf(CATALOG, MODULES).find((row) => row.row_id === "catalog:tatolab-camera");
    if (cameraBeforeTheCatalog === undefined || cameraOnceTheCatalogIsRead === undefined) return expect.unreachable("no camera row");
    expect(cameraBeforeTheCatalog.row_id).toBe("import:tatolab-camera");

    const workById = workByIdWithTheRowsMade({}, cameraBeforeTheCatalog, "remove", "refused");
    expect(workKeptForTheRow(workById, cameraOnceTheCatalogIsRead)).toBe("refused");
    expect(workKeptForTheRow(workByIdWithTheRowsMade({}, cameraOnceTheCatalogIsRead, "update", "under way"), cameraBeforeTheCatalog)).toBe("under way");
    expect(workByIdWithTheRowsMade<string>(workById, cameraOnceTheCatalogIsRead, "remove", null)).toEqual({});
    expect(moduleRowAndItsNeighboursOf(everyModuleCardRowOf(CATALOG, MODULES), "import:tatolab-camera")?.row.row_id).toBe("catalog:tatolab-camera");
  });

  it("keeps one work for a row at a time, and the work of a module in a folder of a sample's name apart from the sample's", () => {
    const rows = everyModuleCardRowOf(CATALOG, [aModule("camera-halftone", null), ...MODULES]);
    const sample = rows.find((row) => row.row_id === "catalog:camera-halftone");
    const moduleInAFolderOfItsName = rows.find((row) => row.row_id === "import:camera-halftone");
    const camera = rows.find((row) => row.row_id === "catalog:tatolab-camera");
    if (sample === undefined || moduleInAFolderOfItsName === undefined || camera === undefined) return expect.unreachable("a row is missing");

    const removing = workByIdWithTheRowsMade({}, moduleInAFolderOfItsName, "remove", "removing");
    expect(workKeptForTheRow(removing, sample)).toBeNull();
    expect(workKeptForTheRow(workByIdWithTheRowsMade(removing, sample, "clone", "cloning"), moduleInAFolderOfItsName)).toBe("removing");

    const addedThenUpdating = workByIdWithTheRowsMade(workByIdWithTheRowsMade({}, camera, "add", "just added"), camera, "update", "updating");
    expect(Object.values(addedThenUpdating)).toEqual(["updating"]);
    expect(workKeptForTheRow(workByIdWithTheRowsMade<string>(addedThenUpdating, camera, "update", null), camera)).toBeNull();
  });

  it("marks a card whose module has an update as news, any other the project has as in the project, one it has not with nothing, and any card by the ask last refused of it", () => {
    const rowOf = (dependency: WorkspaceDependency) => everyModuleCardRowOf(null, [dependency])[0];
    const camera = aModule("tatolab-camera", null);
    const cardNotInTheProject = everyModuleCardRowOf(CATALOG, [])[0];
    expect(moduleCardMarkOf(rowOf({ ...camera, newer_version_exists: true }), null, false)).toEqual({ words: "Update", tone: "news" });
    expect(moduleCardMarkOf(rowOf({ ...camera, edited_files: ["nodes/x.py"] }), null, false)).toEqual({ words: "In project", tone: "quiet" });
    expect(moduleCardMarkOf(cardNotInTheProject, null, false)).toBeNull();
    expect(moduleCardMarkOf(cardNotInTheProject, null, true)).toEqual({ words: "In project", tone: "quiet" });
    const [sampleCard, packageCard] = everyModuleCardRowOf(CATALOG, []);
    expect([cardOffersAdd(packageCard, false), cardOffersAdd(packageCard, true), cardOffersAdd(sampleCard, false), cardOffersAdd(rowOf(camera), false)]).toEqual([true, false, false, false]);
    expect(moduleCardMarkOf(cardNotInTheProject, "clone", false)).toEqual({ words: "Not cloned", tone: "refused" });
    expect(moduleCardMarkOf(rowOf({ ...camera, newer_version_exists: true }), "remove", false)).toEqual({ words: "Not removed", tone: "refused" });
  });

  it("says what a Marketplace card holds, a sample's behind the words Sample project", () => {
    expect(everyModuleCardRowOf(CATALOG, []).map(moduleCardContentsWordsOf)).toEqual(["Sample project · 1 stream", "1 node", "1 node"]);
    const sampleHoldingNothing: PackageCatalogReading = { ...CATALOG, entries: [{ ...CATALOG.entries[0], streams: [] }] };
    expect(everyModuleCardRowOf(sampleHoldingNothing, []).map(moduleCardContentsWordsOf)).toEqual(["Sample project"]);
  });

  it("says in the footer how many modules the project and the Marketplace hold, the updates found, and what is in progress", () => {
    const withAnUpdate = { ...aModule("tatolab-camera", "Tatolab_Camera"), newer_version_exists: true };
    expect(moduleCountsWordsOf("Night Show", moduleRowCountsOf(everyModuleCardRowOf(CATALOG, MODULES)))).toBe("2 in Night Show · 3 in the Marketplace");
    expect(moduleCountsWordsOf("Night Show", moduleRowCountsOf(everyModuleCardRowOf(CATALOG, [withAnUpdate])))).toBe("1 in Night Show · 3 in the Marketplace · 1 update");
    expect([updatesCountWordsOf(1), updatesCountWordsOf(2)]).toEqual(["1 update", "2 updates"]);
    expect(workInProgressWordsOf([])).toBe("Nothing in progress");
    expect(workInProgressWordsOf(["Adding Opus to Night Show…"])).toBe("Adding Opus to Night Show…");
    expect(workInProgressWordsOf(["Adding Opus to Night Show…", "Updating lobby-wall…"])).toBe("2 in progress: Adding Opus to Night Show… Updating lobby-wall…");
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
      ["catalog:camera-halftone", null],
      ["catalog:tatolab-camera", "camera"],
      ["catalog:tatolab-opus", null],
    ]);
  });

  it("gives a Marketplace download to the entry it was downloaded for before one its project's name matches", () => {
    const cameraNamedOpus = { ...aModule("tatolab-opus", "tatolab-opus"), source: "/home/jo/.config/Tato Studio/module-downloads/tatolab-camera-0.68.29.zip" };
    const rows = everyModuleCardRowOf(CATALOG, [cameraNamedOpus]);
    expect(rows.map((row) => [row.row_id, row.module_of_the_project?.folder ?? null])).toEqual([
      ["catalog:camera-halftone", null],
      ["catalog:tatolab-camera", "tatolab-opus"],
      ["catalog:tatolab-opus", null],
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
