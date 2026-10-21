// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/* Mock runtime state for the workbench prototype. Every noun here is a real
   streamlib noun (docs/plan/GLOSSARY.md): machine, stream, node, port, link,
   exposure, relay, broadcast, track. Only the user-facing *wording* is new. */

export type DataKind = "video" | "audio" | "encoded" | "tensor" | "data"
export type Exposure = "internal" | "private" | "public"
export type StreamStatus = "live" | "starting" | "paused" | "attention" | "failed"
/** How a stream came to be running — replaces the old "Kept" / "Attached" words. */
export type RunMode = "always-on" | "dev-session" | "manual"
export type NodeOrigin = "built-in" | "python" | "pack"
export type NodeCategory = "source" | "effect" | "ai" | "codec" | "sink" | "relay" | "analysis"
export type Scene =
  | "camera"
  | "detect"
  | "halftone"
  | "pattern"
  | "inverted"
  | "vignette"
  | "waveform"
  | "spectrum"
  | "thermal"
  | "depth"
  | "screen"
  | "drone"
  | "warehouse"
  | "encoded"
  | "no-signal"
  | "mosaic"

export interface PortSpec {
  name: string
  direction: "in" | "out"
  kind: DataKind
  exposure?: Exposure
  deliveryProfile?: "newest" | "ordered"
  preview?: Scene
}

export interface NodeMetrics {
  fps: number
  latencyMs: number
  cpu: number
  gpu: number
  dropped: number
}

export interface NodeSpec {
  id: string
  label: string
  className: string
  origin: NodeOrigin
  category: NodeCategory
  description: string
  file?: string
  pack?: string
  pid?: number
  ports: PortSpec[]
  config?: Record<string, string | number | boolean>
  metrics: NodeMetrics
  position: { x: number; y: number }
  preview?: Scene
  state?: "running" | "starting" | "stalled" | "crashed" | "stopped"
}

export interface LinkSpec {
  id: string
  from: { node: string; port: string }
  to: { node: string; port: string }
  kind: DataKind
  ratePerSec: number
  dropped: number
}

export interface StreamSpec {
  id: string
  title: string
  description: string
  machine: string
  status: StreamStatus
  statusDetail: string
  runMode: RunMode
  project: string
  uptime: string
  hero: Scene
  tags: string[]
  nodes: NodeSpec[]
  links: LinkSpec[]
  cpu: number
  memoryMb: number
  gpu: number
  restarts: number
  python: string
  entry: string
  createdAgo: string
  relays: string[]
  endToEndMs: number
  fps: number
  resolution: string
}

export type MachineKind = "mac" | "linux-box" | "jetson" | "set-top" | "container"

export interface MachineSpec {
  id: string
  name: string
  kind: MachineKind
  isThisMachine?: boolean
  os: string
  gpu: string
  status: "online" | "offline" | "updating"
  address: string
  location: string
  runtimeVersion: string
  cpu: number
  gpuLoad: number
  memory: number
  temperature: number
  relays: string[]
}

export type RelayProvider = "local" | "cloudflare" | "moqpro" | "red5" | "iroh" | "custom"

export interface RelaySpec {
  id: string
  provider: RelayProvider
  name: string
  url: string
  region: string
  status: "connected" | "connecting" | "error" | "off"
  latencyMs: number
  subscribers: number
  egressMbps: number
  tracks: number
  joinedBy: string[]
  credential: "none" | "token" | "key" | "expiring"
  note: string
}

const m = (fps: number, latencyMs: number, cpu: number, gpu: number, dropped = 0): NodeMetrics => ({
  fps,
  latencyMs,
  cpu,
  gpu,
  dropped,
})

export const machines: MachineSpec[] = [
  {
    id: "studio-mac",
    name: "studio-mac",
    kind: "mac",
    isThisMachine: true,
    os: "macOS 26.1",
    gpu: "Apple M4 Max · 40-core",
    status: "online",
    address: "studio-mac.tail3e9f.ts.net",
    location: "Studio",
    runtimeVersion: "0.46.0",
    cpu: 18,
    gpuLoad: 34,
    memory: 41,
    temperature: 52,
    relays: ["local", "cloudflare"],
  },
  {
    id: "garage-jetson",
    name: "garage-jetson",
    kind: "jetson",
    os: "Ubuntu 24.04 · JetPack 7",
    gpu: "Jetson AGX Orin · 2048-core",
    status: "online",
    address: "garage-jetson.tail3e9f.ts.net",
    location: "Garage, front door camera",
    runtimeVersion: "0.46.0",
    cpu: 46,
    gpuLoad: 71,
    memory: 58,
    temperature: 67,
    relays: ["local", "cloudflare"],
  },
  {
    id: "dock-box",
    name: "dock-box",
    kind: "linux-box",
    os: "Ubuntu 24.04",
    gpu: "NVIDIA RTX 4000 Ada",
    status: "online",
    address: "dock-box.tail3e9f.ts.net",
    location: "Warehouse · dock 4",
    runtimeVersion: "0.45.2",
    cpu: 63,
    gpuLoad: 88,
    memory: 72,
    temperature: 74,
    relays: ["local", "moqpro"],
  },
  {
    id: "lobby-tv",
    name: "lobby-tv",
    kind: "set-top",
    os: "Tatolab OS (set-top)",
    gpu: "Intel Arc A380",
    status: "online",
    address: "lobby-tv.tail3e9f.ts.net",
    location: "Lobby display",
    runtimeVersion: "0.46.0",
    cpu: 12,
    gpuLoad: 22,
    memory: 30,
    temperature: 48,
    relays: ["local", "cloudflare"],
  },
  {
    id: "render-pod",
    name: "render-pod",
    kind: "container",
    os: "Container · linux/amd64",
    gpu: "Software device (CPU)",
    status: "offline",
    address: "render-pod",
    location: "CI · nightly",
    runtimeVersion: "0.46.0",
    cpu: 0,
    gpuLoad: 0,
    memory: 0,
    temperature: 0,
    relays: ["local"],
  },
]

