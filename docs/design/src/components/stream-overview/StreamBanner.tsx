// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { SquareX, RotateCw, ScrollText, TriangleAlert } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import type { StreamSpec } from "@/data/mock"
import { dropShare, exitFor, problemNode } from "./model"

export function StreamBanner({ stream }: { stream: StreamSpec }) {
  if (stream.status === "attention") {
    const node = problemNode(stream)
    const sentence = node ? `${node.label} is dropping ${dropShare(stream, node)}% of frames` : stream.statusDetail
    return (
      <div className="flex h-9 items-center gap-2 border-b bg-warn-soft px-5">
        <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} />
        <span className="text-fg">{sentence}</span>
        {node && <span className="truncate text-fg-3">— {node.metrics.latencyMs} ms per frame against a 33 ms budget</span>}
        <Link to={`/streams/${stream.id}/stats${node ? `?node=${node.id}` : ""}`} className="ml-auto shrink-0 text-brand-text hover:underline">
          Open stats
        </Link>
      </div>
    )
  }
  if (stream.status === "failed") {
    const exit = exitFor(stream)
    return (
      <div className="flex h-10 items-center gap-2 border-b bg-danger-soft px-5">
        <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} />
        <span className="text-fg">
          Exited with code <span className="font-mono">{exit.code}</span> at <span className="tabular">{exit.at}</span> — {exit.reason}
        </span>
        <span className="truncate text-fg-3">· restarted {stream.restarts} times, then gave up</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-[13px]"
            nativeButton={false}
            render={<Link to={`/streams/${stream.id}/logs?level=error`} />}
          >
            <ScrollText className="size-3.5" /> View logs
          </Button>
          <Button size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
            <RotateCw className="size-3.5" /> Restart
          </Button>
        </div>
      </div>
    )
  }
  return null
}
