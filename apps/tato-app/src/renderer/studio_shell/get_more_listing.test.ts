import { describe, expect, it } from "vitest";
import type { OpenProjectReading, PackageCatalogReading } from "../../shared/tatolab_backend_contract";
import { getMoreRowsOf, importChangeLinesOf } from "./get_more_listing";

const CATALOG: PackageCatalogReading = {
  kind: "read",
  unreadable_entry_count: 0,
  entries: [
    { kind: "package", name: "tatolab-camera", title: "Camera", summary: "Captures frames.", version: "0.68.29", requirement: "tatolab-camera>=0.68.29", nodes: [{ name: "CameraSource", import_path: "tatolab.camera:CameraSource", summary: "" }], streams: [], homepage_url: null },
    { kind: "package", name: "tatolab-opus", title: "Opus", summary: "Encodes audio.", version: "0.68.29", requirement: "tatolab-opus>=0.68.29", nodes: [{ name: "OpusEncoder", import_path: "tatolab.opus:OpusEncoder", summary: "" }], streams: [], homepage_url: null },
    { kind: "sample", name: "camera-halftone", title: "Camera halftone", summary: "A halftone camera.", version: "0.68.29", requirement: "camera-halftone @ git+https://x", nodes: [], streams: [{ name: "main", import_path: "camera_halftone.stream:main", summary: "" }], homepage_url: "https://x" },
  ],
};

const WORKSPACE: OpenProjectReading = {
  kind: "read",
  open_project: {
    project: { folder: "/shows/night", name: "night", requirements: ["Tatolab_Camera>=0.60", "lobby-wall"] },
    imports: [
      { name: "tatolab-camera", requirement: "Tatolab_Camera>=0.60", source: { kind: "package_index" } },
      { name: "lobby-wall", requirement: "lobby-wall", source: { kind: "folder", project: { folder: "/shows/lobby-wall", name: "lobby-wall", requirements: [] } } },
    ],
  },
};

describe("what Get more lists", () => {
  it("lists the catalog's packages under Published and its samples under Samples, marking what the workspace already imports", () => {
    expect(getMoreRowsOf("published", CATALOG, WORKSPACE, "").map((row) => [row.name, row.is_imported, row.requirement_to_import])).toEqual([
      ["tatolab-camera", true, null],
      ["tatolab-opus", false, "tatolab-opus>=0.68.29"],
    ]);
    expect(getMoreRowsOf("samples", CATALOG, WORKSPACE, "").map((row) => row.name)).toEqual(["camera-halftone"]);
  });

  it("lists the workspace's imports under In this workspace, with the catalog's words where it lists them, and a folder import opening to edit", () => {
    const rows = getMoreRowsOf("in_this_workspace", CATALOG, WORKSPACE, "");
    expect(rows.map((row) => [row.name, row.title, row.opens_to_edit])).toEqual([
      ["tatolab-camera", "Camera", false],
      ["lobby-wall", "lobby-wall", true],
    ]);
    expect(rows[1]?.summary).toBe("From /shows/lobby-wall");
    expect(getMoreRowsOf("in_this_workspace", { kind: "not_read", because: "offline" }, WORKSPACE, "").map((row) => row.title)).toEqual(["tatolab-camera", "lobby-wall"]);
  });

  it("narrows to a search over names, titles, summaries and the nodes and streams each brings", () => {
    expect(getMoreRowsOf("published", CATALOG, WORKSPACE, "encoder").map((row) => row.name)).toEqual(["tatolab-opus"]);
    expect(getMoreRowsOf("samples", CATALOG, WORKSPACE, "  MAIN ").map((row) => row.name)).toEqual(["camera-halftone"]);
    expect(getMoreRowsOf("published", CATALOG, WORKSPACE, "nothing like it")).toEqual([]);
  });
});

describe("an import's change to pyproject.toml", () => {
  it("shows the last entry taken out and put back with its comma, and the new requirement added", () => {
    const before = '[project]\ndependencies = [\n    "a",\n    "b"\n]\n';
    const after = '[project]\ndependencies = [\n    "a",\n    "b",\n    "c",\n]\n';
    expect(importChangeLinesOf(before, after)).toEqual([
      { text: "[project]", change: "kept" },
      { text: "dependencies = [", change: "kept" },
      { text: '    "a",', change: "kept" },
      { text: '    "b"', change: "removed" },
      { text: '    "b",', change: "added" },
      { text: '    "c",', change: "added" },
      { text: "]", change: "kept" },
      { text: "", change: "kept" },
    ]);
  });
});
