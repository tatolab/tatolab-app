// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AddStepPanel, STEP_DRAG_TYPE } from "@/components/graph/AddStepPanel"
import { type GraphUi, GraphUiContext } from "@/components/graph/context"
import { GraphToolbar } from "@/components/graph/GraphToolbar"
import { NodeInspector, StreamSummary } from "@/components/graph/Inspector"
import { LinkEdge } from "@/components/graph/LinkEdge"
import {
  autoLayout,
  buildGraph,
  type LinkEdge as LinkEdgeType,
  linkToEdge,
  NODE_WIDTH,
  portFromHandle,
  portRate,
  specFromCatalog,
  type StepNode as StepNodeType,
  uniqueId,
} from "@/components/graph/model"
import { type PeekTarget, PinnedPreviewWindow, PortPeekPopover } from "@/components/graph/PortPeek"
import { StepNode } from "@/components/graph/StepNode"
import { type CatalogEntry, type Exposure, machineById, nodeCatalog, type NodeSpec } from "@/data/mock"
import { useStream } from "@/pages/StreamLayout"

const nodeTypes = { step: StepNode }
const edgeTypes = { link: LinkEdge }

const graphCss = `
@keyframes tl-flow { from { stroke-dashoffset: 24 } to { stroke-dashoffset: 0 } }
.tl-flow { animation: tl-flow 0.9s linear infinite }
.tl-graph .react-flow__node:focus-visible { outline: none }
.tl-graph .react-flow__handle.connectingfrom, .tl-graph .react-flow__handle.valid { background: var(--brand) !important }
.tl-graph .react-flow__connection-path { stroke: var(--brand); stroke-width: 1.5 }
.tl-graph .react-flow__minimap { border-color: var(--line); background: var(--chrome) }
`

type Snapshot = { nodes: StepNodeType[]; edges: LinkEdgeType[] }
type PinWindow = { key: string; x: number; y: number }
const fitOptions = { padding: 0.14, maxZoom: 1 }

