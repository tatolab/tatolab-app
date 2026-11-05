// The browser mock's node catalog: every node type its streams name, each with the config schema the
// runtime would serve for it — Python's spelling (`anyOf` with null, no `title`) for a node written in
// Python, Rust's (`"type": [T, "null"]`, a root `title`, an enum under `$defs`) for a native one — and
// its ports by name.

import type { JsonValue, NodeCatalogEntry } from "../../shared/tatolab_backend_contract";

/** What the runtime's Python deriver writes for a node that declares no config. */
const THE_SCHEMA_OF_A_NODE_DECLARING_NO_CONFIG: JsonValue = { type: "object", description: "This node declares no configuration.", additionalProperties: false };

const port = (name: string, description: string) => ({ name, description });

/** Every node type the mock runtime's streams can add, in the order its catalog lists them. */
export const MOCK_NODE_CATALOG_ENTRIES: readonly NodeCatalogEntry[] = [
  {
    type: "tatolab.stream:TestPatternSource",
    description: "Synthetic SMPTE-style color bars with a bouncing potato, rendered on the GPU",
    config_schema: {
      type: "object",
      properties: {
        width: { type: "integer", description: "Frame width in pixels.", default: 1280 },
        height: { type: "integer", description: "Frame height in pixels.", default: 720 },
        fps: { type: "integer", description: "Frames a second.", default: 30 },
      },
      additionalProperties: false,
    },
    inputs: [],
    outputs: [port("video", "Test-pattern video frames")],
  },
  {
    type: "tatolab.stream:CameraSource",
    description: "Captures a camera and converts each frame on the GPU, with no CPU copy",
    config_schema: {
      type: "object",
      properties: {
        device_id: {
          anyOf: [{ type: "string" }, { type: "null" }],
          description: "The camera to open; the first camera found when absent.",
          default: null,
        },
        width: { type: "integer", description: "The widest frame size negotiated.", default: 1920 },
        height: { type: "integer", description: "The tallest frame size negotiated.", default: 1080 },
      },
      additionalProperties: false,
    },
    inputs: [],
    outputs: [port("video", "Camera frames")],
  },
  {
    type: "tatolab.stream:MicrophoneSource",
    description: "Captures a microphone as audio blocks",
    config_schema: {
      type: "object",
      properties: {
        device_id: { anyOf: [{ type: "string" }, { type: "null" }], description: "The capture device; the default input when absent.", default: null },
        sample_rate: { type: "integer", description: "Samples a second.", default: 48000 },
        channels: { type: "integer", description: "Channels captured.", default: 1 },
      },
      additionalProperties: false,
    },
    inputs: [],
    outputs: [port("audio", "Captured audio")],
  },
  {
    type: "tatolab.stream:DisplayWindow",
    description: "Shows video frames in a window on this machine",
    config_schema: {
      title: "DisplayWindowConfig",
      type: "object",
      properties: {
        title: { description: "The window's title.", type: ["string", "null"], default: null },
        scaling: { description: "How a frame fills the window.", $ref: "#/$defs/DisplayWindowScaling", default: "fit" },
        vsync: { description: "Whether presenting waits for the display's refresh.", type: "boolean", default: true },
      },
      $defs: { DisplayWindowScaling: { type: "string", enum: ["fit", "fill", "stretch"] } },
    },
    inputs: [port("video", "Frames to show")],
    outputs: [],
  },
  {
    type: "tatolab.stream:Mp4Writer",
    description: "Writes video frames to an MP4 file",
    config_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Where the file is written, relative to the project." },
        fragment_ms: { type: "integer", description: "How long each fragment runs.", default: 2000 },
      },
      additionalProperties: false,
      required: ["path"],
    },
    inputs: [port("video", "Frames to write")],
    outputs: [],
  },
  {
    type: "nodes.inverting_effect:InvertingEffect",
    description: "Inverts each frame's colours",
    config_schema: THE_SCHEMA_OF_A_NODE_DECLARING_NO_CONFIG,
    inputs: [port("video_from_upstream", "")],
    outputs: [port("video_to_downstream", "")],
  },
  {
    type: "nodes.brightness_meter:BrightnessMeter",
    description: "Logs each frame's mean brightness",
    config_schema: THE_SCHEMA_OF_A_NODE_DECLARING_NO_CONFIG,
    inputs: [port("video_from_upstream", "")],
    outputs: [],
  },
  {
    type: "nodes.level_meter:LevelMeter",
    description: "Logs each audio block's peak level",
    config_schema: THE_SCHEMA_OF_A_NODE_DECLARING_NO_CONFIG,
    inputs: [port("audio_from_upstream", "")],
    outputs: [],
  },
];
