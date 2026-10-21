// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight, SquareX, TriangleAlert } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { NodeSpec, StreamSpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { categoryWords, originWords } from "@/lib/vocab"
import { dropShare, isRunning, pipelineOrder } from "./model"

function Problem({ stream, node }: { stream: StreamSpec; node: NodeSpec }) {
  if (node.state !== "stalled" && node.state !== "crashed") return null
  const crashed = node.state === "crashed"
  const Icon = crashed ? SquareX : TriangleAlert
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex shrink-0 items-center gap-1 text-xs", crashed ? "text-danger" : "text-warn")} />}>
        <Icon className="size-3.5" strokeWidth={1.75} />
        {crashed ? "Crashed" : "Falling behind"}
      </TooltipTrigger>
      <TooltipContent>{crashed ? node.description : `Dropping ${dropShare(stream, node)}% of frames from upstream`}</TooltipContent>
    </Tooltip>
  )
}

function num(value: number, live: boolean, digits = 0) {
  return live && value ? value.toFixed(digits) : "—"
}

export function StepsTable({ stream }: { stream: StreamSpec }) {
  const navigate = useNavigate()
  const live = isRunning(stream)
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <colgroup>
        <col className="w-[26%]" />
        <col />
        <col className="w-[76px]" />
        <col className="w-[96px]" />
        <col className="w-[52px]" />
        <col className="w-[68px]" />
        <col className="w-[52px]" />
        <col className="w-[52px]" />
        <col className="w-7" />
      </colgroup>
      <thead>
        <tr className="border-b text-xs text-fg-3">
          <th className="h-7 pr-3 font-normal">Step</th>
          <th className="px-3 font-normal">Class</th>
          <th className="px-3 font-normal">Origin</th>
          <th className="px-3 font-normal">Process</th>
          <th className="px-2 text-right font-normal">FPS</th>
          <th className="px-2 text-right font-normal">Latency</th>
          <th className="px-2 text-right font-normal">CPU</th>
          <th className="px-2 text-right font-normal">GPU</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {pipelineOrder(stream).map((node) => {
          const CatIcon = categoryWords[node.category].icon
          const nodeLive = live && node.state !== "crashed" && node.state !== "stopped"
          return (
            <tr
              key={node.id}
              onClick={() => navigate(`/streams/${stream.id}/graph?node=${node.id}`)}
              className="group h-8 cursor-default border-b transition-colors hover:bg-hover"
            >
              <td className="pr-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CatIcon className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} />
                  <span className="truncate text-fg">{node.label}</span>
                  <Problem stream={stream} node={node} />
                </div>
              </td>
              <td className="truncate px-3 font-mono text-xs text-fg-3" title={node.className}>
                {node.className}
              </td>
              <td className="px-3 text-fg-2">
                {node.pack ? (
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-default" />}>{originWords[node.origin].label}</TooltipTrigger>
                    <TooltipContent className="font-mono text-[11px]">{node.pack}</TooltipContent>
                  </Tooltip>
                ) : (
                  originWords[node.origin].label
                )}
              </td>
              <td className="truncate px-3 text-xs">
                {node.pid && nodeLive ? (
                  <span className="font-mono text-fg-2">pid {node.pid}</span>
                ) : node.origin === "built-in" ? (
                  <span className="text-fg-3">in runtime</span>
                ) : (
                  <span className="text-fg-4">—</span>
                )}
              </td>
              <td className="px-2 text-right text-fg-2 tabular">{num(node.metrics.fps, nodeLive, node.metrics.fps % 1 ? 1 : 0)}</td>
              <td className={cn("px-2 text-right tabular", node.metrics.latencyMs > 33 && nodeLive ? "text-warn" : "text-fg-2")}>
                {nodeLive && node.metrics.latencyMs ? `${node.metrics.latencyMs.toFixed(1)} ms` : "—"}
              </td>
              <td className="px-2 text-right text-fg-2 tabular">{nodeLive ? `${node.metrics.cpu}%` : "—"}</td>
              <td className="px-2 text-right text-fg-2 tabular">{nodeLive && node.metrics.gpu ? `${node.metrics.gpu}%` : "—"}</td>
              <td>
                <ChevronRight className="ml-auto size-3.5 text-fg-4 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.75} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
