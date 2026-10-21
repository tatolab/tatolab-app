// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import {
  type Exposure,
  machineById,
  type NodeSpec,
  type PortSpec,
  relayById,
  type Scene,
  type StreamSpec,
  type StreamStatus,
} from "@/data/mock"
import { runModeWords } from "@/lib/vocab"

export interface StreamOutput {
  key: string
  node: NodeSpec
  port: PortSpec
  exposure: Exposure
  scene?: Scene
}

export function isRunning(stream: StreamSpec) {
  return stream.status === "live" || stream.status === "attention"
}

/** Kahn's order over the links, ties broken by declaration order. */
export function pipelineOrder(stream: StreamSpec): NodeSpec[] {
  const indegree = new Map(stream.nodes.map((n) => [n.id, 0]))
  for (const l of stream.links) indegree.set(l.to.node, (indegree.get(l.to.node) ?? 0) + 1)
  const ordered: NodeSpec[] = []
  const done = new Set<string>()
  while (ordered.length < stream.nodes.length) {
    const next = stream.nodes.find((n) => !done.has(n.id) && (indegree.get(n.id) ?? 0) === 0) ?? stream.nodes.find((n) => !done.has(n.id))!
    done.add(next.id)
    ordered.push(next)
    for (const l of stream.links) if (l.from.node === next.id) indegree.set(l.to.node, (indegree.get(l.to.node) ?? 1) - 1)
  }
  return ordered
}

export function streamOutputs(stream: StreamSpec): StreamOutput[] {
  return pipelineOrder(stream).flatMap((node) =>
    node.ports
      .filter((p) => p.direction === "out")
      .map((port) => ({
        key: `${node.id}/${port.name}`,
        node,
        port,
        exposure: port.exposure ?? "internal",
        scene: port.preview ?? (port.exposure && port.kind !== "encoded" && port.kind !== "data" ? node.preview : undefined),
      })),
  )
}

export function previewableOutputs(stream: StreamSpec) {
  return streamOutputs(stream).filter((o) => o.scene)
}

const exposureRank: Record<Exposure, number> = { public: 0, private: 1, internal: 2 }

export function primaryOutput(stream: StreamSpec): StreamOutput | undefined {
  const outs = previewableOutputs(stream)
  return [...outs].sort((a, b) => exposureRank[a.exposure] - exposureRank[b.exposure] || outs.indexOf(b) - outs.indexOf(a))[0]
}

export function portAddress(stream: StreamSpec, nodeId: string, port: string) {
  return `${stream.machine}/${stream.id}/${nodeId}/${port}`
}

export function isAudioOutput(o?: StreamOutput) {
  return o?.port.kind === "audio"
}

export function problemNode(stream: StreamSpec) {
  return stream.nodes.find((n) => n.state === "stalled" || n.state === "crashed")
}

/** Share of upstream frames a stalled step fails to keep up with. */
export function dropShare(stream: StreamSpec, node: NodeSpec) {
  const inbound = stream.links.find((l) => l.to.node === node.id)
  if (!inbound || !inbound.ratePerSec) return 0
  return Math.round((1 - node.metrics.fps / inbound.ratePerSec) * 100)
}

export const exitInfo: Record<string, { code: number; at: string; reason: string; node: string }> = {
  "lobby-recorder": { code: 1, at: "03:12", reason: "camera not found", node: "camera" },
}

export function exitFor(stream: StreamSpec) {
  return exitInfo[stream.id] ?? { code: 1, at: "—", reason: stream.statusDetail.toLowerCase(), node: stream.nodes[0].id }
}

export const runtimeStatus: Record<StreamStatus, string> = {
  live: "running",
  attention: "running",
  starting: "starting",
  paused: "stopped",
  failed: "failed",
}

export function venvPath(stream: StreamSpec) {
  return `${stream.project}/.venv`
}

const startedAt: Record<string, string> = {
  "front-door": "2026-10-14T17:02:11.408Z",
  "studio-voice": "2026-10-20T19:01:44.120Z",
  "halftone-booth": "2026-10-20T21:00:12.733Z",
  "dock-4": "2026-09-29T14:12:09.051Z",
  "lobby-wall": "2026-10-17T09:48:30.912Z",
}

function hashId(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0).toString(16).padStart(8, "0")
}

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

