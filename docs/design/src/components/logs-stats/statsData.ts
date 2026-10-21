// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { type LinkSpec, type NodeSpec, series, type StreamSpec } from "@/data/mock"
import { hash, rand, runtimePid } from "./logData"

export type Range = "5m" | "1h" | "24h"

export const ranges: { id: Range; label: string; points: number; stepSec: number; caption: string }[] = [
  { id: "5m", label: "5 min", points: 60, stepSec: 5, caption: "Last 5 minutes · a sample every 5 s" },
  { id: "1h", label: "1 hour", points: 60, stepSec: 60, caption: "Last hour · a sample every minute" },
  { id: "24h", label: "24 hours", points: 96, stepSec: 900, caption: "Last 24 hours · a sample every 15 min" },
]

export interface StepStats {
  node: NodeSpec
  pid: number
  ownProcess: boolean
  interpreter: string
  cpu: number
  gpu: number
  memoryMb: number
  threads: number
  restarts: number
  uptime: string
  fps: number
  latencyMs: number
  budgetMs: number
  bottleneck: boolean
  inputDropPct: number
}

const memoryWeight: Record<NodeSpec["category"], number> = { ai: 6, effect: 2, codec: 1.6, source: 1.2, sink: 0.8, relay: 0.8, analysis: 0.7 }

const restartOverrides: Record<string, Record<string, { restarts: number; uptime: string }>> = {
  "dock-4": { peoplecounter: { restarts: 2, uptime: "47s" } },
  "halftone-booth": { halftone: { restarts: 4, uptime: "36s" } },
  "lobby-recorder": { camera: { restarts: 7, uptime: "—" } },
}

/** Dropped messages per minute on each link, now. */
const dropRates: Record<string, Record<string, number>> = {
  "dock-4": { d1: 162 },
  "front-door": { l3: 1.4 },
}

export const targetFps = (s: StreamSpec) => Math.max(...s.nodes.map((n) => n.metrics.fps), s.fps) || 30

export const isRunning = (s: StreamSpec) => s.status === "live" || s.status === "attention"

export function linkDropRate(stream: StreamSpec, link: LinkSpec) {
  return dropRates[stream.id]?.[link.id] ?? 0
}

export function linkLabel(stream: StreamSpec, link: LinkSpec) {
  return `${link.from.node}.${link.from.port} → ${link.to.node}.${link.to.port}`
}

export function stepStats(stream: StreamSpec): StepStats[] {
  const running = isRunning(stream)
  const weights = stream.nodes.map((n) => memoryWeight[n.category] + (n.origin === "built-in" ? 0 : 1.4))
  const total = weights.reduce((a, b) => a + b, 0)
  const budgetMs = 1000 / targetFps(stream)
  return stream.nodes.map((n, i) => {
    const r = rand(hash(stream.id + n.id))
    const own = n.origin !== "built-in"
    const override = restartOverrides[stream.id]?.[n.id]
    const inbound = stream.links.filter((l) => l.to.node === n.id)
    const inRate = inbound.reduce((a, l) => a + l.ratePerSec, 0)
    const dropPerMin = inbound.reduce((a, l) => a + linkDropRate(stream, l), 0)
    return {
      node: n,
      pid: n.pid ?? (own ? 50000 + (hash(stream.id + n.id) % 9000) : runtimePid[stream.machine]),
      ownProcess: own,
      interpreter: own ? `Python ${stream.python} · own process` : "runtime",
      cpu: running ? n.metrics.cpu : 0,
      gpu: running ? n.metrics.gpu : 0,
      memoryMb: running ? Math.round((stream.memoryMb * weights[i]) / total) : 0,
      threads: running ? (own ? 5 + Math.floor(r() * 6) : 2 + Math.floor(r() * 2)) : 0,
      restarts: override?.restarts ?? 0,
      uptime: running ? (override?.uptime ?? stream.uptime) : "—",
      fps: running ? n.metrics.fps : 0,
      latencyMs: running ? n.metrics.latencyMs : 0,
      budgetMs,
      bottleneck: running && n.metrics.latencyMs > budgetMs,
      inputDropPct: inRate ? Math.round((dropPerMin / 60 / inRate) * 1000) / 10 : 0,
    }
  })
}

function clock(endMs: number, offsetSec: number, withSeconds: boolean) {
  const t = new Date(endMs - offsetSec * 1000).toISOString()
  return withSeconds ? t.slice(11, 19) : t.slice(11, 16)
}

const end = Date.parse("2026-10-20T21:14:00Z")

export function fpsSeries(stream: StreamSpec, range: Range) {
  const spec = ranges.find((r) => r.id === range)!
  const lines = stream.nodes.map((n, i) => {
    const seed = (hash(stream.id + n.id + range) % 997) + i
    const spread = n.metrics.fps < targetFps(stream) * 0.95 ? 3.2 : 0.18
    return series(seed, spec.points, n.metrics.fps, spread).map((v) => Math.min(v, n.metrics.fps + 0.3))
  })
  return Array.from({ length: spec.points }, (_, p) => {
    const row: Record<string, number | string> = { t: clock(end, (spec.points - 1 - p) * spec.stepSec, range === "5m") }
    stream.nodes.forEach((n, i) => (row[n.id] = +lines[i][p].toFixed(1)))
    return row
  })
}

export const seriesColor = (i: number) => `var(--series-${(i % 8) + 1})`

export function dropSeries(stream: StreamSpec, range: Range) {
  const spec = ranges.find((r) => r.id === range)!
  const r = rand(hash(stream.id + range + "drops"))
  return Array.from({ length: spec.points }, (_, p) => {
    const row: Record<string, number | string> = { t: clock(end, (spec.points - 1 - p) * spec.stepSec, range === "5m") }
    let total = 0
    for (const l of stream.links) {
      const perMin = linkDropRate(stream, l)
      let v = 0
      if (perMin >= 20) v = Math.max(0, perMin + (r() - 0.5) * perMin * 0.35 + Math.sin(p / 5) * perMin * 0.12)
      else if (perMin > 0) v = r() > 0.82 ? 1 + Math.floor(r() * 3) : 0
      row[l.id] = Math.round(v)
      total += Math.round(v)
    }
    row.dropped = total
    return row as { t: string; dropped: number } & Record<string, number | string>
  })
}

export function resourceSeries(stream: StreamSpec, key: "cpu" | "gpu" | "memoryMb", range: Range) {
  const spec = ranges.find((r) => r.id === range)!
  const base = stream[key]
  return series(hash(stream.id + key + range) % 991, spec.points, base, Math.max(1, base * (key === "memoryMb" ? 0.04 : 0.22)))
}
