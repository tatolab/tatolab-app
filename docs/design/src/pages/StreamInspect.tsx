// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy, FileJson, SquareTerminal, Variable } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { EnvironmentView, environmentSections } from "@/components/stream-overview/EnvironmentView"
import { describe, JsonRaw, JsonTree } from "@/components/stream-overview/JsonView"
import { environmentFor, inspectDocument } from "@/components/stream-overview/model"
import { Group } from "@/components/stream-overview/Group"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStream } from "@/pages/StreamLayout"

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

export default function StreamInspect() {
  const stream = useStream()
  const [params, setParams] = useSearchParams()
  const view = params.get("view") === "env" ? "env" : "graph"
  const mode = params.get("mode") === "tree" ? "tree" : "raw"
  const [highlight, setHighlight] = useState<string>()
  const [copied, setCopied] = useState(false)
  const doc = inspectDocument(stream)

  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v)
      else merged.delete(k)
    }
    setParams(merged, { replace: true })
  }

  const jump = (target: "graph" | "env", anchor: string) => {
    if (target !== view) update({ view: target === "env" ? "env" : undefined })
    setHighlight(anchor)
    requestAnimationFrame(() => document.getElementById(`inspect-${anchor}`)?.scrollIntoView({ block: "start", behavior: "smooth" }))
  }

  const copy = () => {
    const text =
      view === "graph"
        ? JSON.stringify(doc, null, 2)
        : environmentFor(stream)
            .map((v) => `${v.name}=${v.secret ? "" : v.value}`)
            .join("\n")
    navigator.clipboard?.writeText(text).catch(() => {})
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
              meta={typeof v === "object" && v !== null ? describe(v) : undefined}
              active={view === "graph" && highlight === k}
              onClick={() => jump("graph", k)}
            />
          ))}
        </Group>
        <Group label="Environment" actions={<Variable className="mr-1 size-3.5 text-fg-4" strokeWidth={1.75} />}>
          {environmentSections.map((s) => (
            <OutlineItem key={s.id} label={s.label} active={view === "env" && highlight === s.id} onClick={() => jump("env", s.id)} />
          ))}
        </Group>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
          <SquareTerminal className="size-4 text-fg-3" strokeWidth={1.75} />
          <span className="truncate font-mono text-xs text-fg-2">
            tatolab {view === "graph" ? "inspect" : "env"} {stream.id}
            <span className="text-fg-4"> --machine {stream.machine}</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {view === "graph" && (
              <Segmented
                value={mode}
                onChange={(m) => update({ mode: m === "tree" ? "tree" : undefined })}
                options={[
                  { id: "raw", label: "Raw" },
                  { id: "tree", label: "Tree" },
                ]}
              />
            )}
            <Button variant="outline" size="sm" className="h-7 w-[84px] gap-1.5 px-2.5 text-[13px]" onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          {view === "env" ? (
            <EnvironmentView stream={stream} />
          ) : mode === "tree" ? (
            <JsonTree value={doc} highlight={highlight} />
          ) : (
            <JsonRaw value={doc} highlight={highlight} />
          )}
        </div>
      </div>
    </div>
  )
}