export const relays: RelaySpec[] = [
  {
    id: "local",
    provider: "local",
    name: "Local relay",
    url: "moq://localhost:4443",
    region: "On every machine",
    status: "connected",
    latencyMs: 1,
    subscribers: 3,
    egressMbps: 18.4,
    tracks: 9,
    joinedBy: ["studio-mac", "garage-jetson", "dock-box", "lobby-tv", "render-pod"],
    credential: "none",
    note: "Built in. Your other machines on the tailnet read it directly.",
  },
  {
    id: "cloudflare",
    provider: "cloudflare",
    name: "Cloudflare",
    url: "https://relay.cloudflare.com/tatolab-studio",
    region: "Global · nearest edge (IAD)",
    status: "connected",
    latencyMs: 24,
    subscribers: 412,
    egressMbps: 236.2,
    tracks: 4,
    joinedBy: ["studio-mac", "garage-jetson", "lobby-tv"],
    credential: "token",
    note: "Public broadcasts for anyone with the link.",
  },
  {
    id: "moqpro",
    provider: "moqpro",
    name: "moq.pro",
    url: "https://moq.pro/@tatolab/warehouse",
    region: "us-west-2",
    status: "connected",
    latencyMs: 38,
    subscribers: 14,
    egressMbps: 21.7,
    tracks: 2,
    joinedBy: ["dock-box"],
    credential: "expiring",
    note: "Warehouse ops team. Key expires in 6 days.",
  },
  {
    id: "red5",
    provider: "red5",
    name: "Red5 Cloud",
    url: "https://tatolab.red5.net/live",
    region: "eu-central",
    status: "off",
    latencyMs: 0,
    subscribers: 0,
    egressMbps: 0,
    tracks: 0,
    joinedBy: [],
    credential: "key",
    note: "Configured, not joined by any machine.",
  },
  {
    id: "iroh",
    provider: "iroh",
    name: "iroh",
    url: "iroh://node/5x7k…q2",
    region: "Peer to peer",
    status: "connecting",
    latencyMs: 0,
    subscribers: 0,
    egressMbps: 0,
    tracks: 0,
    joinedBy: ["garage-jetson"],
    credential: "none",
    note: "Direct between machines, no server in the middle.",
  },
]

