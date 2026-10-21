// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowUpRight, Maximize2, Play, Workflow } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { OutputViewer } from "@/components/stream-overview/OutputViewer"
import { IconButton } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { primaryWatchable, watchableOutputs, watchUrl } from "../components/stream/model"
import { TodayDetailsPanel } from "../components/stream/TodayDetailsPanel"
import { DropNotes, FailedBanner } from "../components/stream/TodayNotices"
import { TodayStepsTable } from "../components/stream/TodayStepsTable"
import { useTodayStream } from "./TodayStreamLayout"

export default function TodayStreamOverview() {
  const stream = useTodayStream()
  const [params, setParams] = useSearchParams()
  const failed = stream.state === "failed"
  const outputs = failed ? [] : watchableOutputs(stream)
  const selected = outputs.find((o) => o.key === params.get("output")) ?? (failed ? undefined : primaryWatchable(stream))
  const url = selected ? watchUrl(stream, selected.node.id, selected.port.name) : undefined
  return (
    <div className="flex min-h-full flex-col">
      <FailedBanner stream={stream} />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 px-5 pt-5 pb-8">
          <DropNotes stream={stream} className="-mt-1.5 mb-2.5 max-w-[920px]" />
          <OutputViewer
            stream={stream}
            outputs={outputs}
            selected={selected}
            onSelect={(key) => setParams({ output: key }, { replace: true })}
            actions={selected && stream.loaded ? <IconButton icon={Maximize2} label="Full screen" /> : null}
            overlay={
              stream.loaded ? null : (
                <div className="absolute inset-0 grid place-items-center bg-black/60">
                  <div className="flex flex-col items-center gap-3">
                    <Button size="sm" className="h-7 gap-1.5 px-3 text-[13px]">
                      <Play className="size-3.5" /> Start stream
                    </Button>
                    <span className="text-xs text-white/60">Stopped · the last frame this app saw</span>
                  </div>
                </div>
              )
            }
            meta={
              url && stream.loaded ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={url}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 text-brand-text hover:underline"
                >
                  Open in browser <ArrowUpRight className="size-3" />
                </a>
              ) : (
                <span className="ml-auto shrink-0 text-fg-3">{selected ? "Not loaded" : ""}</span>
              )
            }
            empty={
              <div className={cn("grid place-items-center rounded-md bg-well ring-1 ring-line", failed ? "h-56" : "aspect-video")}>
                <div className="max-w-sm text-center">
                  <div className="text-fg-2">{failed ? "Not loaded, so nothing to preview" : "No exposed output to preview"}</div>
                  <div className="mt-1 text-xs text-fg-3">
                    {failed ? (
                      "Previews come from the exposed outputs of a loaded stream."
                    ) : (
                      <>
                        Expose a video or audio output to this machine to watch it here.{" "}
                        <Link to={`/streams/${stream.id}/outputs`} className="text-brand-text hover:underline">
                          Outputs
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            }
          />
          <section className="mt-7 max-w-[920px]">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-medium">Steps</h2>
              <span className="text-fg-3 tabular">{stream.nodes.length}</span>
              <span className="text-xs text-fg-3">{stream.loaded ? "in pipeline order" : "as of the last load"}</span>
              <Link to={`/streams/${stream.id}/graph`} className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg">
                <Workflow className="size-3.5" strokeWidth={1.75} /> Open graph
              </Link>
            </div>
            <TodayStepsTable stream={stream} />
          </section>
        </div>
        <TodayDetailsPanel stream={stream} />
      </div>
    </div>
  )
}
