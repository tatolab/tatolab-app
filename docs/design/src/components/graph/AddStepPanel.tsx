// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { SquareX, PanelLeftClose, Search, TriangleAlert, X } from "lucide-react"
import { forwardRef, useMemo, useState } from "react"
import { IconButton, KindIcon } from "@/components/stream/primitives"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type CatalogEntry, type NodeCategory, type NodeSpec, nodeCatalog } from "@/data/mock"
import { categoryWords } from "@/lib/vocab"
import { PanelGroup, panelRowClass } from "./PanelGroup"

export const STEP_DRAG_TYPE = "application/x-tatolab-step"

const order: NodeCategory[] = ["source", "relay", "effect", "ai", "analysis", "codec", "sink"]

function Row({ entry, onAdd }: { entry: CatalogEntry; onAdd: (e: CatalogEntry) => void }) {
  const kind = entry.outputs[0] ?? entry.inputs[0]
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(STEP_DRAG_TYPE, entry.className)
              e.dataTransfer.effectAllowed = "copy"
            }}
            onClick={() => onAdd(entry)}
            className={`${panelRowClass()} cursor-grab active:cursor-grabbing`}
          />
        }
      >
        {kind && <KindIcon kind={kind} />}
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        <span className="shrink-0 text-xs text-fg-3">{entry.pack ? entry.pack.split(" ")[0] : entry.origin === "built-in" ? "Built-in" : "Python"}</span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        {entry.description}
        <span className="mt-1 block font-mono text-xs opacity-60">{entry.className}</span>
      </TooltipContent>
    </Tooltip>
  )
}

export const AddStepPanel = forwardRef<
  HTMLInputElement,
  {
    onAdd: (e: CatalogEntry) => void
    onClose: () => void
    steps: NodeSpec[]
    selectedId: string | null
    onFocusStep: (id: string) => void
    catalog?: CatalogEntry[]
    groupByOrigin?: boolean
  }
>(function AddStepPanel({ onAdd, onClose, steps, selectedId, onFocusStep, catalog = nodeCatalog, groupByOrigin }, inputRef) {
  const [query, setQuery] = useState("")
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = catalog.filter((e) => !q || `${e.label} ${e.className} ${e.description} ${e.pack ?? ""}`.toLowerCase().includes(q))
    if (groupByOrigin)
      return [
        { category: "built-in", label: "Built-in", entries: hits.filter((e) => e.origin === "built-in") },
        { category: "python", label: "Python · this project", entries: hits.filter((e) => e.origin !== "built-in") },
      ].filter((g) => g.entries.length)
    return order.map((c) => ({ category: c, label: categoryWords[c].label, entries: hits.filter((e) => e.category === c) })).filter((g) => g.entries.length)
  }, [query, catalog, groupByOrigin])

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r bg-chrome">
      <div className="flex shrink-0 items-center gap-1 p-2 pb-0">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-well px-2 focus-within:border-brand/60">
          <Search className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && groups[0]) onAdd(groups[0].entries[0])
              if (e.key === "Escape") (e.currentTarget as HTMLInputElement).blur()
            }}
            placeholder="Add a step"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
          />
          {query ? (
            <button onClick={() => setQuery("")} className="text-fg-3 hover:text-fg" aria-label="Clear">
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="font-sans text-xs text-fg-4">⌘K</kbd>
          )}
        </label>
        <IconButton icon={PanelLeftClose} label="Hide panel" onClick={onClose} className="size-8" />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {groups.map(({ category, label, entries }) => (
          <PanelGroup
            key={`${category}${query ? "-q" : ""}`}
            label={label}
            collapsible
            className="pb-0"
            actions={<span className="px-1.5 text-xs text-fg-4 tabular">{entries.length}</span>}
          >
            {entries.map((e) => (
              <Row key={e.className} entry={e} onAdd={onAdd} />
            ))}
          </PanelGroup>
        ))}
        {!groups.length && <div className="px-4 py-6 text-center text-fg-3">No steps match “{query}”</div>}
        <div className="h-2" />
      </div>
      <PanelGroup
        label="In this stream"
        collapsible
        className="max-h-[40%] shrink-0 border-t"
        contentClassName="scrollbar-thin min-h-0 overflow-y-auto"
        actions={<span className="px-1.5 text-xs text-fg-4 tabular">{steps.length}</span>}
      >
        {steps.map((s) => {
          const Icon = categoryWords[s.category].icon
          return (
            <button key={s.id} onClick={() => onFocusStep(s.id)} className={panelRowClass(selectedId === s.id)}>
              <Icon className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} />
              <span className="max-w-[65%] shrink-0 truncate">{s.label}</span>
              {s.state === "crashed" && <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} />}
              {s.state === "stalled" && <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} />}
              <span className="ml-auto min-w-0 truncate font-mono text-xs font-normal text-fg-3">{s.id}</span>
            </button>
          )
        })}
      </PanelGroup>
    </aside>
  )
})
