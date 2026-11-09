import { describe, expect, it } from "vitest";
import { mockProjectNodeTypeListing } from "../../backend/mock_project_node_types";
import { paletteTreeOfTheListing } from "./palette_tree_of_the_listing";

const STREAMS_FOLDER = "/home/jonathanf/streams";

function patternListing(isEveryOwnModuleUnreadable = false) {
  const listing = mockProjectNodeTypeListing(`${STREAMS_FOLDER}/pattern`, STREAMS_FOLDER, isEveryOwnModuleUnreadable);
  if (listing === null) return expect.unreachable("the mock lists the pattern project");
  return listing;
}

describe("the palette's tree", () => {
  it("lists each source by its title, the project first, each node type under its category and the generators after", () => {
    const rows = paletteTreeOfTheListing(patternListing(), {});
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label} ${row.expansion}`)).toEqual([
      "pattern expanded",
      "  Effects expanded",
      "    caption_overlay leaf",
      "    InvertingEffect leaf",
      "  nodes.brightness_meter expanded",
      "    BrightnessMeter leaf",
      "  Graph generators expanded",
      "    two_cameras_side_by_side leaf",
      "  nodes/half_written.py:12:5: SyntaxError: expected ':' leaf",
      "6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11 at v1 expanded",
      "  Lighting expanded",
      "    Gripper leaf",
      "camera 0.1.0 collapsed",
      "lobby-recorder 0.4.1 collapsed",
      "tatolab-testpattern 0.3.2 collapsed",
    ]);
  });

  it("opens the project's own declarations in its folder, and nothing for a source not the project's", () => {
    const rows = paletteTreeOfTheListing(patternListing(), { "source:distribution:camera": true });
    const fileOfRow = (label: string) => {
      const meaning = rows.find(({ row }) => row.label === label)?.meaning;
      return meaning === undefined || meaning.kind === "nothing_to_select" ? undefined : meaning.file;
    };
    expect(fileOfRow("InvertingEffect")).toBe(`${STREAMS_FOLDER}/pattern/nodes/inverting_effect.py`);
    expect(fileOfRow("two_cameras_side_by_side")).toBe(`${STREAMS_FOLDER}/pattern/nodes/scenes.py`);
    expect(fileOfRow("nodes/half_written.py:12:5: SyntaxError: expected ':'")).toBe(`${STREAMS_FOLDER}/pattern/nodes/half_written.py`);
    expect(fileOfRow("Gripper")).toBeNull();
    expect(fileOfRow("CameraTilt")).toBeNull();
  });

  it("shows each module that does not parse in the parser's words, for that module only", () => {
    const rows = paletteTreeOfTheListing(patternListing(true), {});
    expect(rows.slice(0, 3).map(({ row }) => [row.label, row.tone ?? "plain"])).toEqual([
      ["pattern", "plain"],
      ["nodes/half_written.py:12:5: SyntaxError: expected ':'", "unreadable"],
      ["nodes/inverting_effect.py:3:1: SyntaxError: unterminated triple-quoted string literal (detected at line 23)", "unreadable"],
    ]);
    expect(rows[3]?.row.label).toBe("6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11 at v1");
  });

  it("says a source declares no node types, and keeps a row the person closed closed", () => {
    const listing = { ...patternListing(), sources: [{ origin: { source: "project" as const }, node_types: [], graph_generators: [], unreadable_modules: [] }] };
    expect(paletteTreeOfTheListing(listing, {}).map(({ row }) => row.label)).toEqual(["pattern", "Declares no node types"]);
    expect(paletteTreeOfTheListing(listing, { "source:project": false }).map(({ row }) => row.label)).toEqual(["pattern"]);
  });
});
