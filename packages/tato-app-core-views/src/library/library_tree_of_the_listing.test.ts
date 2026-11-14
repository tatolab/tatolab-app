import { describe, expect, it } from "vitest";
import { libraryTreeOfTheListing } from "./library_tree_of_the_listing";
import type { PortFamily } from "@tatolab/tato-app-view-sdk/port_families";
import type { ProjectNodeType, ProjectNodeTypeListing, ProjectNodeTypePort, ProjectNodeTypeSource } from "@tatolab/tato-app-view-sdk/studio_readings";

const STREAMS_FOLDER = "/home/jonathanf/streams";

const processPort = (name: string, description: string, family: PortFamily): ProjectNodeTypePort => ({ name, description, family, annotation: null });

const INVERTING_EFFECT: ProjectNodeType = {
  type: "nodes.inverting_effect:InvertingEffect",
  kind: "process",
  description: "Inverts every frame's colours on the GPU.",
  category: "Effects",
  inputs: [processPort("video_from_upstream", "", "image")],
  outputs: [processPort("video_to_downstream", "", "image")],
  path: "nodes/inverting_effect.py",
  line: 10,
};

const BRIGHTNESS_METER: ProjectNodeType = {
  type: "nodes.brightness_meter:BrightnessMeter",
  kind: "process",
  description: "Logs the mean brightness of the frames it sees, once a second.",
  category: "nodes.brightness_meter",
  inputs: [processPort("video_from_upstream", "", "image")],
  outputs: [],
  path: "nodes/brightness_meter.py",
  line: 7,
};

const CAPTION_OVERLAY: ProjectNodeType = {
  type: "nodes.captions:caption_overlay",
  kind: "function",
  description: "Draws the latest caption over each frame.",
  category: "Effects",
  inputs: [
    { name: "video", description: "", family: "image", annotation: "ImageFrame" },
    { name: "caption", description: "", family: "records", annotation: "Caption | None" },
  ],
  outputs: [{ name: "video", description: "", family: "image", annotation: "ImageFrame" }],
  path: "nodes/captions.py",
  line: 14,
};

function patternProjectSource(isEveryModuleUnreadable: boolean): ProjectNodeTypeSource {
  const halfWrittenModule = {
    module: "nodes.half_written",
    path: "nodes/half_written.py",
    line: 12,
    column: 5,
    why: "SyntaxError: expected ':'",
  };
  if (isEveryModuleUnreadable) {
    return {
      origin: { source: "project" },
      node_types: [],
      graph_generators: [],
      unreadable_modules: [
        halfWrittenModule,
        { module: "nodes.inverting_effect", path: "nodes/inverting_effect.py", line: 3, column: 1, why: "SyntaxError: unterminated triple-quoted string literal (detected at line 23)" },
      ],
    };
  }
  return {
    origin: { source: "project" },
    node_types: [INVERTING_EFFECT, BRIGHTNESS_METER, CAPTION_OVERLAY],
    graph_generators: [
      {
        generator: "nodes.scenes:two_cameras_side_by_side",
        description: "Two cameras composed side by side, each with its own label.",
        promoted_config: [
          { name: "left_camera", annotation: "str" },
          { name: "right_camera", annotation: "str" },
        ],
        path: "nodes/scenes.py",
        line: 8,
      },
    ],
    unreadable_modules: [halfWrittenModule],
  };
}

const LIGHTING_RIG_DEPENDENCY: ProjectNodeTypeSource = {
  origin: { source: "dependency", project: "6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11", folder: "hall-of-light", version: "0.1.0", project_name: "Hall of Light" },
  node_types: [
    {
      type: "nodes.gripper:Gripper",
      kind: "function",
      description: "Holds the rig's grip at the last level it was sent.",
      category: "Lighting",
      inputs: [{ name: "grip", description: "", family: "channels", annotation: "float | None" }],
      outputs: null,
      path: "nodes/gripper.py",
      line: 4,
    },
  ],
  graph_generators: [],
  unreadable_modules: [],
};

const CAMERA_TILT: ProjectNodeType = {
  type: "camera.nodes:CameraTilt",
  kind: "process",
  description: "Tilts and crops a camera's frames to the horizon.",
  category: "Camera",
  inputs: [processPort("video", "", "image")],
  outputs: [processPort("video", "", "image")],
  path: "camera/nodes.py",
  line: 9,
};

const LOBBY_RECORDER: ProjectNodeType = {
  type: "lobby_recorder.recording:LobbyRecorder",
  kind: "process",
  description: "Records the lobby camera to rolling one-hour files.",
  category: "Recording",
  inputs: [processPort("video", "", "image"), processPort("audio", "", "channels")],
  outputs: [],
  path: "lobby_recorder/recording.py",
  line: 21,
};