/** What `tatolab inspect <stream>` prints. */
export function inspectDocument(stream: StreamSpec): { [k: string]: Json } {
  const machine = machineById(stream.machine)!
  const exit = stream.status === "failed" ? exitFor(stream) : undefined
  return {
    id: `strm_${hashId(stream.id)}${hashId(stream.machine).slice(0, 4)}`,
    stream: stream.id,
    machine: {
      name: machine.name,
      address: machine.address,
      os: machine.os,
      gpu: machine.gpu,
      runtime: `tatolabd ${machine.runtimeVersion}`,
    },
    state: {
      status: runtimeStatus[stream.status],
      run_mode: runModeWords[stream.runMode].runtimeTerm,
      started_at: startedAt[stream.id] ?? null,
      restarts: stream.restarts,
      exit_code: exit ? exit.code : null,
      error: exit ? exit.reason : null,
      failed_node: exit ? exit.node : null,
    },
    project: {
      path: stream.project,
      entry: stream.entry,
      python: stream.python,
      venv: venvPath(stream),
    },
    nodes: pipelineOrder(stream).map((n) => ({
      name: n.id,
      class: n.className,
      origin: n.origin === "python" ? "python" : n.origin === "pack" ? `pack:${n.pack}` : "built-in",
      state: n.state ?? "running",
      process: n.pid ? { pid: n.pid, interpreter: `${venvPath(stream)}/bin/python${stream.python}` } : n.origin === "built-in" ? "runtime" : null,
      ports: n.ports.map((p) => {
        const port: { [k: string]: Json } = { name: p.name, direction: p.direction, kind: p.kind }
        if (p.deliveryProfile) port.delivery = p.deliveryProfile
        if (p.direction === "out") port.exposure = p.exposure ?? "internal"
        return port
      }),
      config: n.config ?? {},
      metrics: { fps: n.metrics.fps, latency_ms: n.metrics.latencyMs, cpu_pct: n.metrics.cpu, gpu_pct: n.metrics.gpu, dropped: n.metrics.dropped },
    })),
    links: stream.links.map((l) => ({
      from: `${l.from.node}/${l.from.port}`,
      to: `${l.to.node}/${l.to.port}`,
      kind: l.kind,
      rate_per_sec: l.ratePerSec,
      dropped: l.dropped,
    })),
    exposed: streamOutputs(stream)
      .filter((o) => o.exposure !== "internal")
      .map((o) => ({
        address: portAddress(stream, o.node.id, o.port.name),
        exposure: o.exposure,
        relays: o.exposure === "public" ? stream.relays : [],
      })),
  }
}

export interface EnvVar {
  name: string
  value: string
  secret?: boolean
  source: "runtime" | "project" | "machine"
}

export function environmentFor(stream: StreamSpec): EnvVar[] {
  const machine = machineById(stream.machine)!
  const vars: EnvVar[] = [
    { name: "TATOLAB_STREAM", value: stream.id, source: "runtime" },
    { name: "TATOLAB_MACHINE", value: machine.name, source: "runtime" },
    { name: "TATOLAB_RUNTIME_SOCKET", value: machine.kind === "mac" ? "~/Library/Application Support/Tatolab/tatolabd.sock" : "/run/tatolab/tatolabd.sock", source: "runtime" },
    { name: "VIRTUAL_ENV", value: venvPath(stream), source: "runtime" },
    { name: "PYTHONUNBUFFERED", value: "1", source: "runtime" },
  ]
  if (machine.kind === "jetson" || machine.kind === "linux-box") vars.push({ name: "CUDA_VISIBLE_DEVICES", value: "0", source: "machine" })
  if (stream.nodes.some((n) => n.category === "ai")) vars.push({ name: "OMP_NUM_THREADS", value: "4", source: "project" })
  for (const r of stream.relays) {
    const relay = relayById(r)
    if (relay?.credential === "token") vars.push({ name: `${r.toUpperCase()}_RELAY_TOKEN`, value: "cf_rly_8Hq2vT0pZk3nW", secret: true, source: "machine" })
    if (relay?.credential === "expiring" || relay?.credential === "key") vars.push({ name: `${r.toUpperCase()}_RELAY_KEY`, value: "mqp_live_41fe90cc2a", secret: true, source: "machine" })
  }
  if (stream.id === "front-door") vars.push({ name: "DOORBELL_PUSH_TARGET", value: "jonathan-iphone", source: "project" })
  return vars
}

export function packagesFor(stream: StreamSpec): [string, string][] {
  const machine = machineById(stream.machine)!
  const pkgs: [string, string][] = [["tatolab-stream", machine.runtimeVersion]]
  const ai = stream.nodes.some((n) => n.category === "ai")
  const video = stream.nodes.some((n) => n.ports.some((p) => p.kind === "video"))
  const audio = stream.nodes.some((n) => n.ports.some((p) => p.kind === "audio"))
  pkgs.push(["numpy", "2.3.4"])
  if (video) pkgs.push(["opencv-python-headless", "4.12.0.88"])
  if (ai) pkgs.push(["onnxruntime-gpu", "1.23.1"])
  if (audio) pkgs.push(["scipy", "1.16.2"])
  for (const n of stream.nodes) if (n.pack) pkgs.push([n.pack.split(" ")[0], n.pack.split(" ")[1]])
  return pkgs
}
