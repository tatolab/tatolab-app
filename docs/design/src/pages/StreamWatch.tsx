// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Workflow } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { DetailsPanel } from "@/components/stream-overview/DetailsPanel"
import { previewableOutputs, primaryOutput } from "@/components/stream-overview/model"
import { OutputViewer } from "@/components/stream-overview/OutputViewer"
import { StepsTable } from "@/components/stream-overview/StepsTable"
import { StreamBanner } from "@/components/stream-overview/StreamBanner"
import { useStream } from "@/pages/StreamLayout"

export default function StreamWatch() {
  const stream = useStream()
  const [params, setParams] = useSearchParams()
  const outputs = previewableOutputs(stream)
  const selected = outputs.find((o) => o.key === params.get("output")) ?? primaryOutput(stream)
  return (
    <div className="flex min-h-full flex-col">
      <StreamBanner stream={stream} />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 px-5 pt-5 pb-8">
          <OutputViewer
            stream={stream}
            outputs={outputs}
            selected={selected}
            onSelect={(key) => setParams({ output: key }, { replace: true })}
          />
          <section className="mt-7 max-w-[920px]">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-medium">Steps</h2>
              <span className="text-fg-3 tabular">{stream.nodes.length}</span>
              <span className="text-xs text-fg-3">in pipeline order</span>
              <Link to={`/streams/${stream.id}/graph`} className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg">
                <Workflow className="size-3.5" strokeWidth={1.75} /> Open graph
              </Link>
            </div>
            <StepsTable stream={stream} />
          </section>
        </div>
        <DetailsPanel stream={stream} />
      </div>
    </div>
  )
}
