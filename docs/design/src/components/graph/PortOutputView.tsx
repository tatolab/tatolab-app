// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useEffect, useState } from "react"
import { Preview } from "@/components/stream/primitives"
import type { NodeSpec, PortSpec, Scene } from "@/data/mock"
import { cn } from "@/lib/utils"

export function sceneForPort(spec: NodeSpec, port: PortSpec): Scene {
  if (spec.state === "crashed") return "no-signal"
  if (port.preview) return port.preview
  if (port.kind === "encoded") return "encoded"
  return spec.preview ?? "no-signal"
}

function bagFor(port: string, seq: number) {
  const r = (k: number) => Math.abs(Math.sin(seq * 12.9898 + k * 78.233)) % 1
  if (/count/.test(port)) return `{"in": ${412 + Math.floor(seq / 9)}, "out": ${398 + Math.floor(seq / 11)}, "on_floor": ${3 + Math.floor(r(1) * 3)}}`
  if (/detect/.test(port)) {
    const n = 1 + Math.floor(r(2) * 2.4)
    return `{"boxes": ${n}, "best": ${(0.86 + r(3) * 0.1).toFixed(2)}, "label": "person"}`
  }
  return `{"seq": ${seq}, "value": ${(r(4) * 100).toFixed(1)}}`
}

function DataPeek({ port, paused, rows = 8, className }: { port: string; paused?: boolean; rows?: number; className?: string }) {
  const [seq, setSeq] = useState(18234)
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setSeq((s) => s + 1), 340)
    return () => clearInterval(t)
  }, [paused])
  const lines = Array.from({ length: rows }, (_, i) => seq - i)
  return (
    <div className={cn("overflow-hidden rounded-md bg-well px-2.5 py-2 flex flex-col gap-0.5 font-mono text-xs ring-1 ring-line", className)}>
      {paused ? (
        <div className="grid h-full place-items-center text-fg-3">No messages · stream stopped</div>
      ) : (
        lines.map((s, i) => (
          <div key={s} className={cn("flex gap-3 whitespace-nowrap", i === 0 ? "text-fg" : "text-fg-3")}>
            <span className="tabular text-fg-4">#{s}</span>
            <span className="truncate">{bagFor(port, s)}</span>
          </div>
        ))
      )}
    </div>
  )
}

export function PortOutputView({
  spec,
  port,
  paused,
  className,
  rows,
}: {
  spec: NodeSpec
  port: PortSpec
  paused?: boolean
  className?: string
  rows?: number
}) {
  if (port.kind === "data") return <DataPeek port={port.name} paused={paused} rows={rows} className={cn("aspect-video", className)} />
  return <Preview scene={sceneForPort(spec, port)} paused={paused || spec.state === "crashed"} className={cn("aspect-video", className)} seed={spec.id.length} />
}
