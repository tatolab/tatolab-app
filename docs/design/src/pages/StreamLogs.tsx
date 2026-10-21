// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { SquareX, Square } from "lucide-react"
import { useMemo } from "react"
import { streamLogs } from "@/components/logs-stats/logData"
import { LogViewer } from "@/components/logs-stats/LogViewer"
import { useStream } from "@/pages/StreamLayout"

export default function StreamLogs() {
  const stream = useStream()
  const lines = useMemo(() => streamLogs(stream), [stream])
  const running = stream.status === "live" || stream.status === "attention"
  const last = lines[lines.length - 1]
  const footer =
    stream.status === "failed" ? (
      <div className="mx-3 mt-2 mb-1 flex items-center gap-2 border-t pt-2 font-sans text-[13px]">
        <SquareX className="size-3.5 text-danger" strokeWidth={1.75} />
        <span className="text-fg">Exited with code 1</span>
        <span className="text-fg-3">
          at {last.ts.slice(11, 19)} · {stream.restarts} restarts · {stream.statusDetail}
        </span>
      </div>
    ) : stream.status === "paused" ? (
      <div className="mx-3 mt-2 mb-1 flex items-center gap-2 border-t pt-2 font-sans text-[13px]">
        <Square className="size-3.5 text-fg-3" strokeWidth={1.75} />
        <span className="text-fg-2">Stopped</span>
        <span className="text-fg-3">· {stream.statusDetail}</span>
      </div>
    ) : undefined
  return <LogViewer key={stream.id} lines={lines} scope="stream" live={running ? [stream] : []} footer={footer} />
}
