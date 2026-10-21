// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy, FileJson, SquareTerminal } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Group } from "@/components/stream-overview/Group"
import { describe, JsonRaw, JsonTree } from "@/components/stream-overview/JsonView"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { graphDocument } from "../components/stream/model"
import { useTodayStream } from "./TodayStreamLayout"

function OutlineItem({ label, meta, active, onClick, mono }: { label: string; meta?: string; active?: boolean; onClick: () => void; mono?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-fg-2 transition-colors hover:bg-hover hover:text-fg",
        active && "bg-selected text-fg",
      )}
    >
      <span className={cn("truncate", mono && "font-mono text-xs")}>{label}</span>
      {meta && <span className="ml-auto shrink-0 text-xs text-fg-4 tabular">{meta}</span>}
    </button>
  )
}

export default function TodayStreamInspect() {
  const stream = useTodayStream()
  const [params, setParams] = useSearchParams()
  const mode = params.get("mode") === "tree" ? "tree" : "raw"
  const [highlight, setHighlight] = useState<string>()
  const [copied, setCopied] = useState(false)
  const command = `tatolab graph --stream ${stream.id}`

  const jump = (anchor: string) => {
    setHighlight(anchor)
    requestAnimationFrame(() => document.getElementById(`inspect-${anchor}`)?.scrollIntoView({ block: "start", behavior: "smooth" }))
  }

  if (!stream.loaded) {
    return (
      <div className="flex h-full min-h-[420px] flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
          <SquareTerminal className="size-4 text-fg-3" strokeWidth={1.75} />
          <span className="truncate font-mono text-xs text-fg-2">{command}</span>
        </div>
        <div className="grid flex-1 place-items-center px-8">
          <div className="max-w-md text-center">
            <FileJson className="mx-auto size-5 text-fg-4" strokeWidth={1.5} />
            <div className="mt-2.5 text-fg">No graph while the stream is not loaded</div>
            <p className="mt-1 text-fg-3">
              The runtime serves a stream's graph only while it is loaded. {stream.state === "failed" ? "Retry it" : "Start it"} and the graph appears here, as the command prints it.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const doc = graphDocument(stream)
  const copy = () => {
    navigator.clipboard?.writeText(JSON.stringify(doc, null, 2)).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="flex h-full min-h-[420px]">
      <aside className="scrollbar-thin w-56 shrink-0 overflow-y-auto border-r bg-chrome py-1">
        <Group label="Graph" actions={<FileJson className="mr-1 size-3.5 text-fg-4" strokeWidth={1.75} />}>
          {Object.entries(doc).map(([k, v]) => (
            <OutlineItem
              key={k}
              mono
              label={k}
              meta={describe(v)}
              active={highlight === k}
              onClick={() => jump(k)}
            />
          ))}
        </Group>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
          <SquareTerminal className="size-4 text-fg-3" strokeWidth={1.75} />
          <span className="truncate font-mono text-xs text-fg-2">{command}</span>
          <div className="ml-auto flex items-center gap-2">
            <Segmented
              value={mode}
              onChange={(m) => setParams(m === "tree" ? { mode: "tree" } : {}, { replace: true })}
              options={[
                { id: "raw", label: "Raw" },
                { id: "tree", label: "Tree" },
              ]}
            />
            <Button variant="outline" size="sm" className="h-7 w-[84px] gap-1.5 px-2.5 text-[13px]" onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          {mode === "tree" ? <JsonTree value={doc} highlight={highlight} /> : <JsonRaw value={doc} highlight={highlight} />}
        </div>
      </div>
    </div>
  )
}