const installedDistribution = (distribution: string, distributionVersion: string, nodeTypes: ProjectNodeType[]): ProjectNodeTypeSource => ({
  origin: { source: "installed_distribution", distribution, distribution_version: distributionVersion },
  node_types: nodeTypes.map((nodeType) => ({ ...nodeType, path: null, line: null })),
  graph_generators: [],
  unreadable_modules: [],
});

/** What `list_project_node_types` lists for the pattern project: its own modules, one not parsing, a pinned dependency and three installed distributions. */
function patternListing(isEveryOwnModuleUnreadable = false): ProjectNodeTypeListing {
  return {
    project_directory: `${STREAMS_FOLDER}/pattern`,
    project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90",
    project_name: "pattern",
    sources: [
      patternProjectSource(isEveryOwnModuleUnreadable),
      LIGHTING_RIG_DEPENDENCY,
      installedDistribution("camera", "0.1.0", [CAMERA_TILT]),
      installedDistribution("lobby-recorder", "0.4.1", [LOBBY_RECORDER]),
      installedDistribution("tatolab-testpattern", "0.3.2", [
        {
          type: "tatolab.testpattern:TestPatternSource",
          kind: null,
          description: "Synthetic SMPTE-style color bars with a bouncing potato, rendered on the GPU",
          category: "tatolab.testpattern",
          inputs: null,
          outputs: null,
          path: null,
          line: null,
        },
      ]),
    ],
  };
}

describe("the Library's tree", () => {
  it("lists each source by its title, the project first, each node type under its category and each module that does not parse", () => {
    const rows = libraryTreeOfTheListing(patternListing(), {}, "node_types");
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label} ${row.expansion}`)).toEqual([
      "This project expanded",
      "  Effects expanded",
      "    caption_overlay leaf",
      "    InvertingEffect leaf",
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

  it("opens the project's own declarations in its folder, and nothing for a source not the project's", () => {
    const rows = libraryTreeOfTheListing(patternListing(), { "source:distribution:camera": true }, "node_types");
    const fileOfRow = (label: string) => {
      const meaning = rows.find(({ row }) => row.label === label)?.meaning;
      return meaning === undefined || meaning.kind === "nothing_to_select" ? undefined : meaning.file;
    };
    expect(fileOfRow("InvertingEffect")).toBe(`${STREAMS_FOLDER}/pattern/nodes/inverting_effect.py`);
    expect(fileOfRow("nodes/half_written.py:12:5: SyntaxError: expected ':'")).toBe(`${STREAMS_FOLDER}/pattern/nodes/half_written.py`);
    expect(fileOfRow("Gripper")).toBeNull();
    expect(fileOfRow("CameraTilt")).toBeNull();
  });

  it("shows each module that does not parse in the parser's words, for that module only", () => {
    const rows = libraryTreeOfTheListing(patternListing(true), {}, "node_types");
    expect(rows.slice(0, 3).map(({ row }) => [row.label, row.tone ?? "plain"])).toEqual([
      ["This project", "plain"],
      ["nodes/half_written.py:12:5: SyntaxError: expected ':'", "unreadable"],
      ["nodes/inverting_effect.py:3:1: SyntaxError: unterminated triple-quoted string literal (detected at line 23)", "unreadable"],
    ]);
    expect(rows[3]?.row.label).toBe("imports/hall-of-light");
  });

  it("says a source declares no node types, and keeps a row the person closed closed", () => {
    const listing = { ...patternListing(), sources: [{ origin: { source: "project" as const }, node_types: [], graph_generators: [], unreadable_modules: [] }] };
    expect(libraryTreeOfTheListing(listing, {}, "node_types").map(({ row }) => row.label)).toEqual(["This project", "Declares no node types"]);
    expect(libraryTreeOfTheListing(listing, { "source:project": false }, "node_types").map(({ row }) => row.label)).toEqual(["This project"]);
  });

  it("lists only the graph generators, straight under each source that declares one, opening each in the project's folder", () => {
    const rows = libraryTreeOfTheListing(patternListing(), {}, "graph_generators");
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label} ${row.expansion}`)).toEqual(["This project expanded", "  two_cameras_side_by_side leaf"]);
    const generator = rows[1]?.meaning;
    expect(generator?.kind === "graph_generator_declaration" ? generator.file : null).toBe(`${STREAMS_FOLDER}/pattern/nodes/scenes.py`);
    expect(libraryTreeOfTheListing({ ...patternListing(), sources: [LIGHTING_RIG_DEPENDENCY] }, {}, "graph_generators")).toEqual([]);
  });
});
