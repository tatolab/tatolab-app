import type { OpenProject } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { filesTreeOfTheProject, iconOfAFile, IMPORTS_HEADING_ROW_ID, projectFoldersTheTreeLists, type ProjectFilesListedForTheTree } from "./files_tree_of_the_project";

const GALLERY: OpenProject = {
  project: { folder: "/w/gallery", project: "0b6f3c1e-2d4a-4e8b-9c7d-5a1f8e3b6d20", name: "Gallery" },
  imports: [
    {
      project: "060206c3-f170-4008-b425-e6269e038d0d",
      name: "Doorway",
      folder: "doorway",
      source: { kind: "folder", project: { folder: "/w/gallery/imports/doorway", project: "060206c3-f170-4008-b425-e6269e038d0d", name: "Doorway" } },
    },
    { project: "dde5a62f-b0a8-45d2-a741-79140871f978", name: "lobby", folder: "lobby", source: { kind: "folder_unreadable", folder: "/w/gallery/imports/lobby", refusal: "gone" } },
  ],
  imports_not_listed_because: null,
};

const LISTED: ProjectFilesListedForTheTree[] = [
  {
    project_folder: "/w/gallery",
    listing: { kind: "listed", project_files: { project_folder: "/w/gallery", files: ["pyproject.toml", "nodes/glow.py", "streams/main.graph.json", "views/deck/logo.png", "nodes/blur.py", "Notes.md"] } },
  },
  { project_folder: "/w/gallery/imports/doorway", listing: { kind: "listed", project_files: { project_folder: "/w/gallery/imports/doorway", files: ["nodes/door.py"] } } },
];

function rowLines(rows: ReturnType<typeof filesTreeOfTheProject>): string[] {
  return rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label}${row.expansion === "collapsed" ? " +" : ""}${row.isReadOnly === true ? " (read only)" : ""}`);
}

test("the project's folders show closed before its files, sorted by name, then the imports with folders, read-only", () => {
  expect(rowLines(filesTreeOfTheProject(GALLERY, LISTED, {}))).toEqual([
    "Gallery",
    "  nodes +",
    "  streams +",
    "  views +",
    "  Notes.md",
    "  pyproject.toml",
    "Imports",
    "  Doorway (read only)",
    "    nodes +",
  ]);
});

test("an opened folder shows its folders and files, and each file row names the file absolute and whether Code opens it", () => {
  const rows = filesTreeOfTheProject(GALLERY, LISTED, { "folder:/w/gallery/nodes": true, "folder:/w/gallery/views": true, "folder:/w/gallery/views/deck": true });

  expect(rowLines(rows).slice(0, 9)).toEqual(["Gallery", "  nodes", "    blur.py", "    glow.py", "  streams +", "  views", "    deck", "      logo.png", "  Notes.md"]);
  expect(rows.find(({ row }) => row.label === "glow.py")?.meaning).toEqual({ kind: "file", file: "/w/gallery/nodes/glow.py", opens_in_code: true });
  expect(rows.find(({ row }) => row.label === "logo.png")?.meaning).toEqual({ kind: "file", file: "/w/gallery/views/deck/logo.png", opens_in_code: false });
});

test("an import's files are marked read-only", () => {
  const rows = filesTreeOfTheProject(GALLERY, LISTED, { "folder:/w/gallery/imports/doorway/nodes": true });

  expect(rows.find(({ row }) => row.label === "door.py")?.row.isReadOnly).toBe(true);
  expect(rows.find(({ row }) => row.label === "glow.py")).toBeUndefined();
});

test("a closed project heading or Imports heading hides what is under it", () => {
  expect(rowLines(filesTreeOfTheProject(GALLERY, LISTED, { "project:/w/gallery": false, [IMPORTS_HEADING_ROW_ID]: false }))).toEqual(["Gallery +", "Imports +"]);
});

test("a project still being listed says so, and one the runtime refused to list shows the runtime's words", () => {
  const rows = filesTreeOfTheProject(GALLERY, [{ project_folder: "/w/gallery", listing: { kind: "not_listed", because: "list_project_files failed: the runtime is stopping" } }], {});

  expect(rowLines(rows)).toEqual(["Gallery", "  list_project_files failed: the runtime is stopping", "Imports", "  Doorway (read only)", "    Listing the files…"]);
  expect(rows[1]?.row.tone).toBe("unreadable");
});

test("a project with no folder imports shows no Imports heading", () => {
  expect(rowLines(filesTreeOfTheProject({ ...GALLERY, imports: [] }, LISTED, {})).includes("Imports")).toBe(false);
  expect(projectFoldersTheTreeLists(GALLERY)).toEqual(["/w/gallery", "/w/gallery/imports/doorway"]);
});

test("a file's icon follows its kind", () => {
  expect(["glow.py", "frame.pyi", "main.graph.json", "pyproject.toml", "logo.PNG", "Notes.md"].map(iconOfAFile)).toEqual(["code_file", "code_file", "data_file", "data_file", "image_file", "file"]);
});

test("a project the runtime lists no file of says so", () => {
  const rows = filesTreeOfTheProject({ ...GALLERY, imports: [] }, [{ project_folder: "/w/gallery", listing: { kind: "listed", project_files: { project_folder: "/w/gallery", files: [] } } }], {});
  expect(rowLines(rows)).toEqual(["Gallery", "  No files"]);
});
