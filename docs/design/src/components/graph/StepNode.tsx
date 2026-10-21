// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Handle, type NodeProps, Position } from "@xyflow/react"
import { LoaderCircle, SquareX, RotateCw, TriangleAlert } from "lucide-react"
import { memo } from "react"
import { ExposureLabel, KindIcon, Preview } from "@/components/stream/primitives"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PortSpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { categoryWords, originWords } from "@/lib/vocab"
import { pinKey, useGraphUi } from "./context"
import { fmt, inHandle, NODE_WIDTH, outHandle, type StepNode as StepNodeType } from "./model"
import { sceneForPort } from "./PortOutputView"

function ProblemIcon({ state }: { state?: string }) {
  if (state === "stalled")
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="grid place-items-center" />}>
          <TriangleAlert className="size-3.5 text-warn" strokeWidth={1.75} />
        </TooltipTrigger>
        <TooltipContent>Stalled — falling behind its input</TooltipContent>
      </Tooltip>
    )
  if (state === "crashed")
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="grid place-items-center" />}>
          <SquareX className="size-3.5 text-danger" strokeWidth={1.75} />
        </TooltipTrigger>
        <TooltipContent>Exited</TooltipContent>
      </Tooltip>
    )
  if (state === "starting") return <LoaderCircle className="size-3.5 animate-spin text-fg-3" strokeWidth={1.75} />
  return null
}

function PortRow({ nodeId, port, active, muted }: { nodeId: string; port: PortSpec; active: boolean; muted: boolean }) {
  const ui = useGraphUi()
  const isOut = port.direction === "out"
  const pinned = ui.pinned.includes(pinKey(nodeId, port.name))
  const bar = cn("!h-[10px] !w-[3px] !min-h-0 !min-w-0 !rounded-[1px] !border-0 transition-colors", active ? "!bg-brand" : "!bg-fg-4")
  return (
    <div
      className={cn("group/port relative flex h-6 items-center gap-1.5 px-2.5", isOut ? "flex-row-reverse text-right" : "")}
      onMouseEnter={isOut ? (e) => ui.openPeek(nodeId, port.name, e.currentTarget) : undefined}
      onMouseLeave={isOut ? ui.closePeek : undefined}
      onClick={
        isOut
          ? (e) => {
              e.stopPropagation()
              ui.togglePin(pinKey(nodeId, port.name))
            }
          : undefined
      }
    >
      <Handle
        type={isOut ? "source" : "target"}
        position={isOut ? Position.Right : Position.Left}
        id={isOut ? outHandle(port.name) : inHandle(port.name)}
        className={cn(bar, isOut ? "!-right-px" : "!-left-px")}
      />
      <KindIcon kind={port.kind} className={cn(isOut && "group-hover/port:text-fg-2", muted && "text-fg-4")} />
      <span
        className={cn(
          "min-w-0 truncate font-mono text-xs leading-4",
          muted ? "text-fg-3" : "text-fg-2",
          isOut && "cursor-pointer group-hover/port:text-fg",
          pinned && "text-brand-text",
        )}
      >
        {port.name}
      </span>
      {isOut && port.exposure && port.exposure !== "internal" && <ExposureLabel exposure={port.exposure} iconOnly className="shrink-0" />}
    </div>
  )
}

function Footer({ data, muted }: { data: StepNodeType["data"]; muted: boolean }) {
  const ui = useGraphUi()
  const { spec } = data
  const m = spec.metrics
  if (ui.renderFooter) return ui.renderFooter(spec)
  if (spec.state === "crashed") return <div className="flex h-6 items-center border-t px-2.5 font-mono text-[11px] text-danger">Exited</div>
  if (muted || spec.state === "stopped") return <div className="flex h-6 items-center border-t px-2.5 font-mono text-[11px] text-fg-3">Stopped</div>
  if (spec.state === "starting") return <div className="flex h-6 items-center border-t px-2.5 font-mono text-[11px] text-fg-3">Starting…</div>
  const problems = [spec.state === "stalled" && "Stalled", m.dropped > 0 && `${fmt(m.dropped)} dropped`].filter(Boolean)
  if (!ui.showMetrics && !problems.length) return null
  return (
    <div className="border-t px-2.5 py-1 font-mono text-[11px] leading-4">
      {ui.showMetrics && (
        <div className="tabular flex h-4 items-center whitespace-nowrap text-fg-3">
          {m.fps} fps · {m.latencyMs} ms · {m.cpu}% cpu
        </div>
      )}
      {problems.length > 0 && <div className="tabular text-warn">{problems.join(" · ")}</div>}
    </div>
  )
}

function StepNodeView({ id, data, selected }: NodeProps<StepNodeType>) {
  const ui = useGraphUi()
  const { spec, crash } = data
  const Cat = categoryWords[spec.category].icon
  const muted = ui.stopped || spec.state === "stopped"
  const crashed = spec.state === "crashed"
  const inputs = spec.ports.filter((p) => p.direction === "in")
  const outputs = spec.ports.filter((p) => p.direction === "out")
  const previewPort = outputs.find((p) => p.preview) ?? outputs[0]
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        "rounded-lg border bg-raised text-[13px] transition-[border-color,box-shadow] duration-100",
        crashed ? "border-danger/70" : selected ? "border-brand" : "border-line-strong",
        selected && "ring-[3px] ring-brand-soft",
      )}
    >
      <div className="flex h-8 items-center gap-2 px-2.5">
        <Cat className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} />
        <span className={cn("min-w-0 truncate font-medium", muted && !crashed ? "text-fg-2" : "text-fg")}>{spec.label}</span>
        <ProblemIcon state={spec.state} />
        <span className="ml-auto shrink-0 text-xs text-fg-3">{originWords[spec.origin].label}</span>
      </div>
      {crash && (
        <div className="mx-2 mb-2 rounded-md bg-danger-soft px-2.5 py-2">
          <div className="text-xs font-medium text-danger">{crash.message}</div>
          {crash.detail && <div className="mt-0.5 truncate text-xs text-fg-3">{crash.detail}</div>}
          <button
            className="nodrag mt-2 inline-flex h-6 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2 text-xs text-fg transition-colors hover:bg-hover"
            onClick={(e) => {
              e.stopPropagation()
              ui.restartNode(id)
            }}
          >
            <RotateCw className="size-3" strokeWidth={2} /> Restart step
          </button>
        </div>
      )}
      {ui.showPreviews && spec.preview && previewPort && (
        <div className="px-2 pb-2">
          <Preview scene={sceneForPort(spec, previewPort)} paused={muted || crashed} seed={spec.id.length} className="aspect-video w-full" key={String(muted)} />
        </div>
      )}
      <div className="pb-1">
        {inputs.map((p) => (
          <PortRow key={p.name} nodeId={id} port={p} active={selected} muted={muted} />
        ))}
        {outputs.map((p) => (
          <PortRow key={p.name} nodeId={id} port={p} active={selected} muted={muted} />
        ))}
      </div>
      <Footer data={data} muted={muted} />
    </div>
  )
}

export const StepNode = memo(StepNodeView)
