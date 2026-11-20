import { describe, expect, it } from "vitest";
import { libraryTreeOfTheListing } from "./library_tree_of_the_listing";
import type { NodeModuleNotReadable, NodeTypeDescribedOrWhyNot, NodeTypeListed, NodeTypeSourceListed, ProjectNodeTypesDescribed } from "@tatolab/tato-app-view-sdk/studio_readings";

const STREAMS_FOLDER = "/home/jonathanf/streams";

const listed = (nodeType: string, category: string | null): NodeTypeListed => ({ node_type: nodeType, documentation: "", category, kind: "process", described_from: "source" });

/** `nodeType` described as declared at `path`, with no ports. */
const describedAt = (nodeType: string, path: string | null): NodeTypeDescribedOrWhyNot => ({
  node_type: nodeType,
  described_from: "source",
  documentation: "",
  declared_at: path === null ? null : { path, line: 1 },
  inputs: [],
  outputs: [],
  source: "project",
});

const HALF_WRITTEN: NodeModuleNotReadable = { module: "nodes.half_written", path: "nodes/half_written.py", line: 12, column: 5, why: "SyntaxError: expected ':'" };

function patternProjectSource(isEveryModuleUnreadable: boolean): NodeTypeSourceListed {
  if (isEveryModuleUnreadable) {
    return {
      source: "project",
      node_types: [],
      graph_generators: [],
      unreadable_modules: [HALF_WRITTEN, { module: "nodes.stage_shaders", path: "nodes/stage_shaders.py", line: 3, column: 1, why: "SyntaxError: unterminated triple-quoted string literal (detected at line 23)" }],
    };
  }
  return {
    source: "project",
    node_types: [listed("nodes.stage_shaders:Kaleidoscope", "Effects"), listed("nodes.brightness_meter:BrightnessMeter", "nodes.brightness_meter"), listed("nodes.captions:caption_overlay", "Effects")],
    graph_generators: [
      {
        generator: "nodes.scenes:two_cameras_side_by_side",
        description: "Two cameras composed side by side, each with its own label.",
        promoted_settings: [
          { name: "left_camera", annotation: "str" },
          { name: "right_camera", annotation: "str" },
        ],
        path: "nodes/scenes.py",
        line: 8,
      },
    ],
    unreadable_modules: [HALF_WRITTEN],
  };
}

const LIGHTING_RIG_DEPENDENCY: NodeTypeSourceListed = {
  source: "dependency",
  project: "6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11",
  folder: "hall-of-light",
  version: "0.1.0",
  project_name: "Hall of Light",
  node_types: [listed("nodes.gripper:Gripper", "Lighting")],
  graph_generators: [],
  unreadable_modules: [],
};

const installedDistribution = (distribution: string, distributionVersion: string, nodeTypes: NodeTypeListed[]): NodeTypeSourceListed => ({
  source: "installed_distribution",
  distribution,
  distribution_version: distributionVersion,
  node_types: nodeTypes,
  graph_generators: [],
  unreadable_modules: [],
});