export const streams: StreamSpec[] = [
  {
    id: "front-door",
    title: "Front door",
    description: "Spots people at the front door, boxes them, and broadcasts the feed.",
    machine: "garage-jetson",
    status: "live",
    statusDetail: "All 6 steps running",
    runMode: "always-on",
    project: "~/streams/front-door",
    uptime: "6d 4h",
    hero: "detect",
    tags: ["camera", "AI", "public"],
    cpu: 31,
    memoryMb: 1840,
    gpu: 68,
    restarts: 0,
    python: "3.12",
    entry: "stream.py",
    createdAgo: "3 weeks ago",
    relays: ["local", "cloudflare"],
    endToEndMs: 41,
    fps: 30,
    resolution: "1920×1080",
    nodes: [
      {
        id: "camera",
        label: "Camera",
        className: "tatolab.stream:CameraSource",
        origin: "built-in",
        category: "source",
        description: "Frames from the porch camera, on the GPU.",
        ports: [{ name: "video", direction: "out", kind: "video", preview: "camera" }],
        config: { device: "/dev/video0", width: 1920, height: 1080, fps: 30 },
        metrics: m(30, 2.1, 3, 6),
        position: { x: 0, y: 120 },
        preview: "camera",
        state: "running",
      },
      {
        id: "persondetector",
        label: "Person detector",
        className: "nodes.person_detector:PersonDetector",
        origin: "python",
        category: "ai",
        description: "Runs YOLO-v11n on each frame and writes boxes.",
        file: "nodes/person_detector.py",
        pid: 48211,
        ports: [
          { name: "video_from_upstream", direction: "in", kind: "video", deliveryProfile: "newest" },
          { name: "detections", direction: "out", kind: "data", exposure: "private" },
          { name: "video_to_downstream", direction: "out", kind: "video" },
        ],
        config: { model: "yolo11n.onnx", threshold: 0.45 },
        metrics: m(29.6, 14.8, 22, 41, 12),
        position: { x: 360, y: 60 },
        preview: "detect",
        state: "running",
      },
      {
        id: "boxoverlay",
        label: "Box overlay",
        className: "nodes.box_overlay:BoxOverlay",
        origin: "python",
        category: "effect",
        description: "Draws labelled boxes over the frame as a pixel effect.",
        file: "nodes/box_overlay.py",
        pid: 48214,
        ports: [
          { name: "video_from_upstream", direction: "in", kind: "video", deliveryProfile: "newest" },
          { name: "detections_from_upstream", direction: "in", kind: "data", deliveryProfile: "newest" },
          { name: "video_to_downstream", direction: "out", kind: "video", exposure: "public", preview: "detect" },
        ],
        metrics: m(29.6, 3.2, 4, 9),
        position: { x: 720, y: 120 },
        preview: "detect",
        state: "running",
      },
      {
        id: "h264encoder",
        label: "H.264 encoder",
        className: "tatolab.stream:H264Encoder",
        origin: "built-in",
        category: "codec",
        description: "Hardware encode for the broadcast.",
        ports: [
          { name: "video_from_upstream", direction: "in", kind: "video", deliveryProfile: "ordered" },
          { name: "encoded_video", direction: "out", kind: "encoded", exposure: "public" },
        ],
        config: { bitrate_kbps: 6000, keyframe_interval: 60 },
        metrics: m(30, 6.4, 2, 12),
        position: { x: 1080, y: 40 },
        preview: "encoded",
        state: "running",
      },
      {
        id: "mp4sink",
        label: "Recorder",
        className: "tatolab.stream:Mp4Sink",
        origin: "built-in",
        category: "sink",
        description: "Keeps the last 24 hours on disk.",
        ports: [{ name: "encoded_video_from_upstream", direction: "in", kind: "encoded", deliveryProfile: "ordered" }],
        config: { path: "/data/front-door/%Y-%m-%d.mp4" },
        metrics: m(30, 0.8, 1, 0),
        position: { x: 1440, y: 40 },
        state: "running",
      },
      {
        id: "doorbell",
        label: "Doorbell alert",
        className: "home_pack.nodes:PresenceAlert",
        origin: "pack",
        pack: "home-pack 1.2",
        category: "analysis",
        description: "Pings your phone when someone stays more than 5 seconds.",
        pid: 48230,
        ports: [{ name: "detections_from_upstream", direction: "in", kind: "data", deliveryProfile: "ordered" }],
        metrics: m(29.6, 0.4, 1, 0),
        position: { x: 1080, y: 260 },
        state: "running",
      },
    ],
    links: [
      { id: "l1", from: { node: "camera", port: "video" }, to: { node: "persondetector", port: "video_from_upstream" }, kind: "video", ratePerSec: 30, dropped: 0 },
      { id: "l2", from: { node: "camera", port: "video" }, to: { node: "boxoverlay", port: "video_from_upstream" }, kind: "video", ratePerSec: 30, dropped: 0 },
      { id: "l3", from: { node: "persondetector", port: "detections" }, to: { node: "boxoverlay", port: "detections_from_upstream" }, kind: "data", ratePerSec: 29.6, dropped: 12 },
      { id: "l4", from: { node: "boxoverlay", port: "video_to_downstream" }, to: { node: "h264encoder", port: "video_from_upstream" }, kind: "video", ratePerSec: 29.6, dropped: 0 },
      { id: "l5", from: { node: "h264encoder", port: "encoded_video" }, to: { node: "mp4sink", port: "encoded_video_from_upstream" }, kind: "encoded", ratePerSec: 30, dropped: 0 },
      { id: "l6", from: { node: "persondetector", port: "detections" }, to: { node: "doorbell", port: "detections_from_upstream" }, kind: "data", ratePerSec: 29.6, dropped: 0 },
    ],
  },
  {
    id: "studio-voice",
    title: "Studio voice",
    description: "The podcast mic, cleaned up and broadcast in Opus.",
    machine: "studio-mac",
    status: "live",
    statusDetail: "All 5 steps running",
    runMode: "always-on",
    project: "~/streams/studio-voice",
    uptime: "2h 13m",
    hero: "waveform",
    tags: ["audio", "public"],
    cpu: 14,
    memoryMb: 420,
    gpu: 0,
    restarts: 0,
    python: "3.12",
    entry: "stream.py",
    createdAgo: "2 months ago",
    relays: ["local", "cloudflare"],
    endToEndMs: 18,
    fps: 50,
    resolution: "48 kHz · stereo",
    nodes: [
      {
        id: "microphone",
        label: "Microphone",
        className: "tatolab.stream:MicrophoneSource",
        origin: "built-in",
        category: "source",
        description: "Shure MV7+ over USB.",
        ports: [{ name: "audio", direction: "out", kind: "audio", preview: "waveform" }],
        metrics: m(50, 1.1, 1, 0),
        position: { x: 0, y: 80 },
        preview: "waveform",
        state: "running",
      },
      {
        id: "denoise",
        label: "Denoise",
        className: "nodes.denoise:Denoise",
        origin: "python",
        category: "effect",
        description: "RNNoise-style suppression.",
        file: "nodes/denoise.py",
        pid: 51002,
        ports: [
          { name: "audio_from_upstream", direction: "in", kind: "audio", deliveryProfile: "ordered" },
          { name: "audio_to_downstream", direction: "out", kind: "audio", preview: "spectrum" },
        ],
        metrics: m(50, 4.2, 6, 0),
        position: { x: 340, y: 80 },
        preview: "spectrum",
        state: "running",
      },
      {
        id: "roomreverb",
        label: "Room reverb",
        className: "nodes.room_reverb:RoomReverb",
        origin: "python",
        category: "effect",
        description: "A small warm room.",
        file: "nodes/room_reverb.py",
        pid: 51004,
        ports: [
          { name: "audio_from_upstream", direction: "in", kind: "audio", deliveryProfile: "ordered" },
          { name: "audio_to_downstream", direction: "out", kind: "audio", exposure: "private", preview: "waveform" },
        ],
        metrics: m(50, 2.8, 4, 0),
        position: { x: 680, y: 80 },
        preview: "waveform",
        state: "running",
      },
      {
        id: "opusencoder",
        label: "Opus encoder",
        className: "tatolab.stream:OpusEncoder",
        origin: "built-in",
        category: "codec",
        description: "96 kbps, 20 ms frames.",
        ports: [
          { name: "audio_from_upstream", direction: "in", kind: "audio", deliveryProfile: "ordered" },
          { name: "encoded_audio", direction: "out", kind: "encoded", exposure: "public" },
        ],
        metrics: m(50, 1.4, 2, 0),
        position: { x: 1020, y: 20 },
        state: "running",
      },
      {
        id: "speaker",
        label: "Monitor speakers",
        className: "tatolab.stream:SpeakerSink",
        origin: "built-in",
        category: "sink",
        description: "Studio monitors, for the host.",
        ports: [{ name: "audio_from_upstream", direction: "in", kind: "audio", deliveryProfile: "newest" }],
        metrics: m(50, 0.6, 1, 0),
        position: { x: 1020, y: 180 },
        state: "running",
      },
    ],
    links: [
      { id: "a1", from: { node: "microphone", port: "audio" }, to: { node: "denoise", port: "audio_from_upstream" }, kind: "audio", ratePerSec: 50, dropped: 0 },
      { id: "a2", from: { node: "denoise", port: "audio_to_downstream" }, to: { node: "roomreverb", port: "audio_from_upstream" }, kind: "audio", ratePerSec: 50, dropped: 0 },
      { id: "a3", from: { node: "roomreverb", port: "audio_to_downstream" }, to: { node: "opusencoder", port: "audio_from_upstream" }, kind: "audio", ratePerSec: 50, dropped: 0 },
      { id: "a4", from: { node: "roomreverb", port: "audio_to_downstream" }, to: { node: "speaker", port: "audio_from_upstream" }, kind: "audio", ratePerSec: 50, dropped: 0 },
    ],
  },
  {
    id: "halftone-booth",
    title: "Halftone booth",
    description: "Your webcam as a newspaper print, offered to Zoom as a virtual camera.",
    machine: "studio-mac",
    status: "live",
    statusDetail: "Reloads when you save",
    runMode: "dev-session",
    project: "~/streams/halftone-booth",
    uptime: "14m",
    hero: "halftone",
    tags: ["camera", "effect", "dev"],
    cpu: 6,
    memoryMb: 512,
    gpu: 14,
    restarts: 4,
    python: "3.13",
    entry: "stream.py",
    createdAgo: "today",
    relays: ["local"],
    endToEndMs: 9,
    fps: 60,
    resolution: "1280×720",
    nodes: [
      {
        id: "camera",
        label: "Camera",
        className: "tatolab.stream:CameraSource",
        origin: "built-in",
        category: "source",
        description: "FaceTime HD camera.",
        ports: [{ name: "video", direction: "out", kind: "video", preview: "camera" }],
        metrics: m(60, 1.8, 2, 4),
        position: { x: 0, y: 60 },
        preview: "camera",
        state: "running",
      },
      {
        id: "halftone",
        label: "Halftone",
        className: "nodes.halftone:Halftone",
        origin: "python",
        category: "effect",
        description: "One GLSL pixel effect, on the GPU.",
        file: "nodes/halftone.py",
        pid: 52110,
        ports: [
          { name: "video_from_upstream", direction: "in", kind: "video", deliveryProfile: "newest" },
          { name: "video_to_downstream", direction: "out", kind: "video", exposure: "private", preview: "halftone" },
        ],
        config: { dot_size: 7, angle_deg: 15, ink: "#111113" },
        metrics: m(60, 1.1, 1, 8),
        position: { x: 360, y: 60 },
        preview: "halftone",
        state: "running",
      },
      {
        id: "virtualcamera",
        label: "Virtual camera",
        className: "tatolab.stream:VirtualCameraSink",
        origin: "built-in",
        category: "sink",
        description: "Shows up in Zoom, Meet and OBS as “Tatolab Camera”.",
        ports: [{ name: "video_from_upstream", direction: "in", kind: "video", deliveryProfile: "newest" }],
        metrics: m(60, 0.9, 1, 2),
        position: { x: 720, y: 60 },
        state: "running",
      },
    ],
    links: [
      { id: "h1", from: { node: "camera", port: "video" }, to: { node: "halftone", port: "video_from_upstream" }, kind: "video", ratePerSec: 60, dropped: 0 },
      { id: "h2", from: { node: "halftone", port: "video_to_downstream" }, to: { node: "virtualcamera", port: "video_from_upstream" }, kind: "video", ratePerSec: 60, dropped: 0 },
    ],
  },
  {
    id: "dock-4",
    title: "Dock 4 counter",
    description: "Counts people at the loading dock and streams a heat map to the ops team.",
    machine: "dock-box",
    status: "attention",
    statusDetail: "Counter is dropping 9% of frames",
    runMode: "always-on",
    project: "/opt/streams/dock-counter",
    uptime: "21d 7h",
    hero: "warehouse",
    tags: ["camera", "AI", "relay"],
    cpu: 48,
    memoryMb: 3120,
    gpu: 92,
    restarts: 2,
    python: "3.11",
    entry: "stream.py",
    createdAgo: "5 months ago",
    relays: ["local", "moqpro"],
    endToEndMs: 96,
    fps: 27,
    resolution: "2560×1440",
    nodes: [
      {
        id: "camera",
        label: "Dock camera",
        className: "tatolab.stream:CameraSource",
        origin: "built-in",
        category: "source",
        description: "PoE camera over RTSP.",
        ports: [{ name: "video", direction: "out", kind: "video", preview: "warehouse" }],
        metrics: m(30, 3.4, 4, 5),
        position: { x: 0, y: 80 },
        preview: "warehouse",
        state: "running",
      },
      {
        id: "peoplecounter",
        label: "People counter",
        className: "warehouse_pack.nodes:PeopleCounter",
        origin: "pack",
        pack: "warehouse-pack 0.9",
        category: "ai",
        description: "Tracks and counts people crossing the dock line.",
        pid: 3121,
        ports: [
          { name: "video_from_upstream", direction: "in", kind: "video", deliveryProfile: "newest" },
          { name: "counts", direction: "out", kind: "data", exposure: "public" },
          { name: "heatmap", direction: "out", kind: "tensor", preview: "thermal" },
        ],
        metrics: m(27.3, 61.2, 38, 92, 1840),
        position: { x: 360, y: 80 },
        preview: "thermal",
        state: "stalled",
      },
      {
        id: "heatmap",
        label: "Heat map render",
        className: "nodes.heat_render:HeatRender",
        origin: "python",
        category: "effect",
        description: "Paints the heat map over the dock.",
        file: "nodes/heat_render.py",
        pid: 3140,
        ports: [
          { name: "heatmap_from_upstream", direction: "in", kind: "tensor", deliveryProfile: "newest" },
          { name: "video_to_downstream", direction: "out", kind: "video", exposure: "public", preview: "thermal" },
        ],
        metrics: m(27.3, 4.1, 3, 11),
        position: { x: 720, y: 80 },
        preview: "thermal",
        state: "running",
      },
    ],
    links: [
      { id: "d1", from: { node: "camera", port: "video" }, to: { node: "peoplecounter", port: "video_from_upstream" }, kind: "video", ratePerSec: 30, dropped: 1840 },
      { id: "d2", from: { node: "peoplecounter", port: "heatmap" }, to: { node: "heatmap", port: "heatmap_from_upstream" }, kind: "tensor", ratePerSec: 27.3, dropped: 0 },
    ],
  },
  {
    id: "lobby-wall",
    title: "Lobby wall",
    description: "Reads the front door and dock broadcasts and tiles them on the lobby TV.",
    machine: "lobby-tv",
    status: "live",
    statusDetail: "Reading 2 broadcasts",
    runMode: "always-on",
    project: "/opt/streams/lobby-wall",
    uptime: "3d 11h",
    hero: "mosaic",
    tags: ["relay", "display"],
    cpu: 11,
    memoryMb: 980,
    gpu: 23,
    restarts: 0,
    python: "3.12",
    entry: "stream.py",
    createdAgo: "1 month ago",
    relays: ["local", "cloudflare"],
    endToEndMs: 74,
    fps: 30,
    resolution: "3840×2160",
    nodes: [
      {
        id: "frontdoor",
        label: "Front door broadcast",
        className: "tatolab.stream:RelaySource",
        origin: "built-in",
        category: "relay",
        description: "garage-jetson/front-door/boxoverlay/video_to_downstream",
        ports: [{ name: "video", direction: "out", kind: "encoded", preview: "detect" }],
        metrics: m(30, 32, 1, 0),
        position: { x: 0, y: 0 },
        preview: "detect",
        state: "running",
      },
      {
        id: "dock",
        label: "Dock 4 broadcast",
        className: "tatolab.stream:RelaySource",
        origin: "built-in",
        category: "relay",
        description: "dock-box/dock-4/heatmap/video_to_downstream",
        ports: [{ name: "video", direction: "out", kind: "encoded", preview: "thermal" }],
        metrics: m(27, 41, 1, 0),
        position: { x: 0, y: 200 },
        preview: "thermal",
        state: "running",
      },
      {
        id: "decoder",
        label: "H.264 decoder ×2",
        className: "tatolab.stream:H264Decoder",
        origin: "built-in",
        category: "codec",
        description: "Hardware decode.",
        ports: [
          { name: "encoded_video_from_upstream", direction: "in", kind: "encoded", deliveryProfile: "ordered" },
          { name: "video", direction: "out", kind: "video" },
        ],
        metrics: m(30, 5.2, 2, 9),
        position: { x: 360, y: 100 },
        state: "running",
      },
      {
        id: "mosaic",
        label: "Mosaic",
        className: "nodes.mosaic:Mosaic",
        origin: "python",
        category: "effect",
        description: "Tiles inputs with a clock and captions.",
        file: "nodes/mosaic.py",
        pid: 812,
        ports: [
          { name: "video_from_upstream", direction: "in", kind: "video", deliveryProfile: "newest" },
          { name: "video_to_downstream", direction: "out", kind: "video", exposure: "private", preview: "mosaic" },
        ],
        metrics: m(30, 6.1, 4, 14),
        position: { x: 720, y: 100 },
        preview: "mosaic",
        state: "running",
      },
    ],
    links: [
      { id: "w1", from: { node: "frontdoor", port: "video" }, to: { node: "decoder", port: "encoded_video_from_upstream" }, kind: "encoded", ratePerSec: 30, dropped: 0 },
      { id: "w2", from: { node: "dock", port: "video" }, to: { node: "decoder", port: "encoded_video_from_upstream" }, kind: "encoded", ratePerSec: 27, dropped: 0 },
      { id: "w3", from: { node: "decoder", port: "video" }, to: { node: "mosaic", port: "video_from_upstream" }, kind: "video", ratePerSec: 57, dropped: 0 },
    ],
  },
  {
    id: "test-pattern",
    title: "Test pattern",
    description: "Colour bars, inverted. The first stream `tatolab new` writes.",
    machine: "studio-mac",
    status: "paused",
    statusDetail: "Paused by you, 2 days ago",
    runMode: "manual",
    project: "~/streams/pattern",
    uptime: "—",
    hero: "inverted",
    tags: ["sample"],
    cpu: 0,
    memoryMb: 0,
    gpu: 0,
    restarts: 0,
    python: "3.12",
    entry: "stream.py",
    createdAgo: "2 days ago",
    relays: ["local"],
    endToEndMs: 0,
    fps: 0,
    resolution: "1280×720",
    nodes: [
      {
        id: "testpatternsource",
        label: "Test pattern",
        className: "tatolab.stream:TestPatternSource",
        origin: "built-in",
        category: "source",
        description: "SMPTE-style colour bars.",
        ports: [{ name: "video", direction: "out", kind: "video", preview: "pattern" }],
        metrics: m(0, 0, 0, 0),
        position: { x: 0, y: 60 },
        preview: "pattern",
        state: "stopped",
      },
      {
        id: "invertingeffect",
        label: "Invert",
        className: "nodes.inverting_effect:InvertingEffect",
        origin: "python",
        category: "effect",
        description: "Inverts every frame on the GPU.",
        file: "nodes/inverting_effect.py",
        ports: [
          { name: "video_from_upstream", direction: "in", kind: "video", deliveryProfile: "newest" },
          { name: "video_to_downstream", direction: "out", kind: "video", exposure: "private", preview: "inverted" },
        ],
        metrics: m(0, 0, 0, 0),
        position: { x: 360, y: 60 },
        preview: "inverted",
        state: "stopped",
      },
    ],
    links: [
      { id: "t1", from: { node: "testpatternsource", port: "video" }, to: { node: "invertingeffect", port: "video_from_upstream" }, kind: "video", ratePerSec: 0, dropped: 0 },
    ],
  },
  {
    id: "lobby-recorder",
    title: "Lobby recorder",
    description: "Records the lobby camera to the NAS overnight.",
    machine: "lobby-tv",
    status: "failed",
    statusDetail: "Camera unplugged at 03:12",
    runMode: "always-on",
    project: "/opt/streams/lobby-recorder",
    uptime: "—",
    hero: "no-signal",
    tags: ["camera", "recording"],
    cpu: 0,
    memoryMb: 0,
    gpu: 0,
    restarts: 7,
    python: "3.12",
    entry: "stream.py",
    createdAgo: "4 months ago",
    relays: ["local"],
    endToEndMs: 0,
    fps: 0,
    resolution: "1920×1080",
    nodes: [
      {
        id: "camera",
        label: "Lobby camera",
        className: "tatolab.stream:CameraSource",
        origin: "built-in",
        category: "source",
        description: "USB camera — not found.",
        ports: [{ name: "video", direction: "out", kind: "video", preview: "no-signal" }],
        metrics: m(0, 0, 0, 0),
        position: { x: 0, y: 60 },
        preview: "no-signal",
        state: "crashed",
      },
      {
        id: "mp4sink",
        label: "Recorder",
        className: "tatolab.stream:Mp4Sink",
        origin: "built-in",
        category: "sink",
        description: "Writes to //nas/lobby.",
        ports: [{ name: "encoded_video_from_upstream", direction: "in", kind: "encoded", deliveryProfile: "ordered" }],
        metrics: m(0, 0, 0, 0),
        position: { x: 360, y: 60 },
        state: "stopped",
      },
    ],
    links: [
      { id: "r1", from: { node: "camera", port: "video" }, to: { node: "mp4sink", port: "encoded_video_from_upstream" }, kind: "video", ratePerSec: 0, dropped: 0 },
    ],
  },
]

