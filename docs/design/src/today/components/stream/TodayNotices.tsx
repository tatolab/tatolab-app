// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { FileText, RotateCw, SquareX, TriangleAlert } from "lucide-react"
import { Link } from "react-router-dom"
import { fmt } from "@/components/graph/model"
import { Button } from "@/components/ui/button"
import type { TodayStream } from "../../data"
import { jsonlPath } from "./model"

/** The red row a failed stream carries: `failed_because`, Retry, the JSONL log. */
export function FailedBanner({ stream }: { stream: TodayStream }) {
  if (stream.state !== "failed") return null
  return (
    <div className="flex min-h-10 items-center gap-2 border-b bg-danger-soft px-5 py-1.5">
      <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} />
      <span className="min-w-0 text-fg">
        <span className="text-danger">Failed</span> — {stream.failedBecause}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]" title={jsonlPath(stream)}>
          <FileText className="size-3.5" /> Open log file
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
          <RotateCw className="size-3.5" /> Retry
        </Button>
      </div>
    </div>
  )
}

/** One amber line per link whose `dropped_bags` counter is above zero. */
export function DropNotes({ stream, className }: { stream: TodayStream; className?: string }) {
  if (!stream.loaded) return null
  const dropping = stream.links.filter((l) => l.dropped > 0)
  if (!dropping.length) return null
  return (
    <div className={className}>
      {dropping.map((l) => (
        <div key={l.id} className="flex h-8 items-center gap-2 text-[13px]">
          <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} />
          <span className="min-w-0 truncate text-fg-2">
            <span className="font-mono text-xs text-fg">{l.from.node}</span> → <span className="font-mono text-xs text-fg">{l.to.node}</span> has
            dropped <span className="text-warn tabular">{fmt(l.dropped)}</span> messages since it was wired
          </span>
          <Link to={`/streams/${stream.id}/graph?node=${l.to.node}`} className="ml-auto shrink-0 text-xs text-brand-text hover:underline">
            Show in graph
          </Link>
        </div>
      ))}
    </div>
  )
}
