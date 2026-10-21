// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { GripVertical, Pin, PinOff, X } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ExposureLabel, IconButton, KindIcon } from "@/components/stream/primitives"
import type { NodeSpec, PortSpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { kindWords } from "@/lib/vocab"
import { address, type GraphUi, pinKey } from "./context"
import { PortOutputView } from "./PortOutputView"

export interface PeekTarget {
  spec: NodeSpec
  port: PortSpec
  rate: number
  anchor: DOMRect
}

function rateText(ui: GraphUi, spec: NodeSpec, port: PortSpec, rate: number) {
  if (ui.portStatus) return ui.portStatus(spec, port)
  if (ui.stopped || spec.state === "stopped") return "stopped"
  if (spec.state === "crashed") return "no output"
  return `${rate}/s`
}

export function PortPeekPopover({
  target,
  ui,
  onEnter,
  onLeave,
}: {
  target: PeekTarget
  ui: GraphUi
  onEnter: () => void
  onLeave: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const { spec, port, anchor } = target
  const key = pinKey(spec.id, port.name)
  const pinned = ui.pinned.includes(key)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = anchor.right + 14
    if (left + w > window.innerWidth - 8) left = anchor.left - w - 14
    const top = Math.min(Math.max(8, anchor.top + anchor.height / 2 - h / 2), window.innerHeight - h - 8)
    setPos({ left, top })
  }, [anchor])

  return createPortal(
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={pos ?? { left: -9999, top: -9999 }}
      className={cn(
        "fixed z-50 w-[360px] rounded-lg border border-line-strong bg-popover text-[13px] shadow-[var(--shadow-pop)]",
        pos && "animate-in fade-in-0 zoom-in-[0.98] duration-100",
      )}
    >
      <div className="flex h-9 items-center gap-2 pr-1.5 pl-3">
        <KindIcon kind={port.kind} />
        <span className="min-w-0 truncate font-mono text-xs text-fg">{port.name}</span>
        <span className="text-xs text-fg-3">{spec.label}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton icon={pinned ? PinOff : Pin} label={pinned ? "Unpin preview" : "Pin preview"} active={pinned} onClick={() => ui.togglePin(key)} />
        </div>
      </div>
      <div className="px-3">
        <PortOutputView spec={spec} port={port} paused={ui.stopped || spec.state === "stopped"} className="w-full" />
      </div>
      <div className="px-3 pt-2.5 pb-3">
        <div className="truncate font-mono text-xs text-fg-2 select-all">{address(ui, spec.id, port.name)}</div>
        <div className="mt-1 flex items-center gap-3 text-xs text-fg-3">
          <span className="tabular font-mono text-[11px]">{rateText(ui, spec, port, target.rate)}</span>
          <span>{kindWords[port.kind].label}</span>
          {port.exposure && <ExposureLabel exposure={port.exposure} className="text-xs text-fg-3" />}
          <span className="ml-auto">{pinned ? "Pinned" : "Click the port to pin"}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function PinnedPreviewWindow({
  spec,
  port,
  rate,
  ui,
  position,
  onMove,
  onClose,
  onFocus,
  bounds,
}: {
  spec: NodeSpec
  port: PortSpec
  rate: number
  ui: GraphUi
  position: { x: number; y: number }
  onMove: (p: { x: number; y: number }) => void
  onClose: () => void
  onFocus: () => void
  bounds: () => DOMRect | undefined
}) {
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onPointerDown={onFocus}
      style={{ left: position.x, top: position.y }}
      className={cn(
        "absolute z-10 w-[320px] overflow-hidden rounded-lg border border-line-strong bg-popover shadow-[var(--shadow-pop)]",
        dragging && "select-none",
      )}
    >
      <div
        className="flex h-7 cursor-grab items-center gap-1 border-b bg-chrome pr-1 pl-1 active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { dx: e.clientX - position.x, dy: e.clientY - position.y }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const b = bounds()
          const x = e.clientX - drag.current.dx
          const y = e.clientY - drag.current.dy
          onMove(b ? { x: Math.min(Math.max(0, x), b.width - 320), y: Math.min(Math.max(0, y), b.height - 40) } : { x, y })
        }}
        onPointerUp={() => {
          drag.current = null
          setDragging(false)
        }}
      >
        <GripVertical className="size-3.5 shrink-0 text-fg-4" strokeWidth={1.75} />
        <KindIcon kind={port.kind} className="size-3" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2" title={address(ui, spec.id, port.name)}>
          <span className="text-fg-3">{spec.id}/</span>
          {port.name}
        </span>
        <IconButton icon={X} label="Close" onClick={onClose} className="size-5 [&_svg]:size-3.5" />
      </div>
      <PortOutputView spec={spec} port={port} paused={ui.stopped || spec.state === "stopped"} rows={8} className="w-full rounded-none ring-0" />
      <div className="flex h-6 items-center gap-2 border-t px-2.5 font-mono text-[11px] text-fg-3 tabular">
        <span>{rateText(ui, spec, port, rate)}</span>
        <span className="ml-auto">{kindWords[port.kind].label.toLowerCase()}</span>
      </div>
    </div>
  )
}
