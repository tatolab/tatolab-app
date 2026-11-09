// The browser mock's `list_project_node_types`: what the pattern project's own node modules declare,
// one of them not parsing, a graph generator, its camera and lobby-recorder imports, one more
// import whose function node states no outputs in source, and an installed distribution.
// `?node_types=unreadable_project` lists the pattern project with every module of its own unreadable.

import type { PortFamily, ProjectNodeType, ProjectNodeTypeListing, ProjectNodeTypePort, ProjectNodeTypeSource } from "../src/shared/tatolab_backend_contract";

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
  origin: { source: "dependency", project: "6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11", folder: "hall-of-light", version: "9f2c4e1a7b3d5f60c8e2a4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5" },
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

/** The UUID the mock's camera import is listed by. */
export const MOCK_CAMERA_IMPORT_PROJECT = "3a9d6e21-5b7c-4f08-a1e4-6c2b9f0d8e15";
/** The UUID the mock's lobby-recorder import is listed by. */
export const MOCK_LOBBY_RECORDER_IMPORT_PROJECT = "8e1f4c37-0d2a-4b96-b5c8-7f3e2a1d9c64";
/** The version the mock lists each of its imports at. */
export const MOCK_IMPORT_VERSION = "9f2c4e1a7b3d5f60c8e2a4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5";

const importedProjectSource = (project: string, folder: string, nodeTypes: ProjectNodeType[]): ProjectNodeTypeSource => ({
  origin: { source: "dependency", project, folder, version: MOCK_IMPORT_VERSION },
  node_types: nodeTypes,
  graph_generators: [],
  unreadable_modules: [],
});

const installedDistribution = (distribution: string, distributionVersion: string, nodeTypes: ProjectNodeType[]): ProjectNodeTypeSource => ({
  origin: { source: "installed_distribution", distribution, distribution_version: distributionVersion },
  node_types: nodeTypes.map((nodeType) => ({ ...nodeType, path: null, line: null })),
  graph_generators: [],
  unreadable_modules: [],
});

/** The mock runtime's `list_project_node_types` for `projectDirectory` in `streamsFolder`, or `null` for a folder it holds no project in. */
export function mockProjectNodeTypeListing(projectDirectory: string, streamsFolder: string, isEveryOwnModuleUnreadable: boolean): ProjectNodeTypeListing | null {
  switch (projectDirectory) {
    case `${streamsFolder}/pattern`:
      return {
        project_directory: projectDirectory,
        project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90",
        project_name: "pattern",
        sources: [
          patternProjectSource(isEveryOwnModuleUnreadable),
          LIGHTING_RIG_DEPENDENCY,
          importedProjectSource(MOCK_CAMERA_IMPORT_PROJECT, "camera", [CAMERA_TILT]),
          importedProjectSource(MOCK_LOBBY_RECORDER_IMPORT_PROJECT, "lobby-recorder", [LOBBY_RECORDER]),
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
    default:
      return null;
  }
}
