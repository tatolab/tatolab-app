// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { AudioLines, Infinity as InfinityIcon, type LucideIcon, RefreshCw, SquareX, Video } from "lucide-react"
import { Preview } from "@/components/stream/primitives"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { type RuntimeStreamState, runtimeStateWords, type TodayStream } from "../../data"

/** Running, Stopped or Failed: the `list_streams` state as a word; only Failed carries an icon. */
export function TodayStreamStatusWord({ stream, className }: { stream: TodayStream; className?: string }) {
  if (stream.state === "failed") {
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-danger", className)}>
        <SquareX className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="truncate">Failed</span>
      </span>
    )
  }
  return <span className={cn("truncate", stream.loaded ? "text-fg-2" : "text-fg-3", className)}>{stream.loaded ? "Running" : "Stopped"}</span>
}

const runModeIcon: Record<RuntimeStreamState, LucideIcon> = {
  kept: InfinityIcon,
  stopped: InfinityIcon,
  failed: InfinityIcon,
  attached: RefreshCw,
}

/** Always on (kept, stopped, failed) or Dev session (attached), with the runtime's term in the tooltip. */
export function TodayRunModeWord({ stream, className }: { stream: TodayStream; className?: string }) {
  const Icon = runModeIcon[stream.state]
  const label = stream.state === "attached" ? "Dev session" : "Always on"
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex cursor-default items-center gap-1.5", stream.loaded ? "text-fg-2" : "text-fg-3", className)} />}>
        <Icon className="size-3.5 text-fg-3" strokeWidth={1.75} />
        {label}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {runtimeStateWords[stream.state].long}
        <span className="mt-1 block font-mono text-[10px] opacity-60">runtime: {stream.state}</span>
      </TooltipContent>
    </Tooltip>
  )
}

/** The stream's hero output when loaded; an empty frame when nothing is loaded to draw. */
export function TodayStreamThumbnail({ stream, seed, className }: { stream: TodayStream; seed: number; className?: string }) {
  if (stream.loaded) return <Preview scene={stream.hero} seed={seed} className={cn("rounded-[5px]", className)} />
  const Icon = stream.hero === "waveform" || stream.hero === "spectrum" ? AudioLines : Video
  return (
    <div className={cn("grid place-items-center rounded-[5px] bg-well ring-1 ring-line", className)}>
      <Icon className="size-3.5 text-fg-4" strokeWidth={1.75} />
    </div>
  )
}

/** The command that loads this stream the way it is loaded now. */
export function todayStreamCommand(stream: TodayStream) {
  return stream.state === "attached" ? `cd ${stream.project} && tatolab dev` : `cd ${stream.project} && tatolab run -d`
}
