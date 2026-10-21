// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { type Json, pipelineOrder, type StreamOutput, streamOutputs } from "@/components/stream-overview/model"
import type { CatalogEntry, Exposure, LinkSpec, NodeSpec, StreamSpec } from "@/data/mock"
import { thisMachine, type TodayStream, todayRelays } from "../../data"

export type TodayNodeState = "running" | "starting" | "stopped" | "not-loaded"

/** `refused_bags_by_output_port`, keyed `stream/node.port`; absent means zero. */
const refusedBags: Record<string, number> = {
  "dock-4/camera.video": 212,
}

/** `records_no_longer_held` on the first `logs` read of a loaded stream. */
const recordsNoLongerHeld: Record<string, number> = {
  "front-door": 312,
  "studio-voice": 88,
  "halftone-booth": 41,
  "dock-4": 1906,
  "lobby-wall": 140,
}

const noMetrics = { fps: 0, latencyMs: 0, cpu: 0, gpu: 0, dropped: 0 }

/** A node as the runtime's `graph` serves it: no metrics, no pid, previews only on exposed ports. */
export function todayNode(stream: TodayStream, node: NodeSpec): NodeSpec {
  const ports = node.ports.map((p) => {
    if (p.direction === "in") return p
    const exposed = p.exposure && p.exposure !== "internal"
    const scene = p.preview ?? (p.kind !== "data" && p.kind !== "encoded" ? node.preview : undefined)
    return { ...p, preview: exposed ? scene : undefined }
  })
  return {
    ...node,
    origin: node.origin === "built-in" ? "built-in" : "python",
    pack: undefined,
    pid: undefined,
    ports,
    preview: ports.find((p) => p.direction === "out" && p.preview)?.preview,
    metrics: noMetrics,
    state: stream.loaded ? "running" : "stopped",
  }
}

/** The stream with its nodes reshaped to what `graph` serves. */
export function todayGraphStream(stream: TodayStream): TodayStream {
  return { ...stream, nodes: stream.nodes.map((n) => todayNode(stream, n)) }
}

/** The preview scene a port would carry once exposed. */
export function sceneWhenExposed(original: TodayStream, nodeId: string, port: string) {
  const node = original.nodes.find((n) => n.id === nodeId)
  const p = node?.ports.find((x) => x.name === port)
  if (!node || !p) return undefined
  return p.preview ?? (p.kind !== "data" && p.kind !== "encoded" ? node.preview : undefined)
}

export function nodeStateOf(stream: TodayStream, node: NodeSpec): TodayNodeState {
  if (!stream.loaded) return "not-loaded"
  if (node.state === "starting") return "starting"
  if (node.state === "stopped") return "stopped"
  return "running"
}

export const nodeStateWords: Record<TodayNodeState, { label: string; tone: string; runtime: string }> = {
  running: { label: "Running", tone: "text-fg-2", runtime: "running" },
  starting: { label: "Starting", tone: "text-fg-2", runtime: "starting" },
  stopped: { label: "Stopped", tone: "text-fg-3", runtime: "stopped" },
  "not-loaded": { label: "Not loaded", tone: "text-fg-3", runtime: "—" },
}

export function inboundLinks(links: LinkSpec[], nodeId: string) {
  return links.filter((l) => l.to.node === nodeId)
}

export function droppedInto(links: LinkSpec[], nodeId: string) {
  return inboundLinks(links, nodeId).reduce((a, l) => a + l.dropped, 0)
}

export function refusedBy(stream: StreamSpec, nodeId: string, port: string) {
  return refusedBags[`${stream.id}/${nodeId}.${port}`] ?? 0
}

export function refusedByNode(stream: StreamSpec, node: NodeSpec): Record<string, number> {
  return Object.fromEntries(node.ports.filter((p) => p.direction === "out").map((p) => [p.name, refusedBy(stream, node.id, p.name)]))
}

export function recordsNotHeld(stream: StreamSpec) {
  return recordsNoLongerHeld[stream.id] ?? 0
}

export function jsonlPath(stream: StreamSpec) {
  return `${stream.project}/.streamlib/${stream.id}.jsonl`
}

/** `machine/stream/node/port`. */
export function portAddress(stream: StreamSpec, nodeId: string, port: string) {
  return `${thisMachine.name}/${stream.id}/${nodeId}/${port}`
}

const loopback = todayRelays.find((r) => r.relayId === "local-loopback")!

/** The runtime's loopback preview page for an exposed port. */
export function watchUrl(stream: StreamSpec, nodeId: string, port: string) {
  return `http://localhost:${loopback.settings.port}/watch/${portAddress(stream, nodeId, port)}`
}

export const exposureFlag: Record<Exposure, string> = { internal: " --internal", private: "", public: " --public" }

export function exposeCommand(stream: StreamSpec, nodeId: string, port: string, level: Exposure) {
  return `tatolab expose ${stream.id} ${nodeId} ${port}${exposureFlag[level]}`
}

/** Exposed outputs a person can watch: exposed, and video or audio. */
export function watchableOutputs(stream: StreamSpec): StreamOutput[] {
  return streamOutputs(stream).filter((o) => o.exposure !== "internal" && o.scene && (o.port.kind === "video" || o.port.kind === "audio"))
}

