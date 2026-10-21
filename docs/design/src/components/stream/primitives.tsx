// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { LucideIcon } from "lucide-react"
import { LivePreview } from "@/components/live/LivePreview"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DataKind, Exposure, RunMode, Scene, StreamStatus } from "@/data/mock"
import { cn } from "@/lib/utils"
import { exposureWords, kindWords, runModeWords, statusWords } from "@/lib/vocab"

/** Renders nothing for healthy states — a running stream needs no badge. */
export function StatusIcon({ status, className }: { status: StreamStatus; className?: string }) {
  const w = statusWords[status]
  if (!w.icon) return null
  const Icon = w.icon
  return <Icon className={cn("size-3.5 shrink-0", w.tone, w.spin && "animate-spin", className)} strokeWidth={1.75} aria-label={w.label} />
}

export function StatusLabel({ status, className, detail }: { status: StreamStatus; className?: string; detail?: string }) {
  const w = statusWords[status]
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <StatusIcon status={status} />
      <span className={cn("truncate", w.tone)}>
        {w.label}
        {detail && <span className="text-fg-3"> · {detail}</span>}
      </span>
    </span>
  )
}

export function RunModeLabel({ mode, className }: { mode: RunMode; className?: string }) {
  const w = runModeWords[mode]
  const Icon = w.icon
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex cursor-default items-center gap-1.5 text-fg-2", className)} />}>
        <Icon className="size-3.5 text-fg-3" strokeWidth={1.75} />
        {w.label}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {w.long}
        <span className="mt-1 block font-mono text-[10px] opacity-60">runtime: {w.runtimeTerm}</span>
      </TooltipContent>
    </Tooltip>
  )
}

export function ExposureLabel({ exposure, className, iconOnly }: { exposure: Exposure; className?: string; iconOnly?: boolean }) {
  const w = exposureWords[exposure]
  const Icon = w.icon
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex cursor-default items-center gap-1 text-fg-2", className)} />}>
        <Icon className="size-3.5 text-fg-3" strokeWidth={1.75} />
        {!iconOnly && w.label}
      </TooltipTrigger>
      <TooltipContent className="max-w-60">
        {w.long}
        <span className="mt-1 block font-mono text-[10px] opacity-60">exposure: {exposure}</span>
      </TooltipContent>
    </Tooltip>
  )
}

export function KindIcon({ kind, className }: { kind: DataKind; className?: string }) {
  const Icon = kindWords[kind].icon
  return <Icon className={cn("size-3.5 shrink-0 text-fg-3", className)} strokeWidth={1.75} aria-label={kindWords[kind].label} />
}

/** Inline resource meter, as in Activity Monitor / Docker's stats column. */
export function Meter({ value, max = 100, className, warnAt = 85 }: { value: number; max?: number; className?: string; warnAt?: number }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <span className={cn("inline-block h-1 w-12 overflow-hidden rounded-full bg-well align-middle", className)}>
      <span className={cn("block h-full rounded-full", pct >= warnAt ? "bg-warn" : "bg-fg-3")} style={{ width: `${pct}%` }} />
    </span>
  )
}

export function Sparkline({
  values,
  className,
  color = "var(--fg-3)",
  height = 24,
}: {
  values: number[]
  className?: string
  color?: string
  height?: number
}) {
  const w = 100
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - ((v - min) / (max - min || 1)) * (height - 3) - 1.5])
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn("h-6 w-full", className)} aria-hidden>
      <path d={`${d} L${w} ${height} L0 ${height} Z`} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** A live output in a plain frame. No badges; the frame is the content. */
export function Preview({
  scene,
  paused,
  className,
  seed,
  caption,
}: {
  scene: Scene
  paused?: boolean
  className?: string
  seed?: number
  caption?: React.ReactNode
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-black ring-1 ring-line", className)}>
      <LivePreview scene={scene} paused={paused} seed={seed} />
      {caption && (
        <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-6 pb-1.5 font-mono text-[11px] text-white/85">
          {caption}
        </div>
      )}
    </div>
  )
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  filled,
  className,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  active?: boolean
  filled?: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            onClick={onClick}
            aria-label={label}
            className={cn(
              "grid size-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg",
              active && "bg-selected text-fg",
              className,
            )}
          />
        }
      >
        <Icon className={cn("size-4", filled && "size-3 fill-current")} strokeWidth={1.75} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** A VS Code-style panel header: caps label left, actions right. */
export function PanelHeader({ children, actions, className }: { children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-9 shrink-0 items-center gap-2 px-3", className)}>
      <span className="label-caps">{children}</span>
      {actions && <div className="ml-auto flex items-center gap-0.5">{actions}</div>}
    </div>
  )
}

export function KeyValue({ rows, className }: { rows: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-4 gap-y-1.5", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="truncate text-fg-3">{k}</dt>
          <dd className="min-w-0 truncate text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function formatMemory(mb: number) {
  if (!mb) return "—"
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}