export interface CatalogEntry {
  className: string
  label: string
  category: NodeCategory
  origin: NodeOrigin
  pack?: string
  description: string
  inputs: DataKind[]
  outputs: DataKind[]
  preview?: Scene
}

export const nodeCatalog: CatalogEntry[] = [
  { className: "tatolab.stream:CameraSource", label: "Camera", category: "source", origin: "built-in", description: "Frames from any camera this machine sees.", inputs: [], outputs: ["video"], preview: "camera" },
  { className: "tatolab.stream:MicrophoneSource", label: "Microphone", category: "source", origin: "built-in", description: "Audio from a mic or interface.", inputs: [], outputs: ["audio"], preview: "waveform" },
  { className: "tatolab.stream:TestPatternSource", label: "Test pattern", category: "source", origin: "built-in", description: "Colour bars, no camera needed.", inputs: [], outputs: ["video"], preview: "pattern" },
  { className: "tatolab.stream:RelaySource", label: "Relay source", category: "relay", origin: "built-in", description: "Read a broadcast from any relay or machine.", inputs: [], outputs: ["encoded"], preview: "drone" },
  { className: "tatolab.stream:H264Encoder", label: "H.264 encoder", category: "codec", origin: "built-in", description: "Hardware encode, CPU where the GPU can't.", inputs: ["video"], outputs: ["encoded"] },
  { className: "tatolab.stream:H264Decoder", label: "H.264 decoder", category: "codec", origin: "built-in", description: "Hardware decode to GPU frames.", inputs: ["encoded"], outputs: ["video"] },
  { className: "tatolab.stream:H265Encoder", label: "H.265 encoder", category: "codec", origin: "built-in", description: "HEVC for smaller files.", inputs: ["video"], outputs: ["encoded"] },
  { className: "tatolab.stream:OpusEncoder", label: "Opus encoder", category: "codec", origin: "built-in", description: "Speech and music, low latency.", inputs: ["audio"], outputs: ["encoded"] },
  { className: "tatolab.stream:Mp4Sink", label: "Recorder (MP4)", category: "sink", origin: "built-in", description: "Fragmented MP4 to disk.", inputs: ["encoded"], outputs: [] },
  { className: "tatolab.stream:SpeakerSink", label: "Speakers", category: "sink", origin: "built-in", description: "Play audio out loud.", inputs: ["audio"], outputs: [] },
  { className: "tatolab.stream:VirtualCameraSink", label: "Virtual camera", category: "sink", origin: "built-in", description: "Appear in Zoom, Meet and OBS.", inputs: ["video"], outputs: [] },
  { className: "effects:Vignette", label: "Vignette", category: "effect", origin: "python", description: "A GLSL pixel effect you can edit live.", inputs: ["video"], outputs: ["video"], preview: "vignette" },
  { className: "effects:Halftone", label: "Halftone", category: "effect", origin: "python", description: "Newspaper-print dots.", inputs: ["video"], outputs: ["video"], preview: "halftone" },
  { className: "effects:Invert", label: "Invert", category: "effect", origin: "python", description: "Flip every colour.", inputs: ["video"], outputs: ["video"], preview: "inverted" },
  { className: "vision_pack:ObjectDetector", label: "Object detector", category: "ai", origin: "pack", pack: "vision-pack 2.0", description: "YOLO on the GPU, boxes out.", inputs: ["video"], outputs: ["data", "video"], preview: "detect" },
  { className: "vision_pack:DepthEstimator", label: "Depth estimator", category: "ai", origin: "pack", pack: "vision-pack 2.0", description: "Per-pixel depth from one camera.", inputs: ["video"], outputs: ["tensor"], preview: "depth" },
  { className: "warehouse_pack:PeopleCounter", label: "People counter", category: "ai", origin: "pack", pack: "warehouse-pack 0.9", description: "Count crossings of a line.", inputs: ["video"], outputs: ["data", "tensor"], preview: "thermal" },
  { className: "audio_pack:Denoise", label: "Denoise", category: "effect", origin: "pack", pack: "audio-pack 1.4", description: "Remove fans, hum and keyboard.", inputs: ["audio"], outputs: ["audio"], preview: "spectrum" },
  { className: "agents:LiveWatcher", label: "Agent watcher", category: "ai", origin: "pack", pack: "agents 0.3", description: "Let an AI agent watch and answer questions.", inputs: ["video", "audio"], outputs: ["data"] },
]

