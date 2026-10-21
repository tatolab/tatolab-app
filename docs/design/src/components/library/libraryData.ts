// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { CatalogEntry, DataKind } from "@/data/mock"

export interface InstalledPack {
  name: string
  version: string
  update?: string
  nodes: number
  publisher: string
}

export const installedPacks: InstalledPack[] = [
  { name: "vision-pack", version: "2.0", nodes: 2, publisher: "tatolab" },
  { name: "audio-pack", version: "1.4", nodes: 1, publisher: "tatolab" },
  { name: "warehouse-pack", version: "0.9", update: "1.0", nodes: 1, publisher: "acme-logistics" },
  { name: "home-pack", version: "1.2", nodes: 1, publisher: "tatolab" },
  { name: "agents", version: "0.3", nodes: 1, publisher: "tatolab-labs" },
]

export interface LibraryPort {
  direction: "in" | "out"
  kind: DataKind
  name: string
  delivery?: "newest" | "ordered"
}

const outNames: Record<string, Partial<Record<DataKind, string>>> = {
  "vision_pack:ObjectDetector": { data: "detections" },
  "vision_pack:DepthEstimator": { tensor: "depth" },
  "warehouse_pack:PeopleCounter": { data: "counts", tensor: "heatmap" },
  "agents:LiveWatcher": { data: "answers" },
}

export function portsFor(entry: CatalogEntry): LibraryPort[] {
  const isSource = entry.inputs.length === 0
  const ins: LibraryPort[] = entry.inputs.map((kind) => ({
    direction: "in",
    kind,
    name: `${kind === "encoded" ? "encoded_video" : kind}_from_upstream`,
    delivery: kind === "video" || kind === "tensor" ? "newest" : "ordered",
  }))
  const outs: LibraryPort[] = entry.outputs.map((kind) => ({
    direction: "out",
    kind,
    name: outNames[entry.className]?.[kind] ?? (isSource ? kind : kind === "encoded" ? (entry.inputs.includes("audio") ? "encoded_audio" : "encoded_video") : `${kind}_to_downstream`),
  }))
  return [...ins, ...outs]
}

export interface ConfigKey {
  key: string
  type: string
  default: string
  description: string
}

const configs: Record<string, ConfigKey[]> = {
  "tatolab.stream:CameraSource": [
    { key: "device", type: "str", default: '"default"', description: "Camera id or /dev/videoN path." },
    { key: "width", type: "int", default: "1920", description: "Requested frame width." },
    { key: "height", type: "int", default: "1080", description: "Requested frame height." },
    { key: "fps", type: "int", default: "30", description: "Requested frame rate." },
  ],
  "tatolab.stream:MicrophoneSource": [
    { key: "device", type: "str", default: '"default"', description: "Input device name." },
    { key: "sample_rate", type: "int", default: "48000", description: "Samples per second." },
    { key: "channels", type: "int", default: "2", description: "Mono or stereo." },
  ],
  "tatolab.stream:H264Encoder": [
    { key: "bitrate_kbps", type: "int", default: "6000", description: "Target bitrate." },
    { key: "keyframe_interval", type: "int", default: "60", description: "Frames between keyframes." },
  ],
  "tatolab.stream:RelaySource": [{ key: "address", type: "str", default: "—", description: "machine/stream/node/port of a public output." }],
  "tatolab.stream:Mp4Sink": [{ key: "path", type: "str", default: "—", description: "strftime pattern for output files." }],
  "vision_pack:ObjectDetector": [
    { key: "model", type: "str", default: '"yolo11n.onnx"', description: "ONNX model, resolved from the pack's models/." },
    { key: "threshold", type: "float", default: "0.45", description: "Minimum confidence to keep a box." },
    { key: "classes", type: "list[str]", default: '["person"]', description: "Labels to keep. Empty keeps all." },
    { key: "provider", type: "str", default: '"auto"', description: "TensorRT, CoreML or CPU." },
  ],
  "vision_pack:DepthEstimator": [{ key: "model", type: "str", default: '"depth-anything-v2-s"', description: "Depth model." }],
  "warehouse_pack:PeopleCounter": [
    { key: "line", type: "tuple", default: "(0.1, 0.6, 0.9, 0.6)", description: "Counting line in normalised coordinates." },
    { key: "min_track_frames", type: "int", default: "8", description: "Frames before a track counts." },
  ],
  "audio_pack:Denoise": [{ key: "strength", type: "float", default: "0.8", description: "0 leaves audio alone, 1 is strongest." }],
  "effects:Vignette": [{ key: "strength", type: "float", default: "0.6", description: "How dark the corners get." }],
  "effects:Halftone": [
    { key: "dot_size", type: "int", default: "7", description: "Cell size in pixels." },
    { key: "angle_deg", type: "float", default: "15", description: "Screen angle." },
  ],
  "agents:LiveWatcher": [
    { key: "prompt", type: "str", default: "—", description: "What the agent watches for." },
    { key: "every_s", type: "float", default: "2.0", description: "Seconds between looks." },
  ],
}

export const configFor = (className: string) => configs[className] ?? []

export function snippetFor(entry: CatalogEntry) {
  const [module, cls] = entry.className.split(":")
  const variable = entry.label
    .toLowerCase()
    .replace(/\(.*\)/, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^object_/, "")
    .replace(/_$/, "")
  const first = configFor(entry.className)[0]
  const conf =
    entry.className === "vision_pack:ObjectDetector"
      ? ', config={"threshold": 0.45}'
      : first && first.default !== "—"
        ? `, config={"${first.key}": ${first.default}}`
        : ""
  return `from ${module} import ${cls}\n\n${variable} = stream_builder.add(${cls}${conf})`
}
