// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { FileText, RotateCw, ScrollText, SquareX } from "lucide-react"
import { useMemo } from "react"
import { streamLogs } from "@/components/logs-stats/logData"
import { LogViewer } from "@/components/logs-stats/LogViewer"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { streamById } from "@/data/mock"
import type { TodayStream } from "../data"
import { jsonlPath, recordsNotHeld, streamInstanceNumber } from "../components/stream/model"
import { useTodayStream } from "./TodayStreamLayout"

const notServed = new Set(["relay heartbeat", "relay key expires soon"])

function since(uptime: string) {
  return `${uptime.replace(/(\d+)m$/, "$1 min")} ago`
}

function EarlierRecords({ stream }: { stream: TodayStream }) {
  const n = recordsNotHeld(stream)
  if (!n) return null
  return (
    <div className="mx-3 mb-1 flex h-8 items-center gap-2 border-b font-sans text-xs text-fg-3">
      <FileText className="size-3.5 shrink-0 text-fg-4" strokeWidth={1.75} />
      <span className="min-w-0 truncate">
        <span className="tabular">{n.toLocaleString("en-US")}</span> earlier records are in <span className="font-mono text-fg-2">{jsonlPath(stream)}</span>
      </span>
      <button className="shrink-0 text-brand-text hover:underline">Open</button>
    </div>
  )
}

function LoadWord({ stream }: { stream: TodayStream }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="mr-3 cursor-default text-xs whitespace-nowrap text-fg-3" />}>
        Load #{streamInstanceNumber(stream)} · {stream.state === "attached" ? "reloaded" : "loaded"} {since(stream.uptime)}
      </TooltipTrigger>
      <TooltipContent>
        Records since this load are held in memory.
        <span className="mt-1 block font-mono text-[10px] opacity-60">stream_instance: {stream.streamInstance}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function NotLoaded({ stream }: { stream: TodayStream }) {
  const failed = stream.state === "failed"
  return (
    <div className="grid h-full min-h-[420px] place-items-center px-8">
      <div className="flex max-w-lg flex-col items-center text-center">
        {failed ? <SquareX className="size-5 text-danger" strokeWidth={1.5} /> : <ScrollText className="size-5 text-fg-4" strokeWidth={1.5} />}
        <div className="mt-2.5 text-fg">{failed ? "Failed to load" : "Not loaded"}</div>
        <p className="mt-1 text-fg-3">
          {failed ? stream.failedBecause : "The runtime holds records only for a loaded stream. Everything it wrote is in the stream's log file."}
        </p>
        <div className="mt-4 flex h-7 max-w-full items-center rounded-md border bg-well px-2.5 font-mono text-xs text-fg-2">
          <span className="truncate">{jsonlPath(stream)}</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
            <FileText className="size-3.5" /> Open log file
          </Button>
          {failed && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
              <RotateCw className="size-3.5" /> Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TodayStreamLogs() {
  const stream = useTodayStream()
  const spec = streamById(stream.id)!
  const lines = useMemo(() => streamLogs(spec).filter((l) => !notServed.has(l.msg)), [spec])
  if (!stream.loaded) return <NotLoaded stream={stream} />
  return (
    <LogViewer
      key={stream.id}
      lines={lines}
      scope="stream"
      live={[spec]}
      leading={<EarlierRecords stream={stream} />}
      toolbarExtra={<LoadWord stream={stream} />}
    />
  )
}
