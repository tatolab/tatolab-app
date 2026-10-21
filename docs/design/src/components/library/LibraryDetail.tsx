// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowDownToLine, ArrowUpFromLine, BookOpen, ChevronDown, Plus } from "lucide-react"
import { CodeBlock } from "@/components/setup/CommandBlock"
import { KeyValue, KindIcon, Preview } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import type { CatalogEntry } from "@/data/mock"
import { cn } from "@/lib/utils"
import { categoryWords, kindWords, originWords } from "@/lib/vocab"
import { configFor, portsFor, snippetFor } from "./libraryData"

export type LibraryTab = "overview" | "ports" | "config"

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("h-8 px-3 font-normal first:pl-0", className)}>{children}</th>
}

function PortsTable({ entry }: { entry: CatalogEntry }) {
  const ports = portsFor(entry)
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b text-xs text-fg-3">
          <Th>Direction</Th>
          <Th>Kind</Th>
          <Th>Port</Th>
          <Th>Delivery profile</Th>
        </tr>
      </thead>
      <tbody>
        {ports.map((p) => {
          const DirIcon = p.direction === "in" ? ArrowDownToLine : ArrowUpFromLine
          return (
            <tr key={`${p.direction}-${p.name}`} className="h-9 border-b last:border-b-0">
              <td className="pr-3">
                <span className="inline-flex items-center gap-1.5 text-fg-2">
                  <DirIcon className="size-3.5 text-fg-3" strokeWidth={1.75} />
                  {p.direction === "in" ? "Input" : "Output"}
                </span>
              </td>
              <td className="px-3">
                <span className="inline-flex items-center gap-1.5 text-fg-2">
                  <KindIcon kind={p.kind} />
                  {kindWords[p.kind].label}
                </span>
              </td>
              <td className="px-3 font-mono text-xs text-fg">{p.name}</td>
              <td className="px-3 text-fg-2">{p.delivery ? <span className="font-mono text-xs">{p.delivery}</span> : <span className="text-fg-3">Set by the reader</span>}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ConfigTable({ entry }: { entry: CatalogEntry }) {
  const rows = configFor(entry.className)
  if (!rows.length) return <p className="text-fg-3">This node takes no config.</p>
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b text-xs text-fg-3">
          <Th>Key</Th>
          <Th>Type</Th>
          <Th>Default</Th>
          <Th>Description</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="h-9 border-b last:border-b-0">
            <td className="pr-3 font-mono text-xs text-fg">{r.key}</td>
            <td className="px-3 font-mono text-xs text-fg-3">{r.type}</td>
            <td className="px-3 font-mono text-xs text-fg-2">{r.default}</td>
            <td className="px-3 text-fg-2">{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function LibraryDetail({ entry, tab, onTab }: { entry: CatalogEntry; tab: LibraryTab; onTab: (t: LibraryTab) => void }) {
  const Cat = categoryWords[entry.category].icon
  const [pack, version] = entry.pack?.split(" ") ?? []
  const process = entry.origin === "built-in" ? "Inside the runtime, native" : "Its own Python process"
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b px-6 pt-5">
        <div className="flex items-start gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-lg border bg-chrome">
            <Cat className="size-6 text-fg-2" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="title-lg">{entry.label}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-3">
              <span className="font-mono text-xs text-fg-2">{entry.className}</span>
              <span>{originWords[entry.origin].label}</span>
              {pack && (
                <span>
                  <span className="font-mono text-xs">{pack}</span> {version}
                </span>
              )}
              <span>{categoryWords[entry.category].label}</span>
            </div>
            <p className="mt-2 text-fg-2">{entry.description}</p>
            <div className="mt-3 flex items-center gap-1.5">
              <div className="flex">
                <Button size="sm" className="h-7 gap-1 rounded-r-none px-2.5 text-[13px]">
                  <Plus className="size-3.5" /> Add to stream
                </Button>
                <Button size="sm" className="h-7 rounded-l-none border-l border-l-white/25 px-1.5" aria-label="Choose stream">
                  <ChevronDown className="size-3.5" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
                <BookOpen className="size-3.5" /> Docs
              </Button>
              {entry.origin === "pack" && (
                <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[13px] text-fg-2">
                  Uninstall pack
                </Button>
              )}
            </div>
          </div>
        </div>
        <nav className="mt-4 -mb-px flex gap-4">
          {(["overview", "ports", "config"] as LibraryTab[]).map((t) => (
            <button
              key={t}
              onClick={() => onTab(t)}
              className={cn("flex h-9 items-center border-b border-transparent text-fg-3 capitalize transition-colors hover:text-fg", tab === t && "border-fg text-fg")}
            >
              {t}
              {t === "ports" && <span className="ml-1.5 text-xs text-fg-3 tabular">{portsFor(entry).length}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="max-w-[880px] px-6 py-5">
        {tab === "overview" && (
          <div className="flex flex-col gap-6">
            {entry.preview && (
              <Preview scene={entry.preview} className="aspect-video w-full max-w-[560px]" caption={`${portsFor(entry).find((p) => p.direction === "out")?.name ?? "output"} · sample`} />
            )}
            <section>
              <div className="label-caps mb-2">Use it in stream.py</div>
              <CodeBlock code={snippetFor(entry)} caption="stream.py" className="max-w-[560px]" />
            </section>
            <section>
              <div className="label-caps mb-2">Details</div>
              <KeyValue
                rows={[
                  ["Runs in", process],
                  ["Inputs", entry.inputs.length ? entry.inputs.map((k) => kindWords[k].label).join(", ") : "None, it's a source"],
                  ["Outputs", entry.outputs.length ? entry.outputs.map((k) => kindWords[k].label).join(", ") : "None, it's an output"],
                  ["Config keys", `${configFor(entry.className).length}`],
                  ["Platforms", entry.origin === "built-in" ? "macOS, Linux, Jetson" : "Any machine with Python 3.11+"],
                ]}
              />
            </section>
          </div>
        )}
        {tab === "ports" && <PortsTable entry={entry} />}
        {tab === "config" && <ConfigTable entry={entry} />}
      </div>
    </div>
  )
}
