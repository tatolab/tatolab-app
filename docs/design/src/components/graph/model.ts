// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { Edge, Node } from "@xyflow/react"
import type { CatalogEntry, DataKind, LinkSpec, NodeSpec, PortSpec, StreamSpec } from "@/data/mock"

export const NODE_WIDTH = 248
export const PREVIEW_HEIGHT = Math.round(((NODE_WIDTH - 2 - 16) * 9) / 16)

export type StepNodeData = { spec: NodeSpec; crash?: { message: string; detail: string } }
export type StepNode = Node<StepNodeData, "step">
export type LinkEdgeData = { link: LinkSpec }
export type LinkEdge = Edge<LinkEdgeData, "link">

export const inHandle = (port: string) => `in:${port}`
export const outHandle = (port: string) => `out:${port}`
export const portFromHandle = (handle?: string | null) => (handle ?? "").replace(/^(in|out):/, "")

const crashes: Record<string, { message: string; detail: string }> = {
  "lobby-recorder/camera": { message: "Camera not found · exit 1", detail: "Restarted 7 times since 03:12" },
}

export function estimateHeight(spec: NodeSpec, showPreviews: boolean, showMetrics: boolean, crashed: boolean) {
  const ports = spec.ports.length
  const preview = showPreviews && spec.preview ? PREVIEW_HEIGHT + 8 : 0
  const problem = spec.metrics.dropped > 0 || spec.state === "stalled"
  const footer = (showMetrics ? 24 : 0) + (problem ? 18 : 0) || 24
  return 32 + preview + ports * 24 + 8 + footer + (crashed ? 72 : 0)
}

function resolveColumnOverlaps(nodes: StepNode[], showPreviews: boolean, showMetrics: boolean) {
  const columns = new Map<number, StepNode[]>()
  for (const n of nodes) {
    const key = Math.round(n.position.x / 40)
    columns.set(key, [...(columns.get(key) ?? []), n])
  }
  for (const col of columns.values()) {
    col.sort((a, b) => a.position.y - b.position.y)
    let floor = -Infinity
    for (const n of col) {
      if (n.position.y < floor) n.position = { ...n.position, y: floor }
      floor = n.position.y + estimateHeight(n.data.spec, showPreviews, showMetrics, !!n.data.crash) + 40
    }
  }
  return nodes
}

export function buildGraph(stream: StreamSpec, selectedId: string | null): { nodes: StepNode[]; edges: LinkEdge[] } {
  const nodes: StepNode[] = stream.nodes.map((spec) => ({
    id: spec.id,
    type: "step",
    position: { x: spec.position.x * 1.1, y: spec.position.y * 1.6 },
    data: { spec, crash: spec.state === "crashed" ? (crashes[`${stream.id}/${spec.id}`] ?? { message: "Exited · exit 1", detail: "" }) : undefined },
    selected: spec.id === selectedId,
    width: NODE_WIDTH,
  }))
  resolveColumnOverlaps(nodes, true, true)
  const edges: LinkEdge[] = stream.links.map((link) => linkToEdge(link))
  return { nodes, edges }
}

export function linkToEdge(link: LinkSpec): LinkEdge {
  return {
    id: link.id,
    type: "link",
    source: link.from.node,
    sourceHandle: outHandle(link.from.port),
    target: link.to.node,
    targetHandle: inHandle(link.to.port),
    data: { link },
  }
}

export function autoLayout(nodes: StepNode[], edges: LinkEdge[], showPreviews: boolean, showMetrics: boolean): StepNode[] {
  const preds = new Map<string, string[]>()
  for (const n of nodes) preds.set(n.id, [])
  for (const e of edges) preds.get(e.target)?.push(e.source)
  const rank = new Map<string, number>()
  const visit = (id: string, seen: Set<string>): number => {
    if (rank.has(id)) return rank.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const r = Math.max(-1, ...(preds.get(id) ?? []).map((p) => visit(p, seen))) + 1
    rank.set(id, r)
    return r
  }
  for (const n of nodes) visit(n.id, new Set())
  const columns: StepNode[][] = []
  for (const n of nodes) (columns[rank.get(n.id)!] ??= []).push(n)
  const placedY = new Map<string, number>()
  const out = new Map<string, { x: number; y: number }>()
  columns.forEach((col, ci) => {
    const order = col
      .map((n) => {
        const ps = preds.get(n.id) ?? []
        const ys = ps.map((p) => placedY.get(p)).filter((y): y is number => y !== undefined)
        return { n, key: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : n.position.y }
      })
      .sort((a, b) => a.key - b.key)
    const heights = order.map(({ n }) => n.measured?.height ?? estimateHeight(n.data.spec, showPreviews, showMetrics, !!n.data.crash))
    const total = heights.reduce((a, b) => a + b, 0) + (order.length - 1) * 48
    let y = -total / 2
    order.forEach(({ n }, i) => {
      out.set(n.id, { x: ci * (NODE_WIDTH + 120), y })
      placedY.set(n.id, y + heights[i] / 2)
      y += heights[i] + 48
    })
  })
  return nodes.map((n) => ({ ...n, position: out.get(n.id) ?? n.position }))
}

const portName = (kind: DataKind, direction: "in" | "out", isSource: boolean) =>
  direction === "in" ? `${kind === "encoded" ? "encoded_video" : kind}_from_upstream` : isSource ? kind : `${kind === "encoded" ? "encoded_video" : kind}_to_downstream`

export function specFromCatalog(entry: CatalogEntry, id: string, position: { x: number; y: number }): NodeSpec {
  const isSource = entry.inputs.length === 0
  const ports: PortSpec[] = [
    ...entry.inputs.map((kind) => ({ name: portName(kind, "in", false), direction: "in" as const, kind, deliveryProfile: "newest" as const })),
    ...entry.outputs.map((kind, i) => ({
      name: entry.outputs.indexOf(kind) !== i ? `${kind}_${i}` : kind === "data" ? "data" : portName(kind, "out", isSource),
      direction: "out" as const,
      kind,
      preview: kind === "data" ? undefined : entry.preview,
    })),
  ]
  const module = entry.className.split(":")[0]
  return {
    id,
    label: entry.label,
    className: entry.className,
    origin: entry.origin,
    category: entry.category,
    description: entry.description,
    file: entry.origin === "python" ? `nodes/${module.replace(/^effects$/, id)}.py` : undefined,
    pack: entry.pack,
    pid: entry.origin === "built-in" ? undefined : 50000 + Math.floor(Math.random() * 9000),
    ports,
    config: {},
    metrics: { fps: 0, latencyMs: 0, cpu: 0, gpu: 0, dropped: 0 },
    position,
    preview: entry.preview,
    state: "starting",
  }
}

export function uniqueId(base: string, taken: Set<string>) {
  const stem = base.toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (!taken.has(stem)) return stem
  let i = 2
  while (taken.has(`${stem}${i}`)) i++
  return `${stem}${i}`
}

export function portRate(spec: NodeSpec, port: string, edges: LinkEdge[]) {
  const rates = edges.filter((e) => e.source === spec.id && portFromHandle(e.sourceHandle) === port).map((e) => e.data?.link.ratePerSec ?? 0)
  return rates.length ? Math.max(...rates) : spec.metrics.fps
}

export function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString("en-US") : String(n)
}
