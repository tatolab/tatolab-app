// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react"
import { memo } from "react"
import { cn } from "@/lib/utils"
import { useGraphUi } from "./context"
import { fmt, type LinkEdge as LinkEdgeType } from "./model"

function LinkEdgeView({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<LinkEdgeType>) {
  const ui = useGraphUi()
  const link = data?.link
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.32 })
  const hovered = ui.hoveredEdgeId === id
  const touchesSelection = ui.selectedNodeId === source || ui.selectedNodeId === target
  const active = hovered || selected || touchesSelection
  const dropped = link?.dropped ?? 0
  const flowing = !ui.stopped && (link?.ratePerSec ?? 0) > 0
  const stroke = dropped > 0 ? "var(--warn)" : active ? "var(--brand)" : "var(--fg-4)"
  const showLabel = hovered || (dropped > 0 && ui.showMetrics && !ui.stopped)
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={18}
        style={{
          stroke,
          strokeWidth: active ? 1.75 : 1.25,
          strokeDasharray: flowing ? undefined : "4 4",
          transition: "stroke 120ms, stroke-width 120ms",
        }}
      />
      {hovered && flowing && <path d={path} fill="none" className="tl-flow pointer-events-none" stroke="var(--window)" strokeWidth={2.25} strokeDasharray="2 22" />}
      {showLabel && link && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={cn(
              "nodrag nopan pointer-events-none absolute flex h-5 items-center gap-1.5 rounded-md border bg-popover px-1.5 font-mono text-[11px] whitespace-nowrap tabular",
              hovered ? "border-line-strong shadow-[var(--shadow-pop)]" : "border-line",
            )}
          >
            {hovered && (
              <span className="text-fg-2">
                {ui.linkStatus ? ui.linkStatus(link) : ui.stopped ? "stopped" : `${link.ratePerSec}/s`}
              </span>
            )}
            {hovered && dropped > 0 && <span className="text-fg-4">·</span>}
            {dropped > 0 && <span className="text-warn">{fmt(dropped)} dropped</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const LinkEdge = memo(LinkEdgeView)
