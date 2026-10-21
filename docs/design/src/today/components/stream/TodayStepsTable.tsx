// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { fmt } from "@/components/graph/model"
import { pipelineOrder } from "@/components/stream-overview/model"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { categoryWords, originWords } from "@/lib/vocab"
import type { TodayStream } from "../../data"
import { inboundLinks, nodeStateOf, nodeStateWords, refusedByNode, todayNode } from "./model"

function Counters({ stream, nodeId }: { stream: TodayStream; nodeId: string }) {
  const node = stream.nodes.find((n) => n.id === nodeId)!
  const dropping = inboundLinks(stream.links, nodeId).filter((l) => l.dropped > 0)
  const refused = Object.entries(refusedByNode(stream, node)).filter(([, n]) => n > 0)
  if (!stream.loaded || (!dropping.length && !refused.length)) return null
  const dropped = dropping.reduce((a, l) => a + l.dropped, 0)
  const total = refused.reduce((a, [, n]) => a + n, 0)
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-default font-mono text-xs text-warn tabular" />}>
        {[dropped > 0 && `${fmt(dropped)} dropped`, total > 0 && `${fmt(total)} refused`].filter(Boolean).join(" · ")}
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        {dropping.map((l) => (
          <span key={l.id} className="block font-mono text-[11px]">
            {l.from.node}/{l.from.port} → {l.to.port} · dropped_bags {fmt(l.dropped)}
          </span>
        ))}
        {refused.map(([port, n]) => (
          <span key={port} className="block font-mono text-[11px]">
            {port} · refused_bags {fmt(n)}
          </span>
        ))}
        <span className="mt-1 block opacity-70">Since the link was wired, as the runtime counts them.</span>
      </TooltipContent>
    </Tooltip>
  )
}

export function TodayStepsTable({ stream }: { stream: TodayStream }) {
  const navigate = useNavigate()
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <colgroup>
        <col className="w-[24%]" />
        <col />
        <col className="w-[76px]" />
        <col className="w-[88px]" />
        <col className="w-[104px]" />
        <col className="w-[132px]" />
        <col className="w-7" />
      </colgroup>
      <thead>
        <tr className="border-b text-xs text-fg-3">
          <th className="h-7 pr-3 font-normal">Step</th>
          <th className="px-3 font-normal">Type</th>
          <th className="px-3 font-normal">Origin</th>
          <th className="px-3 font-normal">State</th>
          <th className="px-3 font-normal">Process</th>
          <th className="px-3 text-right font-normal">Counters</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {pipelineOrder(stream).map((raw) => {
          const node = todayNode(stream, raw)
          const CatIcon = categoryWords[node.category].icon
          const state = nodeStateWords[nodeStateOf(stream, node)]
          return (
            <tr
              key={node.id}
              onClick={() => navigate(`/streams/${stream.id}/graph?node=${node.id}`)}
              className="group h-8 cursor-default border-b transition-colors hover:bg-hover"
            >
              <td className="pr-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CatIcon className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} />
                  <span className="truncate text-fg" title={node.id}>{node.label}</span>
                </div>
              </td>
              <td className="truncate px-3 font-mono text-xs text-fg-3" title={node.className}>
                {node.className}
              </td>
              <td className="px-3 text-fg-2">{originWords[node.origin].label}</td>
              <td className={cn("px-3", state.tone)}>{state.label}</td>
              <td className="truncate px-3 text-xs text-fg-3">{node.origin === "built-in" ? "in runtime" : "own process"}</td>
              <td className="px-3 text-right">
                <Counters stream={stream} nodeId={node.id} />
              </td>
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