const exposureRank: Record<Exposure, number> = { public: 0, private: 1, internal: 2 }

export function primaryWatchable(stream: StreamSpec) {
  const outs = watchableOutputs(stream)
  return [...outs].sort((a, b) => exposureRank[a.exposure] - exposureRank[b.exposure] || outs.indexOf(b) - outs.indexOf(a))[0]
}

export function streamInstanceNumber(stream: TodayStream) {
  return stream.streamInstance?.split("#")[1]
}

/** The `streamlib://node-catalog` resource: built-ins plus the Python classes the project's venv can import. */
const builtInCatalog: CatalogEntry[] = [
  { className: "tatolab.stream:CameraSource", label: "Camera", category: "source", origin: "built-in", description: "Frames from a camera this machine sees.", inputs: [], outputs: ["video"], preview: "camera" },
  { className: "tatolab.stream:MicrophoneSource", label: "Microphone", category: "source", origin: "built-in", description: "Audio from a mic or interface.", inputs: [], outputs: ["audio"], preview: "waveform" },
  { className: "tatolab.stream:TestPatternSource", label: "Test pattern", category: "source", origin: "built-in", description: "Colour bars, no camera needed.", inputs: [], outputs: ["video"], preview: "pattern" },
  { className: "tatolab.stream:RelayTrackSource", label: "Relay track", category: "relay", origin: "built-in", description: "Read a track from a relay.", inputs: [], outputs: ["encoded"] },
  { className: "tatolab.stream:H264Encoder", label: "H.264 encoder", category: "codec", origin: "built-in", description: "Hardware encode.", inputs: ["video"], outputs: ["encoded"] },
  { className: "tatolab.stream:OpusEncoder", label: "Opus encoder", category: "codec", origin: "built-in", description: "Speech and music, low latency.", inputs: ["audio"], outputs: ["encoded"] },
  { className: "tatolab.stream:Mp4Sink", label: "MP4 sink", category: "sink", origin: "built-in", description: "Fragmented MP4 to disk.", inputs: ["encoded"], outputs: [] },
  { className: "tatolab.stream:SpeakerSink", label: "Speakers", category: "sink", origin: "built-in", description: "Play audio out loud.", inputs: ["audio"], outputs: [] },
  { className: "tatolab.stream:VirtualCameraSink", label: "Virtual camera", category: "sink", origin: "built-in", description: "Appear in Zoom, Meet and OBS.", inputs: ["video"], outputs: [] },
]

const venvExtras: CatalogEntry[] = [
  { className: "nodes.inverting_effect:InvertingEffect", label: "InvertingEffect", category: "effect", origin: "python", description: "nodes/inverting_effect.py", inputs: ["video"], outputs: ["video"], preview: "inverted" },
]

export function todayCatalog(stream: StreamSpec): CatalogEntry[] {
  const seen = new Set<string>()
  const project: CatalogEntry[] = []
  for (const n of stream.nodes) {
    if (n.origin === "built-in" || seen.has(n.className)) continue
    seen.add(n.className)
    project.push({
      className: n.className,
      label: n.className.split(":")[1] ?? n.label,
      category: n.category,
      origin: "python",
      description: n.file ?? n.className.split(":")[0],
      inputs: [...new Set(n.ports.filter((p) => p.direction === "in").map((p) => p.kind))],
      outputs: n.ports.filter((p) => p.direction === "out").map((p) => p.kind),
      preview: n.preview,
    })
  }
  for (const e of venvExtras) if (!seen.has(e.className) && stream.id === "halftone-booth") project.push(e)
  return [...builtInCatalog, ...project]
}

/** What `tatolab graph --stream <name>` prints for a loaded stream. */
export function graphDocument(stream: TodayStream, recordedLevels = stream.state === "kept"): { [k: string]: Json } {
  const nodes = pipelineOrder(stream)
  return {
    machine: thisMachine.name,
    stream: stream.id,
    nodes: nodes.map((n) => {
      const spec = todayNode(stream, n)
      const refused = refusedByNode(stream, n)
      return {
        name: n.id,
        type: n.className,
        config: (n.config ?? {}) as { [k: string]: Json },
        ports: {
          inputs: n.ports.filter((p) => p.direction === "in").map((p) => p.name),
          outputs: n.ports.filter((p) => p.direction === "out").map((p) => p.name),
        },
        state: nodeStateWords[nodeStateOf(stream, spec)].runtime,
        metrics: {
          dropped_bags_by_link: Object.fromEntries(
            stream.links.filter((l) => l.to.node === n.id).map((l) => [l.id, l.dropped]),
          ) as { [k: string]: Json },
          refused_bags_by_output_port: refused,
        },
      }
    }),
    links: stream.links.map((l) => ({
      id: l.id,
      from: { node: l.from.node, port: l.from.port },
      to: { node: l.to.node, port: l.to.port },
      state: "connected",
    })),
    exposed: streamOutputs(stream)
      .filter((o) => o.exposure !== "internal")
      .map((o) => ({ node: o.node.id, port: o.port.name, level: o.exposure, recorded: recordedLevels })),
  }
}
