// The browser mock's node catalog: every node type its streams name, each with the category the
// runtime would serve for it (none for a built-in, the declaring module for a Python node that
// declares none) and the config schema the runtime would serve for it — Python's spelling (`anyOf`
// with null, no `title`) for a node written in Python, Rust's (`"type": [T, "null"]`, a root `title`,
// an enum under `$defs`) for a native one — and its ports by name and the family each carries, which
// the mock serves only when asked.

import type { JsonValue, NodeCatalogEntry, PortFamily } from "../src/shared/tatolab_backend_contract";

/** What the runtime's Python deriver writes for a node that declares no config. */
const THE_SCHEMA_OF_A_NODE_DECLARING_NO_CONFIG: JsonValue = { type: "object", description: "This node declares no configuration.", additionalProperties: false };

const port = (name: string, description: string, family: PortFamily) => ({ name, description, family });

/** Every node type the mock runtime's streams can add, in the order its catalog lists them. */
export const MOCK_NODE_CATALOG_ENTRIES: readonly NodeCatalogEntry[] = [
  {
    type: "tatolab.stream:TestPatternSource",
    description: "Synthetic SMPTE-style color bars with a bouncing potato, rendered on the GPU",
    category: null,
    config_schema: {
      type: "object",
      properties: {
        width: { type: "integer", description: "Frame width in pixels.", default: 1280 },
        height: { type: "integer", description: "Frame height in pixels.", default: 720 },
        fps: { type: "integer", description: "Frames a second.", default: 30, minimum: 1, maximum: 120 },
      },
      additionalProperties: false,
    },
    inputs: [],
    outputs: [port("video", "Test-pattern video frames", "image")],
  },
  {
    type: "tatolab.stream:CameraSource",
    description: "Captures a camera and converts each frame on the GPU, with no CPU copy",
    category: null,
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
    outputs: [port("video", "Camera frames", "image")],
  },
  {
    type: "tatolab.stream:MicrophoneSource",
    description: "Captures a microphone as audio blocks",
    category: null,
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
    outputs: [port("audio", "Captured audio", "channels")],
  },
  {
    type: "tatolab.stream:DisplayWindow",
    description: "Shows video frames in a window on this machine",
    category: null,
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
    inputs: [port("video", "Frames to show", "image")],
    outputs: [],
  },
  {
    type: "tatolab.stream:Mp4Writer",
    description: "Writes video frames to an MP4 file",
    category: null,
    config_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Where the file is written, relative to the project." },
        fragment_ms: { type: "integer", description: "How long each fragment runs.", default: 2000 },
      },
      additionalProperties: false,
      required: ["path"],
    },
    inputs: [port("video", "Frames to write", "image")],
    outputs: [],
  },
  {
    type: "nodes.inverting_effect:InvertingEffect",
    description: "Inverts each frame's colours",
    category: "Effects",
    config_schema: {
      type: "object",
      properties: { strength: { type: "number", description: "How far each colour is inverted.", default: 1, minimum: 0, maximum: 1 } },
    },
    inputs: [port("video_from_upstream", "", "image")],
    outputs: [port("video_to_downstream", "", "image")],
  },
  {
    type: "tatolab.stream:GraphInput",
    description: "Declares one Input of the graph: every port `value` is linked to reads what enters it.",
    category: null,
    config_schema: {
      title: "GraphInputConfig",
      type: "object",
      properties: { port: { type: "string" }, family: { type: "string" } },
    },
    inputs: [],
    outputs: [port("value", "What a client writes to the Input, of the declared family.", "records")],
  },
  {
    type: "nodes.brightness_meter:BrightnessMeter",
    description: "Measures each frame's mean brightness",
    category: null,
    config_schema: THE_SCHEMA_OF_A_NODE_DECLARING_NO_CONFIG,
    inputs: [port("video_from_upstream", "", "image")],
    outputs: [port("brightness", "Each frame's mean brightness", "records"), port("luma_points", "A sample of the frame's pixels as points", "array")],
  },
  {
    type: "nodes.level_meter:LevelMeter",
    description: "Logs each audio block's peak level",
    category: "nodes.level_meter",
    config_schema: THE_SCHEMA_OF_A_NODE_DECLARING_NO_CONFIG,
    inputs: [port("audio_from_upstream", "", "channels")],
    outputs: [],
  },
  {
    type: "tatolab.h264:H264Encoder",
    description: "Encodes each frame as H.264 on the GPU",
    category: null,
    config_schema: {
      type: "object",
      properties: {
        bitrate_bps: { type: "integer", description: "The target bitrate, in bits a second.", default: 4000000 },
        keyframe_interval_frames: { type: "integer", description: "Frames from one keyframe to the next.", default: 30 },
      },
      additionalProperties: false,
    },
    inputs: [port("video", "", "image")],
    outputs: [port("encoded", "Annex-B access units", "packets")],
  },
  {
    type: "tatolab.ops:ImageFile",
    description: "Publishes the project image asset its config names, once at start and again on each config change.",
    category: null,
    config_schema: {
      type: "object",
      properties: { asset: { type: "string", default: "", "x-tatolab-project-asset": { media: ["image"] } } },
      additionalProperties: false,
    },
    inputs: [],
    outputs: [port("image", "", "image")],
  },
  {
    type: "tatolab.compositor:AlphaOverCompositor",
    description: "Video layers stacked back to front, in premultiplied alpha, on the GPU",
    category: null,
    config_schema: {
      type: "object",
      properties: {
        width: { type: "integer", description: "Canvas width in pixels; every composite is this wide.", default: 1920 },
        height: { type: "integer", description: "Canvas height in pixels; every composite is this tall.", default: 1080 },
        layers: {
          type: "array",
          description: "Entry N places `layer_N`; a layer with no entry sits at 0,0 at full opacity.",
          items: {
            type: "object",
            properties: {
              x: { type: "integer", description: "Canvas column of the layer's left edge; negative clips it.", default: 0 },
              y: { type: "integer", description: "Canvas row of the layer's top edge; negative clips it.", default: 0 },
              opacity: { type: "number", description: "0.0 hides the layer, 1.0 shows it as it arrives.", default: 1.0 },
            },
            additionalProperties: false,
          },
          default: [],
        },
      },
      additionalProperties: false,
    },
    inputs: [port("layer_0", "", "image"), port("layer_1", "", "image")],
    outputs: [port("composite", "", "image")],
  },
];