/** The pattern project's node types: its own modules, one not parsing, a pinned dependency, three installed distributions and the runtime's own, each described as declared in its module. */
function patternNodeTypes(isEveryOwnModuleUnreadable = false): ProjectNodeTypesDescribed {
  const sources: NodeTypeSourceListed[] = [
    patternProjectSource(isEveryOwnModuleUnreadable),
    LIGHTING_RIG_DEPENDENCY,
    installedDistribution("camera", "0.1.0", [listed("camera.nodes:CameraTilt", "Camera")]),
    installedDistribution("lobby-recorder", "0.4.1", [listed("lobby_recorder.recording:LobbyRecorder", "Recording")]),
    installedDistribution("tatolab-testpattern", "0.3.2", [listed("tatolab.testpattern:TestPatternSource", "tatolab.testpattern")]),
    { source: "built_in", node_types: [listed("tatolab.stream:ChannelsToRecords", null)], graph_generators: [], unreadable_modules: [] },
  ];
  return {
    listing: { project_directory: `${STREAMS_FOLDER}/pattern`, project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90", project_name: "pattern", sources },
    described: [
      describedAt("nodes.stage_shaders:Kaleidoscope", "nodes/stage_shaders.py"),
      describedAt("nodes.gripper:Gripper", "nodes/gripper.py"),
      describedAt("camera.nodes:CameraTilt", "camera/nodes.py"),
    ],
  };
}

describe("the Library's tree", () => {
  it("lists each source by its title, the project first, each node type under its category and each module that does not parse, and leaves the runtime's own node types out", () => {
    const rows = libraryTreeOfTheListing(patternNodeTypes(), {}, "node_types");
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label} ${row.expansion}`)).toEqual([
      "This project expanded",
      "  Effects expanded",
      "    caption_overlay leaf",
      "    Kaleidoscope leaf",
      "  nodes.brightness_meter expanded",
      "    BrightnessMeter leaf",
      "  nodes/half_written.py:12:5: SyntaxError: expected ':' leaf",
      "imports/hall-of-light expanded",
      "  Lighting expanded",
      "    Gripper leaf",
      "camera 0.1.0 collapsed",
      "lobby-recorder 0.4.1 collapsed",
      "tatolab-testpattern 0.3.2 collapsed",
    ]);
  });

  it("opens the project's own declarations in its folder where its description says they are, and nothing for a source not the project's", () => {
    const rows = libraryTreeOfTheListing(patternNodeTypes(), { "source:distribution:camera": true }, "node_types");
    const meaningOfRow = (label: string) => rows.find(({ row }) => row.label === label)?.meaning;
    const fileOfRow = (label: string) => {
      const meaning = meaningOfRow(label);
      return meaning === undefined || meaning.kind === "nothing_to_select" ? undefined : meaning.file;
    };
    expect(fileOfRow("Kaleidoscope")).toBe(`${STREAMS_FOLDER}/pattern/nodes/stage_shaders.py`);
    expect(fileOfRow("BrightnessMeter")).toBeNull();
    expect(fileOfRow("nodes/half_written.py:12:5: SyntaxError: expected ':'")).toBe(`${STREAMS_FOLDER}/pattern/nodes/half_written.py`);
    expect(fileOfRow("Gripper")).toBeNull();
    expect(fileOfRow("CameraTilt")).toBeNull();
    const kaleidoscope = meaningOfRow("Kaleidoscope");
    expect(kaleidoscope?.kind === "node_type_declaration" ? kaleidoscope.described?.node_type : null).toBe("nodes.stage_shaders:Kaleidoscope");
  });

  it("shows each module that does not parse in the parser's words, for that module only", () => {
    const rows = libraryTreeOfTheListing(patternNodeTypes(true), {}, "node_types");
    expect(rows.slice(0, 3).map(({ row }) => [row.label, row.tone ?? "plain"])).toEqual([
      ["This project", "plain"],
      ["nodes/half_written.py:12:5: SyntaxError: expected ':'", "unreadable"],
      ["nodes/stage_shaders.py:3:1: SyntaxError: unterminated triple-quoted string literal (detected at line 23)", "unreadable"],
    ]);
    expect(rows[3]?.row.label).toBe("imports/hall-of-light");
  });

  it("says a source declares no node types, and keeps a row the person closed closed", () => {
    const nodeTypes = patternNodeTypes();
    const onlyAnEmptyProject = { ...nodeTypes, listing: { ...nodeTypes.listing, sources: [{ source: "project" as const, node_types: [], graph_generators: [], unreadable_modules: [] }] } };
    expect(libraryTreeOfTheListing(onlyAnEmptyProject, {}, "node_types").map(({ row }) => row.label)).toEqual(["This project", "Declares no node types"]);
    expect(libraryTreeOfTheListing(onlyAnEmptyProject, { "source:project": false }, "node_types").map(({ row }) => row.label)).toEqual(["This project"]);
  });

  it("lists only the graph generators, straight under each source that declares one, opening each in the project's folder", () => {
    const rows = libraryTreeOfTheListing(patternNodeTypes(), {}, "graph_generators");
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label} ${row.expansion}`)).toEqual(["This project expanded", "  two_cameras_side_by_side leaf"]);
    const generator = rows[1]?.meaning;
    expect(generator?.kind === "graph_generator_declaration" ? generator.file : null).toBe(`${STREAMS_FOLDER}/pattern/nodes/scenes.py`);
    const nodeTypes = patternNodeTypes();
    expect(libraryTreeOfTheListing({ ...nodeTypes, listing: { ...nodeTypes.listing, sources: [LIGHTING_RIG_DEPENDENCY] } }, {}, "graph_generators")).toEqual([]);
  });
});