export const templates = [
  { id: "camera-effect", title: "Camera + effect", blurb: "Your webcam through one GPU effect, in a preview.", scene: "vignette" as Scene, steps: 3, minutes: 1 },
  { id: "detect", title: "Spot people", blurb: "Run an object detector on live video and box what it finds.", scene: "detect" as Scene, steps: 4, minutes: 3 },
  { id: "broadcast", title: "Go live", blurb: "Encode a camera and broadcast it through a relay.", scene: "camera" as Scene, steps: 3, minutes: 2 },
  { id: "podcast", title: "Clean podcast mic", blurb: "Denoise, a touch of room, and an Opus broadcast.", scene: "waveform" as Scene, steps: 4, minutes: 2 },
  { id: "virtual-cam", title: "Virtual camera", blurb: "Show up in Zoom as anything you can draw.", scene: "halftone" as Scene, steps: 3, minutes: 1 },
  { id: "drone", title: "Field drone", blurb: "Read a drone's broadcast, detect, and relay to the crew.", scene: "drone" as Scene, steps: 5, minutes: 5 },
]

export interface LogRecord {
  t: string
  level: "debug" | "info" | "warn" | "error"
  node: string
  message: string
  fields?: Record<string, string | number>
}

export const logs: LogRecord[] = [
  { t: "21:14:03.118", level: "info", node: "camera", message: "opened device", fields: { device: "/dev/video0", format: "NV12", size: "1920x1080" } },
  { t: "21:14:03.402", level: "info", node: "persondetector", message: "model loaded", fields: { model: "yolo11n.onnx", provider: "TensorRT", ms: 284 } },
  { t: "21:14:04.612", level: "info", node: "persondetector", message: "people in frame", fields: { count: 1, best: 0.94 } },
  { t: "21:14:04.890", level: "warn", node: "persondetector", message: "frame arrived late; newest-profile drained 2 stale frames", fields: { dropped: 2, behind_ms: 41 } },
  { t: "21:14:05.013", level: "info", node: "doorbell", message: "presence started", fields: { zone: "porch" } },
  { t: "21:14:05.613", level: "info", node: "persondetector", message: "people in frame", fields: { count: 2, best: 0.91 } },
  { t: "21:14:06.201", level: "debug", node: "h264encoder", message: "keyframe", fields: { group: 1182, bytes: 148213 } },
  { t: "21:14:06.614", level: "info", node: "persondetector", message: "people in frame", fields: { count: 2, best: 0.89 } },
  { t: "21:14:07.002", level: "info", node: "doorbell", message: "notified", fields: { to: "Jonathan's iPhone" } },
  { t: "21:14:07.615", level: "info", node: "persondetector", message: "people in frame", fields: { count: 1, best: 0.93 } },
  { t: "21:14:08.990", level: "error", node: "mp4sink", message: "disk 91% full; rotating oldest recording", fields: { freed_gb: 12.4 } },
  { t: "21:14:09.210", level: "info", node: "boxoverlay", message: "reloaded after save", fields: { file: "nodes/box_overlay.py" } },
]

export const streamById = (id: string) => streams.find((s) => s.id === id)
export const machineById = (id: string) => machines.find((x) => x.id === id)
export const relayById = (id: string) => relays.find((x) => x.id === id)

/** Deterministic pseudo-random series for sparklines and charts. */
export function series(seed: number, length: number, base: number, spread: number) {
  let s = seed
  const out: number[] = []
  for (let i = 0; i < length; i++) {
    s = (s * 9301 + 49297) % 233280
    const r = s / 233280
    const wave = Math.sin(i / 4 + seed) * spread * 0.4
    out.push(Math.max(0, +(base + wave + (r - 0.5) * spread).toFixed(2)))
  }
  return out
}
