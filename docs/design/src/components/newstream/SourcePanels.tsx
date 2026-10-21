// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, FolderOpen, Search } from "lucide-react"
import { Preview } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { type Scene, streams, templates } from "@/data/mock"
import { cn } from "@/lib/utils"

export function TemplateGrid({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {templates.map((t, i) => {
        const active = t.id === selected
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "group rounded-lg border p-1.5 text-left transition-colors hover:border-line-strong",
              active && "border-brand ring-1 ring-brand hover:border-brand",
            )}
          >
            <Preview scene={t.scene} seed={i * 3} className="aspect-[16/9] w-full rounded-[5px]" />
            <div className="flex items-start gap-2 px-1 pt-2 pb-0.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-fg">{t.title}</div>
                <div className="truncate text-xs text-fg-3">{t.blurb}</div>
              </div>
              <span className="shrink-0 text-xs text-fg-3 tabular">{t.steps} steps</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

const recentFolders = [
  { path: "~/code/porch-cam", detail: "stream.py · 4 nodes · Python 3.12", ok: true },
  { path: "~/code/hand-tracker", detail: "stream.py · 3 nodes · Python 3.13", ok: true },
  { path: "~/Downloads/moq-demo", detail: "No stream.py in this folder", ok: false },
]

export function FolderPanel({ selected, onSelect }: { selected: string; onSelect: (path: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-5">
        <FolderOpen className="size-5 text-fg-3" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <div className="text-fg">Drop a folder here</div>
          <div className="text-xs text-fg-3">Any folder with a stream.py at its root runs as a stream.</div>
        </div>
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]">
          Choose folder…
        </Button>
      </div>
      <div>
        <div className="label-caps mb-1.5">Recent</div>
        <div className="overflow-hidden rounded-lg border">
          {recentFolders.map((f) => (
            <button
              key={f.path}
              disabled={!f.ok}
              onClick={() => onSelect(f.path)}
              className={cn("flex h-11 w-full items-center gap-3 border-b px-3 text-left last:border-b-0 hover:bg-hover disabled:hover:bg-transparent", selected === f.path && "bg-selected hover:bg-selected")}
            >
              <FolderOpen className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} />
              <span className={cn("font-mono text-xs", f.ok ? "text-fg" : "text-fg-3")}>{f.path}</span>
              <span className="ml-auto text-xs text-fg-3">{f.detail}</span>
              {selected === f.path && <Check className="size-4 text-brand-text" strokeWidth={2} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export interface PublicOutput {
  address: string
  stream: string
  scene: Scene
}

export const publicOutputs: PublicOutput[] = streams.flatMap((s) =>
  s.nodes.flatMap((n) =>
    n.ports
      .filter((p) => p.direction === "out" && p.exposure === "public")
      .map((p) => ({ address: `${s.machine}/${s.id}/${n.id}/${p.name}`, stream: s.title, scene: p.preview ?? n.preview ?? s.hero })),
  ),
)

export function RelayPanel({ selected, onSelect }: { selected: string; onSelect: (address: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-8 items-center gap-2 rounded-md border bg-window px-2.5 focus-within:border-line-strong">
        <Search className="size-3.5 text-fg-3" strokeWidth={1.75} />
        <input defaultValue="" placeholder="machine/stream/node/port or a relay URL" className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-[13px] placeholder:text-fg-3" />
      </label>
      <div>
        <div className="label-caps mb-1.5">Public outputs you can read</div>
        <div className="overflow-hidden rounded-lg border">
          {publicOutputs.map((o, i) => {
            const active = o.address === selected
            return (
              <button
                key={o.address}
                onClick={() => onSelect(o.address)}
                className={cn("flex h-12 w-full items-center gap-3 border-b px-3 text-left last:border-b-0 hover:bg-hover", active && "bg-selected hover:bg-selected")}
              >
                <Preview scene={o.scene} seed={i * 4} className="h-[27px] w-12 shrink-0 rounded-[4px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{o.stream}</span>
                  <span className="block truncate font-mono text-xs text-fg-3">{o.address}</span>
                </span>
                {active && <Check className="size-4 text-brand-text" strokeWidth={2} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