function GraphEditor() {
  const stream = useStream()
  const machine = machineById(stream.machine)!
  const stopped = stream.status === "paused" || stream.status === "failed"
  const [params, setParams] = useSearchParams()
  const flow = useReactFlow<StepNodeType, LinkEdgeType>()
  const canvasRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [initial] = useState(() => buildGraph(stream, params.get("node")))
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNodeType>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<LinkEdgeType>(initial.edges)
  const [showPreviews, setShowPreviews] = useState(params.get("previews") !== "off")
  const [showMetrics, setShowMetrics] = useState(params.get("metrics") !== "off")
  const [leftOpen, setLeftOpen] = useState(() => (params.get("left") ? params.get("left") !== "off" : window.innerWidth >= 1600))
  const [rightOpen, setRightOpen] = useState(params.get("right") !== "off")
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [peek, setPeek] = useState<PeekTarget | null>(null)
  const peekTimer = useRef<number | undefined>(undefined)
  const [pins, setPins] = useState<PinWindow[]>([])
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])

  const selected = nodes.find((n) => n.selected) ?? null
  const selectedNodeId = selected?.id ?? null

  useEffect(() => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (selectedNodeId) next.set("node", selectedNodeId)
        else next.delete("node")
        if (pins.length) next.set("pin", pins.map((x) => x.key).join(","))
        else next.delete("pin")
        return next.toString() === p.toString() ? p : next
      },
      { replace: true },
    )
  }, [selectedNodeId, pins, setParams])

  const placePin = useCallback((key: string, index: number): PinWindow => {
    const w = canvasRef.current?.clientWidth ?? 900
    return { key, x: Math.max(12, w - 320 - 14 - index * 24), y: 14 + index * 28 }
  }, [])

  useEffect(() => {
    const keys = (params.get("pin") ?? "").split(",").filter(Boolean)
    const valid = keys.filter((k) => {
      const [n, p] = k.split(".")
      return stream.nodes.some((x) => x.id === n && x.ports.some((q) => q.name === p && q.direction === "out"))
    })
    setPins(valid.map((k, i) => placePin(k, i)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initialized = useNodesInitialized()
  const framed = useRef(false)
  useEffect(() => {
    const el = canvasRef.current
    if (!initialized || framed.current || !el) return
    framed.current = true
    const b = flow.getNodesBounds(flow.getNodes())
    const W = el.clientWidth
    const H = el.clientHeight
    const pad = 48
    const fit = Math.min((W - pad * 2) / b.width, (H - pad * 2) / b.height, 1)
    if (fit >= 0.85) {
      flow.fitView(fitOptions)
      return
    }
    const zoom = 0.85
    const focus = flow.getNodes().find((n) => n.selected)
    const x = focus ? W / 2 - (focus.position.x + NODE_WIDTH / 2) * zoom : pad - b.x * zoom
    const y = b.height * zoom > H - pad * 2 ? pad - b.y * zoom : H / 2 - (b.y + b.height / 2) * zoom
    flow.setViewport({ x: Math.min(x, pad - b.x * zoom), y, zoom })
  }, [initialized, flow])

  const snapshot = useCallback(() => {
    setPast((p) => [...p.slice(-40), { nodes, edges }])
    setFuture([])
  }, [nodes, edges])

  const undo = useCallback(() => {
    const prev = past.at(-1)
    if (!prev) return
    setFuture((f) => [...f, { nodes, edges }])
    setPast((p) => p.slice(0, -1))
    setNodes(prev.nodes)
    setEdges(prev.edges)
  }, [past, nodes, edges, setNodes, setEdges])

  const redo = useCallback(() => {
    const next = future.at(-1)
    if (!next) return
    setPast((p) => [...p, { nodes, edges }])
    setFuture((f) => f.slice(0, -1))
    setNodes(next.nodes)
    setEdges(next.edges)
  }, [future, nodes, edges, setNodes, setEdges])

  const updateNode = useCallback(
    (id: string, fn: (s: NodeSpec) => NodeSpec, crash?: StepNodeType["data"]["crash"] | null) =>
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { spec: fn(n.data.spec), crash: crash === undefined ? n.data.crash : (crash ?? undefined) } } : n,
        ),
      ),
    [setNodes],
  )

  const togglePin = useCallback(
    (key: string) => setPins((ps) => (ps.some((p) => p.key === key) ? ps.filter((p) => p.key !== key) : [...ps, placePin(key, ps.length)])),
    [placePin],
  )

  const restartNode = useCallback(
    (id: string) => {
      const crash = initial.nodes.find((n) => n.id === id)?.data.crash
      updateNode(id, (s) => ({ ...s, state: "starting" }), null)
      window.setTimeout(() => updateNode(id, (s) => ({ ...s, state: crash ? "crashed" : "running" }), crash ?? null), 1800)
    },
    [initial, updateNode],
  )

  const openPeek = useCallback(
    (nodeId: string, port: string, anchor: HTMLElement) => {
      window.clearTimeout(peekTimer.current)
      const spec = flow.getNode(nodeId)?.data.spec
      const p = spec?.ports.find((x) => x.name === port)
      if (!spec || !p) return
      setPeek({ spec, port: p, rate: portRate(spec, port, flow.getEdges()), anchor: anchor.getBoundingClientRect() })
    },
    [flow],
  )
  const closePeek = useCallback(() => {
    window.clearTimeout(peekTimer.current)
    peekTimer.current = window.setTimeout(() => setPeek(null), 140)
  }, [])

  const selectOnly = useCallback(
    (id: string | null) => {
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })))
      setEdges((es) => es.map((e) => ({ ...e, selected: false })))
    },
    [setNodes, setEdges],
  )

  const focusStep = useCallback(
    (id: string) => {
      selectOnly(id)
      const n = flow.getNode(id)
      if (n)
        flow.setCenter(n.position.x + NODE_WIDTH / 2, n.position.y + (n.measured?.height ?? 200) / 2, {
          zoom: Math.max(flow.getZoom(), 0.85),
          duration: 300,
        })
    },
    [flow, selectOnly],
  )

  const addStep = useCallback(
    (entry: CatalogEntry, at?: { x: number; y: number }) => {
      snapshot()
      let pos = at
      if (!pos) {
        const r = canvasRef.current!.getBoundingClientRect()
        const c = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
        pos = { x: c.x - NODE_WIDTH / 2, y: c.y - 80 }
        const rects = flow.getNodes().map((n) => ({ x: n.position.x, y: n.position.y, w: NODE_WIDTH, h: n.measured?.height ?? 240 }))
        const hits = (p: { x: number; y: number }) => rects.some((r) => p.x < r.x + r.w + 24 && p.x + NODE_WIDTH + 24 > r.x && p.y < r.y + r.h + 24 && p.y + 240 > r.y)
        for (let i = 0; i < 40 && hits(pos); i++) pos = { x: pos.x, y: pos.y + 40 }
      }
      const id = uniqueId(entry.label, new Set(flow.getNodes().map((n) => n.id)))
      const spec = specFromCatalog(entry, id, pos)
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "step", position: pos!, data: { spec }, selected: true, width: NODE_WIDTH }])
      window.setTimeout(
        () =>
          updateNode(id, (s) => ({
            ...s,
            state: stopped ? "stopped" : "running",
            metrics: stopped ? s.metrics : { fps: 30, latencyMs: 1.8, cpu: s.origin === "built-in" ? 1 : 3, gpu: 2, dropped: 0 },
          })),
        1400,
      )
    },
    [flow, snapshot, setNodes, updateNode, stopped],
  )

  const deleteSelection = useCallback(() => {
    const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    const edgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id))
    if (!ids.size && !edgeIds.size) return
    snapshot()
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)))
    setEdges((es) => es.filter((e) => !edgeIds.has(e.id) && !ids.has(e.source) && !ids.has(e.target)))
    setPins((ps) => ps.filter((p) => !ids.has(p.key.split(".")[0])))
  }, [nodes, edges, snapshot, setNodes, setEdges])

  const duplicateSelection = useCallback(() => {
    if (!selected) return
    snapshot()
    const id = uniqueId(selected.data.spec.label, new Set(nodes.map((n) => n.id)))
    const position = { x: selected.position.x + 32, y: selected.position.y + 32 }
    const spec = { ...selected.data.spec, id, pid: selected.data.spec.pid ? selected.data.spec.pid + 17 : undefined }
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...selected, id, position, selected: true, data: { ...selected.data, spec } }])
  }, [selected, nodes, snapshot, setNodes])

  const runAutoLayout = useCallback(() => {
    snapshot()
    setNodes((ns) => autoLayout(ns, edges, showPreviews, showMetrics))
    window.setTimeout(() => flow.fitView({ ...fitOptions, duration: 300 }), 30)
  }, [snapshot, setNodes, edges, showPreviews, showMetrics, flow])

  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault()
        e.stopImmediatePropagation()
        setLeftOpen(true)
        window.setTimeout(() => searchRef.current?.focus(), 0)
        return
      }
      if (typing(e.target)) return
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault()
        duplicateSelection()
      } else if (e.key === "Backspace" || e.key === "Delete") {
        deleteSelection()
      } else if (!mod && e.key.toLowerCase() === "f") {
        flow.fitView({ ...fitOptions, duration: 250 })
      } else if (e.key === "Escape") {
        selectOnly(null)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [undo, redo, duplicateSelection, deleteSelection, flow, selectOnly])

  const onConnect = useCallback(
    (c: Connection) => {
      const src = flow.getNode(c.source)?.data.spec
      const port = src?.ports.find((p) => p.name === portFromHandle(c.sourceHandle))
      if (!src || !port) return
      snapshot()
      const link = {
        id: `n${Date.now().toString(36)}`,
        from: { node: c.source, port: port.name },
        to: { node: c.target, port: portFromHandle(c.targetHandle) },
        kind: port.kind,
        ratePerSec: stopped ? 0 : src.metrics.fps,
        dropped: 0,
      }
      setEdges((es) => addEdge(linkToEdge(link), es))
    },
    [flow, snapshot, setEdges, stopped],
  )

  const isValidConnection = useCallback(
    (c: Connection | LinkEdgeType) => {
      const s = flow.getNode(c.source)?.data.spec.ports.find((p) => p.name === portFromHandle(c.sourceHandle))
      const t = flow.getNode(c.target)?.data.spec.ports.find((p) => p.name === portFromHandle(c.targetHandle))
      return !!s && !!t && s.kind === t.kind && c.source !== c.target
    },
    [flow],
  )

  const ui: GraphUi = useMemo(
    () => ({
      stream,
      machine,
      stopped,
      showPreviews,
      showMetrics,
      hoveredEdgeId,
      selectedNodeId,
      pinned: pins.map((p) => p.key),
      openPeek,
      closePeek,
      togglePin,
      restartNode,
    }),
    [stream, machine, stopped, showPreviews, showMetrics, hoveredEdgeId, selectedNodeId, pins, openPeek, closePeek, togglePin, restartNode],
  )

  const specs = nodes.map((n) => n.data.spec)

  return (
    <GraphUiContext.Provider value={ui}>
      <style>{graphCss}</style>
      <div className="tl-graph absolute inset-0 flex bg-window">
        {leftOpen && (
          <AddStepPanel
            ref={searchRef}
            onAdd={(e) => addStep(e)}
            onClose={() => setLeftOpen(false)}
            steps={specs}
            selectedId={selectedNodeId}
            onFocusStep={focusStep}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <GraphToolbar
            leftOpen={leftOpen}
            rightOpen={rightOpen}
            onToggleLeft={() => setLeftOpen((o) => !o)}
            onToggleRight={() => setRightOpen((o) => !o)}
            onTogglePreviews={() => setShowPreviews((v) => !v)}
            onToggleMetrics={() => setShowMetrics((v) => !v)}
            onAutoLayout={runAutoLayout}
            onUndo={undo}
            onRedo={redo}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            selectedLabel={selectedNodeId}
          />
          <div
            ref={canvasRef}
            className="relative min-h-0 flex-1"
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(STEP_DRAG_TYPE)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = "copy"
            }}
            onDrop={(e) => {
              const cls = e.dataTransfer.getData(STEP_DRAG_TYPE)
              const entry = nodeCatalog.find((x) => x.className === cls)
              if (!entry) return
              e.preventDefault()
              const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
              addStep(entry, { x: p.x - NODE_WIDTH / 2, y: p.y - 16 })
            }}
          >
            <ReactFlow<StepNodeType, LinkEdgeType>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeDragStart={snapshot}
              onEdgeMouseEnter={(_, e) => setHoveredEdgeId(e.id)}
              onEdgeMouseLeave={() => setHoveredEdgeId(null)}
              onMoveStart={() => setPeek(null)}
              deleteKeyCode={null}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              connectionRadius={24}
              panOnScroll
            >
              <Background id="minor" variant={BackgroundVariant.Lines} gap={24} lineWidth={1} color="color-mix(in srgb, var(--line) 38%, transparent)" />
              <Background id="major" variant={BackgroundVariant.Lines} gap={120} lineWidth={1} color="color-mix(in srgb, var(--line) 65%, transparent)" />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor={(n) => (n.selected ? "var(--brand)" : "var(--line-strong)")}
                nodeStrokeWidth={0}
                nodeBorderRadius={3}
                maskColor="color-mix(in srgb, var(--window) 62%, transparent)"
                style={{ width: 144, height: 90 }}
              />
            </ReactFlow>
            {pins.map((pin, i) => {
              const [nodeId, portName] = pin.key.split(".")
              const spec = specs.find((s) => s.id === nodeId)
              const port = spec?.ports.find((p) => p.name === portName)
              if (!spec || !port) return null
              return (
                <PinnedPreviewWindow
                  key={pin.key}
                  spec={spec}
                  port={port}
                  rate={portRate(spec, portName, edges)}
                  ui={ui}
                  position={pin}
                  bounds={() => canvasRef.current?.getBoundingClientRect()}
                  onMove={(p) => setPins((ps) => ps.map((x) => (x.key === pin.key ? { ...x, ...p } : x)))}
                  onClose={() => togglePin(pin.key)}
                  onFocus={() => i !== pins.length - 1 && setPins((ps) => [...ps.filter((x) => x.key !== pin.key), ps.find((x) => x.key === pin.key)!])}
                />
              )
            })}
          </div>
        </div>
        {rightOpen && (
          <aside className="flex w-[320px] shrink-0 flex-col border-l bg-chrome">
            {selected ? (
              <NodeInspector
                key={selected.id}
                spec={selected.data.spec}
                edges={edges}
                onClose={() => setRightOpen(false)}
                onConfig={(k, v) => updateNode(selected.id, (s) => ({ ...s, config: { ...s.config, [k]: v } }))}
                onExposure={(port, exposure: Exposure) =>
                  updateNode(selected.id, (s) => ({ ...s, ports: s.ports.map((p) => (p.name === port ? { ...p, exposure } : p)) }))
                }
              />
            ) : (
              <StreamSummary steps={specs} edges={edges} onClose={() => setRightOpen(false)} onSelect={focusStep} />
            )}
          </aside>
        )}
      </div>
      {peek && <PortPeekPopover target={peek} ui={ui} onEnter={() => window.clearTimeout(peekTimer.current)} onLeave={closePeek} />}
    </GraphUiContext.Provider>
  )
}

export default function StreamGraph() {
  const stream = useStream()
  return (
    <ReactFlowProvider key={stream.id}>
      <GraphEditor />
    </ReactFlowProvider>
  )
}
