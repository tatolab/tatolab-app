// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useReactFlow, useStore } from "@xyflow/react"
import { Activity, Image, Minus, Network, PanelLeft, PanelRight, Plus, Redo2, Scan, Undo2 } from "lucide-react"
import { IconButton } from "@/components/stream/primitives"
import { cn } from "@/lib/utils"
import { useGraphUi } from "./context"

function Divider() {
  return <span className="mx-1 h-4 w-px bg-line" />
}

export function GraphToolbar({
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  onTogglePreviews,
  onToggleMetrics,
  onAutoLayout,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  selectedLabel,
  notice,
  metricsNoun = "metrics",
}: {
  leftOpen: boolean
  rightOpen: boolean
  onToggleLeft: () => void
  onToggleRight: () => void
  onTogglePreviews: () => void
  onToggleMetrics: () => void
  onAutoLayout: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  selectedLabel: string | null
  notice?: React.ReactNode
  metricsNoun?: string
}) {
  const ui = useGraphUi()
  const flow = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  const live = ui.stream.runMode === "dev-session" ? "Saved · reloads on save" : ui.stopped ? "Changes apply on start" : "Changes apply live"
  return (
    <div className="@container relative flex h-9 shrink-0 items-center gap-0.5 border-b bg-window px-1.5">
      {!leftOpen && <IconButton icon={PanelLeft} label="Show steps panel" onClick={onToggleLeft} />}
      {!leftOpen && <Divider />}
      <IconButton icon={Minus} label="Zoom out" onClick={() => flow.zoomOut({ duration: 150 })} />
      <button
        onClick={() => flow.zoomTo(1, { duration: 200 })}
        className="h-7 w-11 rounded-md text-center font-mono text-xs text-fg-2 tabular hover:bg-hover hover:text-fg"
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton icon={Plus} label="Zoom in" onClick={() => flow.zoomIn({ duration: 150 })} />
      <IconButton icon={Scan} label="Fit to view (F)" onClick={() => flow.fitView({ padding: 0.14, duration: 250, maxZoom: 1 })} />
      <IconButton icon={Network} label="Auto-layout" onClick={onAutoLayout} />
      <Divider />
      <IconButton icon={Image} label={ui.showPreviews ? "Hide previews" : "Show previews"} active={ui.showPreviews} onClick={onTogglePreviews} />
      <IconButton icon={Activity} label={ui.showMetrics ? `Hide ${metricsNoun}` : `Show ${metricsNoun}`} active={ui.showMetrics} onClick={onToggleMetrics} />

      <div className={cn("pointer-events-none absolute inset-x-0 hidden justify-center", notice ? "@[1180px]:flex" : "@[820px]:flex")}>
        <div className="flex items-center gap-1 font-mono text-xs text-fg-3">
          <span>{ui.stream.id}</span>
          <span className="text-fg-4">/</span>
          <span className={cn(selectedLabel ? "text-fg-3" : "text-fg-2")}>stream.py</span>
          {selectedLabel && (
            <>
              <span className="text-fg-4">/</span>
              <span className="text-fg-2">{selectedLabel}</span>
            </>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        {notice ?? <span className="mr-2 hidden text-xs text-fg-3 @[560px]:inline">{live}</span>}
        <IconButton icon={Undo2} label="Undo (⌘Z)" onClick={onUndo} className={cn(!canUndo && "pointer-events-none opacity-40")} />
        <IconButton icon={Redo2} label="Redo (⇧⌘Z)" onClick={onRedo} className={cn(!canRedo && "pointer-events-none opacity-40")} />
        {!rightOpen && (
          <>
            <Divider />
            <IconButton icon={PanelRight} label="Show inspector" onClick={onToggleRight} />
          </>
        )}
      </div>
    </div>
  )
}
